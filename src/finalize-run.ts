import type { AnswerProfile, LlmWikiConfig } from "./config.js";
import type { AnswerSummaryAgent } from "./answer-summary-agent.js";
import type { CacheFirstLoop } from "./loop-runner.js";
import {
  EvidenceCollector,
  formatEvidenceFooter,
  stripOrphanCitations,
  validateCitations,
  type CitationReport,
  type EvidenceBundle,
} from "./core/evidence/index.js";
import {
  applyAnswerProfile,
  createSecurityAuditLogger,
  maybeRecordSecurityAudit,
} from "./core/security/index.js";
import { augmentQuestionWithRetrievalPlan, classifyRetrievalPlan } from "./retrieval/plan.js";
import { RunTelemetry, type RunTelemetrySnapshot } from "./telemetry/run-telemetry.js";

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  const n = raw?.trim().toLowerCase();
  if (n === "true" || n === "1" || n === "yes") return true;
  if (n === "false" || n === "0" || n === "no") return false;
  return fallback;
}

function stripForcedSummaryPrefix(answer: string): string {
  return answer.replace(/^errors\.reason(?:Stuck|Aborted|ContextGuard)\n\n/, "");
}

export function buildAskPrompt(question: string, repoScope?: string): string {
  const promptParts = [
    repoScope && repoScope !== "all" ? `[repo_scope: ${repoScope}]` : null,
    augmentQuestionWithRetrievalPlan(question),
  ].filter((part): part is string => Boolean(part));
  return promptParts.join("\n\n");
}

export interface PostProcessInput {
  rawAnswer: string;
  evidence: EvidenceCollector;
  telemetry: RunTelemetry;
  cfg: LlmWikiConfig;
  question: string;
  surface: "agent" | "mcp";
  summaryAgent?: AnswerSummaryAgent;
}

export interface RunAskResult {
  answer: string;
  rawAnswer: string;
  evidenceBundle: EvidenceBundle;
  citationReport: CitationReport;
  telemetry: RunTelemetrySnapshot;
}

export async function postProcessRunAnswer(input: PostProcessInput): Promise<RunAskResult> {
  let rawAnswer = stripForcedSummaryPrefix(input.rawAnswer.trim())
    || "(llm-wiki completed without a final answer)";
  const evidenceBundle = input.evidence.toBundle();
  let citationReport = validateCitations(rawAnswer, evidenceBundle);

  const strictEvidence = parseBool(process.env.LLM_WIKI_EVIDENCE_STRICT, true);
  if (input.surface === "mcp" && strictEvidence && citationReport.orphans.length > 0) {
    rawAnswer = stripOrphanCitations(rawAnswer, citationReport.orphans);
    citationReport = validateCitations(rawAnswer, evidenceBundle);
  }

  const profile: AnswerProfile =
    input.surface === "mcp" ? input.cfg.answerProfiles.mcp : input.cfg.answerProfiles.agent;

  if (input.surface === "mcp" && profile === "debug") {
    rawAnswer = `${rawAnswer}\n\n${formatEvidenceFooter(evidenceBundle, citationReport)}`;
  }

  let answer = rawAnswer;
  if (input.surface === "mcp" && input.summaryAgent) {
    try {
      const summarized = await input.summaryAgent.summarize({
        question: input.question,
        answer: rawAnswer,
      });
      answer = summarized.trim() || rawAnswer;
    } catch (err) {
      console.warn(
        `[llm-wiki] answer summary agent failed; returning raw answer: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  const guarded = applyAnswerProfile(answer, profile);
  maybeRecordSecurityAudit(
    createSecurityAuditLogger(`${input.cfg.projectRoot}/.reasonix/security-audit.jsonl`),
    {
      surface: "answer",
      ...guarded.audit,
    },
  );
  answer = guarded.text;

  const telemetry = input.telemetry.finalize({
    question: input.question,
    surface: input.surface,
    answerProfile: profile,
    evidenceBundle,
    citationReport,
    retrievalPlanKind: classifyRetrievalPlan(input.question).kind,
  });

  return {
    answer,
    rawAnswer,
    evidenceBundle,
    citationReport,
    telemetry,
  };
}

async function collectRawAnswer(loop: CacheFirstLoop, prompt: string): Promise<string> {
  const answerParts: string[] = [];
  for await (const ev of loop.step(prompt)) {
    if (ev.role === "assistant_delta" || ev.role === "assistant_final") {
      if (ev.content) answerParts.push(ev.content);
    }
    if (ev.role === "error") {
      throw new Error(ev.error || ev.content || "llm-wiki loop failed");
    }
  }
  return answerParts.join("").trim();
}

export interface RunAskInput {
  loop: CacheFirstLoop;
  evidence: EvidenceCollector;
  telemetry: RunTelemetry;
  cfg: LlmWikiConfig;
  question: string;
  repoScope?: string;
  surface: "agent" | "mcp";
  summaryAgent?: AnswerSummaryAgent;
}

export async function finalizeRunAsk(input: RunAskInput): Promise<RunAskResult> {
  const rawAnswer = await collectRawAnswer(input.loop, buildAskPrompt(input.question, input.repoScope));
  return postProcessRunAnswer({
    rawAnswer,
    evidence: input.evidence,
    telemetry: input.telemetry,
    cfg: input.cfg,
    question: input.question,
    surface: input.surface,
    summaryAgent: input.summaryAgent,
  });
}

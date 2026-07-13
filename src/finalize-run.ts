import type { AnswerProfile, LlmWikiConfig } from "./config.js";
import type { AnswerSummaryAgent } from "./answer-summary-agent.js";
import type { CacheFirstLoop } from "./loop-runner.js";
import {
  EvidenceCollector,
  applyEvidencePolicy,
  formatEvidenceFooter,
  validateCitations,
  type CitationReport,
  type EvidenceBundle,
  type EvidencePolicyResult,
} from "./core/evidence/index.js";
import {
  applyAnswerProfile,
  createSecurityAuditLogger,
  maybeRecordSecurityAudit,
} from "./core/security/index.js";
import { augmentQuestionWithRetrievalPlan, classifyRetrievalPlan } from "./retrieval/plan.js";
import { findRelevantKnowledgeCards, formatKnowledgeHints } from "./core/knowledge/retrieval.js";
import {
  evidenceBundleFromCard,
  tryKnowledgeFastPath,
} from "./core/knowledge/fast-path.js";
import type { KnowledgeCard } from "./core/knowledge/types.js";
import { loadKnowledgeStore } from "./core/knowledge/store.js";
import { RunTelemetry, type RunTelemetrySnapshot } from "./telemetry/run-telemetry.js";
import {
  buildCatalogListingAnswer,
  isCatalogListingEnabled,
  tryCatalogListingResult,
} from "./catalog/listing-path.js";

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  const n = raw?.trim().toLowerCase();
  if (n === "true" || n === "1" || n === "yes") return true;
  if (n === "false" || n === "0" || n === "no") return false;
  return fallback;
}

function stripForcedSummaryPrefix(answer: string): string {
  return answer.replace(/^errors\.reason(?:Stuck|Aborted|ContextGuard|Budget)\n\n/, "");
}

/** Listing/architecture answers are already structured — skip the extra MCP summary LLM call. */
export function shouldSkipMcpSummary(question: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (parseBool(env.LLM_WIKI_MCP_SKIP_SUMMARY, false)) return true;
  const kind = classifyRetrievalPlan(question).kind;
  return kind === "listing" || kind === "architecture";
}

export function buildAskPrompt(question: string, repoScope?: string, cfg?: LlmWikiConfig): string {
  const promptParts = [
    repoScope && repoScope !== "all" ? `[repo_scope: ${repoScope}]` : null,
  ].filter((part): part is string => Boolean(part));

  if (cfg) {
    const cards = findRelevantKnowledgeCards(loadKnowledgeStore(cfg.projectRoot), question);
    const hints = formatKnowledgeHints(cards);
    if (hints) promptParts.push(hints);
  }

  promptParts.push(augmentQuestionWithRetrievalPlan(question));
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
  knowledgeCardId?: string;
}

export interface RunAskResult {
  answer: string;
  rawAnswer: string;
  evidenceBundle: EvidenceBundle;
  citationReport: CitationReport;
  evidencePolicy: EvidencePolicyResult;
  telemetry: RunTelemetrySnapshot;
}

export async function postProcessRunAnswer(input: PostProcessInput): Promise<RunAskResult> {
  let rawAnswer = stripForcedSummaryPrefix(input.rawAnswer.trim())
    || "(llm-wiki completed without a final answer)";
  const evidenceBundle = input.evidence.toBundle();
  let citationReport = validateCitations(rawAnswer, evidenceBundle);

  const strictEvidence = parseBool(process.env.LLM_WIKI_EVIDENCE_STRICT, true);
  const refuseEmpty = parseBool(process.env.LLM_WIKI_EVIDENCE_REFUSE_EMPTY, true);
  const evidencePolicy = applyEvidencePolicy(rawAnswer, evidenceBundle, citationReport, {
    strict: strictEvidence,
    refuseEmpty,
  });
  rawAnswer = evidencePolicy.answer;
  citationReport = validateCitations(rawAnswer, evidenceBundle);

  const profile: AnswerProfile =
    input.surface === "mcp" ? input.cfg.answerProfiles.mcp : input.cfg.answerProfiles.agent;

  if (input.surface === "mcp" && profile === "debug") {
    rawAnswer = `${rawAnswer}\n\n${formatEvidenceFooter(evidenceBundle, citationReport)}`;
  }

  let answer = rawAnswer;
  if (input.surface === "mcp" && input.summaryAgent && !shouldSkipMcpSummary(input.question)) {
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
    finalAnswer: answer,
    knowledgeCardId: input.knowledgeCardId,
  });

  return {
    answer,
    rawAnswer,
    evidenceBundle,
    citationReport,
    evidencePolicy,
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
  if (isCatalogListingEnabled()) {
    const profile: AnswerProfile =
      input.surface === "mcp" ? input.cfg.answerProfiles.mcp : input.cfg.answerProfiles.agent;
    const catalog = tryCatalogListingResult({
      cfg: input.cfg,
      question: input.question,
      repoScope: input.repoScope,
      profile,
    });
    if (catalog !== null) {
      input.evidence.recordCatalogList(catalog.intent.repo);
      return postProcessRunAnswer({
        rawAnswer: catalog.answer,
        evidence: input.evidence,
        telemetry: input.telemetry,
        cfg: input.cfg,
        question: input.question,
        surface: input.surface,
        summaryAgent: input.summaryAgent,
      });
    }
  }

  const fastCard = tryKnowledgeFastPath(input.cfg, input.question, input.repoScope);
  if (fastCard) {
    return finalizeKnowledgeCardAnswer({
      cfg: input.cfg,
      question: input.question,
      card: fastCard,
      surface: input.surface,
      telemetry: input.telemetry,
      summaryAgent: input.summaryAgent,
    });
  }

  const rawAnswer = await collectRawAnswer(
    input.loop,
    buildAskPrompt(input.question, input.repoScope, input.cfg),
  );
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

export interface FinalizeKnowledgeCardInput {
  cfg: LlmWikiConfig;
  question: string;
  card: KnowledgeCard;
  surface: "agent" | "mcp";
  telemetry: RunTelemetry;
  summaryAgent?: AnswerSummaryAgent;
}

/** Verified knowledge card with fresh evidence hashes — skip the tool loop. */
export async function finalizeKnowledgeCardAnswer(
  input: FinalizeKnowledgeCardInput,
): Promise<RunAskResult> {
  const evidenceBundle = evidenceBundleFromCard(
    input.card,
    input.telemetry.runId,
    input.question,
  );
  let rawAnswer = input.card.answer.trim();
  let citationReport = validateCitations(rawAnswer, evidenceBundle);

  const strictEvidence = parseBool(process.env.LLM_WIKI_EVIDENCE_STRICT, true);
  const refuseEmpty = parseBool(process.env.LLM_WIKI_EVIDENCE_REFUSE_EMPTY, true);
  const evidencePolicy = applyEvidencePolicy(rawAnswer, evidenceBundle, citationReport, {
    strict: strictEvidence,
    refuseEmpty,
  });
  rawAnswer = evidencePolicy.answer;
  citationReport = validateCitations(rawAnswer, evidenceBundle);

  const profile: AnswerProfile =
    input.surface === "mcp" ? input.cfg.answerProfiles.mcp : input.cfg.answerProfiles.agent;

  let answer = rawAnswer;
  if (input.surface === "mcp" && input.summaryAgent && !shouldSkipMcpSummary(input.question)) {
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
    finalAnswer: answer,
    knowledgeCardId: input.card.id,
  });

  return {
    answer,
    rawAnswer,
    evidenceBundle,
    citationReport,
    evidencePolicy,
    telemetry,
  };
}

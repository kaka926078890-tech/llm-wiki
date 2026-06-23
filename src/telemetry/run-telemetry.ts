import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { AnswerProfile } from "../config.js";
import type { EvidenceBundle, CitationReport } from "../core/evidence/index.js";

export interface RunTelemetryOptions {
  enabled?: boolean;
  runsDir?: string;
}

export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  blocked?: string;
  emptyResult?: boolean;
  duplicate?: boolean;
}

export interface RunTelemetrySnapshot {
  runId: string;
  startedAt: string;
  endedAt: string;
  question: string;
  surface: "agent" | "mcp";
  answerProfile: AnswerProfile;
  toolCalls: ToolCallRecord[];
  toolCount: number;
  emptyResultCount: number;
  duplicateCallCount: number;
  budgetStopReason?: string;
  securityRedactionHits: number;
  evidenceCount: number;
  citationOrphans: number;
  retrievalPlanKind?: string;
  evidenceBundle?: EvidenceBundle;
  citationReport?: CitationReport;
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  const n = raw?.trim().toLowerCase();
  if (n === "true" || n === "1" || n === "yes") return true;
  if (n === "false" || n === "0" || n === "no") return false;
  return fallback;
}

export function loadRunTelemetryOptions(
  projectRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): RunTelemetryOptions {
  return {
    enabled: parseBool(env.LLM_WIKI_RUN_TELEMETRY_ENABLED, true),
    runsDir: path.join(projectRoot, ".reasonix", "runs"),
  };
}

function looksEmptyResult(result: string): boolean {
  const t = result.trim();
  if (!t) return true;
  if (t === "[]" || t === "{}") return true;
  if (/^no (files|matches|results)/i.test(t)) return true;
  if (/0 (matches|results|files)/i.test(t)) return true;
  if (t.includes('"matches":[]') || t.includes('"hits":[]')) return true;
  return false;
}

export class RunTelemetry {
  readonly runId: string;
  readonly startedAt = new Date().toISOString();
  private readonly toolCalls: ToolCallRecord[] = [];
  private emptyResultCount = 0;
  private duplicateCallCount = 0;
  private budgetStopReason?: string;
  private securityRedactionHits = 0;

  constructor(
    private readonly opts: RunTelemetryOptions,
    runId: string = randomUUID(),
  ) {
    this.runId = runId;
  }

  onToolStart(name: string, args: Record<string, unknown>): void {
    this.toolCalls.push({ name, args });
  }

  onToolBlocked(name: string, args: Record<string, unknown>, blocked: string): void {
    this.toolCalls.push({ name, args, blocked });
    if (blocked === "duplicate") this.duplicateCallCount += 1;
    if (blocked === "total" || blocked === "per-tool" || blocked === "empty-streak") {
      this.budgetStopReason = blocked;
    }
  }

  onToolResult(result: string): void {
    if (looksEmptyResult(result)) this.emptyResultCount += 1;
    if (result.includes("security: redacted") || result.includes("security: content withheld")) {
      this.securityRedactionHits += 1;
    }
    try {
      const parsed = JSON.parse(result) as { budget?: string };
      if (parsed.budget) this.budgetStopReason = parsed.budget;
    } catch {
      /* not json */
    }
  }

  finalize(input: {
    question: string;
    surface: "agent" | "mcp";
    answerProfile: AnswerProfile;
    evidenceBundle: EvidenceBundle;
    citationReport: CitationReport;
    retrievalPlanKind?: string;
  }): RunTelemetrySnapshot {
    const snapshot: RunTelemetrySnapshot = {
      runId: this.runId,
      startedAt: this.startedAt,
      endedAt: new Date().toISOString(),
      question: input.question,
      surface: input.surface,
      answerProfile: input.answerProfile,
      toolCalls: this.toolCalls,
      toolCount: this.toolCalls.filter((c) => !c.blocked).length,
      emptyResultCount: this.emptyResultCount,
      duplicateCallCount: this.duplicateCallCount,
      budgetStopReason: this.budgetStopReason,
      securityRedactionHits: this.securityRedactionHits,
      evidenceCount: input.evidenceBundle.items.length,
      citationOrphans: input.citationReport.orphans.length,
      retrievalPlanKind: input.retrievalPlanKind,
      evidenceBundle: input.evidenceBundle,
      citationReport: input.citationReport,
    };

    if (this.opts.enabled !== false) {
      try {
        mkdirSync(this.opts.runsDir!, { recursive: true });
        writeFileSync(
          path.join(this.opts.runsDir!, `${this.runId}.json`),
          JSON.stringify(snapshot, null, 2),
          "utf8",
        );
      } catch {
        /* telemetry must never break request path */
      }
    }

    return snapshot;
  }
}

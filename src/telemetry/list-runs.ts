import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import type { RunTelemetrySnapshot } from "./run-telemetry.js";

export interface RunListItem {
  runId: string;
  startedAt: string;
  endedAt: string;
  question: string;
  surface: RunTelemetrySnapshot["surface"];
  answerProfile: RunTelemetrySnapshot["answerProfile"];
  toolCount: number;
  emptyResultCount: number;
  duplicateCallCount: number;
  budgetStopReason?: string;
  evidenceCount: number;
  citationOrphans: number;
  retrievalPlanKind?: string;
}

function runsDir(projectRoot: string): string {
  return path.join(projectRoot, ".reasonix", "runs");
}

export function listRunTelemetry(
  projectRoot: string,
  limit = 50,
): RunListItem[] {
  const dir = runsDir(projectRoot);
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }

  const items: Array<RunListItem & { mtime: number }> = [];
  for (const file of files) {
    const full = path.join(dir, file);
    try {
      const raw = readFileSync(full, "utf8");
      const snap = JSON.parse(raw) as RunTelemetrySnapshot & { retrievalPlanKind?: string };
      items.push({
        runId: snap.runId,
        startedAt: snap.startedAt,
        endedAt: snap.endedAt,
        question: snap.question,
        surface: snap.surface,
        answerProfile: snap.answerProfile,
        toolCount: snap.toolCount,
        emptyResultCount: snap.emptyResultCount,
        duplicateCallCount: snap.duplicateCallCount,
        budgetStopReason: snap.budgetStopReason,
        evidenceCount: snap.evidenceCount,
        citationOrphans: snap.citationOrphans,
        retrievalPlanKind: snap.retrievalPlanKind,
        mtime: statSync(full).mtimeMs,
      });
    } catch {
      /* skip corrupt files */
    }
  }

  return items
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit)
    .map(({ mtime: _mtime, ...rest }) => rest);
}

export function readRunTelemetry(
  projectRoot: string,
  runId: string,
): RunTelemetrySnapshot | null {
  const safe = runId.replace(/[^a-zA-Z0-9-]/g, "");
  if (!safe) return null;
  const full = path.join(runsDir(projectRoot), `${safe}.json`);
  try {
    return JSON.parse(readFileSync(full, "utf8")) as RunTelemetrySnapshot;
  } catch {
    return null;
  }
}

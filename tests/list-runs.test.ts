import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { listRunTelemetry, readRunTelemetry } from "../src/telemetry/list-runs.js";

describe("list runs telemetry", () => {
  it("lists and reads run json files", () => {
    const root = path.join(process.cwd(), ".reasonix-test-runs");
    const runsDir = path.join(root, ".reasonix", "runs");
    mkdirSync(runsDir, { recursive: true });
    const runId = "test-run-1";
    writeFileSync(
      path.join(runsDir, `${runId}.json`),
      JSON.stringify({
        runId,
        startedAt: "2026-01-01T00:00:00.000Z",
        endedAt: "2026-01-01T00:01:00.000Z",
        question: "hello?",
        surface: "agent",
        answerProfile: "debug",
        toolCalls: [],
        toolCount: 2,
        emptyResultCount: 0,
        duplicateCallCount: 0,
        securityRedactionHits: 0,
        evidenceCount: 1,
        citationOrphans: 0,
        retrievalPlanKind: "general",
      }),
      "utf8",
    );

    const list = listRunTelemetry(root, 10);
    expect(list.some((r) => r.runId === runId)).toBe(true);
    const detail = readRunTelemetry(root, runId);
    expect(detail?.question).toBe("hello?");
  });
});

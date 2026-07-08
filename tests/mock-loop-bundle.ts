import { randomUUID } from "node:crypto";
import { vi } from "vitest";

import { EvidenceCollector } from "../src/core/evidence/index.js";
import type { LoopEvent } from "../src/core/loop/types.js";
import type { CacheFirstLoop, LoopBundle } from "../src/loop-runner.js";
import { RunTelemetry } from "../src/telemetry/run-telemetry.js";

function seedEvidenceFromEvents(collector: EvidenceCollector, events: LoopEvent[]): void {
  for (const event of events) {
    if (event.role === "tool_start" && event.toolName) {
      let args: Record<string, unknown> = {};
      if (event.toolArgs) {
        try {
          args = JSON.parse(event.toolArgs) as Record<string, unknown>;
        } catch {
          args = {};
        }
      }
      collector.onToolStart(event.toolName, args);
    }
    if (event.role === "tool" && event.toolName) {
      let args: Record<string, unknown> = {};
      if (event.toolArgs) {
        try {
          args = JSON.parse(event.toolArgs) as Record<string, unknown>;
        } catch {
          args = {};
        }
      }
      collector.onToolResult(event.toolName, args, event.content);
    }
  }
}

export function mockLoop(events: LoopEvent[]): CacheFirstLoop {
  const abort = vi.fn();
  const step = vi.fn(async function* () {
    for (const event of events) yield event;
  });
  return { abort, step } as unknown as CacheFirstLoop;
}

export function mockLoopBundle(events: LoopEvent[], question = "test"): LoopBundle {
  const evidence = new EvidenceCollector(randomUUID(), question);
  seedEvidenceFromEvents(evidence, events);
  const bundle = evidence.toBundle();
  if (bundle.items.length === 0 && bundle.negativeSearches.length === 0) {
    evidence.onToolStart("search_content", { query: "mock-evidence-seed" });
  }
  return {
    loop: mockLoop(events),
    evidence,
    telemetry: new RunTelemetry({ enabled: false }, randomUUID()),
  };
}

export function bundleFromLoop(loop: CacheFirstLoop, question = "test", events: LoopEvent[] = []): LoopBundle {
  const evidence = new EvidenceCollector(randomUUID(), question);
  seedEvidenceFromEvents(evidence, events);
  const bundle = evidence.toBundle();
  if (bundle.items.length === 0 && bundle.negativeSearches.length === 0) {
    evidence.onToolStart("search_content", { query: "mock-evidence-seed" });
  }
  return {
    loop,
    evidence,
    telemetry: new RunTelemetry({ enabled: false }, randomUUID()),
  };
}

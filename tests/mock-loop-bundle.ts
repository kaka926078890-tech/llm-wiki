import { randomUUID } from "node:crypto";
import { vi } from "vitest";

import { EvidenceCollector } from "../src/core/evidence/index.js";
import type { LoopEvent } from "../src/core/loop/types.js";
import type { CacheFirstLoop, LoopBundle } from "../src/loop-runner.js";
import { RunTelemetry } from "../src/telemetry/run-telemetry.js";

export function mockLoop(events: LoopEvent[]): CacheFirstLoop {
  const abort = vi.fn();
  const step = vi.fn(async function* () {
    for (const event of events) yield event;
  });
  return { abort, step } as unknown as CacheFirstLoop;
}

export function mockLoopBundle(events: LoopEvent[], question = "test"): LoopBundle {
  return bundleFromLoop(mockLoop(events), question);
}

export function bundleFromLoop(loop: CacheFirstLoop, question = "test"): LoopBundle {
  return {
    loop,
    evidence: new EvidenceCollector(randomUUID(), question),
    telemetry: new RunTelemetry({ enabled: false }, randomUUID()),
  };
}

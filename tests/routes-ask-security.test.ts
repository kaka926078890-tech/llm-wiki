import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { getProjectRoot, loadConfig, type LlmWikiConfig } from "../src/config.js";
import type { LoopEvent } from "../src/core/loop/types.js";
import { mockLoopBundle } from "./mock-loop-bundle.js";

function testConfig(): LlmWikiConfig {
  return loadConfig({
    DEEPSEEK_API_KEY: "test-key",
    REPO_CHATKIT_MIDDLEWARE: getProjectRoot(),
    REPO_CHATKIT_WEB: getProjectRoot(),
    REPO_FINCLAW: getProjectRoot(),
  });
}

function parseSsePayloads(body: string): LoopEvent[] {
  const events: LoopEvent[] = [];
  for (const block of body.split("\n\n")) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const dataLine = trimmed.split("\n").find((line) => line.startsWith("data: "));
    if (dataLine) events.push(JSON.parse(dataLine.slice("data: ".length)) as LoopEvent);
  }
  return events;
}

function mockLoop(events: LoopEvent[]): CacheFirstLoop {
  const abort = vi.fn();
  const step = vi.fn(async function* () {
    for (const event of events) yield event;
  });
  return { abort, step } as unknown as CacheFirstLoop;
}

describe("routes-ask agent stream", () => {
  it("does not redact streamed assistant final answers", async () => {
    const app = await createApp({
      config: testConfig(),
      buildLoopBundle: async (_cfg, question) =>
        mockLoopBundle([
          {
            turn: 1,
            role: "assistant_final",
            content: "Use Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456",
          },
          { turn: 1, role: "done", content: "" },
        ], question),
    });

    const res = await app.inject({
      method: "POST",
      url: "/agent/run",
      headers: { "content-type": "application/json" },
      payload: { messages: [{ role: "user", content: "leak token" }] },
    });

    const parsed = parseSsePayloads(res.body);
    const final = parsed.find((event) => event.role === "assistant_final");
    expect(final?.content).toContain("Bearer abcdefghijklmnopqrstuvwxyz123456");
    await app.close();
  });
});

import { describe, expect, it, vi } from "vitest";

import { getProjectRoot, type LlmWikiConfig } from "../src/config.js";
import { Usage } from "../src/core/client.js";
import { buildLoop } from "../src/loop-runner.js";
import type { ToolCall } from "../src/core/types.js";
import type { LoopEvent } from "../src/core/loop/types.js";

function testConfig(): LlmWikiConfig {
  const projectRoot = getProjectRoot();
  return {
    projectRoot,
    deepseekApiKey: "test-key",
    deepseekBaseUrl: "https://api.deepseek.com",
    deepseekModel: "deepseek-chat",
    port: 3001,
    host: "127.0.0.1",
    repos: {
      middleware: projectRoot,
      web: projectRoot,
      finclaw: projectRoot,
    },
  };
}

describe("loop-smoke", () => {
  it("P1-LOOP-01 buildLoop returns a runnable instance", () => {
    const loop = buildLoop(testConfig());
    expect(loop).toBeDefined();
    expect(typeof loop.step).toBe("function");
  });

  it("P1-LOOP-02 mock LLM tool_call executes at least one tool", async () => {
    const loop = buildLoop(testConfig());
    const toolCalls: ToolCall[] = [
      {
        id: "call-1",
        type: "function",
        function: { name: "search_files", arguments: JSON.stringify({ pattern: "config" }) },
      },
    ];

    let chatRound = 0;
    vi.spyOn(loop.client, "chat").mockImplementation(async () => {
      chatRound += 1;
      if (chatRound === 1) {
        return {
          content: "",
          reasoningContent: null,
          toolCalls,
          usage: Usage.fromApi({ prompt_tokens: 1, completion_tokens: 1 }),
          raw: {},
        };
      }
      return {
        content: "Found config files in the workspace.",
        reasoningContent: null,
        toolCalls: [],
        usage: Usage.fromApi({ prompt_tokens: 1, completion_tokens: 2 }),
        raw: {},
      };
    });

    const events: LoopEvent[] = [];
    for await (const ev of loop.step("where is config?")) {
      events.push(ev);
    }

    const toolEvents = events.filter((e) => e.role === "tool");
    expect(toolEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("P1-LOOP-03 mock final assistant yields assistant_final or done", async () => {
    const loop = buildLoop(testConfig());

    vi.spyOn(loop.client, "chat").mockResolvedValue({
      content: "Done answering.",
      reasoningContent: null,
      toolCalls: [],
      usage: Usage.fromApi({ prompt_tokens: 1, completion_tokens: 1 }),
      raw: {},
    });

    const events: LoopEvent[] = [];
    for await (const ev of loop.step("hello")) {
      events.push(ev);
    }

    const hasFinal = events.some(
      (e) => e.role === "assistant_final" || e.role === "done",
    );
    expect(hasFinal).toBe(true);
  });
});

import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { getProjectRoot, type LlmWikiConfig } from "../src/config.js";
import type { LoopEvent } from "../src/core/loop/types.js";
import type { CacheFirstLoop } from "../src/loop-runner.js";

function testConfig(): LlmWikiConfig {
  const projectRoot = getProjectRoot();
  return {
    projectRoot,
    deepseekApiKey: "test-key",
    deepseekBaseUrl: "https://api.deepseek.com",
    deepseekModel: "deepseek-chat",
    port: 0,
    host: "127.0.0.1",
    repos: {
      middleware: projectRoot,
      web: projectRoot,
      finclaw: projectRoot,
    },
  };
}

function mockLoop(events: LoopEvent[]): CacheFirstLoop {
  const abort = vi.fn();
  const step = vi.fn(async function* () {
    for (const ev of events) yield ev;
  });
  return { abort, step } as unknown as CacheFirstLoop;
}

describe("routes-mcp", () => {
  it("initializes a streamable HTTP MCP session", async () => {
    const app = await createApp({
      config: testConfig(),
      buildLoop: () => mockLoop([]),
    });

    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        accept: "application/json, text/event-stream",
      },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "0.0.0" },
        },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["mcp-session-id"]).toEqual(expect.any(String));
    expect(res.json()).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-03-26",
        serverInfo: { name: "llm-wiki" },
      },
    });
    await app.close();
  });

  it("lists the ask_llm_wiki tool", async () => {
    const app = await createApp({
      config: testConfig(),
      buildLoop: () => mockLoop([]),
    });

    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      payload: {
        jsonrpc: "2.0",
        id: "tools",
        method: "tools/list",
        params: {},
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      result: { tools: Array<{ name: string; inputSchema: { required?: string[] } }> };
    };
    expect(body.result.tools[0]?.name).toBe("ask_llm_wiki");
    expect(body.result.tools[0]?.inputSchema.required).toContain("question");
    await app.close();
  });

  it("calls ask_llm_wiki and returns the final answer", async () => {
    const events: LoopEvent[] = [
      {
        turn: 1,
        role: "tool_start",
        content: "",
        toolName: "search_content",
        toolArgs: '{"pattern":"MCP"}',
      },
      {
        turn: 1,
        role: "assistant_final",
        content: "llm-wiki can be exposed as an MCP server.",
      },
      { turn: 1, role: "done", content: "" },
    ];
    const app = await createApp({
      config: testConfig(),
      buildLoop: () => mockLoop(events),
    });

    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      payload: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "ask_llm_wiki",
          arguments: {
            question: "How should this be integrated?",
            include_reasoning: true,
          },
        },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      jsonrpc: "2.0",
      id: 2,
      result: {
        content: [
          {
            type: "text",
            text: expect.stringContaining("llm-wiki can be exposed as an MCP server."),
          },
        ],
        isError: false,
      },
    });
    expect(res.body).toContain("tool_start search_content");
    await app.close();
  });

  it("truncates oversized ask_llm_wiki results for MCP clients", async () => {
    const events: LoopEvent[] = [
      {
        turn: 1,
        role: "assistant_final",
        content: "x".repeat(5_000),
      },
      { turn: 1, role: "done", content: "" },
    ];
    const app = await createApp({
      config: testConfig(),
      buildLoop: () => mockLoop(events),
    });

    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      payload: {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "ask_llm_wiki",
          arguments: {
            question: "Give me a long answer",
            max_answer_chars: 1_000,
          },
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      result: { content: Array<{ type: string; text: string }>; isError: boolean };
    };
    const text = body.result.content[0]?.text ?? "";
    expect(text.length).toBeLessThanOrEqual(1_000);
    expect(text).toContain("llm-wiki truncated this MCP result");
    await app.close();
  });

  it("streams ask_llm_wiki chunks over MCP SSE before the final result", async () => {
    const events: LoopEvent[] = [
      {
        turn: 1,
        role: "assistant_delta",
        content: "part one ",
      },
      {
        turn: 1,
        role: "assistant_final",
        content: "part two",
      },
      { turn: 1, role: "done", content: "" },
    ];
    const app = await createApp({
      config: testConfig(),
      buildLoop: () => mockLoop(events),
    });

    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        accept: "application/json, text/event-stream",
      },
      payload: {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "ask_llm_wiki",
          arguments: {
            question: "Stream this answer",
          },
        },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    const frames = res.body
      .split("\n\n")
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => {
        const data = block.split("\n").find((line) => line.startsWith("data: "));
        return data ? JSON.parse(data.slice("data: ".length)) : null;
      });
    expect(frames).toHaveLength(3);
    expect(frames[0]).toMatchObject({
      method: "notifications/message",
      params: { data: { type: "text", text: "part one " } },
    });
    expect(frames[1]).toMatchObject({
      method: "notifications/message",
      params: { data: { type: "text", text: "part two" } },
    });
    expect(frames[2]).toMatchObject({
      jsonrpc: "2.0",
      id: 4,
      result: {
        content: [{ type: "text", text: "part one part two" }],
        isError: false,
      },
    });
    await app.close();
  });
});

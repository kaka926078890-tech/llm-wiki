import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { getProjectRoot, loadConfig, type LlmWikiConfig } from "../src/config.js";
import type { LoopEvent } from "../src/core/loop/types.js";
import type { CacheFirstLoop } from "../src/loop-runner.js";

function testConfig(): LlmWikiConfig {
  return loadConfig({
    DEEPSEEK_API_KEY: "test-key",
    REPO_CHATKIT_MIDDLEWARE: getProjectRoot(),
    REPO_CHATKIT_WEB: getProjectRoot(),
    REPO_FINCLAW: getProjectRoot(),
    LLM_WIKI_TEI_BASE_URL: "",
  });
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
      buildLoop: async () => mockLoop([]),
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

  it("lists only the ask_llm_wiki tool", async () => {
    const app = await createApp({
      config: testConfig(),
      buildLoop: async () => mockLoop([]),
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
      result: {
        tools: Array<{
          name: string;
          description: string;
          inputSchema: { required?: string[]; properties?: Record<string, unknown> };
        }>;
      };
    };
    expect(body.result.tools.map((tool) => tool.name)).toEqual(["ask_llm_wiki"]);
    expect(body.result.tools[0]?.inputSchema.required).toContain("question");
    expect(body.result.tools[0]?.inputSchema.properties).not.toHaveProperty("include_reasoning");
    expect(body.result.tools[0]?.inputSchema.properties).not.toHaveProperty("max_answer_chars");
    expect(body.result.tools[0]?.description).toContain("Do not call this tool again");
    expect(body.result.tools[0]?.description).toContain("do not infer that more content is available");
    expect(body.result.tools[0]?.description).toContain("Answer the user from the received result");
    await app.close();
  });

  it("calls ask_llm_wiki and returns the full answer directly", async () => {
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
      buildLoop: async () => mockLoop(events),
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
            text: "llm-wiki can be exposed as an MCP server.",
          },
        ],
        isError: false,
      },
    });
    expect(res.body).not.toContain("result_id: wiki_");
    expect(res.body).not.toContain("read_llm_wiki_result");
    expect(res.body).not.toContain("tool_start search_content");
    await app.close();
  });

  it("does not add frontline non-technical no-code instructions to MCP ask prompts", async () => {
    const step = vi.fn(async function* () {
      yield {
        turn: 1,
        role: "assistant_final",
        content: "功能说明",
      } satisfies LoopEvent;
      yield { turn: 1, role: "done", content: "" } satisfies LoopEvent;
    });
    const app = await createApp({
      config: testConfig(),
      buildLoop: async () => ({ abort: vi.fn(), step }) as unknown as CacheFirstLoop,
    });

    await app.inject({
      method: "POST",
      url: "/mcp",
      payload: {
        jsonrpc: "2.0",
        id: 20,
        method: "tools/call",
        params: {
          name: "ask_llm_wiki",
          arguments: {
            question: "用户端有哪些功能？",
          },
        },
      },
    });

    const prompt = step.mock.calls[0]?.[0] ?? "";
    expect(prompt).toContain("用户端有哪些功能？");
    expect(prompt).not.toContain("一线非技术");
    expect(prompt).not.toContain("禁止返回任何代码");
    expect(prompt).not.toContain("Please answer concisely");
    await app.close();
  });

  it("returns oversized ask_llm_wiki results directly without a handle", async () => {
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
      buildLoop: async () => mockLoop(events),
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
          },
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      result: { content: Array<{ type: string; text: string }>; isError: boolean };
    };
    const text = body.result.content[0]?.text ?? "";
    expect(text).toBe("x".repeat(5_000));
    expect(text).not.toContain("result_id: wiki_");
    expect(text).not.toContain("read_llm_wiki_result");
    expect(text).not.toContain("truncated");
    await app.close();
  });

  it("rejects legacy read_llm_wiki_result tool calls", async () => {
    const step = vi.fn(async function* () {
      yield {
        turn: 1,
        role: "assistant_final",
        content: "abcdef",
      } satisfies LoopEvent;
      yield { turn: 1, role: "done", content: "" } satisfies LoopEvent;
    });
    const app = await createApp({
      config: testConfig(),
      buildLoop: async () => ({ abort: vi.fn(), step }) as unknown as CacheFirstLoop,
    });

    const read = await app.inject({
      method: "POST",
      url: "/mcp",
      payload: {
        jsonrpc: "2.0",
        id: 11,
        method: "tools/call",
        params: {
          name: "read_llm_wiki_result",
          arguments: {
            result_id: "wiki_legacy",
            cursor: 3,
            max_chars: 3,
          },
        },
      },
    });

    expect(read.statusCode).toBe(200);
    expect(read.json()).toMatchObject({
      jsonrpc: "2.0",
      id: 11,
      error: {
        code: -32602,
        message: "Unknown tool: read_llm_wiki_result",
      },
    });
    expect(step).not.toHaveBeenCalled();
    await app.close();
  });

  it("preserves original MCP answers in the direct ask_llm_wiki response", async () => {
    const step = vi.fn(async function* () {
      yield {
        turn: 1,
        role: "assistant_final",
        content:
          "用户可以在后台维护模板。\n\n```ts\nconst secret = createAdminClient();\n```\n\n证据链接: [App.tsx](../../chatkit-web/src/App.tsx:191)\n路径 src/services/adminApi.ts:1940 还有 JSON 配置。",
      } satisfies LoopEvent;
      yield {
        turn: 1,
        role: "tool",
        content: "raw source code here",
        toolName: "read_file",
      } satisfies LoopEvent;
      yield { turn: 1, role: "done", content: "" } satisfies LoopEvent;
    });
    const app = await createApp({
      config: testConfig(),
      buildLoop: async () => ({ abort: vi.fn(), step }) as unknown as CacheFirstLoop,
    });

    const ask = await app.inject({
      method: "POST",
      url: "/mcp",
      payload: {
        jsonrpc: "2.0",
        id: 30,
        method: "tools/call",
        params: {
          name: "ask_llm_wiki",
          arguments: {
            question: "模板有什么功能？",
          },
        },
      },
    });
    const askText = (ask.json() as { result: { content: Array<{ text: string }> } }).result
      .content[0]!.text;
    expect(askText).toContain("用户可以在后台维护模板");
    expect(askText).toContain("const secret");
    expect(askText).toContain("App.tsx");
    expect(askText).toContain("adminApi.ts");
    expect(askText).not.toContain("result_id:");
    expect(askText).not.toContain("read_llm_wiki_result");
    await app.close();
  });

  it("returns full ask_llm_wiki results directly without an 8000 character cap", async () => {
    const longAnswer = `${"a".repeat(9_000)}needle-after-9000${"b".repeat(3_000)}`;
    const step = vi.fn(async function* () {
      yield {
        turn: 1,
        role: "assistant_final",
        content: longAnswer,
      } satisfies LoopEvent;
      yield { turn: 1, role: "done", content: "" } satisfies LoopEvent;
    });
    const app = await createApp({
      config: testConfig(),
      buildLoop: async () => ({ abort: vi.fn(), step }) as unknown as CacheFirstLoop,
    });

    const ask = await app.inject({
      method: "POST",
      url: "/mcp",
      payload: {
        jsonrpc: "2.0",
        id: 32,
        method: "tools/call",
        params: {
          name: "ask_llm_wiki",
          arguments: {
            question: "Cache this long answer",
          },
        },
      },
    });
    const askText = (ask.json() as { result: { content: Array<{ text: string }> } }).result
      .content[0]!.text;
    expect(askText).toBe(longAnswer);
    expect(askText).toContain("needle-after-9000");
    expect(askText).toContain("b".repeat(500));
    expect(askText).not.toContain("result_id:");
    expect(askText).not.toContain("next_cursor:");
    expect(step).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("ignores legacy max_answer_chars and returns the full ask_llm_wiki result", async () => {
    const step = vi.fn(async function* () {
      yield {
        turn: 1,
        role: "assistant_final",
        content: `${"a".repeat(1_000)}${"b".repeat(500)}${"c".repeat(500)}`,
      } satisfies LoopEvent;
      yield { turn: 1, role: "done", content: "" } satisfies LoopEvent;
    });
    const app = await createApp({
      config: testConfig(),
      buildLoop: async () => ({ abort: vi.fn(), step }) as unknown as CacheFirstLoop,
    });

    const ask = await app.inject({
      method: "POST",
      url: "/mcp",
      payload: {
        jsonrpc: "2.0",
        id: 12,
        method: "tools/call",
        params: {
          name: "ask_llm_wiki",
          arguments: {
            question: "Cache this",
            max_answer_chars: 1_000,
          },
        },
      },
    });
    const askText = (ask.json() as { result: { content: Array<{ text: string }> } }).result
      .content[0]!.text;
    expect(askText).toBe(`${"a".repeat(1_000)}${"b".repeat(500)}${"c".repeat(500)}`);
    expect(askText).not.toContain("range: 0-1000 of 2000");
    expect(askText).not.toContain("read_llm_wiki_result");
    expect(step).toHaveBeenCalledTimes(1);
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
      buildLoop: async () => mockLoop(events),
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
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({
      jsonrpc: "2.0",
      id: 4,
      result: {
        content: [{ type: "text", text: "part one part two" }],
        isError: false,
      },
    });
    expect(res.body).not.toContain("result_id: wiki_");
    expect(res.body).not.toContain("read_llm_wiki_result");
    await app.close();
  });
});

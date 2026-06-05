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
      result: {
        tools: Array<{
          name: string;
          inputSchema: { required?: string[]; properties?: Record<string, unknown> };
        }>;
      };
    };
    expect(body.result.tools.map((tool) => tool.name)).toEqual([
      "ask_llm_wiki",
      "read_llm_wiki_result",
    ]);
    expect(body.result.tools[0]?.inputSchema.required).toContain("question");
    expect(body.result.tools[0]?.inputSchema.properties).not.toHaveProperty("include_reasoning");
    await app.close();
  });

  it("calls ask_llm_wiki and returns only a cached result handle", async () => {
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
            text: expect.stringContaining("llm-wiki result prepared"),
          },
        ],
        isError: false,
      },
    });
    expect(res.body).toContain("result_id: wiki_");
    expect(res.body).toContain("next_action: call read_llm_wiki_result");
    expect(res.body).not.toContain("llm-wiki can be exposed as an MCP server.");
    expect(res.body).not.toContain("tool_start search_content");
    await app.close();
  });

  it("adds frontline non-technical no-code instructions to MCP ask prompts", async () => {
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
      buildLoop: () => ({ abort: vi.fn(), step }) as unknown as CacheFirstLoop,
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
    expect(prompt).toContain("一线非技术");
    expect(prompt).toContain("禁止返回任何代码");
    expect(prompt).toContain("操作步骤");
    await app.close();
  });

  it("stores oversized ask_llm_wiki results and returns only a handle", async () => {
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
    expect(text.length).toBeLessThanOrEqual(500);
    expect(text).toContain("llm-wiki result prepared");
    expect(text).toContain("result_id: wiki_");
    expect(text).toContain("next_action: call read_llm_wiki_result");
    expect(text).not.toContain("x".repeat(100));
    expect(text).not.toContain("truncated");
    await app.close();
  });

  it("reads cached llm-wiki result chunks without rerunning the loop", async () => {
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
      buildLoop: () => ({ abort: vi.fn(), step }) as unknown as CacheFirstLoop,
    });

    const ask = await app.inject({
      method: "POST",
      url: "/mcp",
      payload: {
        jsonrpc: "2.0",
        id: 10,
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
    const resultId = askText.match(/result_id: (wiki_[^\n]+)/)?.[1];
    expect(resultId).toEqual(expect.stringMatching(/^wiki_/));
    expect(askText).not.toContain("abcdef");

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
            result_id: resultId,
            cursor: 3,
            max_chars: 3,
          },
        },
      },
    });

    expect(read.statusCode).toBe(200);
    const readText = (read.json() as { result: { content: Array<{ text: string }> } }).result
      .content[0]!.text;
    expect(readText).toContain("range: 3-6 of 6");
    expect(readText).toContain("def");
    expect(step).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("sanitizes cached MCP answers before read_llm_wiki_result exposes them", async () => {
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
      buildLoop: () => ({ abort: vi.fn(), step }) as unknown as CacheFirstLoop,
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
            include_reasoning: true,
          },
        },
      },
    });
    const askText = (ask.json() as { result: { content: Array<{ text: string }> } }).result
      .content[0]!.text;
    const resultId = askText.match(/result_id: (wiki_[^\n]+)/)?.[1];

    const read = await app.inject({
      method: "POST",
      url: "/mcp",
      payload: {
        jsonrpc: "2.0",
        id: 31,
        method: "tools/call",
        params: {
          name: "read_llm_wiki_result",
          arguments: {
            result_id: resultId,
          },
        },
      },
    });

    const readText = (read.json() as { result: { content: Array<{ text: string }> } }).result
      .content[0]!.text;
    expect(readText).toContain("用户可以在后台维护模板");
    expect(readText).not.toContain("const secret");
    expect(readText).not.toContain("App.tsx");
    expect(readText).not.toContain("adminApi.ts");
    expect(readText).not.toContain("raw source code");
    expect(readText).not.toContain("Tool trace");
    await app.close();
  });

  it("auto-continues cached chunks when cursor is omitted", async () => {
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
      buildLoop: () => ({ abort: vi.fn(), step }) as unknown as CacheFirstLoop,
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
    const resultId = askText.match(/result_id: (wiki_[^\n]+)/)?.[1];
    expect(askText).not.toContain("range: 0-1000 of 2000");

    const read = await app.inject({
      method: "POST",
      url: "/mcp",
      payload: {
        jsonrpc: "2.0",
        id: 13,
        method: "tools/call",
        params: {
          name: "read_llm_wiki_result",
          arguments: {
            result_id: resultId,
            max_chars: 500,
          },
        },
      },
    });

    const readText = (read.json() as { result: { content: Array<{ text: string }> } }).result
      .content[0]!.text;
    expect(readText).toContain("range: 0-500 of 2000");
    expect(readText).toContain("a".repeat(100));
    await app.inject({
      method: "POST",
      url: "/mcp",
      payload: {
        jsonrpc: "2.0",
        id: 14,
        method: "tools/call",
        params: {
          name: "read_llm_wiki_result",
          arguments: {
            result_id: resultId,
            max_chars: 500,
          },
        },
      },
    });
    const secondRead = await app.inject({
      method: "POST",
      url: "/mcp",
      payload: {
        jsonrpc: "2.0",
        id: 15,
        method: "tools/call",
        params: {
          name: "read_llm_wiki_result",
          arguments: {
            result_id: resultId,
            max_chars: 500,
          },
        },
      },
    });
    const secondReadText = (secondRead.json() as { result: { content: Array<{ text: string }> } })
      .result.content[0]!.text;
    expect(secondReadText).toContain("range: 1000-1500 of 2000");
    expect(secondReadText).toContain("b".repeat(100));
    expect(secondReadText).toContain("Do not call ask_llm_wiki again");
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
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({
      jsonrpc: "2.0",
      id: 4,
      result: {
        content: [{ type: "text", text: expect.stringContaining("llm-wiki result prepared") }],
        isError: false,
      },
    });
    expect(res.body).not.toContain("part one part two");
    await app.close();
  });
});

import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { getProjectRoot, loadConfig, type LlmWikiConfig } from "../src/config.js";
import type { LoopEvent } from "../src/core/loop/types.js";
import type { CacheFirstLoop } from "../src/loop-runner.js";
import { bundleFromLoop, mockLoopBundle } from "./mock-loop-bundle.js";

function testConfig(overrides: Record<string, string> = {}): LlmWikiConfig {
  return loadConfig({
    DEEPSEEK_API_KEY: "test-key",
    REPO_CHATKIT_MIDDLEWARE: getProjectRoot(),
    REPO_CHATKIT_WEB: getProjectRoot(),
    REPO_FINCLAW: getProjectRoot(),
    ...overrides,
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
      buildLoopBundle: async (_cfg, question) => mockLoopBundle([], question),
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
      buildLoopBundle: async (_cfg, question) => mockLoopBundle([], question),
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
    expect(body.result.tools[0]?.description).toContain("One-shot repository knowledge Q&A");
    expect(body.result.tools[0]?.description).toContain("not a code-search API");
    expect(body.result.tools[0]?.description).toContain(
      "presenting the tool result verbatim",
    );
    expect(body.result.tools[0]?.description).toContain("do not rewrite, reformat, summarize, or shorten");
    expect(body.result.tools[0]?.description).toContain("Do not call again for the same question");
    const questionSchema = body.result.tools[0]?.inputSchema.properties?.question as
      | { description?: string }
      | undefined;
    expect(questionSchema?.description).toContain("verbatim");
    expect(questionSchema?.description).toContain("do not rewrite, expand, split, or narrow");
    const repoScopeSchema = body.result.tools[0]?.inputSchema.properties?.repo_scope as
      | { description?: string }
      | undefined;
    expect(repoScopeSchema?.description).toContain("Usually omit");
    expect(repoScopeSchema?.description).toContain("middleware=chatkit-middleware");
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
      buildLoopBundle: async (_cfg, question) => mockLoopBundle(events, question),
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

  it("summarizes MCP ask answers before returning them", async () => {
    const rawAnswer =
      "模板管理支持创建、编辑和发布模板。\n路径 src/services/adminApi.ts:1940。\n```ts\nconst templateApi = createClient();\n```";
    const summarize = vi.fn(async () => "模板管理支持创建、编辑和发布模板。");
    const app = await createApp({
      config: testConfig(),
      buildLoopBundle: async (_cfg, question) =>
        mockLoopBundle([
          {
            turn: 1,
            role: "assistant_final",
            content: rawAnswer,
          },
          { turn: 1, role: "done", content: "" },
        ], question),
      buildAnswerSummaryAgent: async () => ({ summarize }),
    });

    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      payload: {
        jsonrpc: "2.0",
        id: 21,
        method: "tools/call",
        params: {
          name: "ask_llm_wiki",
          arguments: {
            question: "模板有什么功能？",
          },
        },
      },
    });

    const text = (res.json() as { result: { content: Array<{ text: string }> } }).result
      .content[0]!.text;
    expect(text).toBe("模板管理支持创建、编辑和发布模板。");
    expect(summarize).toHaveBeenCalledWith({
      question: "模板有什么功能？",
      answer: rawAnswer,
    });
    await app.close();
  });

  it("strips forced-summary error prefixes from MCP ask answers", async () => {
    const rawAnswer = "errors.reasonStuck\n\n完整功能清单正文";
    const app = await createApp({
      config: testConfig(),
      buildLoopBundle: async (_cfg, question) =>
        mockLoopBundle([
          {
            turn: 1,
            role: "assistant_final",
            content: rawAnswer,
          },
          { turn: 1, role: "done", content: "" },
        ], question),
    });

    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      payload: {
        jsonrpc: "2.0",
        id: 22,
        method: "tools/call",
        params: {
          name: "ask_llm_wiki",
          arguments: {
            question: "功能清单",
          },
        },
      },
    });

    const text = (res.json() as { result: { content: Array<{ text: string }> } }).result
      .content[0]!.text;
    expect(text).toBe("完整功能清单正文");
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
      buildLoopBundle: async (_cfg, question) => bundleFromLoop({ abort: vi.fn(), step } as unknown as CacheFirstLoop, question),
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
      buildLoopBundle: async (_cfg, question) => mockLoopBundle(events, question),
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
      buildLoopBundle: async (_cfg, question) => bundleFromLoop({ abort: vi.fn(), step } as unknown as CacheFirstLoop, question),
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

  it("keeps the MCP answer direct while minimizing code and file-location details", async () => {
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
      buildLoopBundle: async (_cfg, question) => bundleFromLoop({ abort: vi.fn(), step } as unknown as CacheFirstLoop, question),
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
    expect(askText).toContain("源码示例已省略");
    expect(askText).toContain("源码位置");
    expect(askText).not.toContain("[INTERNAL_");
    expect(askText).not.toContain("const secret");
    expect(askText).not.toContain("../../chatkit-web/src/App.tsx:191");
    expect(askText).not.toContain("src/services/adminApi.ts:1940");
    expect(askText).not.toContain("result_id:");
    expect(askText).not.toContain("read_llm_wiki_result");
    await app.close();
  });

  it("redacts secret-like content in direct MCP ask answers", async () => {
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
      url: "/mcp",
      payload: {
        jsonrpc: "2.0",
        id: 31,
        method: "tools/call",
        params: {
          name: "ask_llm_wiki",
          arguments: {
            question: "token?",
          },
        },
      },
    });

    const text = (res.json() as { result: { content: Array<{ text: string }> } }).result
      .content[0]!.text;
    expect(text).toContain("[REDACTED_BEARER_TOKEN]");
    expect(text).not.toContain("abcdefghijklmnopqrstuvwxyz123456");
    await app.close();
  });

  it("summarizes internal implementation details into readable MCP categories", async () => {
    const app = await createApp({
      config: testConfig(),
      buildLoopBundle: async (_cfg, question) =>
        mockLoopBundle([
          {
            turn: 1,
            role: "assistant_final",
            content: [
              "VITE_PROXY_AGENT_TARGET defaults to http://localhost:26100.",
              "VITE_CHANNEL_LOGIN_PASSWORD configures channel test login.",
              "localStorage key chatkit-sessions-v1- stores cached sessions.",
              "Routes include /admin/users and /api/wecom/bind.",
            ].join("\n"),
          },
          { turn: 1, role: "done", content: "" },
        ], question),
    });

    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      payload: {
        jsonrpc: "2.0",
        id: 33,
        method: "tools/call",
        params: {
          name: "ask_llm_wiki",
          arguments: {
            question: "chatkit-web 都有哪些配置项？",
          },
        },
      },
    });

    const text = (res.json() as { result: { content: Array<{ text: string }> } }).result
      .content[0]!.text;
    expect(text).toContain("前端代理目标配置");
    expect(text).toContain("本地开发服务连接");
    expect(text).toContain("频道登录测试配置");
    expect(text).toContain("浏览器本地缓存配置");
    expect(text).toContain("管理后台接口");
    expect(text).toContain("第三方集成接口");
    expect(text).toContain("部分底层实现细节已按安全策略省略");
    expect(text).not.toContain("[INTERNAL_");
    expect(text).not.toContain("VITE_PROXY_AGENT_TARGET");
    expect(text).not.toContain("VITE_CHANNEL_LOGIN_PASSWORD");
    expect(text).not.toContain("http://localhost:26100");
    expect(text).not.toContain("chatkit-sessions-v1-");
    expect(text).not.toContain("/admin/users");
    await app.close();
  });

  it("uses the internal MCP answer profile without public category minimization", async () => {
    const app = await createApp({
      config: {
        ...testConfig(),
        answerProfiles: {
          agent: "debug",
          mcp: "internal",
        },
      },
      buildLoopBundle: async (_cfg, question) =>
        mockLoopBundle([
          {
            turn: 1,
            role: "assistant_final",
            content: "VITE_PROXY_AGENT_TARGET defaults to http://localhost:26100.",
          },
          { turn: 1, role: "done", content: "" },
        ], question),
    });

    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      payload: {
        jsonrpc: "2.0",
        id: 34,
        method: "tools/call",
        params: {
          name: "ask_llm_wiki",
          arguments: {
            question: "内部配置？",
          },
        },
      },
    });

    const text = (res.json() as { result: { content: Array<{ text: string }> } }).result
      .content[0]!.text;
    expect(text).toContain("VITE_PROXY_AGENT_TARGET");
    expect(text).toContain("http://localhost:26100");
    expect(text).not.toContain("前端代理目标配置");
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
      buildLoopBundle: async (_cfg, question) => bundleFromLoop({ abort: vi.fn(), step } as unknown as CacheFirstLoop, question),
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
      buildLoopBundle: async (_cfg, question) => bundleFromLoop({ abort: vi.fn(), step } as unknown as CacheFirstLoop, question),
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
      buildLoopBundle: async (_cfg, question) => mockLoopBundle(events, question),
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

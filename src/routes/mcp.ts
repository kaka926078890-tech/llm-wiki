import type { FastifyInstance } from "fastify";
import type { IncomingHttpHeaders } from "node:http";
import { randomUUID } from "node:crypto";
import type { LlmWikiConfig } from "../config.js";
import type { LoopEvent } from "../core/loop/types.js";
import type { CacheFirstLoop } from "../loop-runner.js";
import { buildLoop } from "../loop-runner.js";
import type { BuildLoopFn } from "./ask.js";

const MCP_PROTOCOL_VERSION = "2025-03-26";
const SERVER_NAME = "llm-wiki";
const SERVER_VERSION = "0.1.0";
const ASK_TOOL_NAME = "ask_llm_wiki";
const READ_RESULT_TOOL_NAME = "read_llm_wiki_result";

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: unknown;
}

interface JsonRpcFailure {
  jsonrpc: "2.0";
  id: JsonRpcId;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;

interface AskToolArguments {
  question: string;
  repo_scope?: string;
  include_reasoning?: boolean;
  max_answer_chars?: number;
}

interface ReadResultArguments {
  result_id: string;
  cursor?: number;
  max_chars?: number;
}

interface StoredResult {
  id: string;
  createdAt: number;
  question: string;
  text: string;
}

const DEFAULT_MAX_ANSWER_CHARS = 3_000;
const HARD_MAX_ANSWER_CHARS = 8_000;
const DEFAULT_CHUNK_CHARS = 3_000;
const HARD_CHUNK_CHARS = 8_000;
const MAX_STORED_RESULTS = 100;

type StreamChunk = {
  type: "text" | "trace";
  text: string;
};

type StreamChunkHandler = (chunk: StreamChunk) => void;

const askToolDefinition = {
  name: ASK_TOOL_NAME,
  description:
    "Ask llm-wiki to inspect the authorized ChatKit/FinClaw repositories once. The full answer is cached; this tool returns a concise first chunk plus a result_id for read_llm_wiki_result when more detail is needed.",
  inputSchema: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "Natural-language question about chatkit-middleware, chatkit-web, or finclaw.",
      },
      repo_scope: {
        type: "string",
        description:
          "Optional scope hint, for example chatkit-middleware, chatkit-web, finclaw, or all.",
      },
      include_reasoning: {
        type: "boolean",
        description: "When true, include compact reasoning/tool trace details in the returned text.",
      },
      max_answer_chars: {
        type: "integer",
        description:
          "Maximum first-chunk characters returned to the MCP client. Defaults to 3000 and is capped at 8000. Full answer remains available via read_llm_wiki_result.",
        minimum: 1000,
        maximum: HARD_MAX_ANSWER_CHARS,
      },
    },
    required: ["question"],
    additionalProperties: false,
  },
};

const readResultToolDefinition = {
  name: READ_RESULT_TOOL_NAME,
  description:
    "Read a cached llm-wiki answer by result_id without rerunning repository analysis. Use cursor from the previous response to get the next chunk.",
  inputSchema: {
    type: "object",
    properties: {
      result_id: {
        type: "string",
        description: "The result_id returned by ask_llm_wiki.",
      },
      cursor: {
        type: "integer",
        description: "Character offset to read from. Defaults to 0.",
        minimum: 0,
      },
      max_chars: {
        type: "integer",
        description: "Maximum chunk characters to return. Defaults to 3000 and is capped at 8000.",
        minimum: 500,
        maximum: HARD_CHUNK_CHARS,
      },
    },
    required: ["result_id"],
    additionalProperties: false,
  },
};

function rpcId(value: unknown): JsonRpcId {
  if (typeof value === "string" || typeof value === "number" || value === null) {
    return value;
  }
  return null;
}

function success(id: JsonRpcId, result: unknown): JsonRpcSuccess {
  return { jsonrpc: "2.0", id, result };
}

function failure(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcFailure {
  return {
    jsonrpc: "2.0",
    id,
    error: data === undefined ? { code, message } : { code, message, data },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getHeaderValue(requestHeaders: IncomingHttpHeaders, name: string): string {
  const raw = requestHeaders[name] ?? requestHeaders[name.toLowerCase()];
  if (Array.isArray(raw)) return String(raw[0] ?? "");
  return typeof raw === "string" ? raw : "";
}

function parseAskArgs(value: unknown): AskToolArguments {
  const args = asRecord(value);
  const question = typeof args.question === "string" ? args.question.trim() : "";
  if (!question) throw new Error('ask_llm_wiki requires a non-empty "question" argument');
  return {
    question,
    repo_scope: typeof args.repo_scope === "string" ? args.repo_scope.trim() : undefined,
    include_reasoning: args.include_reasoning === true,
    max_answer_chars: normalizeMaxAnswerChars(args.max_answer_chars),
  };
}

function parseReadResultArgs(value: unknown): ReadResultArguments {
  const args = asRecord(value);
  const resultId = typeof args.result_id === "string" ? args.result_id.trim() : "";
  if (!resultId) throw new Error('read_llm_wiki_result requires a non-empty "result_id" argument');
  return {
    result_id: resultId,
    cursor:
      typeof args.cursor === "number" && Number.isFinite(args.cursor)
        ? Math.max(0, Math.floor(args.cursor))
        : 0,
    max_chars: normalizeChunkChars(args.max_chars),
  };
}

function normalizeMaxAnswerChars(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_MAX_ANSWER_CHARS;
  return Math.min(HARD_MAX_ANSWER_CHARS, Math.max(1_000, Math.floor(value)));
}

function normalizeChunkChars(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_CHUNK_CHARS;
  return Math.min(HARD_CHUNK_CHARS, Math.max(500, Math.floor(value)));
}

function sliceByChars(text: string, cursor: number, maxChars: number): {
  chunk: string;
  nextCursor: number | null;
  totalChars: number;
} {
  const chars = [...text];
  const start = Math.min(cursor, chars.length);
  const end = Math.min(chars.length, start + maxChars);
  return {
    chunk: chars.slice(start, end).join(""),
    nextCursor: end < chars.length ? end : null,
    totalChars: chars.length,
  };
}

function renderStoredChunk(stored: StoredResult, cursor: number, maxChars: number): string {
  const { chunk, nextCursor, totalChars } = sliceByChars(stored.text, cursor, maxChars);
  const header = [
    `llm-wiki result_id: ${stored.id}`,
    `chars: ${Math.min(cursor, totalChars)}-${nextCursor ?? totalChars} of ${totalChars}`,
    nextCursor === null
      ? "next_cursor: null"
      : `next_cursor: ${nextCursor} (call read_llm_wiki_result with this cursor for the next chunk)`,
  ].join("\n");
  return `${header}\n\n${chunk}`;
}

function acceptsEventStream(headers: IncomingHttpHeaders): boolean {
  return getHeaderValue(headers, "accept").toLowerCase().includes("text/event-stream");
}

function sseFrame(message: unknown): string {
  return `event: message\ndata: ${JSON.stringify(message)}\n\n`;
}

function chunkNotification(chunk: StreamChunk): Record<string, unknown> {
  return {
    jsonrpc: "2.0",
    method: "notifications/message",
    params: {
      level: "info",
      logger: "llm-wiki",
      data: chunk,
    },
  };
}

function toolTraceLine(ev: LoopEvent): string | null {
  if (ev.role === "tool_start" && ev.toolName) {
    return `tool_start ${ev.toolName}${ev.toolArgs ? ` ${ev.toolArgs}` : ""}`;
  }
  if (ev.role === "tool" && ev.toolName) {
    return `tool_result ${ev.toolName}: ${ev.content}`.trim();
  }
  if (ev.role === "warning" && ev.content) {
    return `warning: ${ev.content}`;
  }
  return null;
}

async function runAskTool(
  loop: CacheFirstLoop,
  args: AskToolArguments,
  onChunk?: StreamChunkHandler,
): Promise<string> {
  const question =
    args.repo_scope && args.repo_scope !== "all"
      ? `[repo_scope: ${args.repo_scope}]\n${args.question}\n\nPlease answer concisely and stay under ${args.max_answer_chars ?? DEFAULT_MAX_ANSWER_CHARS} characters.`
      : `${args.question}\n\nPlease answer concisely and stay under ${args.max_answer_chars ?? DEFAULT_MAX_ANSWER_CHARS} characters.`;
  const answerParts: string[] = [];
  const traceParts: string[] = [];
  const reasoningParts: string[] = [];

  for await (const ev of loop.step(question)) {
    if (ev.role === "assistant_delta" || ev.role === "assistant_final") {
      if (ev.content) {
        answerParts.push(ev.content);
        onChunk?.({ type: "text", text: ev.content });
      }
    }
    if (ev.reasoningDelta) reasoningParts.push(ev.reasoningDelta);
    const trace = toolTraceLine(ev);
    if (trace) {
      traceParts.push(trace);
      if (args.include_reasoning) onChunk?.({ type: "trace", text: trace });
    }
    if (ev.role === "error") {
      throw new Error(ev.error || ev.content || "llm-wiki loop failed");
    }
  }

  const answer = answerParts.join("").trim();
  const sections = [answer || "(llm-wiki completed without a final answer)"];
  if (args.include_reasoning && reasoningParts.length > 0) {
    sections.push(`\nReasoning trace:\n${reasoningParts.join("").trim()}`);
  }
  if (args.include_reasoning && traceParts.length > 0) {
    sections.push(`\nTool trace:\n${traceParts.join("\n")}`);
  }
  return sections.join("\n").trim();
}

export async function registerMcpRoutes(
  app: FastifyInstance,
  cfg: LlmWikiConfig,
  buildLoopFn: BuildLoopFn = buildLoop,
): Promise<void> {
  const sessions = new Set<string>();
  const results = new Map<string, StoredResult>();

  const saveResult = (question: string, text: string): StoredResult => {
    const stored: StoredResult = {
      id: `wiki_${randomUUID()}`,
      createdAt: Date.now(),
      question,
      text,
    };
    results.set(stored.id, stored);
    while (results.size > MAX_STORED_RESULTS) {
      const oldest = [...results.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
      if (!oldest) break;
      results.delete(oldest.id);
    }
    return stored;
  };

  app.get("/mcp", async (_request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    reply.raw.write(": llm-wiki mcp event stream\n\n");
  });

  app.delete("/mcp", async (request, reply) => {
    const sessionId = getHeaderValue(request.headers, "mcp-session-id");
    if (sessionId) sessions.delete(sessionId);
    return reply.code(202).send();
  });

  app.post("/mcp", async (request, reply) => {
    const body = request.body as JsonRpcRequest;
    const id = rpcId(body?.id);
    const method = typeof body?.method === "string" ? body.method : "";

    if (!body || typeof body !== "object" || body.jsonrpc !== "2.0" || !method) {
      return reply.code(400).send(failure(id, -32600, "Invalid JSON-RPC request"));
    }

    const isNotification = body.id === undefined;
    const sessionId = getHeaderValue(request.headers, "mcp-session-id");
    if (method !== "initialize" && sessionId && !sessions.has(sessionId)) {
      return reply.code(404).send(failure(id, -32001, "Unknown or expired MCP session"));
    }

    try {
      if (method === "initialize") {
        const nextSessionId = randomUUID();
        sessions.add(nextSessionId);
        reply.header("mcp-session-id", nextSessionId);
        return reply.send(
          success(id, {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: {
              tools: { listChanged: false },
            },
            serverInfo: {
              name: SERVER_NAME,
              version: SERVER_VERSION,
            },
          }),
        );
      }

      if (method === "notifications/initialized") {
        return reply.code(202).send();
      }

      if (method === "tools/list") {
        return reply.send(success(id, { tools: [askToolDefinition, readResultToolDefinition] }));
      }

      if (method === "tools/call") {
        const params = asRecord(body.params);
        const name = typeof params.name === "string" ? params.name : "";
        if (name !== ASK_TOOL_NAME && name !== READ_RESULT_TOOL_NAME) {
          return reply.send(failure(id, -32602, `Unknown tool: ${name || "(missing)"}`));
        }
        if (name === READ_RESULT_TOOL_NAME) {
          const args = parseReadResultArgs(params.arguments);
          const stored = results.get(args.result_id);
          if (!stored) {
            return reply.send(
              success(id, {
                content: [
                  {
                    type: "text",
                    text: `No cached llm-wiki result found for result_id "${args.result_id}". Ask with ${ASK_TOOL_NAME} again to create a fresh cached result.`,
                  },
                ],
                isError: true,
              }),
            );
          }
          return reply.send(
            success(id, {
              content: [
                {
                  type: "text",
                  text: renderStoredChunk(stored, args.cursor ?? 0, args.max_chars ?? DEFAULT_CHUNK_CHARS),
                },
              ],
              isError: false,
            }),
          );
        }

        const args = parseAskArgs(params.arguments);
        const loop = buildLoopFn(cfg);
        if (acceptsEventStream(request.headers)) {
          reply.hijack();
          reply.raw.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });
          try {
            const text = await runAskTool(loop, args, (chunk) => {
              if (!reply.raw.destroyed && !reply.raw.writableEnded) {
                reply.raw.write(sseFrame(chunkNotification(chunk)));
              }
            });
            const stored = saveResult(args.question, text);
            const firstChunk = renderStoredChunk(
              stored,
              0,
              args.max_answer_chars ?? DEFAULT_MAX_ANSWER_CHARS,
            );
            if (!reply.raw.destroyed && !reply.raw.writableEnded) {
              reply.raw.write(
                sseFrame(
                  success(id, {
                    content: [{ type: "text", text: firstChunk }],
                    isError: false,
                  }),
                ),
              );
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (!reply.raw.destroyed && !reply.raw.writableEnded) {
              reply.raw.write(
                sseFrame(
                  success(id, {
                    content: [{ type: "text", text: message }],
                    isError: true,
                  }),
                ),
              );
            }
          } finally {
            if (!reply.raw.writableEnded) reply.raw.end();
          }
          return;
        }

        const text = await runAskTool(loop, args);
        const stored = saveResult(args.question, text);
        return reply.send(
          success(id, {
            content: [
              {
                type: "text",
                text: renderStoredChunk(
                  stored,
                  0,
                  args.max_answer_chars ?? DEFAULT_MAX_ANSWER_CHARS,
                ),
              },
            ],
            isError: false,
          }),
        );
      }

      if (isNotification) {
        return reply.code(202).send();
      }
      return reply.send(failure(id, -32601, `Method not found: ${method}`));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.send(
        success(id, {
          content: [{ type: "text", text: message }],
          isError: true,
        }),
      );
    }
  });
}

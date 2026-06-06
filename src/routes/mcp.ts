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
}

const askToolDefinition = {
  name: ASK_TOOL_NAME,
  description:
    [
      "Ask llm-wiki to inspect the authorized ChatKit/FinClaw repositories once and return a complete answer directly.",
      "Use this tool for repository knowledge questions, then Answer the user from the received result.",
      "Do not call this tool again for the same user question just because the result is long or the UI/model context mentions truncation, size limits, or prompt budget.",
      "The tool has no pagination or continuation API; do not infer that more content is available unless the user explicitly asks a new, narrower follow-up question.",
    ].join(" "),
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
    },
    required: ["question"],
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
  };
}

function acceptsEventStream(headers: IncomingHttpHeaders): boolean {
  return getHeaderValue(headers, "accept").toLowerCase().includes("text/event-stream");
}

function sseFrame(message: unknown): string {
  return `event: message\ndata: ${JSON.stringify(message)}\n\n`;
}

async function runAskTool(
  loop: CacheFirstLoop,
  args: AskToolArguments,
): Promise<string> {
  const promptParts = [
    args.repo_scope && args.repo_scope !== "all" ? `[repo_scope: ${args.repo_scope}]` : null,
    args.question,
  ].filter((part): part is string => Boolean(part));
  const question = promptParts.join("\n\n");
  const answerParts: string[] = [];

  for await (const ev of loop.step(question)) {
    if (ev.role === "assistant_delta" || ev.role === "assistant_final") {
      if (ev.content) {
        answerParts.push(ev.content);
      }
    }
    if (ev.role === "error") {
      throw new Error(ev.error || ev.content || "llm-wiki loop failed");
    }
  }

  const answer = answerParts.join("").trim();
  const sections = [answer || "(llm-wiki completed without a final answer)"];
  return sections.join("\n").trim();
}

export async function registerMcpRoutes(
  app: FastifyInstance,
  cfg: LlmWikiConfig,
  buildLoopFn: BuildLoopFn = buildLoop,
): Promise<void> {
  const sessions = new Set<string>();

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
        return reply.send(success(id, { tools: [askToolDefinition] }));
      }

      if (method === "tools/call") {
        const params = asRecord(body.params);
        const name = typeof params.name === "string" ? params.name : "";
        if (name !== ASK_TOOL_NAME) {
          return reply.send(failure(id, -32602, `Unknown tool: ${name || "(missing)"}`));
        }

        const args = parseAskArgs(params.arguments);
        const loop = await buildLoopFn(cfg);
        if (acceptsEventStream(request.headers)) {
          reply.hijack();
          reply.raw.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });
          try {
            const text = await runAskTool(loop, args);
            if (!reply.raw.destroyed && !reply.raw.writableEnded) {
              reply.raw.write(
                sseFrame(
                  success(id, {
                    content: [{ type: "text", text }],
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
        return reply.send(
          success(id, {
            content: [
              {
                type: "text",
                text,
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

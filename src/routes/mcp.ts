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
  include_reasoning?: boolean;
  max_answer_chars?: number;
}

const DEFAULT_MAX_ANSWER_CHARS = 6_000;
const HARD_MAX_ANSWER_CHARS = 12_000;

const askToolDefinition = {
  name: ASK_TOOL_NAME,
  description:
    "Ask llm-wiki to inspect the authorized ChatKit/FinClaw repositories and answer with code-grounded evidence.",
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
          "Maximum response characters returned to the MCP client. Defaults to 6000 and is capped at 12000.",
        minimum: 1000,
        maximum: HARD_MAX_ANSWER_CHARS,
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
    include_reasoning: args.include_reasoning === true,
    max_answer_chars: normalizeMaxAnswerChars(args.max_answer_chars),
  };
}

function normalizeMaxAnswerChars(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_MAX_ANSWER_CHARS;
  return Math.min(HARD_MAX_ANSWER_CHARS, Math.max(1_000, Math.floor(value)));
}

function truncateAnswer(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const note =
    "\n\n[llm-wiki truncated this MCP result. Ask a narrower follow-up question or raise max_answer_chars up to 12000.]";
  const budget = Math.max(0, maxChars - note.length);
  return `${text.slice(0, budget).trimEnd()}${note}`;
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

async function runAskTool(loop: CacheFirstLoop, args: AskToolArguments): Promise<string> {
  const question =
    args.repo_scope && args.repo_scope !== "all"
      ? `[repo_scope: ${args.repo_scope}]\n${args.question}\n\nPlease answer concisely and stay under ${args.max_answer_chars ?? DEFAULT_MAX_ANSWER_CHARS} characters.`
      : `${args.question}\n\nPlease answer concisely and stay under ${args.max_answer_chars ?? DEFAULT_MAX_ANSWER_CHARS} characters.`;
  const answerParts: string[] = [];
  const traceParts: string[] = [];
  const reasoningParts: string[] = [];

  for await (const ev of loop.step(question)) {
    if (ev.role === "assistant_delta" || ev.role === "assistant_final") {
      if (ev.content) answerParts.push(ev.content);
    }
    if (ev.reasoningDelta) reasoningParts.push(ev.reasoningDelta);
    const trace = toolTraceLine(ev);
    if (trace) traceParts.push(trace);
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
  return truncateAnswer(sections.join("\n").trim(), args.max_answer_chars ?? DEFAULT_MAX_ANSWER_CHARS);
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
        const loop = buildLoopFn(cfg);
        const text = await runAskTool(loop, args);
        return reply.send(
          success(id, {
            content: [{ type: "text", text }],
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

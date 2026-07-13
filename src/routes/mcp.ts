import type { FastifyInstance } from "fastify";
import type { IncomingHttpHeaders } from "node:http";
import { randomUUID } from "node:crypto";
import type { LlmWikiConfig } from "../config.js";
import {
  applyAnswerProfile,
  createSecurityAuditLogger,
  maybeRecordSecurityAudit,
} from "../core/security/index.js";
import { DeepSeekClient } from "../core/client.js";
import {
  LlmAnswerSummaryAgent,
  type AnswerSummaryAgent,
} from "../answer-summary-agent.js";
import type { CacheFirstLoop } from "../loop-runner.js";
import { buildLoopBundle } from "../loop-runner.js";
import { finalizeRunAsk, buildAskPrompt } from "../finalize-run.js";
import type { BuildLoopBundleFn } from "./ask.js";
import { RunTelemetry, loadRunTelemetryOptions } from "../telemetry/run-telemetry.js";

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

export type BuildAnswerSummaryAgentFn = (cfg: LlmWikiConfig) => Promise<AnswerSummaryAgent>;

export const ASK_TOOL_DESCRIPTION = [
  "One-shot repository knowledge Q&A — not a code-search API, pagination endpoint, or multi-call retrieval tool.",
  "Call once with the user's exact question; llm-wiki searches chatkit-middleware, chatkit-web, and finclaw internally and returns one complete answer.",
  "After it returns, answer the user by presenting the tool result verbatim in this turn; do not rewrite, reformat, summarize, or shorten it.",
  "Do not append follow-up invitations such as \"可以进一步问我\", \"如需深入\", or \"Would you like me to…\".",
  "Do not call again for the same question, do not send continuation prompts such as \"接上一条\" or \"继续补充\", and do not re-call because the answer is long or context mentions truncation or prompt budget.",
  "Do not ask the user clarifying questions that llm-wiki can resolve by searching the codebase.",
].join(" ");

const askToolDefinition = {
  name: ASK_TOOL_NAME,
  description: ASK_TOOL_DESCRIPTION,
  inputSchema: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description:
          "The user's question verbatim. Cross-repo questions are fine; do not rewrite, expand, split, or narrow it before calling.",
      },
      repo_scope: {
        type: "string",
        description:
          "Usually omit. Only set when the user already named a repo or alias (middleware=chatkit-middleware, web=chatkit-web, finclaw, or all).",
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

function stripForcedSummaryPrefix(answer: string): string {
  return answer.replace(/^errors\.reason(?:Stuck|Aborted|ContextGuard)\n\n/, "");
}

function debugMcp(message: string, fields: Record<string, unknown> = {}): void {
  if (process.env.LLM_WIKI_DEBUG_MCP !== "true" && process.env.LLM_WIKI_DEBUG_TOOLS !== "true") {
    return;
  }
  const suffix = Object.keys(fields).length > 0 ? ` ${JSON.stringify(fields)}` : "";
  console.error(`[llm-wiki][mcp] ${message}${suffix}`);
}

function guardMcpAnswer(answer: string, cfg: LlmWikiConfig): string {
  const guarded = applyAnswerProfile(answer, cfg.answerProfiles.mcp);
  maybeRecordSecurityAudit(
    createSecurityAuditLogger(`${cfg.projectRoot}/.reasonix/security-audit.jsonl`),
    {
      surface: "answer",
      ...guarded.audit,
    },
  );
  return guarded.text;
}

export async function runAskTool(
  loop: CacheFirstLoop,
  summaryAgent: AnswerSummaryAgent,
  args: AskToolArguments,
  cfg: LlmWikiConfig,
  handles?: { evidence: import("../core/evidence/index.js").EvidenceCollector; telemetry: import("../telemetry/run-telemetry.js").RunTelemetry },
): Promise<string> {
  if (handles) {
    const result = await finalizeRunAsk({
      loop,
      evidence: handles.evidence,
      telemetry: handles.telemetry,
      cfg,
      question: args.question,
      repoScope: args.repo_scope,
      surface: "mcp",
      summaryAgent,
    });
    return result.answer;
  }

  const answerParts: string[] = [];
  const question = buildAskPrompt(args.question, args.repo_scope, cfg);

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

  const rawAnswer =
    stripForcedSummaryPrefix(answerParts.join("").trim()) ||
    "(llm-wiki completed without a final answer)";
  try {
    const summarized = await summaryAgent.summarize({
      question: args.question,
      answer: rawAnswer,
    });
    return guardMcpAnswer(summarized.trim() || rawAnswer, cfg);
  } catch (err) {
    console.warn(
      `[llm-wiki] answer summary agent failed; returning raw answer: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return guardMcpAnswer(rawAnswer, cfg);
  }
}

async function buildDefaultAnswerSummaryAgent(cfg: LlmWikiConfig): Promise<AnswerSummaryAgent> {
  const client = new DeepSeekClient({
    apiKey: cfg.deepseekApiKey,
    baseUrl: cfg.deepseekBaseUrl,
  });
  return new LlmAnswerSummaryAgent({
    client,
    model: cfg.deepseekModel,
  });
}

export async function registerMcpRoutes(
  app: FastifyInstance,
  cfg: LlmWikiConfig,
  buildLoopBundleFn: BuildLoopBundleFn = buildLoopBundle,
  buildAnswerSummaryAgentFn: BuildAnswerSummaryAgentFn = buildDefaultAnswerSummaryAgent,
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
    debugMcp("request", { method: method || "(missing)", hasSession: Boolean(sessionId) });
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
        const answerFn = async () => {
          const bundle = await buildLoopBundleFn(cfg, args.question);
          const summaryAgent = await buildAnswerSummaryAgentFn(cfg);
          const result = await finalizeRunAsk({
            loop: bundle.loop,
            evidence: bundle.evidence,
            telemetry: bundle.telemetry,
            cfg,
            question: args.question,
            repoScope: args.repo_scope,
            surface: "mcp",
            summaryAgent,
          });
          return result.answer;
        };
        if (acceptsEventStream(request.headers)) {
          reply.hijack();
          reply.raw.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });
          try {
            const text = await answerFn();
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

        const text = await answerFn();
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

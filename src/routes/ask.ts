import type { FastifyInstance } from "fastify";
import type { LlmWikiConfig } from "../config.js";
import type { CacheFirstLoop } from "../loop-runner.js";
import { buildLoop } from "../loop-runner.js";
import { mapLoopEventToSse } from "../sse/map-loop-event.js";

export interface ChatMessage {
  role: string;
  content: string;
}

export interface AgentRunBody {
  messages: ChatMessage[];
}

export type BuildLoopFn = (cfg: LlmWikiConfig) => CacheFirstLoop;

function parseAgentRunBody(body: unknown): AgentRunBody | null {
  if (!body || typeof body !== "object") return null;
  const messages = (body as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return null;
  for (const m of messages) {
    if (!m || typeof m !== "object") return null;
    const msg = m as { role?: unknown; content?: unknown };
    if (typeof msg.role !== "string" || typeof msg.content !== "string") {
      return null;
    }
  }
  return { messages: messages as ChatMessage[] };
}

function lastUserMessage(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user" && messages[i].content.trim()) {
      return messages[i].content;
    }
  }
  return null;
}

export async function registerAskRoutes(
  app: FastifyInstance,
  cfg: LlmWikiConfig,
  buildLoopFn: BuildLoopFn = buildLoop,
): Promise<void> {
  app.post("/agent/run", async (request, reply) => {
    const parsed = parseAgentRunBody(request.body);
    if (!parsed) {
      return reply.code(400).send({ error: "Invalid request body" });
    }

    const question = lastUserMessage(parsed.messages);
    if (!question) {
      return reply.code(400).send({ error: "No user message in messages" });
    }

    const loop = buildLoopFn(cfg);

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    let aborted = false;
    const abortFromClient = () => {
      if (aborted) return;
      aborted = true;
      loop.abort();
    };

    const bindDisconnect = (emitter: NodeJS.EventEmitter, event: string) => {
      emitter.on(event, abortFromClient);
      return () => emitter.off(event, abortFromClient);
    };

    const unbindRequestClose = bindDisconnect(request.raw, "close");
    const unbindRequestAborted = bindDisconnect(request.raw, "aborted");
    const unbindReplyClose = bindDisconnect(reply.raw, "close");
    const unbindSocketClose =
      request.raw.socket != null
        ? bindDisconnect(request.raw.socket, "close")
        : () => {};

    try {
      for await (const ev of loop.step(question)) {
        if (aborted || request.raw.aborted || request.raw.destroyed) break;
        if (reply.raw.destroyed || reply.raw.writableEnded) break;
        reply.raw.write(mapLoopEventToSse(ev));
        if (request.raw.aborted || request.raw.destroyed) {
          abortFromClient();
          break;
        }
      }
    } catch (err) {
      if (!aborted && !reply.raw.writableEnded) {
        const message = err instanceof Error ? err.message : String(err);
        reply.raw.write(
          mapLoopEventToSse({
            turn: 0,
            role: "error",
            content: "",
            error: message,
          }),
        );
      }
    } finally {
      unbindRequestClose();
      unbindRequestAborted();
      unbindReplyClose();
      unbindSocketClose();
      if (!reply.raw.writableEnded) reply.raw.end();
    }
  });
}

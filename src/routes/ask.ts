import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import type { LlmWikiConfig } from "../config.js";
import type { LoopBundle } from "../loop-runner.js";
import { buildLoopBundle } from "../loop-runner.js";
import {
  postProcessRunAnswer,
  buildAskPrompt,
  finalizeKnowledgeCardAnswer,
} from "../finalize-run.js";
import { tryKnowledgeFastPath } from "../core/knowledge/fast-path.js";
import { isCatalogListingEnabled, tryCatalogListingResult } from "../catalog/listing-path.js";
import { EvidenceCollector } from "../core/evidence/index.js";
import { formatEvidenceFooter } from "../core/evidence/index.js";
import { mapLoopEventToSse } from "../sse/map-loop-event.js";
import { RunTelemetry, loadRunTelemetryOptions } from "../telemetry/run-telemetry.js";

export interface ChatMessage {
  role: string;
  content: string;
}

export interface AgentRunBody {
  messages: ChatMessage[];
}

export type BuildLoopBundleFn = (
  cfg: LlmWikiConfig,
  question: string,
  runId?: string,
) => Promise<LoopBundle>;

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
  buildLoopBundleFn: BuildLoopBundleFn = buildLoopBundle,
): Promise<void> {
  app.post("/agent/run", async (request, reply) => {
    const parsed = parseAgentRunBody(request.body);
    if (!parsed) {
      return reply.code(400).send({ error: "Invalid request body" });
    }

    const rawQuestion = lastUserMessage(parsed.messages);
    if (!rawQuestion) {
      return reply.code(400).send({ error: "No user message in messages" });
    }

    const runId = randomUUID();

    if (isCatalogListingEnabled()) {
      const catalog = tryCatalogListingResult({
        cfg,
        question: rawQuestion,
        profile: cfg.answerProfiles.agent,
      });
      if (catalog) {
        const telemetry = new RunTelemetry(loadRunTelemetryOptions(cfg.projectRoot), runId);
        const evidence = new EvidenceCollector(runId, rawQuestion);
        evidence.recordCatalogList(catalog.intent.repo);
        reply.hijack();
        reply.raw.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
        });
        try {
          const processed = await postProcessRunAnswer({
            rawAnswer: catalog.answer,
            evidence,
            telemetry,
            cfg,
            question: rawQuestion,
            surface: "agent",
          });
          reply.raw.write(
            mapLoopEventToSse({
              turn: 1,
              role: "status",
              content: "[Catalog listing fast path]",
            }),
          );
          reply.raw.write(
            mapLoopEventToSse({
              turn: 1,
              role: "assistant_final",
              content: processed.answer,
            }),
          );
          reply.raw.write(mapLoopEventToSse({ turn: 1, role: "done", content: "" }));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          reply.raw.write(
            mapLoopEventToSse({ turn: 0, role: "error", content: "", error: message }),
          );
        } finally {
          if (!reply.raw.writableEnded) reply.raw.end();
        }
        return;
      }
    }

    const fastCard = tryKnowledgeFastPath(cfg, rawQuestion);
    if (fastCard) {
      const telemetry = new RunTelemetry(loadRunTelemetryOptions(cfg.projectRoot), runId);
      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      try {
        const processed = await finalizeKnowledgeCardAnswer({
          cfg,
          question: rawQuestion,
          card: fastCard,
          surface: "agent",
          telemetry,
        });
        reply.raw.write(
          mapLoopEventToSse({
            turn: 1,
            role: "status",
            content: `[Knowledge card fast path: ${fastCard.id}]`,
          }),
        );
        reply.raw.write(
          mapLoopEventToSse({
            turn: 1,
            role: "assistant_final",
            content: processed.answer,
          }),
        );
        reply.raw.write(
          mapLoopEventToSse({
            turn: 1,
            role: "evidence",
            content: JSON.stringify({
              runId: processed.telemetry.runId,
              knowledgeCardId: fastCard.id,
              evidenceCount: processed.evidenceBundle.items.length,
              citationOrphans: processed.citationReport.orphans.length,
              negativeSearches: processed.evidenceBundle.negativeSearches.length,
              evidenceRefused: processed.evidencePolicy.refused,
              policyNotes: processed.evidencePolicy.policyNotes,
              items: processed.evidenceBundle.items,
              orphans: processed.citationReport.orphans,
            }),
          }),
        );
        reply.raw.write(mapLoopEventToSse({ turn: 1, role: "done", content: "" }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.raw.write(
          mapLoopEventToSse({
            turn: 0,
            role: "error",
            content: "",
            error: message,
          }),
        );
      } finally {
        if (!reply.raw.writableEnded) reply.raw.end();
      }
      return;
    }

    const { loop, evidence, telemetry } = await buildLoopBundleFn(cfg, rawQuestion, runId);
    const prompt = buildAskPrompt(rawQuestion, undefined, cfg);

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

    const unbindRequestAborted = bindDisconnect(request.raw, "aborted");
    const unbindReplyClose = bindDisconnect(reply.raw, "close");
    const unbindSocketClose =
      request.raw.socket != null
        ? bindDisconnect(request.raw.socket, "close")
        : () => {};

    const answerParts: string[] = [];

    try {
      for await (const ev of loop.step(prompt)) {
        if (aborted || request.raw.aborted) break;
        if (reply.raw.destroyed || reply.raw.writableEnded) {
          abortFromClient();
          break;
        }
        if (ev.role === "assistant_delta" || ev.role === "assistant_final") {
          if (ev.content) answerParts.push(ev.content);
        }
        reply.raw.write(mapLoopEventToSse(ev));
        if (request.raw.aborted) {
          abortFromClient();
          break;
        }
      }

      if (!aborted && !reply.raw.destroyed && !reply.raw.writableEnded) {
        const streamedAnswer = answerParts.join("").trim();
        const processed = await postProcessRunAnswer({
          rawAnswer: answerParts.join(""),
          evidence,
          telemetry,
          cfg,
          question: rawQuestion,
          surface: "agent",
        });
        const canonical = processed.rawAnswer.trim();
        const alreadyStreamed =
          canonical.length > 0
          && streamedAnswer.length > 0
          && (streamedAnswer.includes(canonical) || canonical.includes(streamedAnswer));
        if (canonical && !alreadyStreamed) {
          reply.raw.write(
            mapLoopEventToSse({
              turn: 0,
              role: "assistant_final",
              content: canonical,
            }),
          );
        }
        reply.raw.write(
          mapLoopEventToSse({
            turn: 0,
            role: "evidence",
            content: JSON.stringify({
              runId: processed.telemetry.runId,
              evidenceCount: processed.evidenceBundle.items.length,
              citationOrphans: processed.citationReport.orphans.length,
              negativeSearches: processed.evidenceBundle.negativeSearches.length,
              evidenceRefused: processed.evidencePolicy.refused,
              policyNotes: processed.evidencePolicy.policyNotes,
              items: processed.evidenceBundle.items,
              orphans: processed.citationReport.orphans,
            }),
          }),
        );
        if (
          processed.evidencePolicy.refused
          || processed.evidencePolicy.policyNotes.length > 0
        ) {
          reply.raw.write(
            mapLoopEventToSse({
              turn: 0,
              role: "warning",
              content: `Evidence policy: ${processed.evidencePolicy.policyNotes.join("; ") || "adjusted"}`,
            }),
          );
        }
        if (cfg.answerProfiles.agent === "debug") {
          reply.raw.write(
            mapLoopEventToSse({
              turn: 0,
              role: "assistant_final",
              content: `\n\n${formatEvidenceFooter(processed.evidenceBundle, processed.citationReport)}`,
            }),
          );
        }
        reply.raw.write(mapLoopEventToSse({ turn: 0, role: "done", content: "" }));
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
      unbindRequestAborted();
      unbindReplyClose();
      unbindSocketClose();
      if (!reply.raw.writableEnded) reply.raw.end();
    }
  });
}

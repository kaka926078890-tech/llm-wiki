import type { FastifyInstance } from "fastify";

import type { LlmWikiConfig } from "../config.js";
import { hashFileExcerpt, refreshKnowledgeStale } from "../core/knowledge/stale.js";
import { loadKnowledgeStore } from "../core/knowledge/store.js";
import type { KnowledgeConfidence, SaveKnowledgeCardInput } from "../core/knowledge/types.js";
import { resolveAuthorizedPath } from "../path/authorized-roots.js";

function parseSaveBody(body: unknown): SaveKnowledgeCardInput | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  const question = typeof raw.question === "string" ? raw.question.trim() : "";
  const answer = typeof raw.answer === "string" ? raw.answer.trim() : "";
  if (!question || !answer) return null;

  const repoScope = Array.isArray(raw.repoScope)
    ? raw.repoScope.filter((item): item is string => typeof item === "string")
    : undefined;

  const evidence = Array.isArray(raw.evidence)
    ? raw.evidence
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        .map((item) => ({
          path: String(item.path ?? ""),
          startLine: typeof item.startLine === "number" ? item.startLine : undefined,
          endLine: typeof item.endLine === "number" ? item.endLine : undefined,
          hash: typeof item.hash === "string" ? item.hash : undefined,
          redacted: item.redacted === true,
        }))
        .filter((item) => item.path)
    : undefined;

  const confidence =
    raw.confidence === "verified" || raw.confidence === "draft" || raw.confidence === "rejected"
      ? raw.confidence
      : undefined;

  return {
    question,
    answer,
    repoScope,
    evidence,
    confidence,
    sourceRunId: typeof raw.sourceRunId === "string" ? raw.sourceRunId : undefined,
  };
}

function enrichEvidenceHashes(
  input: SaveKnowledgeCardInput,
  cfg: LlmWikiConfig,
): SaveKnowledgeCardInput {
  if (!input.evidence?.length) return input;
  const evidence = input.evidence.map((item) => {
    if (item.hash || item.redacted) return item;
    try {
      const abs = resolveAuthorizedPath(item.path, cfg.repos);
      const hash = hashFileExcerpt(abs, item.startLine, item.endLine);
      return hash ? { ...item, hash } : item;
    } catch {
      return item;
    }
  });
  return { ...input, evidence };
}

function parseConfidence(body: unknown): KnowledgeConfidence | null {
  if (!body || typeof body !== "object") return null;
  const value = (body as { confidence?: unknown }).confidence;
  if (value === "verified" || value === "draft" || value === "rejected") return value;
  return null;
}

export async function registerKnowledgeRoutes(
  app: FastifyInstance,
  cfg: LlmWikiConfig,
): Promise<void> {
  app.get("/api/knowledge", async (request) => {
    const query = request.query as { sourceRunId?: string };
    const store = loadKnowledgeStore(cfg.projectRoot);
    let cards = store.list();
    if (typeof query.sourceRunId === "string" && query.sourceRunId.trim()) {
      const runId = query.sourceRunId.trim();
      cards = cards.filter((card) => card.sourceRunId === runId);
    }
    return { cards };
  });

  app.post("/api/knowledge/refresh-stale", async () => {
    const store = loadKnowledgeStore(cfg.projectRoot);
    const updated = refreshKnowledgeStale(store, cfg.repos);
    return { updatedCount: updated.length, updated };
  });

  app.get("/api/knowledge/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const card = loadKnowledgeStore(cfg.projectRoot).get(id);
    if (!card) return reply.code(404).send({ error: "Knowledge card not found" });
    return card;
  });

  app.post("/api/knowledge", async (request, reply) => {
    const parsed = parseSaveBody(request.body);
    if (!parsed) return reply.code(400).send({ error: "Invalid knowledge card body" });
    const store = loadKnowledgeStore(cfg.projectRoot);
    const { card, merged } = store.saveOrMerge(enrichEvidenceHashes(parsed, cfg));
    return reply.code(merged ? 200 : 201).send({ card, merged });
  });

  app.patch("/api/knowledge/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const confidence = parseConfidence(request.body);
    if (!confidence) return reply.code(400).send({ error: "confidence is required" });
    const card = loadKnowledgeStore(cfg.projectRoot).updateConfidence(id, confidence);
    if (!card) return reply.code(404).send({ error: "Knowledge card not found" });
    return card;
  });

  app.delete("/api/knowledge/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = loadKnowledgeStore(cfg.projectRoot).delete(id);
    if (!deleted) return reply.code(404).send({ error: "Knowledge card not found" });
    return reply.code(204).send();
  });
}

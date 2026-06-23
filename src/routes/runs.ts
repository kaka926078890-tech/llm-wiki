import type { FastifyInstance } from "fastify";

import type { LlmWikiConfig } from "../config.js";
import { listRunTelemetry, readRunTelemetry } from "../telemetry/list-runs.js";

export async function registerRunsRoutes(
  app: FastifyInstance,
  cfg: LlmWikiConfig,
): Promise<void> {
  app.get("/api/runs", async (request) => {
    const limitRaw = (request.query as { limit?: string })?.limit;
    const limit = limitRaw ? Math.min(100, Math.max(1, Number(limitRaw) || 50)) : 50;
    return { runs: listRunTelemetry(cfg.projectRoot, limit) };
  });

  app.get<{ Params: { runId: string } }>("/api/runs/:runId", async (request, reply) => {
    const run = readRunTelemetry(cfg.projectRoot, request.params.runId);
    if (!run) return reply.code(404).send({ error: "Run not found" });
    return run;
  });
}

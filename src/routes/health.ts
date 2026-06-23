import type { FastifyInstance } from "fastify";
import type { LlmWikiConfig } from "../config.js";
import { getCbmStatus } from "../cbm-status.js";

export async function registerHealthRoutes(
  app: FastifyInstance,
  cfg: LlmWikiConfig,
): Promise<void> {
  app.get("/health", async () => ({
    status: "ok",
    repos: {
      middleware: cfg.repos.middleware,
      web: cfg.repos.web,
      finclaw: cfg.repos.finclaw,
    },
    cbm: await getCbmStatus(cfg),
  }));
}

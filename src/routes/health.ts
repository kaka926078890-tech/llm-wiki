import type { FastifyInstance } from "fastify";
import type { LlmWikiConfig } from "../config.js";

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
  }));
}

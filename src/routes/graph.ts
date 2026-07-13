import type { FastifyInstance } from "fastify";

import type { LlmWikiConfig } from "../config.js";
import { loadProjectGraph } from "../graph/store.js";

export async function registerGraphRoutes(
  app: FastifyInstance,
  cfg: LlmWikiConfig,
): Promise<void> {
  app.get("/api/graph", async (_request, reply) => {
    const graph = loadProjectGraph(cfg.projectRoot);
    if (!graph) {
      return reply.code(404).send({
        error: "Project graph not found",
        hint: "Run npm run graph:gen or npm run sync:code:full after catalog:gen",
      });
    }
    return { graph };
  });
}

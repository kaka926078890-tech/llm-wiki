import type { FastifyInstance } from "fastify";

import { getCbmStatus } from "../cbm-status.js";
import { getCbmSyncJob, startCbmSync } from "../cbm/sync-job.js";
import type { LlmWikiConfig } from "../config.js";

export async function registerIndexRoutes(
  app: FastifyInstance,
  cfg: LlmWikiConfig,
): Promise<void> {
  app.get("/api/index/status", async () => {
    const cbm = await getCbmStatus(cfg);
    const syncJob = getCbmSyncJob();
    return {
      cbm,
      syncJob,
      syncHint:
        syncJob.state === "running"
          ? "CBM re-index in progress…"
          : cbm.anyStale
            ? "Index is stale — use Re-index on the Index page or run `npm run cbm:sync`."
            : undefined,
    };
  });

  app.get("/api/index/sync", async () => ({ job: getCbmSyncJob() }));

  app.post("/api/index/sync", async (_request, reply) => {
    const result = startCbmSync(cfg.projectRoot);
    if (!result.started) {
      return reply.code(409).send({ error: result.reason, job: getCbmSyncJob() });
    }
    return { job: getCbmSyncJob() };
  });
}

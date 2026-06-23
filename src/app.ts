import fastifyStatic from "@fastify/static";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { existsSync } from "node:fs";
import path from "node:path";
import type { LlmWikiConfig } from "./config.js";
import { identityAnswerSummaryAgent } from "./answer-summary-agent.js";
import type { BuildLoopBundleFn } from "./routes/ask.js";
import { registerAskRoutes } from "./routes/ask.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerIndexRoutes } from "./routes/index.js";
import { registerRunsRoutes } from "./routes/runs.js";
import { type BuildAnswerSummaryAgentFn, registerMcpRoutes } from "./routes/mcp.js";

export interface CreateAppOptions {
  config: LlmWikiConfig;
  buildLoopBundle?: BuildLoopBundleFn;
  buildAnswerSummaryAgent?: BuildAnswerSummaryAgentFn;
}

export async function createApp(opts: CreateAppOptions) {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });

  await registerHealthRoutes(app, opts.config);
  await registerIndexRoutes(app, opts.config);
  await registerRunsRoutes(app, opts.config);
  await registerAskRoutes(app, opts.config, opts.buildLoopBundle);
  await registerMcpRoutes(
    app,
    opts.config,
    opts.buildLoopBundle,
    opts.buildAnswerSummaryAgent
      ?? (opts.buildLoopBundle
        ? async () => identityAnswerSummaryAgent
        : undefined),
  );

  const staticRoot = path.join(opts.config.projectRoot, "frontend/dist");
  if (existsSync(staticRoot)) {
    await app.register(fastifyStatic, {
      root: staticRoot,
      prefix: "/",
    });
  }

  return app;
}

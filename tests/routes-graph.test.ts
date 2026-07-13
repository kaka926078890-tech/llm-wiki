import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { getProjectRoot, loadConfig, type LlmWikiConfig } from "../src/config.js";
import { saveRepoFeatureLists } from "../src/catalog/store.js";
import { generateProjectGraph } from "../src/graph/generate.js";
import { saveProjectGraph } from "../src/graph/store.js";
import { mockLoopBundle } from "./mock-loop-bundle.js";

function testConfig(projectRoot: string): LlmWikiConfig {
  return {
    ...loadConfig({
      DEEPSEEK_API_KEY: "test-key",
      REPO_CHATKIT_MIDDLEWARE: getProjectRoot(),
      REPO_CHATKIT_WEB: getProjectRoot(),
      REPO_FINCLAW: getProjectRoot(),
    }),
    projectRoot,
  };
}

function seedCatalog(root: string): void {
  const now = new Date().toISOString();
  saveRepoFeatureLists(root, {
    repo: "chatkit-middleware",
    generatedAt: now,
    lists: {
      services: [{ id: "svc:a", title: "api-gateway", sources: [], confidence: "high" }],
    },
  });
  saveRepoFeatureLists(root, {
    repo: "chatkit-web",
    generatedAt: now,
    lists: {
      apps: [{ id: "app:a", title: "chatkit-mobile", sources: [], confidence: "high" }],
    },
  });
  saveRepoFeatureLists(root, {
    repo: "finclaw",
    generatedAt: now,
    lists: {
      modules: [{ id: "crate:a", title: "finclaw-core", sources: [], confidence: "high" }],
    },
  });
}

describe("routes-graph", () => {
  it("API-01 returns graph when graph.json exists", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "llm-wiki-api-graph-"));
    seedCatalog(root);
    saveProjectGraph(root, generateProjectGraph(root));

    const app = await createApp({
      config: testConfig(root),
      buildLoopBundle: async (_cfg, question) => mockLoopBundle([], question),
    });

    const res = await app.inject({ method: "GET", url: "/api/graph" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { graph: { nodes: unknown[]; edges: unknown[] } };
    expect(body.graph.nodes.length).toBeGreaterThan(0);
    expect(body.graph.edges.length).toBeGreaterThan(0);
  });

  it("API-02 returns 404 with hint when graph missing", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "llm-wiki-api-graph-miss-"));
    const app = await createApp({
      config: testConfig(root),
      buildLoopBundle: async (_cfg, question) => mockLoopBundle([], question),
    });

    const res = await app.inject({ method: "GET", url: "/api/graph" });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { hint?: string };
    expect(body.hint).toMatch(/graph:gen/i);
  });
});

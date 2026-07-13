import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { saveRepoFeatureLists } from "../src/catalog/store.js";
import type { RepoFeatureLists } from "../src/catalog/types.js";
import { graphFromCatalog } from "../src/graph/generate.js";
import { loadProjectGraph, saveProjectGraph } from "../src/graph/store.js";
import { GRAPH_VERSION } from "../src/graph/types.js";

function writeCatalog(root: string, data: RepoFeatureLists): void {
  saveRepoFeatureLists(root, data);
}

describe("graph store", () => {
  it("GR-01 round-trips graph JSON", () => {
    const root = mkdtempSync(path.join(tmpdir(), "llm-wiki-graph-store-"));
    const graph = {
      version: GRAPH_VERSION,
      generatedAt: new Date().toISOString(),
      sources: { catalog: ["chatkit-middleware.json"] },
      nodes: [{ id: "repo:chatkit-middleware", type: "repo" as const, title: "chatkit-middleware", repo: "chatkit-middleware" as const }],
      edges: [],
    };
    saveProjectGraph(root, graph);
    expect(loadProjectGraph(root)).toEqual(graph);
  });

  it("GR-02 persists version 1", () => {
    const root = mkdtempSync(path.join(tmpdir(), "llm-wiki-graph-store-"));
    saveProjectGraph(root, {
      version: GRAPH_VERSION,
      generatedAt: "2026-01-01T00:00:00.000Z",
      sources: { catalog: [] },
      nodes: [],
      edges: [],
    });
    const raw = JSON.parse(readFileSync(path.join(root, ".reasonix", "graph.json"), "utf-8"));
    expect(raw.version).toBe(1);
  });
});

describe("graph generate", () => {
  it("GG-01 middleware catalog yields service module nodes", () => {
    const root = mkdtempSync(path.join(tmpdir(), "llm-wiki-graph-gen-"));
    writeCatalog(root, {
      repo: "chatkit-middleware",
      generatedAt: new Date().toISOString(),
      lists: {
        services: [
          {
            id: "svc:api-gateway",
            title: "api-gateway",
            sources: ["edition-manifest.yaml"],
            confidence: "high",
          },
        ],
      },
    });
    writeCatalog(root, {
      repo: "chatkit-web",
      generatedAt: new Date().toISOString(),
      lists: { apps: [{ id: "app:mobile", title: "chatkit-mobile", sources: ["package.json"], confidence: "high" }] },
    });
    writeCatalog(root, {
      repo: "finclaw",
      generatedAt: new Date().toISOString(),
      lists: { modules: [{ id: "crate:core", title: "finclaw-core", sources: ["Cargo.toml"], confidence: "high" }] },
    });

    const graph = graphFromCatalog(root);
    expect(graph.nodes.some((n) => n.id === "repo:chatkit-middleware")).toBe(true);
    expect(graph.nodes.some((n) => n.title === "api-gateway" && n.type === "module")).toBe(true);
    expect(graph.edges.some((e) => e.from === "repo:chatkit-middleware" && e.type === "contains")).toBe(
      true,
    );
  });

  it("GG-02 each catalog item has repo contains edge", () => {
    const root = mkdtempSync(path.join(tmpdir(), "llm-wiki-graph-gen-"));
    writeCatalog(root, {
      repo: "chatkit-middleware",
      generatedAt: new Date().toISOString(),
      lists: {
        services: [
          { id: "a", title: "a", sources: [], confidence: "high" },
          { id: "b", title: "b", sources: [], confidence: "high" },
        ],
      },
    });
    writeCatalog(root, {
      repo: "chatkit-web",
      generatedAt: new Date().toISOString(),
      lists: { apps: [{ id: "x", title: "x", sources: [], confidence: "high" }] },
    });
    writeCatalog(root, {
      repo: "finclaw",
      generatedAt: new Date().toISOString(),
      lists: { modules: [{ id: "y", title: "y", sources: [], confidence: "high" }] },
    });

    const graph = graphFromCatalog(root);
    const itemNodes = graph.nodes.filter((n) => n.type !== "repo");
    for (const node of itemNodes) {
      expect(graph.edges.some((e) => e.to === node.id && e.type === "contains")).toBe(true);
    }
  });

  it("GG-03 stable node ids for same catalog input", () => {
    const root = mkdtempSync(path.join(tmpdir(), "llm-wiki-graph-gen-"));
    const catalog: RepoFeatureLists = {
      repo: "chatkit-middleware",
      generatedAt: "2026-07-13T00:00:00.000Z",
      lists: {
        services: [{ id: "svc:gw", title: "api-gateway", sources: [], confidence: "high" }],
      },
    };
    writeCatalog(root, catalog);
    writeCatalog(root, { ...catalog, repo: "chatkit-web", lists: { apps: [{ id: "app:a", title: "a", sources: [], confidence: "high" }] } });
    writeCatalog(root, { ...catalog, repo: "finclaw", lists: { modules: [{ id: "c:1", title: "c", sources: [], confidence: "high" }] } });

    const a = graphFromCatalog(root).nodes.map((n) => n.id).sort();
    const b = graphFromCatalog(root).nodes.map((n) => n.id).sort();
    expect(a).toEqual(b);
  });
});

import { existsSync } from "node:fs";
import path from "node:path";

import {
  featureListPath,
  loadRepoFeatureLists,
} from "../catalog/store.js";
import type { CatalogListKind, CatalogRepo, FeatureItem } from "../catalog/types.js";
import type { GraphEdge, GraphNode, GraphNodeType, ProjectGraph } from "./types.js";
import { GRAPH_VERSION } from "./types.js";

const CATALOG_REPOS: CatalogRepo[] = ["chatkit-middleware", "chatkit-web", "finclaw"];

const LIST_NODE_TYPE: Partial<Record<CatalogListKind, GraphNodeType>> = {
  services: "module",
  apps: "app",
  libs: "module",
  "admin-features": "route",
  modules: "module",
  cli: "module",
};

function repoNodeId(repo: CatalogRepo): string {
  return `repo:${repo}`;
}

function itemNodeId(repo: CatalogRepo, listKind: CatalogListKind, item: FeatureItem): string {
  return `${repo}:${listKind}:${item.id}`;
}

export function graphFromCatalog(projectRoot: string): ProjectGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const catalogSources: string[] = [];

  for (const repo of CATALOG_REPOS) {
    const lists = loadRepoFeatureLists(projectRoot, repo);
    if (!lists) {
      throw new Error(
        `missing catalog for ${repo} — run npm run catalog:gen first (${featureListPath(projectRoot, repo)})`,
      );
    }
    catalogSources.push(path.relative(projectRoot, featureListPath(projectRoot, repo)));

    const repoId = repoNodeId(repo);
    nodes.push({ id: repoId, type: "repo", title: repo, repo });

    for (const [listKind, items] of Object.entries(lists.lists) as [
      CatalogListKind,
      FeatureItem[] | undefined,
    ][]) {
      if (!items?.length) continue;
      const nodeType = LIST_NODE_TYPE[listKind];
      if (!nodeType) continue;
      for (const item of items) {
        const nodeId = itemNodeId(repo, listKind, item);
        nodes.push({
          id: nodeId,
          type: nodeType,
          title: item.title,
          repo,
          listKind,
          ...(item.summary ? { summary: item.summary } : {}),
          ...(item.sources.length ? { sources: [...item.sources] } : {}),
        });
        edges.push({ from: repoId, to: nodeId, type: "contains" });
      }
    }
  }

  const cbmStateRel = ".reasonix/cbm-index-state.json";
  const cbmIndexState = existsSync(path.join(projectRoot, cbmStateRel))
    ? cbmStateRel
    : undefined;

  return {
    version: GRAPH_VERSION,
    generatedAt: new Date().toISOString(),
    sources: { catalog: catalogSources, ...(cbmIndexState ? { cbmIndexState } : {}) },
    nodes,
    edges,
  };
}

export function generateProjectGraph(projectRoot: string): ProjectGraph {
  return graphFromCatalog(projectRoot);
}

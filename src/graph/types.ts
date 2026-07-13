import type { CatalogListKind, CatalogRepo } from "../catalog/types.js";

export const GRAPH_VERSION = 1 as const;

export type GraphNodeType = "repo" | "module" | "app" | "route";

export type GraphEdgeType = "contains";

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  title: string;
  repo: CatalogRepo;
  listKind?: CatalogListKind;
  summary?: string;
  sources?: string[];
}

export interface GraphEdge {
  from: string;
  to: string;
  type: GraphEdgeType;
}

export interface ProjectGraph {
  version: typeof GRAPH_VERSION;
  generatedAt: string;
  sources: {
    catalog: string[];
    cbmIndexState?: string;
  };
  nodes: GraphNode[];
  edges: GraphEdge[];
}

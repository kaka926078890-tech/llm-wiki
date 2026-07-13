import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { ProjectGraph } from "./types.js";
import { GRAPH_VERSION } from "./types.js";

export function graphPath(projectRoot: string): string {
  return path.join(projectRoot, ".reasonix", "graph.json");
}

export function loadProjectGraph(projectRoot: string): ProjectGraph | null {
  const file = graphPath(projectRoot);
  if (!existsSync(file)) return null;
  const raw = JSON.parse(readFileSync(file, "utf-8")) as ProjectGraph;
  if (raw.version !== GRAPH_VERSION) {
    throw new Error(`unsupported graph version: ${raw.version}`);
  }
  return raw;
}

export function saveProjectGraph(projectRoot: string, graph: ProjectGraph): void {
  const file = graphPath(projectRoot);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(graph, null, 2)}\n`, "utf-8");
}

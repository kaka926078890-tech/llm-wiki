export interface CbmListedProject {
  name: string;
  rootPath: string;
  nodes?: number;
  edges?: number;
  sizeBytes?: number;
}

export interface CbmDetectChanges {
  changedCount: number;
  changedFiles: string[];
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function parseListProjects(raw: unknown): CbmListedProject[] {
  const rows = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { projects?: unknown[] }).projects)
      ? (raw as { projects: unknown[] }).projects
      : [];

  const out: CbmListedProject[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const name = "name" in row && typeof row.name === "string" ? row.name : null;
    const rootPath =
      "root_path" in row && typeof row.root_path === "string"
        ? row.root_path
        : "rootPath" in row && typeof row.rootPath === "string"
          ? row.rootPath
          : null;
    if (!name || !rootPath) continue;
    out.push({
      name,
      rootPath,
      nodes: typeof row.nodes === "number" ? row.nodes : undefined,
      edges: typeof row.edges === "number" ? row.edges : undefined,
      sizeBytes: typeof row.size_bytes === "number" ? row.size_bytes : undefined,
    });
  }
  return out;
}

export function matchProjectForRepo(
  projects: CbmListedProject[],
  repoPath: string,
): CbmListedProject | undefined {
  const normalized = normalizePath(repoPath);
  const base = normalized.split("/").pop() ?? normalized;
  return projects.find((p) => {
    const root = normalizePath(p.rootPath);
    return root === normalized || root.endsWith(`/${base}`) || p.name.includes(base);
  });
}

export function parseDetectChanges(raw: unknown): CbmDetectChanges {
  if (!raw || typeof raw !== "object") {
    return { changedCount: 0, changedFiles: [] };
  }
  const obj = raw as { changed_count?: unknown; changed_files?: unknown };
  const files = Array.isArray(obj.changed_files)
    ? obj.changed_files.filter((f): f is string => typeof f === "string")
    : [];
  const count =
    typeof obj.changed_count === "number" ? obj.changed_count : files.length;
  return { changedCount: count, changedFiles: files };
}

export function resolveStale(params: {
  indexed: boolean;
  changedCount: number;
}): { stale: boolean; staleReason?: "not_indexed" | "git_changes" } {
  if (!params.indexed) {
    return { stale: true, staleReason: "not_indexed" };
  }
  if (params.changedCount > 0) {
    return { stale: true, staleReason: "git_changes" };
  }
  return { stale: false };
}

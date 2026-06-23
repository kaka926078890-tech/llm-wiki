import path from "node:path";

import { formatCbmJson, probeCbmBinary, runCbmCli } from "./cbm/exec.js";
import { readGitHead, shortGitHead } from "./cbm/git.js";
import { readCbmIndexState } from "./cbm/index-state.js";
import {
  matchProjectForRepo,
  parseDetectChanges,
  parseListProjects,
  resolveStale,
  type CbmListedProject,
} from "./cbm/projects.js";
import type { CbmConfig, LlmWikiConfig } from "./config.js";

export type CbmStaleReason = "not_indexed" | "git_changes";

export interface CbmProjectStatus {
  repo: string;
  repoPath: string;
  indexed: boolean;
  projectName?: string;
  nodes?: number;
  edges?: number;
  sizeBytes?: number;
  gitHead?: string;
  gitHeadShort?: string;
  indexedGitHead?: string;
  indexedAt?: string;
  changedFileCount: number;
  changedFiles: string[];
  stale: boolean;
  staleReason?: CbmStaleReason;
  indexStatus?: string;
}

export interface CbmStatus {
  enabled: CbmConfig["enabled"];
  binary: string;
  binaryReady: boolean;
  cbmSearchReady: boolean;
  anyStale: boolean;
  allIndexed: boolean;
  lastSyncAt?: string;
  projects: CbmProjectStatus[];
}

const REPO_KEYS = [
  { key: "chatkit-middleware" as const, root: (c: LlmWikiConfig) => c.repos.middleware },
  { key: "chatkit-web" as const, root: (c: LlmWikiConfig) => c.repos.web },
  { key: "finclaw" as const, root: (c: LlmWikiConfig) => c.repos.finclaw },
];

const MAX_CHANGED_FILES = 12;

async function loadListedProjects(
  binary: string,
): Promise<CbmListedProject[]> {
  const listed = await runCbmCli(binary, "list_projects", {});
  if (!listed.ok) return [];
  try {
    return parseListProjects(JSON.parse(listed.stdout.trim()));
  } catch {
    return [];
  }
}

async function detectProjectChanges(
  binary: string,
  project: CbmListedProject,
): Promise<CbmDetectChangesResult> {
  const result = await runCbmCli(binary, "detect_changes", { project: project.name });
  if (!result.ok) {
    return { changedCount: 0, changedFiles: [], detectError: result.error };
  }
  try {
    return { ...parseDetectChanges(JSON.parse(result.stdout.trim())), detectError: undefined };
  } catch {
    return { changedCount: 0, changedFiles: [], detectError: "invalid detect_changes JSON" };
  }
}

interface CbmDetectChangesResult {
  changedCount: number;
  changedFiles: string[];
  detectError?: string;
}

async function loadIndexStatus(
  binary: string,
  projectName: string,
): Promise<string | undefined> {
  const status = await runCbmCli(binary, "index_status", { project: projectName });
  if (!status.ok) return undefined;
  try {
    const parsed = JSON.parse(status.stdout.trim()) as { status?: unknown };
    return typeof parsed.status === "string" ? parsed.status : undefined;
  } catch {
    return undefined;
  }
}

export async function getCbmStatus(cfg: LlmWikiConfig): Promise<CbmStatus> {
  const binary = cfg.cbm.binary;
  const binaryReady = await probeCbmBinary(binary);
  const indexState = readCbmIndexState(cfg.projectRoot);

  const listedProjects = binaryReady ? await loadListedProjects(binary) : [];

  const projects: CbmProjectStatus[] = [];

  for (const entry of REPO_KEYS) {
    const repoPath = entry.root(cfg);
    const matched = matchProjectForRepo(listedProjects, repoPath);
    const indexed = Boolean(matched);
    const gitHead = await readGitHead(repoPath);
    const stored = indexState?.repos[entry.key];

    let changes: CbmDetectChangesResult = { changedCount: 0, changedFiles: [] };
    let indexStatus: string | undefined;

    if (binaryReady && matched) {
      changes = await detectProjectChanges(binary, matched);
      indexStatus = await loadIndexStatus(binary, matched.name);
    }

    const { stale, staleReason } = resolveStale({
      indexed,
      changedCount: changes.changedCount,
    });

    projects.push({
      repo: entry.key,
      repoPath,
      indexed,
      projectName: matched?.name,
      nodes: matched?.nodes,
      edges: matched?.edges,
      sizeBytes: matched?.sizeBytes,
      gitHead: gitHead ?? undefined,
      gitHeadShort: gitHead ? shortGitHead(gitHead) : undefined,
      indexedGitHead: stored?.gitHead ?? undefined,
      indexedAt: stored?.indexedAt,
      changedFileCount: changes.changedCount,
      changedFiles: changes.changedFiles.slice(0, MAX_CHANGED_FILES),
      stale,
      staleReason,
      indexStatus,
    });
  }

  const cbmSearchReady = binaryReady && projects.some((p) => p.indexed);
  const anyStale = projects.some((p) => p.stale);
  const allIndexed = projects.length > 0 && projects.every((p) => p.indexed);

  return {
    enabled: cfg.cbm.enabled,
    binary,
    binaryReady,
    cbmSearchReady,
    anyStale,
    allIndexed,
    lastSyncAt: indexState?.updatedAt,
    projects,
  };
}

export function formatCbmStatusForLog(status: CbmStatus): string {
  return formatCbmJson(JSON.stringify(status));
}

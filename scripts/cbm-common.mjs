import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertCodeReposPresent } from "./code-repos.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const binary = process.env.LLM_WIKI_CBM_BINARY?.trim() || "codebase-memory-mcp";

function gitHead(dir) {
  const result = spawnSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf-8" });
  if (result.status !== 0) return null;
  const head = result.stdout.trim();
  return head || null;
}

function listProjects() {
  const result = spawnSync(binary, ["cli", "list_projects", "{}"], {
    cwd: projectRoot,
    encoding: "utf-8",
  });
  if (result.status !== 0) return [];
  try {
    const parsed = JSON.parse(result.stdout.trim());
    return Array.isArray(parsed?.projects) ? parsed.projects : [];
  } catch {
    return [];
  }
}

function matchProjectName(projects, repoDir) {
  const normalized = repoDir.replace(/\\/g, "/").replace(/\/+$/, "");
  const base = normalized.split("/").pop();
  const hit = projects.find((p) => {
    const root = String(p.root_path ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
    return root === normalized || root.endsWith(`/${base}`) || String(p.name).includes(base);
  });
  return hit?.name;
}

export function writeCbmIndexState(repos) {
  const state = {
    updatedAt: new Date().toISOString(),
    repos: {},
  };
  const projects = listProjects();
  for (const entry of repos) {
    state.repos[entry.name] = {
      gitHead: gitHead(entry.dir),
      indexedAt: state.updatedAt,
      projectName: matchProjectName(projects, entry.dir) ?? undefined,
    };
  }
  const dir = path.join(projectRoot, ".reasonix");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "cbm-index-state.json"),
    `${JSON.stringify(state, null, 2)}\n`,
    "utf-8",
  );
  console.log("[cbm] wrote .reasonix/cbm-index-state.json");
}

export function runCbm(tool, payload) {
  const result = spawnSync(binary, ["cli", tool, JSON.stringify(payload)], {
    cwd: projectRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

export function loadReposOrExit() {
  return assertCodeReposPresent();
}

export { projectRoot, binary };

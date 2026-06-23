import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export interface CbmRepoIndexRecord {
  gitHead: string | null;
  indexedAt: string;
  projectName?: string;
}

export interface CbmIndexStateFile {
  updatedAt: string;
  repos: Record<string, CbmRepoIndexRecord>;
}

export function cbmIndexStatePath(projectRoot: string): string {
  return path.join(projectRoot, ".reasonix", "cbm-index-state.json");
}

export function readCbmIndexState(projectRoot: string): CbmIndexStateFile | null {
  const filePath = cbmIndexStatePath(projectRoot);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as CbmIndexStateFile;
  } catch {
    return null;
  }
}

export function writeCbmIndexState(
  projectRoot: string,
  repos: Record<string, CbmRepoIndexRecord>,
): void {
  const dir = path.join(projectRoot, ".reasonix");
  mkdirSync(dir, { recursive: true });
  const payload: CbmIndexStateFile = {
    updatedAt: new Date().toISOString(),
    repos,
  };
  writeFileSync(cbmIndexStatePath(projectRoot), `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

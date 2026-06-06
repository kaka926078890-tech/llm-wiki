import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SemanticIndexFile } from "./types.js";

const INDEX_FILE = "index.json";

export function semanticIndexPath(indexDir: string): string {
  return path.join(indexDir, INDEX_FILE);
}

function isSemanticIndexFile(value: unknown): value is SemanticIndexFile {
  const candidate = value as SemanticIndexFile;
  return !!candidate
    && candidate.version === 1
    && typeof candidate.repo === "string"
    && typeof candidate.model === "string"
    && Array.isArray(candidate.records);
}

export async function loadSemanticIndex(indexDir: string): Promise<SemanticIndexFile | null> {
  try {
    const raw = await readFile(semanticIndexPath(indexDir), "utf-8");
    const parsed = JSON.parse(raw);
    if (!isSemanticIndexFile(parsed)) return null;
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function saveSemanticIndex(indexDir: string, index: SemanticIndexFile): Promise<void> {
  await mkdir(indexDir, { recursive: true });
  await writeFile(semanticIndexPath(indexDir), `${JSON.stringify(index, null, 2)}\n`, "utf-8");
}

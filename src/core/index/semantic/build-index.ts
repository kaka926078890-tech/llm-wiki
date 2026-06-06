import { readFile } from "node:fs/promises";
import { promises as fs } from "node:fs";
import path from "node:path";
import ignore, { type Ignore } from "ignore";
import { compileFilters, resolveIndexConfig, type IndexFilters } from "../config.js";
import { chunkText } from "./chunker.js";
import { saveSemanticIndex } from "./index-store.js";
import type { EmbeddingClient, SemanticIndexFile, SemanticVectorRecord } from "./types.js";

export interface BuildSemanticIndexOptions {
  repo: string;
  repoRoot: string;
  indexDir: string;
  model: string;
  client: EmbeddingClient;
  chunkChars: number;
  chunkOverlap: number;
}

async function loadRepoGitignore(repoRoot: string): Promise<Ignore> {
  const ig = ignore();
  try {
    const raw = await readFile(path.join(repoRoot, ".gitignore"), "utf-8");
    ig.add(raw);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  return ig;
}

function shouldSkipName(name: string, filters: IndexFilters): boolean {
  const lower = name.toLowerCase();
  return filters.dirSet.has(name)
    || filters.fileSet.has(name)
    || [...filters.extSet].some((ext) => lower.endsWith(ext));
}

async function collectFiles(
  root: string,
  filters: IndexFilters,
  gitignore: Ignore | null,
  dir = root,
): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full).replaceAll("\\", "/");
    if (shouldSkipName(entry.name, filters) || filters.patternMatch(rel)) continue;
    if (gitignore?.ignores(rel)) continue;
    if (entry.isFile() && entry.name.startsWith(".")) continue;
    if (entry.isDirectory()) {
      files.push(...await collectFiles(root, filters, gitignore, full));
    } else if (entry.isFile()) {
      const stat = await fs.stat(full);
      if (stat.size <= filters.maxFileBytes) files.push(full);
    }
  }
  return files;
}

export async function buildSemanticIndexForRepo(
  opts: BuildSemanticIndexOptions,
): Promise<SemanticIndexFile> {
  const filters = compileFilters(resolveIndexConfig());
  const gitignore = filters.respectGitignore ? await loadRepoGitignore(opts.repoRoot) : null;
  const files = await collectFiles(opts.repoRoot, filters, gitignore);
  const chunks = [];
  for (const file of files) {
    const rel = path.relative(opts.repoRoot, file).replaceAll("\\", "/");
    const text = await fs.readFile(file, "utf-8").catch(() => "");
    chunks.push(...chunkText({
      repo: opts.repo,
      path: rel,
      text,
      maxChars: opts.chunkChars,
      overlapChars: opts.chunkOverlap,
    }));
  }

  const vectors = await opts.client.embed(chunks.map((chunk) => chunk.text));
  const records: SemanticVectorRecord[] = chunks.map((chunk, i) => ({
    ...chunk,
    embedding: vectors[i] ?? [],
  })).filter((record) => record.embedding.length > 0);

  const index: SemanticIndexFile = {
    version: 1,
    repo: opts.repo,
    model: opts.model,
    generatedAt: new Date().toISOString(),
    records,
  };
  await saveSemanticIndex(opts.indexDir, index);
  return index;
}

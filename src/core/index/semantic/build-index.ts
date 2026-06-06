import { readFile } from "node:fs/promises";
import { promises as fs } from "node:fs";
import path from "node:path";
import ignore, { type Ignore } from "ignore";
import { compileFilters, resolveIndexConfig, type IndexFilters } from "../config.js";
import { chunkText } from "./chunker.js";
import { saveSemanticIndex } from "./index-store.js";
import type { EmbeddingClient, SemanticIndexFile, SemanticVectorRecord } from "./types.js";

export interface BuildSemanticIndexProgress {
  repo: string;
  phase: "scanning" | "chunking" | "embedding" | "saving";
  files?: number;
  chunks?: number;
  embedBatch?: number;
  embedBatches?: number;
  embeddedChunks?: number;
}

export interface BuildSemanticIndexOptions {
  repo: string;
  repoRoot: string;
  indexDir: string;
  model: string;
  client: EmbeddingClient;
  chunkChars: number;
  chunkOverlap: number;
  embedBatchSize?: number;
  onProgress?: (progress: BuildSemanticIndexProgress) => void;
}

const DEFAULT_EMBED_BATCH_SIZE = 32;
/** BGE via TEI enforces 512 tokens per input; ~1000 chars stays safely under for mixed code. */
const TEI_MAX_CHUNK_CHARS = 1000;

async function embedInBatches(
  client: EmbeddingClient,
  texts: string[],
  batchSize: number,
  onBatch?: (embedBatch: number, embedBatches: number, embeddedChunks: number) => void,
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const size = Math.max(1, Math.floor(batchSize));
  const totalBatches = Math.ceil(texts.length / size);
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += size) {
    const batch = texts.slice(i, i + size);
    vectors.push(...await client.embed(batch));
    const embedBatch = Math.floor(i / size) + 1;
    onBatch?.(embedBatch, totalBatches, Math.min(i + batch.length, texts.length));
  }
  return vectors;
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
  const report = (progress: BuildSemanticIndexProgress) => opts.onProgress?.(progress);

  report({ repo: opts.repo, phase: "scanning" });
  const filters = compileFilters(resolveIndexConfig());
  const gitignore = filters.respectGitignore ? await loadRepoGitignore(opts.repoRoot) : null;
  const files = await collectFiles(opts.repoRoot, filters, gitignore);
  const maxChars = Math.min(opts.chunkChars, TEI_MAX_CHUNK_CHARS);
  const chunks = [];
  for (const file of files) {
    const rel = path.relative(opts.repoRoot, file).replaceAll("\\", "/");
    const text = await fs.readFile(file, "utf-8").catch(() => "");
    chunks.push(...chunkText({
      repo: opts.repo,
      path: rel,
      text,
      maxChars,
      overlapChars: opts.chunkOverlap,
    }));
  }

  report({
    repo: opts.repo,
    phase: "chunking",
    files: files.length,
    chunks: chunks.length,
  });

  const vectors = await embedInBatches(
    opts.client,
    chunks.map((chunk) => chunk.text),
    opts.embedBatchSize ?? DEFAULT_EMBED_BATCH_SIZE,
    (embedBatch, embedBatches, embeddedChunks) => {
      if (embedBatch === 1 || embedBatch === embedBatches || embedBatch % 10 === 0) {
        report({
          repo: opts.repo,
          phase: "embedding",
          chunks: chunks.length,
          embedBatch,
          embedBatches,
          embeddedChunks,
        });
      }
    },
  );
  const records: SemanticVectorRecord[] = chunks.map((chunk, i) => ({
    ...chunk,
    embedding: vectors[i] ?? [],
  })).filter((record) => record.embedding.length > 0);

  report({ repo: opts.repo, phase: "saving", chunks: records.length });

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

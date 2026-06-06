import path from "node:path";
import { loadConfig, loadEnvFile } from "./config.js";
import { TeiEmbeddingClient } from "./core/index/semantic/tei-client.js";
import { buildSemanticIndexForRepo } from "./core/index/semantic/build-index.js";
import type { BuildSemanticIndexProgress } from "./core/index/semantic/build-index.js";

function repoEntries(cfg: ReturnType<typeof loadConfig>): Array<{ repo: string; root: string }> {
  return [
    { repo: "chatkit-middleware", root: cfg.repos.middleware },
    { repo: "chatkit-web", root: cfg.repos.web },
    { repo: "finclaw", root: cfg.repos.finclaw },
  ];
}

function formatProgress(progress: BuildSemanticIndexProgress, repoIndex: number, repoTotal: number): string {
  const prefix = `[index ${repoIndex}/${repoTotal}] ${progress.repo}`;
  switch (progress.phase) {
    case "scanning":
      return `${prefix}: scanning files...`;
    case "chunking":
      return `${prefix}: ${progress.files} files -> ${progress.chunks} chunks`;
    case "embedding":
      return `${prefix}: embedding ${progress.embeddedChunks}/${progress.chunks} chunks (batch ${progress.embedBatch}/${progress.embedBatches})`;
    case "saving":
      return `${prefix}: writing ${progress.chunks} records...`;
  }
}

async function main(): Promise<void> {
  loadEnvFile();
  const cfg = loadConfig();
  if (!cfg.semantic.teiBaseUrl) {
    throw new Error("LLM_WIKI_TEI_BASE_URL is required to build semantic indexes");
  }

  const client = new TeiEmbeddingClient({
    baseUrl: cfg.semantic.teiBaseUrl,
    model: cfg.semantic.teiModel,
  });
  const ok = await client.probe();
  if (!ok) throw new Error(`TEI embedding service unavailable at ${cfg.semantic.teiBaseUrl}`);

  const entries = repoEntries(cfg);
  console.log(`[index] TEI ${cfg.semantic.teiBaseUrl} model=${cfg.semantic.teiModel}`);
  console.log(`[index] building ${entries.length} repo indexes`);

  for (const [i, entry] of entries.entries()) {
    const indexDir = path.join(entry.root, cfg.semantic.indexDir);
    const index = await buildSemanticIndexForRepo({
      repo: entry.repo,
      repoRoot: entry.root,
      indexDir,
      model: cfg.semantic.teiModel,
      client,
      chunkChars: cfg.semantic.chunkChars,
      chunkOverlap: cfg.semantic.chunkOverlap,
      onProgress: (progress) => {
        console.log(formatProgress(progress, i + 1, entries.length));
      },
    });
    console.log(`[index ${i + 1}/${entries.length}] done: ${index.records.length} chunks -> ${indexDir}`);
  }

  console.log("[index] all repos indexed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

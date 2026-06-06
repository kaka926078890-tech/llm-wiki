import path from "node:path";
import { loadConfig, loadEnvFile } from "./config.js";
import { TeiEmbeddingClient } from "./core/index/semantic/tei-client.js";
import { buildSemanticIndexForRepo } from "./core/index/semantic/build-index.js";

function repoEntries(cfg: ReturnType<typeof loadConfig>): Array<{ repo: string; root: string }> {
  return [
    { repo: "chatkit-middleware", root: cfg.repos.middleware },
    { repo: "chatkit-web", root: cfg.repos.web },
    { repo: "finclaw", root: cfg.repos.finclaw },
  ];
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

  for (const entry of repoEntries(cfg)) {
    const indexDir = path.join(entry.root, cfg.semantic.indexDir);
    const index = await buildSemanticIndexForRepo({
      repo: entry.repo,
      repoRoot: entry.root,
      indexDir,
      model: cfg.semantic.teiModel,
      client,
      chunkChars: cfg.semantic.chunkChars,
      chunkOverlap: cfg.semantic.chunkOverlap,
    });
    console.log(`indexed ${entry.repo}: ${index.records.length} chunks -> ${indexDir}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

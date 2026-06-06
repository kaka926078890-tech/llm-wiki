import path from "node:path";
import { CacheFirstLoop } from "./core/loop.js";
import { DeepSeekClient } from "./core/client.js";
import { ImmutablePrefix } from "./core/memory/runtime.js";
import { ToolRegistry } from "./core/tools.js";
import type { LlmWikiConfig } from "./config.js";
import { buildSystemPrompt } from "./prompt.js";
import { TeiEmbeddingClient } from "./core/index/semantic/tei-client.js";
import { SemanticSearchEngine } from "./core/index/semantic/search.js";
import { registerMultiRootReadonlyTools } from "./tools/multi-root-readonly.js";
import { registerSemanticSearchTool } from "./tools/semantic-search.js";
import { registerCodeGraphSearchTool } from "./tools/codegraph-search.js";

async function tryRegisterSemanticTools(tools: ToolRegistry, cfg: LlmWikiConfig): Promise<void> {
  if (cfg.semantic.enabled === false) return;
  if (!cfg.semantic.teiBaseUrl) return;

  const client = new TeiEmbeddingClient({
    baseUrl: cfg.semantic.teiBaseUrl,
    model: cfg.semantic.teiModel,
  });
  const engine = new SemanticSearchEngine({
    client,
    expectedModel: cfg.semantic.teiModel,
    indexes: [
      { repo: "chatkit-middleware", indexDir: path.join(cfg.repos.middleware, cfg.semantic.indexDir) },
      { repo: "chatkit-web", indexDir: path.join(cfg.repos.web, cfg.semantic.indexDir) },
      { repo: "finclaw", indexDir: path.join(cfg.repos.finclaw, cfg.semantic.indexDir) },
    ],
  });

  const registered = await registerSemanticSearchTool(tools, {
    engine,
    defaultTopK: cfg.semantic.topK,
  });
  if (cfg.semantic.enabled === true && !registered) {
    console.warn(
      "[llm-wiki] LLM_WIKI_SEMANTIC_ENABLED=true but semantic_search is unavailable "
      + "(TEI unreachable, missing indexes, or index model mismatch with LLM_WIKI_TEI_MODEL). "
      + "Continuing with lexical tools only. If you changed the embedding model, re-run `npm run index`.",
    );
  }
}

export async function buildLoop(cfg: LlmWikiConfig): Promise<CacheFirstLoop> {
  const tools = new ToolRegistry({ autoFlatten: true });
  registerMultiRootReadonlyTools(tools, { roots: cfg.repos });
  registerCodeGraphSearchTool(tools, { projectRoot: cfg.projectRoot });
  await tryRegisterSemanticTools(tools, cfg);

  const client = new DeepSeekClient({
    apiKey: cfg.deepseekApiKey,
    baseUrl: cfg.deepseekBaseUrl,
  });

  const system = buildSystemPrompt(cfg);
  const prefix = new ImmutablePrefix({
    system,
    toolSpecs: tools.specs(),
  });

  return new CacheFirstLoop({
    client,
    prefix,
    tools,
    model: cfg.deepseekModel,
    stream: false,
    maxIterPerTurn: 10,
  });
}

export { CacheFirstLoop };

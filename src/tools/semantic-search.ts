import type { ToolRegistry } from "../core/tools.js";
import type { SemanticSearchEngine } from "../core/index/semantic/search.js";

export interface RegisterSemanticSearchToolOptions {
  engine: SemanticSearchEngine;
  defaultTopK: number;
}

export async function registerSemanticSearchTool(
  registry: ToolRegistry,
  opts: RegisterSemanticSearchToolOptions,
): Promise<boolean> {
  const available = await opts.engine.probe();
  if (!available) return false;

  registry.register({
    name: "semantic_search",
    readOnly: true,
    parallelSafe: true,
    stormExempt: true,
    description:
      "Semantic search over prebuilt repo indexes. Use first for broad descriptive questions, feature discovery, architecture discovery, and conceptually related code. For exact symbols, routes, env vars, and error strings, use search_content instead.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural-language search query." },
        repo: {
          type: "string",
          description: "Optional repo filter: chatkit-middleware, chatkit-web, or finclaw.",
        },
        top_k: {
          type: "integer",
          description: "Number of semantic hits to return. Default comes from config.",
        },
      },
      required: ["query"],
    },
    fn: async (args: { query: string; repo?: string; top_k?: number }) => {
      const topK = Math.max(1, Math.min(50, Math.floor(args.top_k ?? opts.defaultTopK)));
      const hits = await opts.engine.search(args.query, { topK, repo: args.repo });
      if (hits.length === 0) {
        return "No semantic matches found. Fall back to search_content, glob, directory_tree, and read_file.";
      }
      return hits.map((hit) => [
        `[${hit.repo}] ${hit.path}:${hit.startLine}-${hit.endLine} score=${hit.score}`,
        hit.text,
      ].join("\n")).join("\n\n---\n\n");
    },
  });

  return true;
}

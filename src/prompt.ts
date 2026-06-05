import type { AuthorizedRoots, LlmWikiConfig } from "./config.js";
import { buildWikiSystemPrompt } from "./prompt-code.js";

export function workspaceReposAppend(roots: AuthorizedRoots): string {
  return `# Workspace repos (read-only)

You may search and read across these roots:
- chatkit-middleware — backend middleware (${roots.middleware})
- chatkit-web — admin & channel frontends (${roots.web})
- finclaw — agent runtime (${roots.finclaw})

Use relative paths from each repo root. Cite evidence with file:line as usual.`;
}

export function buildSystemPrompt(cfg: LlmWikiConfig): string {
  return buildWikiSystemPrompt(cfg.deepseekModel, workspaceReposAppend(cfg.repos));
}

import { CacheFirstLoop } from "./core/loop.js";
import { DeepSeekClient } from "./core/client.js";
import { ImmutablePrefix } from "./core/memory/runtime.js";
import { ToolRegistry } from "./core/tools.js";
import type { LlmWikiConfig } from "./config.js";
import { buildSystemPrompt } from "./prompt.js";
import { registerMultiRootReadonlyTools } from "./tools/multi-root-readonly.js";

export function buildLoop(cfg: LlmWikiConfig): CacheFirstLoop {
  const tools = new ToolRegistry({ autoFlatten: true });
  registerMultiRootReadonlyTools(tools, { roots: cfg.repos });

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

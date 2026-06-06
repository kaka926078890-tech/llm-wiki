import { describe, expect, it } from "vitest";

import { ToolRegistry } from "../src/core/tools.js";
import { registerSemanticSearchTool } from "../src/tools/semantic-search.js";
import type { SemanticSearchEngine } from "../src/core/index/semantic/search.js";

describe("registerSemanticSearchTool", () => {
  it("registers semantic_search when engine is available", async () => {
    const registry = new ToolRegistry({ autoFlatten: true });
    const engine = {
      probe: async () => true,
      search: async () => [{
        id: "hit-1",
        repo: "chatkit-web",
        path: "src/App.tsx",
        startLine: 1,
        endLine: 3,
        text: "chat feature",
        score: 0.9,
      }],
    } as unknown as SemanticSearchEngine;

    await registerSemanticSearchTool(registry, { engine, defaultTopK: 8 });
    expect(registry.specs().some((spec) => spec.function.name === "semantic_search")).toBe(true);

    const result = await registry.dispatch("semantic_search", { query: "chat feature" });
    expect(result).toContain("[chatkit-web] src/App.tsx:1-3 score=0.9");
    expect(result).toContain("chat feature");
  });

  it("does not register semantic_search when engine is unavailable", async () => {
    const registry = new ToolRegistry({ autoFlatten: true });
    const engine = {
      probe: async () => false,
      search: async () => [],
    } as unknown as SemanticSearchEngine;

    await registerSemanticSearchTool(registry, { engine, defaultTopK: 8 });
    expect(registry.specs().some((spec) => spec.function.name === "semantic_search")).toBe(false);
  });
});

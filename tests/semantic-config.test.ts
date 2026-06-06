import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";

function env(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    DEEPSEEK_API_KEY: "test-key",
    ...overrides,
  };
}

describe("semantic config", () => {
  it("defaults semantic search to auto and TEI provider", () => {
    const cfg = loadConfig(env());
    expect(cfg.semantic.enabled).toBe("auto");
    expect(cfg.semantic.provider).toBe("tei");
    expect(cfg.semantic.teiBaseUrl).toBe("");
    expect(cfg.semantic.topK).toBe(8);
    expect(cfg.semantic.chunkChars).toBe(1400);
    expect(cfg.semantic.chunkOverlap).toBe(200);
    expect(cfg.semantic.indexDir).toBe(".reasonix/semantic");
  });

  it("parses semantic env overrides", () => {
    const cfg = loadConfig(
      env({
        LLM_WIKI_SEMANTIC_ENABLED: "true",
        LLM_WIKI_EMBEDDING_PROVIDER: "tei",
        LLM_WIKI_TEI_BASE_URL: "http://127.0.0.1:8080",
        LLM_WIKI_TEI_MODEL: "BAAI/bge-large-zh-v1.5",
        LLM_WIKI_SEMANTIC_TOP_K: "5",
        LLM_WIKI_SEMANTIC_CHUNK_CHARS: "1200",
        LLM_WIKI_SEMANTIC_CHUNK_OVERLAP: "160",
        LLM_WIKI_SEMANTIC_INDEX_DIR: ".reasonix/semantic-custom",
      }),
    );

    expect(cfg.semantic).toMatchObject({
      enabled: true,
      provider: "tei",
      teiBaseUrl: "http://127.0.0.1:8080",
      teiModel: "BAAI/bge-large-zh-v1.5",
      topK: 5,
      chunkChars: 1200,
      chunkOverlap: 160,
      indexDir: ".reasonix/semantic-custom",
    });
  });

  it("clamps unsafe semantic numeric values", () => {
    const cfg = loadConfig(
      env({
        LLM_WIKI_SEMANTIC_TOP_K: "999",
        LLM_WIKI_SEMANTIC_CHUNK_CHARS: "20",
        LLM_WIKI_SEMANTIC_CHUNK_OVERLAP: "9999",
      }),
    );

    expect(cfg.semantic.topK).toBe(50);
    expect(cfg.semantic.chunkChars).toBe(300);
    expect(cfg.semantic.chunkOverlap).toBe(299);
  });
});

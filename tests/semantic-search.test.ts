import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { saveSemanticIndex } from "../src/core/index/semantic/index-store.js";
import { SemanticSearchEngine } from "../src/core/index/semantic/search.js";
import type { EmbeddingClient, SemanticIndexFile } from "../src/core/index/semantic/types.js";

let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-search-semantic-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("SemanticSearchEngine", () => {
  it("loads indexes and ranks hits by cosine similarity", async () => {
    const index: SemanticIndexFile = {
      version: 1,
      repo: "chatkit-web",
      model: "test-model",
      generatedAt: "2026-06-06T00:00:00.000Z",
      records: [
        { id: "a", repo: "chatkit-web", path: "a.ts", startLine: 1, endLine: 1, text: "billing", embedding: [1, 0] },
        { id: "b", repo: "chatkit-web", path: "b.ts", startLine: 1, endLine: 1, text: "chat", embedding: [0, 1] },
      ],
    };
    await saveSemanticIndex(path.join(dir, ".reasonix", "semantic"), index);

    const client: EmbeddingClient = {
      probe: async () => true,
      embed: async () => [[0, 1]],
    };
    const engine = new SemanticSearchEngine({
      client,
      expectedModel: "test-model",
      indexes: [{ repo: "chatkit-web", indexDir: path.join(dir, ".reasonix", "semantic") }],
    });

    await expect(engine.probe()).resolves.toBe(true);
    const hits = await engine.search("chat UI", { topK: 1 });
    expect(hits).toEqual([
      {
        id: "b",
        repo: "chatkit-web",
        path: "b.ts",
        startLine: 1,
        endLine: 1,
        text: "chat",
        score: 1,
      },
    ]);
  });

  it("is unavailable when no indexes exist", async () => {
    const client: EmbeddingClient = {
      probe: async () => true,
      embed: async () => [[1, 0]],
    };
    const engine = new SemanticSearchEngine({
      client,
      expectedModel: "test-model",
      indexes: [{ repo: "chatkit-web", indexDir: path.join(dir, ".reasonix", "semantic") }],
    });

    await expect(engine.probe()).resolves.toBe(false);
  });

  it("skips indexes built with a different embedding model", async () => {
    const index: SemanticIndexFile = {
      version: 1,
      repo: "chatkit-web",
      model: "old-model",
      generatedAt: "2026-06-06T00:00:00.000Z",
      records: [
        { id: "a", repo: "chatkit-web", path: "a.ts", startLine: 1, endLine: 1, text: "chat", embedding: [1, 0] },
      ],
    };
    await saveSemanticIndex(path.join(dir, ".reasonix", "semantic"), index);

    const client: EmbeddingClient = {
      probe: async () => true,
      embed: async () => [[1, 0]],
    };
    const engine = new SemanticSearchEngine({
      client,
      expectedModel: "test-model",
      indexes: [{ repo: "chatkit-web", indexDir: path.join(dir, ".reasonix", "semantic") }],
    });

    await expect(engine.probe()).resolves.toBe(false);
  });
});

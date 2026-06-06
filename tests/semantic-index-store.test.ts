import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadSemanticIndex, saveSemanticIndex } from "../src/core/index/semantic/index-store.js";
import type { SemanticIndexFile } from "../src/core/index/semantic/types.js";

let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-semantic-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("semantic index store", () => {
  it("saves and loads an index file", async () => {
    const index: SemanticIndexFile = {
      version: 1,
      repo: "chatkit-web",
      model: "BAAI/bge-m3",
      generatedAt: "2026-06-06T00:00:00.000Z",
      records: [{
        id: "chatkit-web:a.ts:1-1:0",
        repo: "chatkit-web",
        path: "a.ts",
        startLine: 1,
        endLine: 1,
        text: "hello",
        embedding: [1, 0],
      }],
    };

    await saveSemanticIndex(dir, index);
    await expect(loadSemanticIndex(dir)).resolves.toEqual(index);
  });

  it("returns null when index is missing", async () => {
    await expect(loadSemanticIndex(dir)).resolves.toBeNull();
  });
});

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildSemanticIndexForRepo } from "../src/core/index/semantic/build-index.js";
import type { EmbeddingClient } from "../src/core/index/semantic/types.js";

let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-build-semantic-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("buildSemanticIndexForRepo", () => {
  it("chunks files, embeds records, and writes index.json", async () => {
    await writeFile(path.join(dir, "a.ts"), "export const alpha = 1;\nexport const beta = 2;\n", "utf-8");

    const client: EmbeddingClient = {
      probe: async () => true,
      embed: async (inputs) => inputs.map((input, i) => [input.length, i]),
    };

    const result = await buildSemanticIndexForRepo({
      repo: "chatkit-web",
      repoRoot: dir,
      indexDir: path.join(dir, ".reasonix", "semantic"),
      model: "test-model",
      client,
      chunkChars: 300,
      chunkOverlap: 20,
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]!.path).toBe("a.ts");
    expect(result.records[0]!.embedding).toEqual([result.records[0]!.text.length, 0]);

    const raw = await readFile(path.join(dir, ".reasonix", "semantic", "index.json"), "utf-8");
    expect(JSON.parse(raw)).toMatchObject({
      version: 1,
      repo: "chatkit-web",
      model: "test-model",
    });
  });

  it("embeds in batches to avoid oversized TEI requests", async () => {
    const lines = Array.from({ length: 80 }, (_, i) => `export const v${i} = ${i};\n`).join("");
    await writeFile(path.join(dir, "big.ts"), lines, "utf-8");

    let embedCalls = 0;
    const client: EmbeddingClient = {
      probe: async () => true,
      embed: async (inputs) => {
        embedCalls += 1;
        expect(inputs.length).toBeLessThanOrEqual(3);
        return inputs.map((input) => [input.length]);
      },
    };

    const result = await buildSemanticIndexForRepo({
      repo: "chatkit-web",
      repoRoot: dir,
      indexDir: path.join(dir, ".reasonix", "semantic"),
      model: "test-model",
      client,
      chunkChars: 300,
      chunkOverlap: 20,
      embedBatchSize: 3,
    });

    expect(result.records.length).toBeGreaterThan(3);
    expect(embedCalls).toBeGreaterThan(1);
  });

  it("reports progress through scanning, chunking, embedding, and saving", async () => {
    const lines = Array.from({ length: 10 }, (_, i) => `export const v${i} = ${i};\n`).join("");
    await writeFile(path.join(dir, "big.ts"), lines, "utf-8");

    const phases: string[] = [];
    const client: EmbeddingClient = {
      probe: async () => true,
      embed: async (inputs) => inputs.map((input) => [input.length]),
    };

    await buildSemanticIndexForRepo({
      repo: "chatkit-web",
      repoRoot: dir,
      indexDir: path.join(dir, ".reasonix", "semantic"),
      model: "test-model",
      client,
      chunkChars: 300,
      chunkOverlap: 20,
      embedBatchSize: 3,
      onProgress: (progress) => phases.push(progress.phase),
    });

    expect(phases).toContain("scanning");
    expect(phases).toContain("chunking");
    expect(phases).toContain("embedding");
    expect(phases).toContain("saving");
  });

  it("skips lock files, excluded dirs, and gitignored paths", async () => {
    const { mkdir } = await import("node:fs/promises");
    await writeFile(path.join(dir, "a.ts"), "export const alpha = 1;\n", "utf-8");
    await writeFile(path.join(dir, "package-lock.json"), "{}", "utf-8");
    await writeFile(path.join(dir, ".gitignore"), "ignored.ts\n", "utf-8");
    await writeFile(path.join(dir, "ignored.ts"), "export const hidden = 1;\n", "utf-8");
    await mkdir(path.join(dir, "node_modules", "pkg"), { recursive: true });
    await writeFile(path.join(dir, "node_modules", "pkg", "index.js"), "module.exports = {};\n", "utf-8");

    const client: EmbeddingClient = {
      probe: async () => true,
      embed: async (inputs) => inputs.map((input) => [input.length]),
    };

    const result = await buildSemanticIndexForRepo({
      repo: "chatkit-web",
      repoRoot: dir,
      indexDir: path.join(dir, ".reasonix", "semantic"),
      model: "test-model",
      client,
      chunkChars: 300,
      chunkOverlap: 20,
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]!.path).toBe("a.ts");
  });
});

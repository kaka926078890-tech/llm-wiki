import { describe, expect, it } from "vitest";

import { chunkText } from "../src/core/index/semantic/chunker.js";

describe("chunkText", () => {
  it("returns one chunk for short text with line numbers", () => {
    const chunks = chunkText({
      repo: "chatkit-web",
      path: "src/App.tsx",
      text: "one\ntwo\nthree",
      maxChars: 100,
      overlapChars: 10,
    });

    expect(chunks).toEqual([
      {
        id: "chatkit-web:src/App.tsx:1-3:0",
        repo: "chatkit-web",
        path: "src/App.tsx",
        startLine: 1,
        endLine: 3,
        text: "one\ntwo\nthree",
      },
    ]);
  });

  it("splits long text with overlap and stable ids", () => {
    const text = Array.from({ length: 40 }, (_, i) => `line-${i + 1}-padding-text`).join("\n");
    const chunks = chunkText({
      repo: "chatkit-web",
      path: "src/file.ts",
      text,
      maxChars: 300,
      overlapChars: 5,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]!.id).toMatch(/^chatkit-web:src\/file\.ts:\d+-\d+:0$/);
    expect(chunks[0]!.text).toContain("line-1");
    expect(chunks[1]!.startLine).toBeLessThanOrEqual(chunks[0]!.endLine);
  });
});

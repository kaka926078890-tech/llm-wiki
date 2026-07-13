import { describe, expect, it } from "vitest";

import { diffRepoFeatureLists, logCatalogDrift } from "../src/catalog/drift.js";
import type { RepoFeatureLists } from "../src/catalog/types.js";

describe("catalog drift", () => {
  it("detects added and removed service ids", () => {
    const prev: RepoFeatureLists = {
      repo: "chatkit-middleware",
      generatedAt: "2026-01-01",
      lists: {
        services: [
          { id: "service:a", title: "a", sources: ["x"], confidence: "high" },
          { id: "service:b", title: "b", sources: ["x"], confidence: "high" },
        ],
      },
    };
    const next: RepoFeatureLists = {
      repo: "chatkit-middleware",
      generatedAt: "2026-01-02",
      lists: {
        services: [
          { id: "service:a", title: "a", sources: ["x"], confidence: "high" },
          { id: "service:c", title: "c", sources: ["x"], confidence: "high" },
        ],
      },
    };
    const drifts = diffRepoFeatureLists(prev, next);
    expect(drifts).toHaveLength(1);
    expect(drifts[0]!.added).toEqual(["c"]);
    expect(drifts[0]!.removed).toEqual(["b"]);
  });

  it("logs no changes when lists match", () => {
    const data: RepoFeatureLists = {
      repo: "finclaw",
      generatedAt: "2026-01-01",
      lists: { modules: [{ id: "m:1", title: "one", sources: ["x"], confidence: "high" }] },
    };
    const lines: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => lines.push(String(args[0]));
    try {
      logCatalogDrift("finclaw", diffRepoFeatureLists(data, data));
    } finally {
      console.log = orig;
    }
    expect(lines.some((l) => l.includes("no changes"))).toBe(true);
  });
});

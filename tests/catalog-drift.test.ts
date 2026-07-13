import { describe, expect, it } from "vitest";

import { diffRepoFeatureLists, logCatalogDrift } from "../src/catalog/drift.js";
import { lintCatalogAnswerSubset } from "../src/catalog/g3-lint.js";
import { parseRepoFeatureLists, normalizeFeatureLists } from "../src/catalog/validate.js";
import { parseCatalogRulesYaml } from "../src/catalog/rules.js";
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

  it("detects summaryChanged drift", () => {
    const prev: RepoFeatureLists = {
      repo: "finclaw",
      generatedAt: "2026-01-01",
      lists: {
        modules: [{ id: "m:1", title: "one", summary: "old", sources: ["x"], confidence: "high" }],
      },
    };
    const next: RepoFeatureLists = {
      repo: "finclaw",
      generatedAt: "2026-01-02",
      lists: {
        modules: [{ id: "m:1", title: "one", summary: "new", sources: ["x"], confidence: "high" }],
      },
    };
    expect(diffRepoFeatureLists(prev, next)[0]!.summaryChanged).toEqual(["one"]);
  });

  it("logs first run without listing all items as added", () => {
    const lines: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => lines.push(String(args[0]));
    try {
      logCatalogDrift("finclaw", diffRepoFeatureLists(null, {
        repo: "finclaw",
        generatedAt: "2026-01-01",
        lists: { modules: [{ id: "m:1", title: "one", sources: ["x"], confidence: "high" }] },
      }), false);
    } finally {
      console.log = orig;
    }
    expect(lines.some((l) => l.includes("first run"))).toBe(true);
  });
});

describe("catalog g3 lint", () => {
  const items = [{ id: "a", title: "api-gateway", sources: ["x"], confidence: "high" as const }];

  it("passes when bold titles match table", () => {
    const answer = "list\n- **api-gateway**：hello";
    expect(lintCatalogAnswerSubset(answer, items, { allowExtraItems: false })).toEqual([]);
  });

  it("flags table-external bold tokens", () => {
    const answer = "- **api-gateway**\n- **phantom-svc**";
    expect(lintCatalogAnswerSubset(answer, items, { allowExtraItems: false }).length).toBe(1);
  });
});

describe("catalog validate", () => {
  it("backfills missing middleware editions", () => {
    const raw: RepoFeatureLists = {
      repo: "chatkit-middleware",
      generatedAt: "2026-01-01",
      lists: {
        services: [{ id: "service:a", title: "a", sources: ["x"], confidence: "high" }],
      },
    };
    const norm = normalizeFeatureLists(raw);
    expect(norm.lists.services![0]!.editions).toEqual(["basic", "advance"]);
  });

  it("rejects invalid JSON shape", () => {
    expect(() => parseRepoFeatureLists({ repo: "nope" })).toThrow();
  });
});

describe("catalog rules yaml", () => {
  it("reads exclude_paths and stale days from yaml", () => {
    const rules = parseCatalogRulesYaml(`
middleware:
  edition_names: [basic, advance]
chatkit-web:
  exclude_paths: [/login, /foo]
shared:
  catalog_stale_days: 7
  allow_extra_items: false
`);
    expect(rules.web.excludePaths).toEqual(["/login", "/foo"]);
    expect(rules.shared.catalogStaleDays).toBe(7);
  });
});

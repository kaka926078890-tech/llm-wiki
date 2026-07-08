import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  evidenceBundleFromCard,
  isCardEvidenceFresh,
  tryKnowledgeFastPath,
} from "../src/core/knowledge/fast-path.js";
import { KnowledgeStore } from "../src/core/knowledge/store.js";
import { hashFileExcerpt } from "../src/core/knowledge/stale.js";
import { shouldSkipMcpSummary } from "../src/finalize-run.js";
import type { LlmWikiConfig } from "../src/config.js";

function miniCfg(root: string, repoRoot: string): LlmWikiConfig {
  return {
    projectRoot: root,
    repos: { middleware: repoRoot, web: repoRoot, finclaw: repoRoot },
  } as LlmWikiConfig;
}

describe("shouldSkipMcpSummary", () => {
  it("skips listing and architecture questions by default", () => {
    expect(shouldSkipMcpSummary("chatkit-middleware 功能清单有哪些")).toBe(true);
    expect(shouldSkipMcpSummary("整体架构是怎样的")).toBe(true);
    expect(shouldSkipMcpSummary("某个函数在哪一行")).toBe(false);
  });
});

describe("knowledge fast path", () => {
  it("returns verified card when question matches and hashes are fresh", () => {
    const root = mkdtempSync(path.join(tmpdir(), "llm-wiki-fp-"));
    const rel = "chatkit-middleware/README.md";
    const abs = path.join(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, "# ChatKit Middleware\n\nServices overview.\n", "utf-8");
    const hash = hashFileExcerpt(abs, 1, 2);
    const store = new KnowledgeStore(path.join(root, ".reasonix", "knowledge-cards.jsonl"));
    store.save({
      question: "chatkit-middleware的详细功能清单都有哪些",
      answer: "Gateways, Platform, Pulse…",
      evidence: [{ path: rel, startLine: 1, endLine: 2, hash: hash!, redacted: false }],
      confidence: "verified",
    });

    const cfg = miniCfg(root, root);
    const hit = tryKnowledgeFastPath(cfg, "chatkit-middleware的详细功能清单都有哪些");
    expect(hit?.answer).toContain("Gateways");
    expect(isCardEvidenceFresh(hit!, cfg)).toBe(true);
  });

  it("skips draft cards and stale evidence", () => {
    const root = mkdtempSync(path.join(tmpdir(), "llm-wiki-fp-"));
    const rel = "sample.ts";
    const abs = path.join(root, rel);
    writeFileSync(abs, "export const a = 1;\n", "utf-8");
    const hash = hashFileExcerpt(abs, 1, 1);
    const store = new KnowledgeStore(path.join(root, ".reasonix", "knowledge-cards.jsonl"));
    store.save({
      question: "chatkit-web 功能清单",
      answer: "draft answer",
      evidence: [{ path: rel, startLine: 1, endLine: 1, hash: hash!, redacted: false }],
      confidence: "draft",
    });

    const cfg = miniCfg(root, root);
    expect(tryKnowledgeFastPath(cfg, "chatkit-web 功能清单有哪些")).toBeNull();

    writeFileSync(abs, "export const changed = 2;\n", "utf-8");
    const verified = store.save({
      question: "chatkit-web 功能清单",
      answer: "verified answer",
      evidence: [{ path: rel, startLine: 1, endLine: 1, hash: hash!, redacted: false }],
      confidence: "verified",
    });
    expect(tryKnowledgeFastPath(cfg, "chatkit-web 功能清单有哪些")).not.toBeNull();
    store.markStale(verified.id, ["hash_changed:sample.ts"]);
    expect(tryKnowledgeFastPath(cfg, "chatkit-web 功能清单有哪些")).toBeNull();
  });

  it("maps card evidence into an evidence bundle", () => {
    const bundle = evidenceBundleFromCard(
      {
        id: "knowledge:test",
        question: "q",
        answer: "a",
        repoScope: [],
        evidence: [{ path: "foo.ts", startLine: 1, endLine: 3, hash: "abc", redacted: false }],
        confidence: "verified",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      "run-1",
      "q",
    );
    expect(bundle.items).toHaveLength(1);
    expect(bundle.items[0]?.tool).toBe("knowledge_card");
    expect(bundle.items[0]?.excerptHash).toBe("abc");
  });
});

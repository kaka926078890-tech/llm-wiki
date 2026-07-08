import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { findRelevantKnowledgeCards } from "../src/core/knowledge/retrieval.js";
import { KnowledgeStore } from "../src/core/knowledge/store.js";
import { checkCardStale, hashFileExcerpt } from "../src/core/knowledge/stale.js";

describe("knowledge store", () => {
  it("saves and lists cards", () => {
    const root = mkdtempSync(path.join(tmpdir(), "llm-wiki-knowledge-"));
    const store = new KnowledgeStore(path.join(root, ".reasonix", "knowledge-cards.jsonl"));
    const card = store.save({
      question: "Where is health?",
      answer: "Health route is in routes/health.ts",
      evidence: [{ path: "chatkit-middleware/src/routes/health.ts", redacted: false }],
      confidence: "verified",
    });
    expect(store.list()).toHaveLength(1);
    expect(store.get(card.id)?.question).toContain("health");
    expect(store.updateConfidence(card.id, "rejected")?.confidence).toBe("rejected");
  });
});

describe("knowledge retrieval", () => {
  it("matches similar questions and skips rejected cards", () => {
    const root = mkdtempSync(path.join(tmpdir(), "llm-wiki-knowledge-"));
    const store = new KnowledgeStore(path.join(root, ".reasonix", "knowledge-cards.jsonl"));
    store.save({
      question: "chatkit-web 有哪些配置项",
      answer: "env、proxy、i18n…",
      confidence: "verified",
    });
    const rejected = store.save({
      question: "chatkit-web config inventory",
      answer: "wrong",
      confidence: "verified",
    });
    store.updateConfidence(rejected.id, "rejected");

    const hits = findRelevantKnowledgeCards(store, "chatkit-web 配置项有哪些");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.answer).toContain("env");
  });
});

describe("knowledge stale detection", () => {
  it("marks cards stale when excerpt hash changes", () => {
    const root = mkdtempSync(path.join(tmpdir(), "llm-wiki-stale-"));
    const rel = "sample.ts";
    const abs = path.join(root, rel);
    writeFileSync(abs, "export const a = 1;\nexport const b = 2;\n", "utf-8");
    const hash = hashFileExcerpt(abs, 1, 2);
    expect(hash).toBeTruthy();

    const card = {
      id: "knowledge:test",
      question: "noop",
      answer: "noop",
      repoScope: [],
      evidence: [{ path: rel, startLine: 1, endLine: 2, hash: hash!, redacted: false }],
      confidence: "verified" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    writeFileSync(abs, "// changed content\nexport {}\n", "utf-8");
    const stale = checkCardStale(card, {
      middleware: root,
      web: root,
      finclaw: root,
    });
    expect(stale.stale).toBe(true);
    expect(stale.reasons.some((reason) => reason.startsWith("hash_changed"))).toBe(true);
  });
});

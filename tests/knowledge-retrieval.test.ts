import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEDUP_MERGE_SCORE,
  FAST_PATH_MIN_SCORE,
  findBestMatchingCard,
  findRelevantKnowledgeCards,
  scoreQuestionMatch,
} from "../src/core/knowledge/retrieval.js";
import { KnowledgeStore } from "../src/core/knowledge/store.js";

describe("knowledge retrieval scoring", () => {
  it("matches paraphrased Chinese listing questions", () => {
    const stored = "chatkit-middleware的详细功能清单都有哪些";
    const queries = [
      "chatkit-middleware 功能清单有哪些",
      "middleware 详细功能清单",
      "chatkit-middleware都有哪些功能",
    ];
    for (const query of queries) {
      const score = scoreQuestionMatch(query, stored);
      expect(score).toBeGreaterThanOrEqual(FAST_PATH_MIN_SCORE);
    }
  });

  it("does not over-match unrelated repos", () => {
    const score = scoreQuestionMatch(
      "chatkit-web 功能清单有哪些",
      "chatkit-middleware的详细功能清单都有哪些",
    );
    expect(score).toBeLessThan(FAST_PATH_MIN_SCORE);
  });
});

describe("knowledge save merge", () => {
  it("merges similar questions into one card with aliases", () => {
    const root = mkdtempSync(path.join(tmpdir(), "llm-wiki-merge-"));
    const store = new KnowledgeStore(path.join(root, ".reasonix", "knowledge-cards.jsonl"));
    const first = store.saveOrMerge({
      question: "chatkit-middleware的详细功能清单都有哪些",
      answer: "answer v1",
      confidence: "verified",
    });
    expect(first.merged).toBe(false);

    const second = store.saveOrMerge({
      question: "chatkit-middleware 功能清单有哪些",
      answer: "answer v2",
      confidence: "verified",
    });
    expect(second.merged).toBe(true);
    expect(store.list()).toHaveLength(1);
    expect(second.card.id).toBe(first.card.id);
    expect(second.card.answer).toBe("answer v2");
    expect(second.card.questionAliases?.length).toBeGreaterThan(0);

    const match = findBestMatchingCard(store, "chatkit-middleware 功能清单有哪些", DEDUP_MERGE_SCORE);
    expect(match?.card.id).toBe(first.card.id);
  });

  it("records fast-path hits", () => {
    const root = mkdtempSync(path.join(tmpdir(), "llm-wiki-hit-"));
    const store = new KnowledgeStore(path.join(root, ".reasonix", "knowledge-cards.jsonl"));
    const { card } = store.saveOrMerge({
      question: "chatkit-web 有哪些配置项",
      answer: "env proxy",
      confidence: "verified",
    });
    store.recordHit(card.id);
    expect(store.get(card.id)?.hitCount).toBe(1);
    expect(store.get(card.id)?.lastHitAt).toBeTruthy();
  });

  it("skips rejected cards during retrieval", () => {
    const root = mkdtempSync(path.join(tmpdir(), "llm-wiki-reject-"));
    const store = new KnowledgeStore(path.join(root, ".reasonix", "knowledge-cards.jsonl"));
    store.save({ question: "chatkit-web 有哪些配置项", answer: "good", confidence: "verified" });
    const bad = store.save({ question: "chatkit-web config", answer: "bad", confidence: "verified" });
    store.updateConfidence(bad.id, "rejected");
    const hits = findRelevantKnowledgeCards(store, "chatkit-web 配置项有哪些");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.answer).toBe("good");
  });
});

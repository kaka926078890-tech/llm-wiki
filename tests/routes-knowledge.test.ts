import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { getProjectRoot, loadConfig, type LlmWikiConfig } from "../src/config.js";
import { mockLoopBundle } from "./mock-loop-bundle.js";

function testConfig(projectRoot: string): LlmWikiConfig {
  return {
    ...loadConfig({
      DEEPSEEK_API_KEY: "test-key",
      REPO_CHATKIT_MIDDLEWARE: getProjectRoot(),
      REPO_CHATKIT_WEB: getProjectRoot(),
      REPO_FINCLAW: getProjectRoot(),
    }),
    projectRoot,
  };
}

describe("routes-knowledge", () => {
  it("P3-KNOW-01 saves and lists knowledge cards", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "llm-wiki-api-knowledge-"));
    const app = await createApp({
      config: testConfig(root),
      buildLoopBundle: async (_cfg, question) => mockLoopBundle([], question),
    });

    const save = await app.inject({
      method: "POST",
      url: "/api/knowledge",
      payload: {
        question: "What is llm-wiki?",
        answer: "A code Q&A prototype.",
        confidence: "verified",
      },
    });
    expect(save.statusCode).toBe(201);
    const saved = save.json() as { card: { question: string }; merged: boolean };
    expect(saved.merged).toBe(false);

    const list = await app.inject({ method: "GET", url: "/api/knowledge" });
    expect(list.statusCode).toBe(200);
    const body = list.json() as { cards: Array<{ question: string }> };
    expect(body.cards).toHaveLength(1);
    expect(body.cards[0]?.question).toContain("llm-wiki");
    await app.close();
  });

  it("P3-KNOW-02 marks a card rejected", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "llm-wiki-api-knowledge-"));
    const app = await createApp({
      config: testConfig(root),
      buildLoopBundle: async (_cfg, question) => mockLoopBundle([], question),
    });

    const save = await app.inject({
      method: "POST",
      url: "/api/knowledge",
      payload: {
        question: "bad answer",
        answer: "nope",
      },
    });
    const card = (save.json() as { card: { id: string } }).card;
    const patch = await app.inject({
      method: "PATCH",
      url: `/api/knowledge/${encodeURIComponent(card.id)}`,
      payload: { confidence: "rejected" },
    });
    expect(patch.statusCode).toBe(200);
    expect((patch.json() as { confidence: string }).confidence).toBe("rejected");
    await app.close();
  });

  it("P3-KNOW-03 filters cards by sourceRunId", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "llm-wiki-api-knowledge-"));
    const app = await createApp({
      config: testConfig(root),
      buildLoopBundle: async (_cfg, question) => mockLoopBundle([], question),
    });

    await app.inject({
      method: "POST",
      url: "/api/knowledge",
      payload: {
        question: "run-a",
        answer: "answer a",
        sourceRunId: "run-a-id",
      },
    });
    await app.inject({
      method: "POST",
      url: "/api/knowledge",
      payload: {
        question: "run-b",
        answer: "answer b",
        sourceRunId: "run-b-id",
      },
    });

    const filtered = await app.inject({
      method: "GET",
      url: "/api/knowledge?sourceRunId=run-a-id",
    });
    const body = filtered.json() as { cards: Array<{ question: string }> };
    expect(body.cards).toHaveLength(1);
    expect(body.cards[0]?.question).toBe("run-a");
    await app.close();
  });
});

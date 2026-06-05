import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { buildSystemPrompt } from "../src/prompt.js";

describe("prompt", () => {
  const originalEnv = { ...process.env };

  it("P1-PRM-01 prompt mentions three workspace repos", () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    const prompt = buildSystemPrompt(loadConfig());
    expect(prompt).toMatch(/chatkit-middleware/i);
    expect(prompt).toMatch(/chatkit-web/i);
    expect(prompt).toMatch(/finclaw/i);
    process.env = originalEnv;
  });

  it("P1-PRM-02 prompt includes Reasonix cite-or-shut-up language", () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    const prompt = buildSystemPrompt(loadConfig());
    expect(prompt).toMatch(/Cite or shut up/i);
    expect(prompt).toMatch(/search_content/i);
    process.env = originalEnv;
  });

  it("P1-PRM-03 prompt targets non-technical frontline users and forbids code output", () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    const prompt = buildSystemPrompt(loadConfig());
    expect(prompt).toMatch(/一线非技术/);
    expect(prompt).toMatch(/禁止.*代码/);
    expect(prompt).toMatch(/不要返回.*代码块/);
    expect(prompt).toMatch(/操作步骤/);
    process.env = originalEnv;
  });
});

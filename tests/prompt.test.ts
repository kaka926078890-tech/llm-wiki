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

  it("P1-PRM-03 prompt excludes product-manual style constraints", () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    const prompt = buildSystemPrompt(loadConfig());
    expect(prompt).not.toMatch(/产品手册/);
    expect(prompt).not.toMatch(/禁止代码/);
    expect(prompt).not.toMatch(/禁止.*代码/i);
    process.env = originalEnv;
  });
});

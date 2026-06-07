import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { buildSystemPrompt } from "../src/prompt.js";
import { codeSystemBase } from "../src/prompt-code.js";

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
    expect(prompt).toMatch(/directory_tree/i);
    expect(prompt).toMatch(/glob/i);
    expect(prompt).toMatch(/get_symbols/i);
    expect(prompt).toMatch(/find_in_code/i);
    expect(prompt).toMatch(/semantic_search/i);
    expect(prompt).toMatch(/codegraph_search/i);
    process.env = originalEnv;
  });

  it("mentions codegraph and optional semantic_search strategy", () => {
    const prompt = codeSystemBase("deepseek-chat");
    expect(prompt).toContain("`codegraph_search`");
    expect(prompt).toContain("callers/callees");
    expect(prompt).toContain("If `semantic_search` is available");
    expect(prompt).toContain("descriptive questions");
    expect(prompt).toContain("For exact routes");
  });

  it("P1-PRM-03 prompt does not force frontline non-technical output boundaries", () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    const prompt = buildSystemPrompt(loadConfig());
    expect(prompt).not.toMatch(/一线非技术/);
    expect(prompt).not.toMatch(/禁止.*代码/);
    expect(prompt).not.toMatch(/不要返回.*代码块/);
    process.env = originalEnv;
  });

  it("prompt requires definitive final answers without follow-up invitations", () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    const prompt = buildSystemPrompt(loadConfig());
    expect(prompt).toMatch(/Final answer — definitive, no hand-offs/i);
    expect(prompt).toMatch(/Do NOT close with invitations to continue/i);
    expect(prompt).toMatch(/Never suggest the caller should invoke you again/i);
    process.env = originalEnv;
  });
});

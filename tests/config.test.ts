import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getProjectRoot, loadConfig } from "../src/config.js";

describe("config", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.DEEPSEEK_API_KEY = "test-key";
    delete process.env.REPO_CHATKIT_MIDDLEWARE;
    delete process.env.REPO_CHATKIT_WEB;
    delete process.env.REPO_FINCLAW;
    delete process.env.LLM_WIKI_PORT;
    delete process.env.LLM_WIKI_HOST;
    delete process.env.LLM_WIKI_AGENT_ANSWER_PROFILE;
    delete process.env.LLM_WIKI_MCP_ANSWER_PROFILE;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("P0-CFG-01 loadConfig returns full config with absolute repo paths", () => {
    const cfg = loadConfig();

    expect(cfg.port).toBe(3001);
    expect(cfg.host).toBe("127.0.0.1");
    expect(path.isAbsolute(cfg.repos.middleware)).toBe(true);
    expect(path.isAbsolute(cfg.repos.web)).toBe(true);
    expect(path.isAbsolute(cfg.repos.finclaw)).toBe(true);
    expect(cfg.deepseekApiKey).toBe("test-key");
    expect(cfg.answerProfiles.agent).toBe("debug");
    expect(cfg.answerProfiles.mcp).toBe("public");
  });

  it("P0-CFG-02 default relative paths resolve under llm-wiki/code", () => {
    const projectRoot = getProjectRoot();
    const cfg = loadConfig();

    expect(cfg.repos.middleware).toBe(
      path.resolve(projectRoot, "code/chatkit-middleware"),
    );
    expect(cfg.repos.web).toBe(
      path.resolve(projectRoot, "code/chatkit-web"),
    );
    expect(cfg.repos.finclaw).toBe(path.resolve(projectRoot, "code/finclaw"));
  });

  it("P0-CFG-03 missing DEEPSEEK_API_KEY throws", () => {
    delete process.env.DEEPSEEK_API_KEY;

    expect(() => loadConfig()).toThrow(/DEEPSEEK_API_KEY/i);
  });

  it("loads answer profiles from environment", () => {
    process.env.LLM_WIKI_AGENT_ANSWER_PROFILE = "internal";
    process.env.LLM_WIKI_MCP_ANSWER_PROFILE = "internal";

    const cfg = loadConfig();

    expect(cfg.answerProfiles.agent).toBe("internal");
    expect(cfg.answerProfiles.mcp).toBe("internal");
  });

  it("rejects invalid answer profiles", () => {
    process.env.LLM_WIKI_MCP_ANSWER_PROFILE = "raw";

    expect(() => loadConfig()).toThrow(/LLM_WIKI_MCP_ANSWER_PROFILE/i);
  });

  it("loads CBM config from environment", () => {
    process.env.LLM_WIKI_CBM_ENABLED = "true";
    process.env.LLM_WIKI_CBM_BINARY = "/usr/local/bin/codebase-memory-mcp";
    process.env.LLM_WIKI_CBM_TOP_K = "12";

    const cfg = loadConfig();

    expect(cfg.cbm).toMatchObject({
      enabled: true,
      binary: "/usr/local/bin/codebase-memory-mcp",
      topK: 12,
    });
  });

  it("defaults CBM to auto with codebase-memory-mcp binary", () => {
    const cfg = loadConfig();
    expect(cfg.cbm.enabled).toBe("auto");
    expect(cfg.cbm.binary).toBe("codebase-memory-mcp");
    expect(cfg.cbm.topK).toBe(8);
  });
});

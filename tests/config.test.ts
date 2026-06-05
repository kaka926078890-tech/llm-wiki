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
  });

  it("P0-CFG-02 default relative paths resolve under project root", () => {
    const projectRoot = getProjectRoot();
    const cfg = loadConfig();

    expect(cfg.repos.middleware).toBe(
      path.resolve(projectRoot, "../chatkit-middleware"),
    );
    expect(cfg.repos.web).toBe(
      path.resolve(projectRoot, "../chatkit-middleware/tools/chatkit-web"),
    );
    expect(cfg.repos.finclaw).toBe(path.resolve(projectRoot, "../finclaw"));
  });

  it("P0-CFG-03 missing DEEPSEEK_API_KEY throws", () => {
    delete process.env.DEEPSEEK_API_KEY;

    expect(() => loadConfig()).toThrow(/DEEPSEEK_API_KEY/i);
  });
});

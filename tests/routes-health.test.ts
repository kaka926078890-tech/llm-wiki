import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { getProjectRoot, loadConfig, type LlmWikiConfig } from "../src/config.js";

function testConfig(): LlmWikiConfig {
  return loadConfig({
    DEEPSEEK_API_KEY: "test-key",
    REPO_CHATKIT_MIDDLEWARE: getProjectRoot(),
    REPO_CHATKIT_WEB: getProjectRoot(),
    REPO_FINCLAW: getProjectRoot(),
    LLM_WIKI_TEI_BASE_URL: "",
  });
}

describe("routes-health", () => {
  it("P2-HTH-01 GET /health returns ok and three repo paths", async () => {
    const cfg = testConfig();
    const app = await createApp({ config: cfg });
    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      status: string;
      repos: { middleware: string; web: string; finclaw: string };
    };
    expect(body.status).toBe("ok");
    expect(body.repos.middleware).toBe(cfg.repos.middleware);
    expect(body.repos.web).toBe(cfg.repos.web);
    expect(body.repos.finclaw).toBe(cfg.repos.finclaw);
    await app.close();
  });
});

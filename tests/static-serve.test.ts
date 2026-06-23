import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { getProjectRoot, loadConfig, type LlmWikiConfig } from "../src/config.js";

function testConfig(): LlmWikiConfig {
  return loadConfig({
    DEEPSEEK_API_KEY: "test-key",
    REPO_CHATKIT_MIDDLEWARE: getProjectRoot(),
    REPO_CHATKIT_WEB: getProjectRoot(),
    REPO_FINCLAW: getProjectRoot(),
  });
}

const distIndex = path.join(getProjectRoot(), "frontend/dist/index.html");

describe.skipIf(!existsSync(distIndex))("static-serve", () => {
  it("P3-STATIC-01 GET / returns index.html", async () => {
    const cfg = testConfig();
    const app = await createApp({ config: cfg });
    const res = await app.inject({ method: "GET", url: "/" });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.payload).toContain("<!doctype html");
    await app.close();
  });
});

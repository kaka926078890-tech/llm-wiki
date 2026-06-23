import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { getProjectRoot, loadConfig } from "../src/config.js";

describe("routes-runs", () => {
  it("GET /api/runs returns a runs array", async () => {
    const app = await createApp({
      config: loadConfig({
        DEEPSEEK_API_KEY: "test-key",
        REPO_CHATKIT_MIDDLEWARE: getProjectRoot(),
        REPO_CHATKIT_WEB: getProjectRoot(),
        REPO_FINCLAW: getProjectRoot(),
      }),
    });
    const res = await app.inject({ method: "GET", url: "/api/runs" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("runs");
    await app.close();
  });
});

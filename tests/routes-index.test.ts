import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";

import { loadConfig } from "../src/config.js";
import { registerIndexRoutes } from "../src/routes/index.js";

const startCbmSyncMock = vi.hoisted(() => vi.fn());
const getCbmSyncJobMock = vi.hoisted(() => vi.fn());

vi.mock("../src/cbm/sync-job.js", () => ({
  getCbmSyncJob: () => getCbmSyncJobMock(),
  startCbmSync: (...args: unknown[]) => startCbmSyncMock(...args),
}));

describe("routes-index", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv, DEEPSEEK_API_KEY: "test-key" };
    getCbmSyncJobMock.mockReturnValue({ state: "idle", log: [] });
    startCbmSyncMock.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("GET /api/index/status returns cbm envelope", async () => {
    const cfg = loadConfig();
    const app = Fastify({ logger: false });
    await registerIndexRoutes(app, cfg);

    const res = await app.inject({ method: "GET", url: "/api/index/status" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { cbm: { projects: unknown[] }; syncJob: unknown };
    expect(body.cbm.projects).toHaveLength(3);
    expect(body.syncJob).toEqual({ state: "idle", log: [] });

    await app.close();
  });

  it("POST /api/index/sync starts background job", async () => {
    startCbmSyncMock.mockReturnValue({ started: true });
    getCbmSyncJobMock.mockReturnValue({ state: "running", log: ["[cbm] sync"] });

    const cfg = loadConfig();
    const app = Fastify({ logger: false });
    await registerIndexRoutes(app, cfg);

    const res = await app.inject({ method: "POST", url: "/api/index/sync" });
    expect(res.statusCode).toBe(200);
    expect(startCbmSyncMock).toHaveBeenCalledOnce();
    expect(res.json()).toEqual({ job: { state: "running", log: ["[cbm] sync"] } });

    await app.close();
  });

  it("POST /api/index/sync returns 409 when already running", async () => {
    startCbmSyncMock.mockReturnValue({ started: false, reason: "sync_already_running" });
    getCbmSyncJobMock.mockReturnValue({ state: "running", log: [] });

    const cfg = loadConfig();
    const app = Fastify({ logger: false });
    await registerIndexRoutes(app, cfg);

    const res = await app.inject({ method: "POST", url: "/api/index/sync" });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: "sync_already_running" });

    await app.close();
  });
});

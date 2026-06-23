import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getProjectRoot } from "../src/config.js";
import {
  getCbmSyncJob,
  resetCbmSyncJobForTests,
  startCbmSync,
} from "../src/cbm/sync-job.js";

describe("cbm/sync-job", () => {
  beforeEach(() => {
    resetCbmSyncJobForTests();
  });

  afterEach(() => {
    resetCbmSyncJobForTests();
  });

  it("runs a script to completion", async () => {
    const noop = path.join(getProjectRoot(), "tests", "fixtures", "noop-script.mjs");
    const started = startCbmSync(getProjectRoot(), { scriptPath: noop });
    expect(started.started).toBe(true);
    expect(getCbmSyncJob().state).toBe("running");

    await new Promise<void>((resolve) => {
      const tick = () => {
        const job = getCbmSyncJob();
        if (job.state === "running") {
          setTimeout(tick, 20);
          return;
        }
        expect(job.state).toBe("succeeded");
        resolve();
      };
      tick();
    });
  });

  it("rejects concurrent sync", () => {
    const noop = path.join(getProjectRoot(), "tests", "fixtures", "noop-script.mjs");
    expect(startCbmSync(getProjectRoot(), { scriptPath: noop }).started).toBe(true);
    expect(startCbmSync(getProjectRoot(), { scriptPath: noop })).toEqual({
      started: false,
      reason: "sync_already_running",
    });
  });
});

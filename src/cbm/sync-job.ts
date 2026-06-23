import { spawn } from "node:child_process";
import path from "node:path";

export type CbmSyncJobState = "idle" | "running" | "succeeded" | "failed";

export interface CbmSyncJob {
  state: CbmSyncJobState;
  startedAt?: string;
  endedAt?: string;
  exitCode?: number;
  log: string[];
}

const MAX_LOG_LINES = 200;

let job: CbmSyncJob = { state: "idle", log: [] };

function appendLog(line: string): void {
  for (const part of line.split("\n")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    job.log.push(trimmed);
    if (job.log.length > MAX_LOG_LINES) job.log.shift();
  }
}

export function getCbmSyncJob(): CbmSyncJob {
  return {
    ...job,
    log: [...job.log],
  };
}

/** ponytail: single global lock; one CBM sync at a time per server process. */
export function startCbmSync(
  projectRoot: string,
  opts?: { scriptPath?: string },
): { started: true } | { started: false; reason: "sync_already_running" } {
  if (job.state === "running") {
    return { started: false, reason: "sync_already_running" };
  }

  const scriptPath = opts?.scriptPath ?? path.join(projectRoot, "scripts", "cbm-sync.mjs");
  job = {
    state: "running",
    startedAt: new Date().toISOString(),
    log: [],
  };

  const child = spawn(process.execPath, [scriptPath], {
    cwd: projectRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.on("data", (chunk: Buffer) => appendLog(chunk.toString("utf-8")));
  child.stderr?.on("data", (chunk: Buffer) => appendLog(chunk.toString("utf-8")));
  child.on("close", (code) => {
    job.state = code === 0 ? "succeeded" : "failed";
    job.endedAt = new Date().toISOString();
    job.exitCode = code ?? 1;
  });
  child.on("error", (err) => {
    appendLog(err.message);
    job.state = "failed";
    job.endedAt = new Date().toISOString();
    job.exitCode = 1;
  });

  return { started: true };
}

/** Test-only reset. */
export function resetCbmSyncJobForTests(): void {
  job = { state: "idle", log: [] };
}

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PROBE_TIMEOUT_MS = 8_000;
const QUERY_TIMEOUT_MS = 45_000;
const MAX_OUTPUT_BYTES = 512 * 1024;

export async function probeCbmBinary(binary: string): Promise<boolean> {
  if (!binary.trim()) return false;
  try {
    await execFileAsync(binary, ["cli", "list_projects", "{}"], {
      timeout: PROBE_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
    });
    return true;
  } catch {
    return false;
  }
}

export async function runCbmCli(
  binary: string,
  toolName: string,
  payload: Record<string, unknown>,
  cwd?: string,
): Promise<{ ok: true; stdout: string } | { ok: false; error: string }> {
  try {
    const { stdout = "", stderr = "" } = await execFileAsync(
      binary,
      ["cli", toolName, JSON.stringify(payload)],
      {
        cwd,
        timeout: QUERY_TIMEOUT_MS,
        maxBuffer: MAX_OUTPUT_BYTES,
      },
    );
    return { ok: true, stdout };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stderr = typeof (err as { stderr?: unknown }).stderr === "string"
      ? (err as { stderr: string }).stderr.trim()
      : "";
    return { ok: false, error: [stderr, message].filter(Boolean).join("\n") };
  }
}

export function formatCbmJson(stdout: string): string {
  const trimmed = stdout.trim();
  if (!trimmed) return "(codebase-memory-mcp returned no output)";
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return trimmed;
  }
}

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function readGitHead(repoPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", repoPath, "rev-parse", "HEAD"], {
      timeout: 5_000,
      maxBuffer: 4096,
    });
    const head = stdout.trim();
    return head || null;
  } catch {
    return null;
  }
}

export function shortGitHead(head: string): string {
  return head.slice(0, 7);
}

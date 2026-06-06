import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const codeRoot = path.join(projectRoot, "code");

export const CODEGRAPH_REPOS = [
  "chatkit-middleware",
  "chatkit-web",
  "finclaw",
];

export function repoDirs() {
  return CODEGRAPH_REPOS.map((name) => ({
    name,
    dir: path.join(codeRoot, name),
  }));
}

export function assertCodeReposPresent() {
  const missing = repoDirs().filter((entry) => !existsSync(entry.dir));
  if (missing.length === CODEGRAPH_REPOS.length) {
    console.error(
      "No repositories found under code/. Run `npm run sync:code` first, then retry.",
    );
    process.exit(1);
  }
  for (const entry of missing) {
    console.warn(`[codegraph] skipping missing repo: ${entry.name} (${entry.dir})`);
  }
  return repoDirs().filter((entry) => existsSync(entry.dir));
}

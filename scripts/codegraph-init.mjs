import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { assertCodeReposPresent } from "./codegraph-repos.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function runCodegraph(args) {
  const result = spawnSync("codegraph", args, {
    cwd: projectRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const repos = assertCodeReposPresent();
console.log(`[codegraph] initializing ${repos.length} repo indexes under code/`);

for (const entry of repos) {
  console.log(`\n==> ${entry.name}`);
  runCodegraph(["init", entry.dir]);
}

console.log("\n[codegraph] all repo indexes ready.");

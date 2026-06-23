import { loadReposOrExit, runCbm, writeCbmIndexState, binary } from "./cbm-common.mjs";

const repos = loadReposOrExit();
console.log(`[cbm] incremental re-index for ${repos.length} repos`);

for (const entry of repos) {
  console.log(`\n==> ${entry.name}`);
  runCbm("index_repository", { repo_path: entry.dir });
}

writeCbmIndexState(repos);
console.log("\n[cbm] sync complete.");

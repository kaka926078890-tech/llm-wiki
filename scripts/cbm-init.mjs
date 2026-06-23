import { loadReposOrExit, runCbm, writeCbmIndexState, binary } from "./cbm-common.mjs";

const repos = loadReposOrExit();
console.log(`[cbm] indexing ${repos.length} repos with ${binary}`);

for (const entry of repos) {
  console.log(`\n==> ${entry.name}`);
  runCbm("index_repository", { repo_path: entry.dir });
}

writeCbmIndexState(repos);
console.log("\n[cbm] all repo indexes ready.");

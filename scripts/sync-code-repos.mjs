import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const codeRoot = path.join(projectRoot, "code");

const repos = [
  {
    name: "chatkit-web",
    url: "git@github.com:Geeksfino/chatkit-web.git",
    dir: path.join(codeRoot, "chatkit-web"),
  },
  {
    name: "chatkit-middleware",
    url: "git@github.com:Geeksfino/chatkit-middleware.git",
    dir: path.join(codeRoot, "chatkit-middleware"),
  },
  {
    name: "finclaw",
    url: "git@github.com:Geeksfino/finclaw.git",
    dir: path.join(codeRoot, "finclaw"),
  },
];

function runGit(args, cwd = projectRoot) {
  const result = spawnSync("git", args, {
    cwd,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

mkdirSync(codeRoot, { recursive: true });

for (const repo of repos) {
  if (existsSync(path.join(repo.dir, ".git"))) {
    console.log(`\n==> Updating ${repo.name}`);
    runGit(["-C", repo.dir, "pull", "--ff-only"]);
    continue;
  }

  if (existsSync(repo.dir)) {
    console.error(
      `\n${repo.dir} exists but is not a git repository. Move it away or initialize it before retrying.`,
    );
    process.exit(1);
  }

  console.log(`\n==> Cloning ${repo.name}`);
  runGit(["clone", repo.url, repo.dir]);
}

console.log("\nAll llm-wiki code repositories are ready under ./code.");

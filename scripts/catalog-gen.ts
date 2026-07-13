#!/usr/bin/env tsx
import { getProjectRoot, loadConfig, loadEnvFile } from "../src/config.js";
import { generateAllFeatureLists } from "../src/catalog/generate.js";

loadEnvFile();

const projectRoot = getProjectRoot();
let repos;
try {
  repos = loadConfig().repos;
} catch {
  repos = loadConfig({ ...process.env, DEEPSEEK_API_KEY: "catalog-gen" }).repos;
}

const results = generateAllFeatureLists(projectRoot, repos);
for (const r of results) {
  const sections = Object.entries(r.lists)
    .filter(([, v]) => v?.length)
    .map(([k, v]) => `${k}=${v!.length}`)
    .join(", ");
  console.log(`[catalog:gen] ${r.repo}: ${sections}`);
}

import { loadConfig, loadEnvFile } from "../src/config.js";
import { refreshKnowledgeStale } from "../src/core/knowledge/stale.js";
import { loadKnowledgeStore } from "../src/core/knowledge/store.js";

loadEnvFile();

const cfg = loadConfig({
  ...process.env,
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY?.trim() || "knowledge-refresh-stale",
});

const store = loadKnowledgeStore(cfg.projectRoot);
const updated = refreshKnowledgeStale(store, cfg.repos);
console.log(`[knowledge:refresh-stale] updatedCount=${updated.length}`);

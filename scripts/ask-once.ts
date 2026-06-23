#!/usr/bin/env tsx
/**
 * One-shot legacy llm-wiki question for benchmarks.
 * Usage: tsx scripts/ask-once.ts "your question"
 */
import { loadConfig, loadEnvFile } from "../src/config.js";
import { buildLoop } from "../src/loop-runner.js";

loadEnvFile();

const question = process.argv.slice(2).join(" ").trim();
if (!question) {
  console.error("Usage: tsx scripts/ask-once.ts <question>");
  process.exit(1);
}

const toolCalls: Array<{ name: string; args: unknown }> = [];
const started = performance.now();

async function main(): Promise<void> {
  const cfg = loadConfig();
  if (!cfg.deepseekApiKey) {
    console.error(JSON.stringify({ error: "DEEPSEEK_API_KEY not configured" }));
    process.exit(2);
  }

  const loop = await buildLoop(cfg);
  loop.tools.setAuditListener(({ name, args }) => {
    toolCalls.push({ name, args });
  });

  const answer = await loop.run(question);
  const latencyMs = Math.round(performance.now() - started);
  const filesRead = loop.readTracker.size;

  const hasPathEvidence = /(?:services|libs|tools|config|contracts)\/[^\s`]+|\.env\.example|package\.json/i.test(answer);

  console.log(
    JSON.stringify(
      {
        mode: "legacy-agent",
        question,
        answer,
        toolCalls: toolCalls.length,
        toolNames: [...new Set(toolCalls.map((t) => t.name))],
        filesRead,
        hasPathEvidence,
        latencyMs,
      },
      null,
      0,
    ),
  );
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  process.exit(1);
});

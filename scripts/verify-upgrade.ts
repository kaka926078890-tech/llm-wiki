#!/usr/bin/env tsx
/**
 * Golden-question MCP public-answer verification for llm-wiki upgrades.
 *
 * Usage:
 *   npm run verify:upgrade
 *   npm run verify:upgrade -- --quick
 *   npm run verify:upgrade -- --runs 5 --id web-config-inventory
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { lintPublicAnswer } from "../src/benchmark/public-answer-lint.js";
import {
  scoreChecklistHits,
  scorePolarity,
  scoreQuestionStability,
  type GoldenQuestion,
  type QuestionScore,
  type RunScore,
} from "../src/benchmark/scoring.js";
import { loadConfig, loadEnvFile, getProjectRoot } from "../src/config.js";
import { DeepSeekClient } from "../src/core/client.js";
import { LlmAnswerSummaryAgent } from "../src/answer-summary-agent.js";
import { finalizeRunAsk } from "../src/finalize-run.js";
import { buildLoopBundle } from "../src/loop-runner.js";

interface GoldenFile {
  version: number;
  defaults: {
    runs: number;
    minCoreIntersectionRatio: number;
    maxCoreMissPerRun: number;
  };
  questions: GoldenQuestion[];
}

interface VerifyReport {
  generatedAt: string;
  runsPerQuestion: number;
  gitHeads: Record<string, string | null>;
  summary: {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
  };
  questions: QuestionScore[];
}

function parseArgs(argv: string[]): {
  runs: number | null;
  quick: boolean;
  ids: Set<string> | null;
  outDir: string;
} {
  let runs: number | null = null;
  let quick = false;
  const ids = new Set<string>();
  let outDir = path.join(getProjectRoot(), "benchmarks", "reports");

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--quick") quick = true;
    else if (arg === "--runs" && argv[i + 1]) runs = Number(argv[++i]);
    else if ((arg === "--id" || arg === "--ids") && argv[i + 1]) {
      for (const part of argv[++i]!.split(",")) {
        const trimmed = part.trim();
        if (trimmed) ids.add(trimmed);
      }
    } else if (arg === "--out" && argv[i + 1]) outDir = path.resolve(argv[++i]!);
  }

  return { runs, quick, ids: ids.size > 0 ? ids : null, outDir };
}

function loadGolden(): GoldenFile {
  const file = path.join(getProjectRoot(), "benchmarks", "golden-questions.json");
  return JSON.parse(readFileSync(file, "utf-8")) as GoldenFile;
}

function tryGitHead(repoPath: string): string | null {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: repoPath, encoding: "utf-8" }).trim();
  } catch {
    return null;
  }
}

async function askOnce(
  question: GoldenQuestion,
  cfg: ReturnType<typeof loadConfig>,
): Promise<{ answer: string; latencyMs: number; toolCalls: number }> {
  const started = performance.now();
  const toolCalls: unknown[] = [];
  const bundle = await buildLoopBundle(cfg, question.question);
  const summaryAgent = new LlmAnswerSummaryAgent({
    client: new DeepSeekClient({
      apiKey: cfg.deepseekApiKey,
      baseUrl: cfg.deepseekBaseUrl,
    }),
    model: cfg.deepseekModel,
  });
  bundle.loop.tools.setAuditListener(({ name, args }) => {
    toolCalls.push({ name, args });
  });
  const answer = await finalizeRunAsk({
    loop: bundle.loop,
    evidence: bundle.evidence,
    telemetry: bundle.telemetry,
    cfg,
    question: question.question,
    repoScope: question.repo_scope,
    surface: "mcp",
    summaryAgent,
  });
  return {
    answer: answer.answer,
    latencyMs: Math.round(performance.now() - started),
    toolCalls: toolCalls.length,
  };
}

function renderMarkdown(report: VerifyReport): string {
  const lines = [
    `# llm-wiki 升级验证报告`,
    ``,
    `- 时间：${report.generatedAt}`,
    `- 每题运行次数：${report.runsPerQuestion}`,
    `- 通过：${report.summary.passed}/${report.summary.total}（${(report.summary.passRate * 100).toFixed(0)}%）`,
    ``,
    `## Repo HEAD`,
    ...Object.entries(report.gitHeads).map(([k, v]) => `- ${k}: ${v ?? "unknown"}`),
    ``,
  ];

  for (const q of report.questions) {
    lines.push(`## ${q.passed ? "✅" : "❌"} ${q.id}`);
    lines.push(`**问题**：${q.question}`);
    lines.push(
      `- 核心点交集：${q.intersectionCoreHits.length}/${q.unionCoreHits.length}（ratio ${q.intersectionRatio.toFixed(2)}）`,
    );
    lines.push(`- 单次最大遗漏：${q.maxCoreMissPerRun} 项`);
    lines.push(`- Public lint：${q.lintClean ? "通过" : "失败"}`);
    if (!q.passed) lines.push(`- **失败原因**：${q.failReasons.join("; ")}`);
    lines.push(``);
    for (const run of q.runs) {
      lines.push(
        `### Run ${run.runIndex + 1}（${run.latencyMs}ms, ${run.toolCalls} tools）`,
      );
      if (run.lintViolations.length > 0) {
        lines.push(`Lint: ${run.lintViolations.map((v) => v.rule).join(", ")}`);
      }
      if (run.coreMisses.length > 0) {
        lines.push(`遗漏核心点：${run.coreMisses.join(", ")}`);
      }
      lines.push(run.answer.slice(0, 500) + (run.answer.length > 500 ? "…" : ""));
      lines.push(``);
    }
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  loadEnvFile();
  const cfg = loadConfig();
  if (!cfg.deepseekApiKey) {
    console.error("DEEPSEEK_API_KEY is required for verify:upgrade");
    process.exit(2);
  }

  const args = parseArgs(process.argv.slice(2));
  const golden = loadGolden();
  const runsPerQuestion = args.runs ?? golden.defaults.runs;
  const thresholds = {
    minCoreIntersectionRatio: golden.defaults.minCoreIntersectionRatio,
    maxCoreMissPerRun: golden.defaults.maxCoreMissPerRun,
  };

  let questions = golden.questions;
  if (args.quick) questions = questions.filter((q) => q.quick);
  if (args.ids) questions = questions.filter((q) => args.ids!.has(q.id));
  if (questions.length === 0) {
    console.error("No questions selected.");
    process.exit(1);
  }

  console.error(
    `[verify:upgrade] ${questions.length} questions × ${runsPerQuestion} runs`,
  );

  const questionScores: QuestionScore[] = [];

  for (const question of questions) {
    console.error(`[verify:upgrade] ${question.id} …`);
    const runs: RunScore[] = [];

    for (let runIndex = 0; runIndex < runsPerQuestion; runIndex++) {
      const { answer, latencyMs, toolCalls } = await askOnce(question, cfg);
      const { hits, misses } = scoreChecklistHits(answer, question.core);
      runs.push({
        runIndex,
        answer,
        lintViolations: lintPublicAnswer(answer),
        coreHits: hits,
        coreMisses: misses,
        polarityIssues: scorePolarity(answer, question.polarity),
        latencyMs,
        toolCalls,
      });
    }

    questionScores.push(scoreQuestionStability(question, runs, thresholds));
  }

  const passed = questionScores.filter((q) => q.passed).length;
  const report: VerifyReport = {
    generatedAt: new Date().toISOString(),
    runsPerQuestion,
    gitHeads: {
      "chatkit-web": tryGitHead(cfg.repos.web),
      "chatkit-middleware": tryGitHead(cfg.repos.middleware),
      finclaw: tryGitHead(cfg.repos.finclaw),
    },
    summary: {
      total: questionScores.length,
      passed,
      failed: questionScores.length - passed,
      passRate: questionScores.length === 0 ? 0 : passed / questionScores.length,
    },
    questions: questionScores,
  };

  mkdirSync(args.outDir, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, "-");
  const jsonPath = path.join(args.outDir, `verify-${stamp}.json`);
  const mdPath = path.join(args.outDir, `verify-${stamp}.md`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(mdPath, renderMarkdown(report));

  console.log(JSON.stringify({ ok: report.summary.failed === 0, reportPath: jsonPath, summary: report.summary }, null, 2));
  process.exit(report.summary.failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

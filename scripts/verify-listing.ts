#!/usr/bin/env tsx
/**
 * Listing-question verification (E0 baseline / E1 candidate).
 *
 *   npm run verify:listing -- --baseline --runs 3
 *   LLM_WIKI_CATALOG_LISTING=true npm run verify:listing -- --candidate --runs 3
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

import { lintPublicAnswer } from "../src/benchmark/public-answer-lint.js";
import {
  detectGuessCountViolation,
  pairwiseJaccardStability,
  scoreSetOverlap,
  tokenSet,
  tokensFromAnswer,
  type SetMetrics,
} from "../src/benchmark/listing-scoring.js";
import { buildCatalogListingAnswer, isCatalogListingEnabled } from "../src/catalog/listing-path.js";
import { loadConfig, loadEnvFile, getProjectRoot, type LlmWikiConfig } from "../src/config.js";
import { DeepSeekClient } from "../src/core/client.js";
import { LlmAnswerSummaryAgent } from "../src/answer-summary-agent.js";
import { finalizeRunAsk } from "../src/finalize-run.js";
import { buildLoopBundle } from "../src/loop-runner.js";
import type { CatalogListKind, CatalogRepo, MiddlewareEdition } from "../src/catalog/types.js";
import { loadRepoFeatureLists } from "../src/catalog/store.js";

interface ListingQuestion {
  id: string;
  repo: CatalogRepo;
  listKind: CatalogListKind;
  question: string;
  editionFilter?: MiddlewareEdition;
}

interface ListingFile {
  version: number;
  defaults: { runs: number };
  questions: ListingQuestion[];
}

interface QuestionRun {
  runIndex: number;
  answer: string;
  tokens: string[];
  metrics: SetMetrics;
  guessCountViolation: boolean;
  lintViolations: ReturnType<typeof lintPublicAnswer>;
}

interface QuestionReport {
  id: string;
  question: string;
  goldSize: number;
  runs: QuestionRun[];
  meanF1: number;
  stabilityJaccard: number;
  guessViolations: number;
  lintFailed: boolean;
}

interface ListingReport {
  generatedAt: string;
  mode: "baseline" | "candidate";
  catalogListingEnabled: boolean;
  runsPerQuestion: number;
  liveAgent: boolean;
  summary: {
    meanF1: number;
    meanStabilityJaccard: number;
    guessViolations: number;
    lintFailures: number;
  };
  questions: QuestionReport[];
}

function parseArgs(argv: string[]) {
  let runs: number | null = null;
  let mode: "baseline" | "candidate" = "baseline";
  let outDir = path.join(getProjectRoot(), "benchmarks", "reports");

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--baseline") mode = "baseline";
    else if (arg === "--candidate") mode = "candidate";
    else if (arg === "--runs" && argv[i + 1]) runs = Number(argv[++i]);
    else if (arg === "--out" && argv[i + 1]) outDir = path.resolve(argv[++i]!);
  }
  return { runs, mode, outDir };
}

function loadListingQuestions(): ListingFile {
  const file = path.join(getProjectRoot(), "benchmarks", "listing-questions.json");
  return JSON.parse(readFileSync(file, "utf-8")) as ListingFile;
}

function loadGoldSet(
  projectRoot: string,
  repo: CatalogRepo,
  listKind: CatalogListKind,
  editionFilter?: MiddlewareEdition,
): Set<string> {
  if (listKind === "not-microservice") {
    const mod = loadGoldNames(repo, "modules");
    const cli = loadGoldNames(repo, "cli");
    return tokenSet([...mod, ...cli]);
  }
  if (editionFilter === "basic" && repo === "chatkit-middleware" && listKind === "services") {
    const lists = loadRepoFeatureLists(projectRoot, repo);
    const names = (lists?.lists.services ?? [])
      .filter((i) => !i.editions?.length || i.editions.includes("basic"))
      .map((i) => i.title);
    if (names.length) return tokenSet(names);
  }
  return tokenSet(loadGoldNames(repo, listKind));
}

function loadGoldNames(repo: CatalogRepo, listKind: CatalogListKind): string[] {
  const catalogPath = path.join(
    getProjectRoot(),
    "benchmarks",
    "catalogs",
    `${repo}.${listKind}.json`,
  );
  if (!existsSync(catalogPath)) return [];
  const data = JSON.parse(readFileSync(catalogPath, "utf-8")) as { names: string[] };
  return data.names ?? [];
}

async function answerOnce(
  q: ListingQuestion,
  cfg: LlmWikiConfig,
  mode: "baseline" | "candidate",
): Promise<string> {
  if (mode === "candidate" && isCatalogListingEnabled()) {
    const answer = buildCatalogListingAnswer({
      cfg,
      question: q.question,
      profile: cfg.answerProfiles.mcp,
    });
    return answer ?? "(no catalog answer)";
  }

  const bundle = await buildLoopBundle(cfg, q.question);
  const summaryAgent = new LlmAnswerSummaryAgent({
    client: new DeepSeekClient({
      apiKey: cfg.deepseekApiKey,
      baseUrl: cfg.deepseekBaseUrl,
      model: cfg.deepseekModel,
    }),
  });
  const result = await finalizeRunAsk({
    loop: bundle.loop,
    evidence: bundle.evidence,
    telemetry: bundle.telemetry,
    cfg,
    question: q.question,
    surface: "mcp",
    summaryAgent,
  });
  return result.answer;
}

function miniConfig(projectRoot: string): LlmWikiConfig {
  return loadConfig({ ...process.env, DEEPSEEK_API_KEY: "verify-placeholder" });
}

async function main(): Promise<void> {
  loadEnvFile();
  const { runs: runsArg, mode, outDir } = parseArgs(process.argv.slice(2));
  const listing = loadListingQuestions();
  const runsPerQuestion = runsArg ?? listing.defaults.runs ?? 3;

  const projectRoot = getProjectRoot();
  let cfg: LlmWikiConfig;
  let liveAgent = false;
  try {
    cfg = loadConfig();
    liveAgent = mode === "baseline" || !isCatalogListingEnabled();
  } catch {
    cfg = miniConfig(projectRoot);
    cfg.projectRoot = projectRoot;
  }

  if (mode === "candidate") {
    process.env.LLM_WIKI_CATALOG_LISTING = "true";
  }

  const questionReports: QuestionReport[] = [];

  for (const q of listing.questions) {
    const gold = loadGoldSet(projectRoot, q.repo, q.listKind, q.editionFilter);
    const runReports: QuestionRun[] = [];
    const tokenSets: Set<string>[] = [];

    for (let i = 0; i < runsPerQuestion; i++) {
      let answer: string;
      if (mode === "candidate" && isCatalogListingEnabled()) {
        answer =
          buildCatalogListingAnswer({
            cfg,
            question: q.question,
            profile: cfg.answerProfiles.mcp,
          }) ?? "(no catalog answer)";
      } else if (liveAgent && process.env.DEEPSEEK_API_KEY?.trim()) {
        answer = await answerOnce(q, cfg, mode);
      } else {
        answer = "(skipped: DEEPSEEK_API_KEY required for live agent baseline)";
      }

      const predicted = tokensFromAnswer(answer);
      tokenSets.push(predicted);
      const metrics = scoreSetOverlap(predicted, gold);
      runReports.push({
        runIndex: i,
        answer,
        tokens: [...predicted],
        metrics,
        guessCountViolation: detectGuessCountViolation(answer, gold.size, q.listKind),
        lintViolations: lintPublicAnswer(answer),
      });
    }

    const meanF1 =
      runReports.reduce((s, r) => s + r.metrics.f1, 0) / Math.max(runReports.length, 1);
    questionReports.push({
      id: q.id,
      question: q.question,
      goldSize: gold.size,
      runs: runReports,
      meanF1,
      stabilityJaccard: pairwiseJaccardStability(tokenSets),
      guessViolations: runReports.filter((r) => r.guessCountViolation).length,
      lintFailed: runReports.some((r) => r.lintViolations.length > 0),
    });
  }

  const report: ListingReport = {
    generatedAt: new Date().toISOString(),
    mode,
    catalogListingEnabled: isCatalogListingEnabled(),
    runsPerQuestion,
    liveAgent,
    summary: {
      meanF1:
        questionReports.reduce((s, q) => s + q.meanF1, 0) /
        Math.max(questionReports.length, 1),
      meanStabilityJaccard:
        questionReports.reduce((s, q) => s + q.stabilityJaccard, 0) /
        Math.max(questionReports.length, 1),
      guessViolations: questionReports.reduce((s, q) => s + q.guessViolations, 0),
      lintFailures: questionReports.filter((q) => q.lintFailed).length,
    },
    questions: questionReports,
  };

  mkdirSync(outDir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const prefix = mode === "baseline" ? "e0-baseline" : "e1-candidate";
  const outFile = path.join(outDir, `${prefix}-${date}.json`);
  writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, "utf-8");

  console.log(`[verify:listing] wrote ${outFile}`);
  console.log(
    `[verify:listing] meanF1=${report.summary.meanF1.toFixed(3)} stability=${report.summary.meanStabilityJaccard.toFixed(3)} guessViolations=${report.summary.guessViolations}`,
  );

  const passF1 = report.summary.meanF1 >= 0.95;
  const passStability = report.summary.meanStabilityJaccard >= 0.95;
  const passGuess = report.summary.guessViolations === 0;

  if (mode === "candidate" && (!passF1 || !passStability || !passGuess)) {
    console.error("[verify:listing] G2 gate failed (need F1/Jaccard≥0.95, guess=0)");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

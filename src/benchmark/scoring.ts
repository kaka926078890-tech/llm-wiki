import type { PublicAnswerLintViolation } from "./public-answer-lint.js";

export interface ChecklistItem {
  id: string;
  patterns: string[];
}

export interface PolarityCheck {
  id: string;
  positive: string[];
  negative: string[];
}

export interface GoldenQuestion {
  id: string;
  category: string;
  question: string;
  repo_scope?: string;
  quick?: boolean;
  core: ChecklistItem[];
  polarity?: PolarityCheck[];
}

export interface RunScore {
  runIndex: number;
  answer: string;
  lintViolations: PublicAnswerLintViolation[];
  coreHits: string[];
  coreMisses: string[];
  polarityIssues: string[];
  latencyMs: number;
  toolCalls: number;
}

export interface QuestionScore {
  id: string;
  question: string;
  runs: RunScore[];
  unionCoreHits: string[];
  intersectionCoreHits: string[];
  intersectionRatio: number;
  maxCoreMissPerRun: number;
  polarityStable: boolean;
  lintClean: boolean;
  passed: boolean;
  failReasons: string[];
}

function patternHit(text: string, pattern: string): boolean {
  try {
    return new RegExp(pattern, "i").test(text);
  } catch {
    return text.toLowerCase().includes(pattern.toLowerCase());
  }
}

export function scoreChecklistHits(text: string, items: ChecklistItem[]): {
  hits: string[];
  misses: string[];
} {
  const hits: string[] = [];
  const misses: string[] = [];
  for (const item of items) {
    const matched = item.patterns.some((p) => patternHit(text, p));
    if (matched) hits.push(item.id);
    else misses.push(item.id);
  }
  return { hits, misses };
}

export function scorePolarity(text: string, checks: PolarityCheck[] = []): string[] {
  const issues: string[] = [];
  for (const check of checks) {
    const hasPositive = check.positive.some((p) => patternHit(text, p));
    const hasNegative = check.negative.some((p) => patternHit(text, p));
    if (hasNegative && !hasPositive) {
      issues.push(`${check.id}: negative conclusion without supporting positive signal`);
    }
    if (hasNegative && hasPositive) {
      issues.push(`${check.id}: contradictory positive and negative signals`);
    }
  }
  return issues;
}

export function scoreQuestionStability(
  question: GoldenQuestion,
  runs: RunScore[],
  opts: { minCoreIntersectionRatio: number; maxCoreMissPerRun: number },
): QuestionScore {
  const coreIds = question.core.map((c) => c.id);
  const unionCoreHits = [
    ...new Set(runs.flatMap((r) => r.coreHits)),
  ];
  const intersectionCoreHits = coreIds.filter((id) =>
    runs.every((r) => r.coreHits.includes(id)),
  );
  const intersectionRatio = coreIds.length === 0 ? 1 : intersectionCoreHits.length / coreIds.length;
  const maxCoreMissPerRun = Math.max(
    0,
    ...runs.map((r) => r.coreMisses.length),
  );
  const lintClean = runs.every((r) => r.lintViolations.length === 0);
  const polarityStable = runs.every((r) => r.polarityIssues.length === 0);
  const unionComplete = coreIds.every((id) => unionCoreHits.includes(id));

  const failReasons: string[] = [];
  if (!lintClean) failReasons.push("public_answer_lint_failed");
  if (!unionComplete) {
    const missing = coreIds.filter((id) => !unionCoreHits.includes(id));
    failReasons.push(`core_never_mentioned: ${missing.join(", ")}`);
  }
  if (intersectionRatio < opts.minCoreIntersectionRatio) {
    failReasons.push(
      `core_intersection_ratio ${intersectionRatio.toFixed(2)} < ${opts.minCoreIntersectionRatio}`,
    );
  }
  if (maxCoreMissPerRun > opts.maxCoreMissPerRun) {
    failReasons.push(
      `core_miss_per_run ${maxCoreMissPerRun} > ${opts.maxCoreMissPerRun}`,
    );
  }
  if (!polarityStable) failReasons.push("polarity_unstable");

  return {
    id: question.id,
    question: question.question,
    runs,
    unionCoreHits,
    intersectionCoreHits,
    intersectionRatio,
    maxCoreMissPerRun,
    polarityStable,
    lintClean,
    passed: failReasons.length === 0,
    failReasons,
  };
}

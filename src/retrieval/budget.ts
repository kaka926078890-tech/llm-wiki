import type { ToolRegistry } from "../core/tools.js";

import type { RetrievalPlanKind } from "./plan.js";
import { classifyRetrievalPlan } from "./plan.js";

export interface RetrievalBudgetOptions {
  enabled?: boolean;
  totalMax?: number;
  perToolMax?: Partial<Record<string, number>>;
  emptyStreakStop?: number;
}

const DEFAULT_PER_TOOL: Record<string, number> = {
  directory_tree: 2,
  list_directory: 4,
  glob: 5,
  search_files: 5,
  search_content: 7,
  read_file: 6,
  cbm_search: 5,
  get_symbols: 5,
  find_in_code: 5,
};

/** ponytail: completeness-first floors — breadth questions need more reads before answering. */
const PLAN_BUDGET_FLOORS: Record<
  RetrievalPlanKind,
  { totalMax: number; emptyStreakStop: number; perToolMax?: Partial<Record<string, number>> }
> = {
  config: {
    totalMax: 28,
    emptyStreakStop: 5,
    perToolMax: { glob: 8, search_content: 10, read_file: 10, cbm_search: 6 },
  },
  listing: {
    totalMax: 26,
    emptyStreakStop: 5,
    perToolMax: { glob: 8, search_content: 9, read_file: 9, cbm_search: 7, directory_tree: 3 },
  },
  architecture: {
    totalMax: 24,
    emptyStreakStop: 4,
    perToolMax: { cbm_search: 7, read_file: 8, search_content: 8 },
  },
  symbol: {
    totalMax: 18,
    emptyStreakStop: 3,
    perToolMax: { cbm_search: 6, read_file: 6, search_content: 6 },
  },
  general: {
    totalMax: 20,
    emptyStreakStop: 3,
  },
};

const SEARCH_TOOLS = new Set([
  "directory_tree",
  "list_directory",
  "glob",
  "search_files",
  "search_content",
  "cbm_search",
  "get_symbols",
  "find_in_code",
]);

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  const n = raw?.trim().toLowerCase();
  if (n === "true" || n === "1" || n === "yes") return true;
  if (n === "false" || n === "0" || n === "no") return false;
  return fallback;
}

function parsePositive(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function loadRetrievalBudgetOptions(
  env: NodeJS.ProcessEnv = process.env,
): RetrievalBudgetOptions {
  return {
    enabled: parseBool(env.LLM_WIKI_TOOL_BUDGET_ENABLED, true),
    totalMax: parsePositive(env.LLM_WIKI_TOOL_BUDGET_TOTAL, 20),
    emptyStreakStop: parsePositive(env.LLM_WIKI_TOOL_BUDGET_EMPTY_STOP, 3),
  };
}

/** Plan-aware budget: env can raise limits but not below completeness floors. */
export function loadRetrievalBudgetForQuestion(
  question: string,
  env: NodeJS.ProcessEnv = process.env,
): RetrievalBudgetOptions {
  const base = loadRetrievalBudgetOptions(env);
  const kind = classifyRetrievalPlan(question).kind;
  const floor = PLAN_BUDGET_FLOORS[kind];
  const envTotal = env.LLM_WIKI_TOOL_BUDGET_TOTAL?.trim();
  const envEmpty = env.LLM_WIKI_TOOL_BUDGET_EMPTY_STOP?.trim();
  return {
    enabled: base.enabled,
    totalMax: envTotal
      ? Math.max(parsePositive(envTotal, floor.totalMax), floor.totalMax)
      : floor.totalMax,
    emptyStreakStop: envEmpty
      ? Math.max(parsePositive(envEmpty, floor.emptyStreakStop), floor.emptyStreakStop)
      : floor.emptyStreakStop,
    perToolMax: { ...DEFAULT_PER_TOOL, ...floor.perToolMax, ...base.perToolMax },
  };
}

function fingerprintArgs(args: Record<string, unknown>): string {
  const sortJson = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sortJson);
    if (!value || typeof value !== "object") return value;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = sortJson((value as Record<string, unknown>)[key]);
    }
    return out;
  };
  try {
    return JSON.stringify(sortJson(args));
  } catch {
    return "";
  }
}

function looksEmptyResult(result: string): boolean {
  const t = result.trim();
  if (!t) return true;
  if (t === "[]" || t === "{}") return true;
  if (/^no (files|matches|results)/i.test(t)) return true;
  if (/0 (matches|results|files)/i.test(t)) return true;
  if (t.includes('"matches":[]') || t.includes('"hits":[]')) return true;
  if (t.includes("error") && t.length < 120) return true;
  return false;
}

export class RetrievalBudget {
  private total = 0;
  private readonly perTool = new Map<string, number>();
  private readonly seen = new Set<string>();
  private emptyStreak = 0;

  constructor(private readonly opts: RetrievalBudgetOptions) {}

  reset(): void {
    this.total = 0;
    this.perTool.clear();
    this.seen.clear();
    this.emptyStreak = 0;
  }

  beforeCall(name: string, args: Record<string, unknown>): string | null {
    if (this.opts.enabled === false) return null;

    const fp = `${name}:${fingerprintArgs(args)}`;
    if (this.seen.has(fp)) {
      return JSON.stringify({
        error: `${name}: duplicate call skipped (same arguments already ran this turn). Try a different tool or query.`,
        budget: "duplicate",
      });
    }

    if (this.total >= (this.opts.totalMax ?? 14)) {
      return JSON.stringify({
        error: `Tool budget exhausted (${this.opts.totalMax} calls). Answer from evidence already collected.`,
        budget: "total",
      });
    }

    const cap = this.opts.perToolMax?.[name] ?? DEFAULT_PER_TOOL[name];
    const used = this.perTool.get(name) ?? 0;
    if (cap != null && used >= cap) {
      return JSON.stringify({
        error: `${name}: per-tool limit reached (${cap}). Switch tool or conclude.`,
        budget: "per-tool",
      });
    }

    if (
      SEARCH_TOOLS.has(name)
      && this.emptyStreak >= (this.opts.emptyStreakStop ?? 3)
    ) {
      return JSON.stringify({
        error:
          `Search tools paused after ${this.emptyStreak} consecutive empty results. `
          + "Change repo scope, query terms, or answer with partial evidence.",
        budget: "empty-streak",
      });
    }

    this.seen.add(fp);
    this.total += 1;
    this.perTool.set(name, used + 1);
    return null;
  }

  afterResult(result: string): void {
    if (this.opts.enabled === false) return;
    if (looksEmptyResult(result)) this.emptyStreak += 1;
    else this.emptyStreak = 0;
  }
}

export function registerRetrievalBudget(
  tools: ToolRegistry,
  opts: RetrievalBudgetOptions = loadRetrievalBudgetOptions(),
): RetrievalBudget {
  const budget = new RetrievalBudget(opts);

  tools.addToolInterceptor("retrieval-budget", (name, args) => {
    return budget.beforeCall(name, args);
  });

  return budget;
}

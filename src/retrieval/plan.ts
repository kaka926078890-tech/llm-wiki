export type RetrievalPlanKind =
  | "config"
  | "symbol"
  | "listing"
  | "architecture"
  | "general";

export const PREFERRED_TOOLS: Record<RetrievalPlanKind, string[]> = {
  config: ["glob", "search_content"],
  symbol: ["cbm_search"],
  listing: ["cbm_search", "glob"],
  architecture: ["cbm_search"],
  general: [],
};

export function preferredTools(kind: RetrievalPlanKind): string[] {
  return PREFERRED_TOOLS[kind] ?? [];
}

export interface RetrievalPlan {
  kind: RetrievalPlanKind;
  hint: string;
}

const CONFIG_RE =
  /配置|环境变量|\.env|env\s*var|config\s*key|yaml|yml|toml|settings?/i;
const SYMBOL_RE =
  /入口|函数|方法|类|symbol|caller|callee|调用链|影响|file:line|哪一行|定义在/i;
const LISTING_RE =
  /清单|列表|有哪些|模块|服务|package|功能|目录结构|components?/i;
const ARCH_RE = /架构|流程|整体设计|how\s+does|数据流|交互/i;

const HINTS: Record<RetrievalPlanKind, string> = {
  config:
    "[Retrieval plan: config] Inventory ALL config categories before answering (env, build, proxy, i18n, RBAC, channels, session/cache). Use glob/search_content on *.{env,yaml,yml,json,toml,config.*}; read matched files — do not stop at partial coverage.",
  symbol:
    "[Retrieval plan: symbol] Prefer cbm_search (trace/query); verify with a narrow read_file range.",
  listing:
    "[Retrieval plan: listing] Use cbm_search architecture or directory_tree/glob per repo root; read README/package manifests; cover every major module before concluding.",
  architecture:
    "[Retrieval plan: architecture] Use cbm_search semantic or architecture first, then read 2–4 key files — not whole directories.",
  general:
    "[Retrieval plan] Pick one primary search tool first; avoid repeating identical tool calls.",
};

export function classifyRetrievalPlan(question: string): RetrievalPlan {
  const q = question.trim();
  if (CONFIG_RE.test(q)) return { kind: "config", hint: HINTS.config };
  if (SYMBOL_RE.test(q)) return { kind: "symbol", hint: HINTS.symbol };
  if (LISTING_RE.test(q)) return { kind: "listing", hint: HINTS.listing };
  if (ARCH_RE.test(q)) return { kind: "architecture", hint: HINTS.architecture };
  return { kind: "general", hint: HINTS.general };
}

export function augmentQuestionWithRetrievalPlan(question: string): string {
  const plan = classifyRetrievalPlan(question);
  const preferred = preferredTools(plan.kind);
  const preferredLine =
    preferred.length > 0 ? `\nPreferred tools (required first): ${preferred.join(", ")}.` : "";
  return `${plan.hint}${preferredLine}\n\n${question.trim()}`;
}

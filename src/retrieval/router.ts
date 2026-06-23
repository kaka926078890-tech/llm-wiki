import type { ToolRegistry } from "../core/tools.js";

import { preferredTools, type RetrievalPlanKind } from "./plan.js";

/** ponytail: gate low-yield tools until primary search tools run — unlock on hit or all preferred tried. */
function routingRule(kind: RetrievalPlanKind): RetrievalRoutingRule | null {
  switch (kind) {
    case "config":
      return {
        preferred: preferredTools(kind),
        blockedUntilUnlock: [
          "directory_tree",
          "list_directory",
          "read_file",
          "get_symbols",
          "find_in_code",
        ],
      };
    case "symbol":
      return {
        preferred: preferredTools(kind),
        blockedUntilUnlock: ["directory_tree", "list_directory", "glob", "search_files"],
      };
    case "listing":
      return {
        preferred: preferredTools(kind),
        blockedUntilUnlock: ["directory_tree", "list_directory"],
      };
    case "architecture":
      return {
        preferred: preferredTools(kind),
        blockedUntilUnlock: ["directory_tree", "list_directory"],
      };
    default:
      return null;
  }
}

export interface RetrievalRoutingRule {
  preferred: string[];
  blockedUntilUnlock: string[];
}

export { preferredTools } from "./plan.js";

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  const n = raw?.trim().toLowerCase();
  if (n === "true" || n === "1" || n === "yes") return true;
  if (n === "false" || n === "0" || n === "no") return false;
  return fallback;
}

export function loadRetrievalRoutingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return parseBool(env.LLM_WIKI_RETRIEVAL_ROUTING_ENABLED, true);
}

function looksEmptyResult(result: string): boolean {
  const t = result.trim();
  if (!t) return true;
  if (t === "[]" || t === "{}") return true;
  if (/^no (files|matches|results)/i.test(t)) return true;
  if (/0 (matches|results|files)/i.test(t)) return true;
  if (t.includes('"matches":[]') || t.includes('"hits":[]')) return true;
  return false;
}

export class RetrievalRouter {
  private unlocked = false;
  private readonly preferredAttempted = new Set<string>();

  constructor(
    private readonly kind: RetrievalPlanKind,
    private readonly enabled: boolean,
  ) {
    if (!routingRule(kind)) this.unlocked = true;
  }

  beforeCall(name: string): string | null {
    if (!this.enabled || this.unlocked) return null;
    const rule = routingRule(this.kind);
    if (!rule) return null;
    if (!rule.blockedUntilUnlock.includes(name)) return null;
    if (rule.preferred.includes(name)) return null;

    const hint = rule.preferred.join(" or ");
    return JSON.stringify({
      error:
        `${name}: blocked by retrieval plan (${this.kind}). `
        + `Use ${hint} first to locate evidence, then read_file or other tools.`,
      budget: "routing",
      routing: "wait-preferred",
      preferred: rule.preferred,
    });
  }

  afterResult(name: string, result: string): void {
    if (!this.enabled || this.unlocked) return;
    const rule = routingRule(this.kind);
    if (!rule) return;
    if (!rule.preferred.includes(name)) return;

    this.preferredAttempted.add(name);
    if (!looksEmptyResult(result)) this.unlocked = true;
    if (rule.preferred.every((tool) => this.preferredAttempted.has(tool))) {
      this.unlocked = true;
    }
  }

  get isUnlocked(): boolean {
    return this.unlocked;
  }
}

export function registerRetrievalRouter(
  tools: ToolRegistry,
  kind: RetrievalPlanKind,
  enabled: boolean = loadRetrievalRoutingEnabled(),
): RetrievalRouter {
  const router = new RetrievalRouter(kind, enabled);

  tools.addToolInterceptor("retrieval-router", (name) => router.beforeCall(name));

  return router;
}

import { normalizeToken } from "./metrics.js";
import type { FeatureItem } from "./types.js";

export interface CatalogSubsetViolation {
  token: string;
  reason: "extra_item";
}

/** Bold titles on list-item lines only — ignores ** inside README summaries. */
function listItemBoldTokens(answer: string): Set<string> {
  const tokens = new Set<string>();
  for (const m of answer.matchAll(/^- \*\*([^*]+)\*\*/gm)) {
    tokens.add(normalizeToken(m[1]!));
  }
  return tokens;
}

/** G3=A: rendered list item titles must be subset of allowed item titles. */
export function lintCatalogAnswerSubset(
  answer: string,
  items: FeatureItem[],
  opts: { allowExtraItems: boolean },
): CatalogSubsetViolation[] {
  if (opts.allowExtraItems) return [];

  const allowed = new Set(items.map((i) => normalizeToken(i.title)).filter(Boolean));
  const violations: CatalogSubsetViolation[] = [];

  for (const token of listItemBoldTokens(answer)) {
    if (!token || allowed.has(token)) continue;
    violations.push({ token, reason: "extra_item" });
  }

  return violations;
}

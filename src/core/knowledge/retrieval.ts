import type { KnowledgeCard } from "./types.js";
import type { KnowledgeStore } from "./store.js";
import { normalizeQuestionForMatch } from "./normalize.js";

export const HINT_MIN_SCORE = 0.35;
export const FAST_PATH_MIN_SCORE = 0.45;
/** At or above this score, save merges into an existing card instead of creating a new one. */
export const DEDUP_MERGE_SCORE = 0.65;

const STOP_TOKENS = new Set([
  "的",
  "详细",
  "具体",
  "都",
  "请",
  "哪些",
  "什么",
  "列举",
  "一下",
  "还有",
  "以及",
]);

function tokenize(text: string): string[] {
  const normalized = normalizeQuestionForMatch(text);
  return normalized
    .split(/[^\p{L}\p{N}-]+/u)
    .filter((token) => token.length > 1 && !STOP_TOKENS.has(token));
}

function charBigrams(text: string): Set<string> {
  const compact = normalizeQuestionForMatch(text).replace(/\s+/g, "");
  const grams = new Set<string>();
  for (let i = 0; i < compact.length - 1; i += 1) {
    grams.add(compact.slice(i, i + 2));
  }
  return grams;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const item of a) {
    if (b.has(item)) inter += 1;
  }
  const union = new Set([...a, ...b]).size;
  return inter / union;
}

function tokenOverlapScore(query: string, candidate: string): number {
  const queryTokens = new Set(tokenize(query));
  const cardTokens = tokenize(candidate);
  if (cardTokens.length === 0 || queryTokens.size === 0) return 0;
  let hits = 0;
  for (const token of cardTokens) {
    if (queryTokens.has(token)) hits += 1;
  }
  const forward = hits / cardTokens.length;
  let reverseHits = 0;
  for (const token of queryTokens) {
    if (cardTokens.includes(token)) reverseHits += 1;
  }
  const reverse = reverseHits / queryTokens.size;
  return Math.max(forward, reverse);
}

/** ponytail: lexical + bigram blend — no embedding; tune via DEDUP_MERGE_SCORE / FAST_PATH_MIN_SCORE. */
export function scoreQuestionMatch(query: string, cardQuestion: string): number {
  const normQuery = normalizeQuestionForMatch(query);
  const normCard = normalizeQuestionForMatch(cardQuestion);
  if (!normQuery || !normCard) return 0;
  if (normQuery === normCard) return 1;

  const tokenScore = tokenOverlapScore(query, cardQuestion);
  const bigramScore = jaccard(charBigrams(query), charBigrams(cardQuestion));
  const substringBonus =
    normQuery.includes(normCard) || normCard.includes(normQuery) ? 0.12 : 0;
  const blended = Math.max(tokenScore, bigramScore * 0.92) + substringBonus;
  return Math.min(1, blended);
}

function cardQuestionVariants(card: KnowledgeCard): string[] {
  const variants = [card.question, ...(card.questionAliases ?? [])];
  return [...new Set(variants.map((q) => q.trim()).filter(Boolean))];
}

export function scoreCardMatch(query: string, card: KnowledgeCard): number {
  let best = 0;
  for (const variant of cardQuestionVariants(card)) {
    best = Math.max(best, scoreQuestionMatch(query, variant));
  }
  return best;
}

export interface ScoredKnowledgeCard {
  card: KnowledgeCard;
  score: number;
}

export function scoreAllKnowledgeCards(
  store: KnowledgeStore,
  question: string,
): ScoredKnowledgeCard[] {
  return store
    .list()
    .filter((card) => card.confidence !== "rejected" && !card.staleAt)
    .map((card) => ({ card, score: scoreCardMatch(question, card) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function findRelevantKnowledgeCards(
  store: KnowledgeStore,
  question: string,
  opts?: { limit?: number; minScore?: number },
): KnowledgeCard[] {
  const limit = opts?.limit ?? 3;
  const minScore = opts?.minScore ?? HINT_MIN_SCORE;
  return scoreAllKnowledgeCards(store, question)
    .filter((entry) => entry.score >= minScore)
    .slice(0, limit)
    .map((entry) => entry.card);
}

export function findBestMatchingCard(
  store: KnowledgeStore,
  question: string,
  minScore: number,
): ScoredKnowledgeCard | null {
  const ranked = scoreAllKnowledgeCards(store, question);
  const best = ranked[0];
  if (!best || best.score < minScore) return null;
  return best;
}

export function formatKnowledgeHints(cards: KnowledgeCard[]): string {
  if (cards.length === 0) return "";
  const blocks = cards.map((card) => {
    const evidence = card.evidence
      .map((item) => `${item.path}${item.startLine ? `:${item.startLine}` : ""}${item.endLine ? `-${item.endLine}` : ""}`)
      .join(", ");
    const aliases =
      card.questionAliases?.length ? `Aliases: ${card.questionAliases.join(" | ")}` : null;
    return [
      `[Knowledge card ${card.id} · ${card.confidence}${card.hitCount ? ` · hits ${card.hitCount}` : ""}]`,
      `Q: ${card.question}`,
      aliases,
      `A: ${card.answer}`,
      evidence ? `Evidence: ${evidence}` : "Evidence: (none recorded)",
    ]
      .filter(Boolean)
      .join("\n");
  });
  return [
    "[Prior verified knowledge — re-check evidence with tools before citing; do not trust stale/rejected cards]",
    "",
    ...blocks,
  ].join("\n\n");
}

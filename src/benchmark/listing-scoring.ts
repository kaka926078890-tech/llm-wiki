import { normalizeToken } from "../catalog/metrics.js";

export interface SetMetrics {
  precision: number;
  recall: number;
  f1: number;
  jaccard: number;
  intersection: number;
  predictedSize: number;
  goldSize: number;
}

export function tokenSet(values: string[]): Set<string> {
  return new Set(values.map(normalizeToken).filter(Boolean));
}

export function scoreSetOverlap(predicted: Set<string>, gold: Set<string>): SetMetrics {
  const intersection = [...predicted].filter((t) => gold.has(t)).length;
  const predictedSize = predicted.size;
  const goldSize = gold.size;
  const precision = predictedSize > 0 ? intersection / predictedSize : goldSize === 0 ? 1 : 0;
  const recall = goldSize > 0 ? intersection / goldSize : 1;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const union = predictedSize + goldSize - intersection;
  const jaccard = union > 0 ? intersection / union : 1;
  return { precision, recall, f1, jaccard, intersection, predictedSize, goldSize };
}

export function pairwiseJaccardStability(sets: Set<string>[]): number {
  if (sets.length < 2) return 1;
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      sum += scoreSetOverlap(sets[i]!, sets[j]!).jaccard;
      pairs++;
    }
  }
  return pairs > 0 ? sum / pairs : 1;
}

/** List-item bold titles only — ignore README summary text after the title. */
export function tokensFromAnswer(answer: string): Set<string> {
  const tokens = new Set<string>();
  for (const m of answer.matchAll(/^- \*\*([^*]+)\*\*/gm)) {
    tokens.add(normalizeToken(m[1]!));
  }
  return tokens;
}

export function detectGuessCountViolation(
  answer: string,
  expectedCount: number,
  listKind?: string,
): boolean {
  if (listKind === "not-microservice") return false;
  const main = answer.match(/（共\s*(\d+)\s*项/);
  if (!main) return false;
  return Number(main[1]) !== expectedCount;
}

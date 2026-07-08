/** Shared question normalization for lexical match + dedup keys. */

const REPO_ALIASES: Array<[RegExp, string]> = [
  [/\bchatkit[- ]?middleware\b/gi, "chatkit-middleware"],
  [/\bchatkit[- ]?web\b/gi, "chatkit-web"],
  [/\bfinclaw\b/gi, "finclaw"],
  [/\bmiddleware\b/gi, "chatkit-middleware"],
];

const CN_FILLERS =
  /^(请|帮我|能否|可以|麻烦|详细|具体|一下|简要|大概|列出|告诉我|说说|讲讲|介绍|说明)+/gu;

export function normalizeQuestionForMatch(question: string): string {
  let q = question.trim().toLowerCase();
  for (const [pattern, replacement] of REPO_ALIASES) {
    q = q.replace(pattern, replacement);
  }
  q = q.replace(CN_FILLERS, "");
  return q
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function questionDedupKey(question: string): string {
  return normalizeQuestionForMatch(question);
}

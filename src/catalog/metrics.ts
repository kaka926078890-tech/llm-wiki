export function normalizeToken(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff-]+/g, " ")
    .trim();
}

export function extractMentionedTokens(answer: string): Set<string> {
  const tokens = new Set<string>();
  for (const m of answer.matchAll(/\*\*([^*]+)\*\*/g)) {
    tokens.add(normalizeToken(m[1]!));
  }
  for (const m of answer.matchAll(/(?:^|\n)-\s+([^\n:]+)/gm)) {
    tokens.add(normalizeToken(m[1]!.replace(/\*\*/g, "")));
  }
  return tokens;
}

export function itemTitlesForMetrics(titles: string[]): string[] {
  return titles.map(normalizeToken).filter(Boolean);
}

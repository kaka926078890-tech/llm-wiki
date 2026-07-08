import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import type { AuthorizedRoots } from "../../config.js";
import { resolveAuthorizedPath } from "../../path/authorized-roots.js";
import type { KnowledgeCard } from "./types.js";
import type { KnowledgeStore } from "./store.js";

export function hashFileExcerpt(
  absPath: string,
  startLine?: number,
  endLine?: number,
): string | null {
  if (!existsSync(absPath)) return null;
  const lines = readFileSync(absPath, "utf-8").split("\n");
  const start = Math.max(1, startLine ?? 1);
  const end = Math.min(lines.length, endLine ?? lines.length);
  const excerpt = lines.slice(start - 1, end).join("\n");
  return createHash("sha256").update(excerpt).digest("hex").slice(0, 16);
}

function resolveRepoPath(rawPath: string, roots: AuthorizedRoots): string | null {
  const candidates = [rawPath];
  for (const repo of ["chatkit-middleware", "chatkit-web", "finclaw"]) {
    if (!rawPath.startsWith(`${repo}/`)) {
      candidates.push(`${repo}/${rawPath}`);
    }
  }
  for (const candidate of candidates) {
    try {
      return resolveAuthorizedPath(candidate, roots);
    } catch {
      // ponytail: try next alias — O(repos) path guesses, fine for stale checks
    }
  }
  return null;
}

export function checkCardStale(
  card: KnowledgeCard,
  roots: AuthorizedRoots,
): { stale: boolean; reasons: string[] } {
  const reasons: string[] = [];
  for (const item of card.evidence) {
    if (!item.hash) continue;
    const abs = resolveRepoPath(item.path, roots);
    if (!abs) {
      reasons.push(`missing_file:${item.path}`);
      continue;
    }
    const current = hashFileExcerpt(abs, item.startLine, item.endLine);
    if (!current) {
      reasons.push(`missing_file:${item.path}`);
      continue;
    }
    if (current !== item.hash) {
      reasons.push(`hash_changed:${item.path}`);
    }
  }
  return { stale: reasons.length > 0, reasons };
}

export function refreshKnowledgeStale(store: KnowledgeStore, roots: AuthorizedRoots): KnowledgeCard[] {
  const updated: KnowledgeCard[] = [];
  for (const card of store.list()) {
    if (card.confidence === "rejected") continue;
    const { stale, reasons } = checkCardStale(card, roots);
    if (stale && !card.staleAt) {
      const next = store.markStale(card.id, reasons);
      if (next) updated.push(next);
    } else if (!stale && card.staleAt) {
      const next = store.clearStale(card.id);
      if (next) updated.push(next);
    }
  }
  return updated;
}

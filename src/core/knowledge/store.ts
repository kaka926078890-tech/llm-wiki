import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  DEDUP_MERGE_SCORE,
  findBestMatchingCard,
} from "./retrieval.js";
import { questionDedupKey } from "./normalize.js";
import type { KnowledgeCard, KnowledgeConfidence, KnowledgeEvidence, SaveKnowledgeCardInput } from "./types.js";

function cardsPath(projectRoot: string): string {
  return path.join(projectRoot, ".reasonix", "knowledge-cards.jsonl");
}

function readLines(filePath: string): KnowledgeCard[] {
  if (!existsSync(filePath)) return [];
  const cards: KnowledgeCard[] = [];
  for (const line of readFileSync(filePath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    cards.push(JSON.parse(trimmed) as KnowledgeCard);
  }
  return cards;
}

function writeLines(filePath: string, cards: KnowledgeCard[]): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const body = cards.length > 0 ? `${cards.map((c) => JSON.stringify(c)).join("\n")}\n` : "";
  writeFileSync(filePath, body, "utf-8");
}

function evidenceKey(item: KnowledgeEvidence): string {
  return `${item.path}:${item.startLine ?? ""}:${item.endLine ?? ""}`;
}

function mergeEvidence(
  existing: KnowledgeEvidence[],
  incoming: KnowledgeEvidence[] | undefined,
): KnowledgeEvidence[] {
  if (!incoming?.length) return existing;
  const merged = new Map<string, KnowledgeEvidence>();
  for (const item of existing) merged.set(evidenceKey(item), item);
  for (const item of incoming) {
    const key = evidenceKey(item);
    const prev = merged.get(key);
    merged.set(key, prev ? { ...prev, ...item, hash: item.hash ?? prev.hash } : item);
  }
  return [...merged.values()];
}

function mergeAliases(
  existing: string[] | undefined,
  primary: string,
  incoming: string,
): string[] {
  const aliases = new Set((existing ?? []).map((q) => q.trim()).filter(Boolean));
  const normPrimary = questionDedupKey(primary);
  for (const candidate of [incoming, primary]) {
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    if (questionDedupKey(trimmed) === normPrimary) continue;
    aliases.add(trimmed);
  }
  return [...aliases];
}

export function knowledgeCardId(): string {
  return `knowledge:${randomUUID()}`;
}

export function stableCardId(question: string): string {
  const digest = createHash("sha256").update(questionDedupKey(question)).digest("hex").slice(0, 12);
  return `knowledge:${digest}`;
}

export interface SaveOrMergeResult {
  card: KnowledgeCard;
  merged: boolean;
}

export class KnowledgeStore {
  constructor(private readonly filePath: string) {}

  list(): KnowledgeCard[] {
    return readLines(this.filePath);
  }

  get(id: string): KnowledgeCard | undefined {
    return this.list().find((card) => card.id === id);
  }

  save(input: SaveKnowledgeCardInput): KnowledgeCard {
    return this.saveOrMerge(input).card;
  }

  saveOrMerge(input: SaveKnowledgeCardInput): SaveOrMergeResult {
    const duplicate = findBestMatchingCard(this, input.question, DEDUP_MERGE_SCORE);
    if (duplicate) {
      const merged = this.updateCard(duplicate.card.id, {
        answer: input.answer.trim(),
        evidence: mergeEvidence(duplicate.card.evidence, input.evidence),
        repoScope: input.repoScope?.length
          ? [...new Set([...duplicate.card.repoScope, ...input.repoScope])]
          : duplicate.card.repoScope,
        confidence: input.confidence ?? duplicate.card.confidence,
        sourceRunId: input.sourceRunId ?? duplicate.card.sourceRunId,
        questionAliases: mergeAliases(
          duplicate.card.questionAliases,
          duplicate.card.question,
          input.question,
        ),
        clearStale: true,
      });
      if (!merged) {
        return { card: this.createCard(input), merged: false };
      }
      return { card: merged, merged: true };
    }
    return { card: this.createCard(input), merged: false };
  }

  private createCard(input: SaveKnowledgeCardInput): KnowledgeCard {
    const now = new Date().toISOString();
    const card: KnowledgeCard = {
      id: knowledgeCardId(),
      question: input.question.trim(),
      answer: input.answer.trim(),
      repoScope: input.repoScope?.length ? [...input.repoScope] : [],
      evidence: input.evidence?.map((item) => ({ ...item })) ?? [],
      confidence: input.confidence ?? "verified",
      createdAt: now,
      updatedAt: now,
      sourceRunId: input.sourceRunId,
      hitCount: 0,
    };
    const cards = this.list();
    cards.push(card);
    writeLines(this.filePath, cards);
    return card;
  }

  private updateCard(
    id: string,
    patch: {
      answer?: string;
      evidence?: KnowledgeEvidence[];
      repoScope?: string[];
      confidence?: KnowledgeConfidence;
      sourceRunId?: string;
      questionAliases?: string[];
      clearStale?: boolean;
    },
  ): KnowledgeCard | undefined {
    const cards = this.list();
    const idx = cards.findIndex((card) => card.id === id);
    if (idx < 0) return undefined;
    const current = cards[idx]!;
    const { clearStale, ...rest } = patch;
    const next: KnowledgeCard = {
      ...current,
      ...rest,
      updatedAt: new Date().toISOString(),
    };
    if (clearStale) {
      delete next.staleAt;
      delete next.staleReasons;
    }
    cards[idx] = next;
    writeLines(this.filePath, cards);
    return next;
  }

  recordHit(id: string): KnowledgeCard | undefined {
    const cards = this.list();
    const idx = cards.findIndex((card) => card.id === id);
    if (idx < 0) return undefined;
    const current = cards[idx]!;
    const next: KnowledgeCard = {
      ...current,
      hitCount: (current.hitCount ?? 0) + 1,
      lastHitAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    cards[idx] = next;
    writeLines(this.filePath, cards);
    return next;
  }

  updateConfidence(id: string, confidence: KnowledgeConfidence): KnowledgeCard | undefined {
    return this.updateCard(id, { confidence });
  }

  markStale(id: string, reasons: string[]): KnowledgeCard | undefined {
    const cards = this.list();
    const idx = cards.findIndex((card) => card.id === id);
    if (idx < 0) return undefined;
    const next: KnowledgeCard = {
      ...cards[idx]!,
      staleAt: new Date().toISOString(),
      staleReasons: [...reasons],
      updatedAt: new Date().toISOString(),
    };
    cards[idx] = next;
    writeLines(this.filePath, cards);
    return next;
  }

  clearStale(id: string): KnowledgeCard | undefined {
    const cards = this.list();
    const idx = cards.findIndex((card) => card.id === id);
    if (idx < 0) return undefined;
    const { staleAt: _staleAt, staleReasons: _staleReasons, ...rest } = cards[idx]!;
    const next: KnowledgeCard = {
      ...rest,
      updatedAt: new Date().toISOString(),
    };
    cards[idx] = next;
    writeLines(this.filePath, cards);
    return next;
  }

  delete(id: string): boolean {
    const cards = this.list();
    const next = cards.filter((card) => card.id !== id);
    if (next.length === cards.length) return false;
    writeLines(this.filePath, next);
    return true;
  }
}

export function loadKnowledgeStore(projectRoot: string): KnowledgeStore {
  return new KnowledgeStore(cardsPath(projectRoot));
}

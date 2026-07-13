import type { LlmWikiConfig } from "../../config.js";
import type { EvidenceBundle } from "../evidence/index.js";
import { loadKnowledgeStore } from "./store.js";
import { checkCardStale } from "./stale.js";
import { findRelevantKnowledgeCards, FAST_PATH_MIN_SCORE } from "./retrieval.js";
import type { KnowledgeCard } from "./types.js";

export function isCardEvidenceFresh(card: KnowledgeCard, cfg: LlmWikiConfig): boolean {
  if (card.staleAt || card.confidence !== "verified") return false;
  const hashed = card.evidence.filter((item) => item.hash && !item.redacted);
  if (hashed.length === 0) return false;
  void cfg;
  return true;
}

export function tryKnowledgeFastPath(
  cfg: LlmWikiConfig,
  question: string,
  repoScope?: string,
): KnowledgeCard | null {
  const store = loadKnowledgeStore(cfg.projectRoot);
  const hits = findRelevantKnowledgeCards(store, question, {
    limit: 1,
    minScore: FAST_PATH_MIN_SCORE,
  });
  const card = hits[0];
  if (!card) return null;
  if (repoScope && repoScope !== "all" && card.repoScope.length > 0) {
    if (!card.repoScope.includes(repoScope)) return null;
  }
  const { stale, reasons } = checkCardStale(card, cfg.repos);
  if (stale) {
    store.markStale(card.id, reasons);
    return null;
  }
  if (!isCardEvidenceFresh(card, cfg)) return null;
  store.recordHit(card.id);
  return card;
}

export function evidenceBundleFromCard(
  card: KnowledgeCard,
  runId: string,
  question: string,
): EvidenceBundle {
  return {
    runId,
    question,
    items: card.evidence.map((item, index) => ({
      id: `kc-${index + 1}`,
      tool: "knowledge_card",
      path: item.path,
      line: item.startLine,
      lineEnd: item.endLine,
      excerptHash: item.hash,
      redaction: item.redacted ? "redact" : "allow",
    })),
    negativeSearches: [],
    collectedAt: new Date().toISOString(),
  };
}

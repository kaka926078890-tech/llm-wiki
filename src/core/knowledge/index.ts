export type {
  KnowledgeCard,
  KnowledgeConfidence,
  KnowledgeEvidence,
  SaveKnowledgeCardInput,
} from "./types.js";
export { KnowledgeStore, loadKnowledgeStore, knowledgeCardId } from "./store.js";
export { checkCardStale, hashFileExcerpt, refreshKnowledgeStale } from "./stale.js";
export { findRelevantKnowledgeCards, formatKnowledgeHints, scoreQuestionMatch, scoreCardMatch, DEDUP_MERGE_SCORE, FAST_PATH_MIN_SCORE } from "./retrieval.js";
export { normalizeQuestionForMatch, questionDedupKey } from "./normalize.js";
export {
  evidenceBundleFromCard,
  isCardEvidenceFresh,
  tryKnowledgeFastPath,
} from "./fast-path.js";

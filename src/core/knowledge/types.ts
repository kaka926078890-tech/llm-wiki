export type KnowledgeConfidence = "verified" | "draft" | "rejected";

export interface KnowledgeEvidence {
  path: string;
  startLine?: number;
  endLine?: number;
  hash?: string;
  redacted: boolean;
}

export interface KnowledgeCard {
  id: string;
  question: string;
  /** Alternate phrasings merged from similar saves — used for match scoring. */
  questionAliases?: string[];
  answer: string;
  repoScope: string[];
  evidence: KnowledgeEvidence[];
  confidence: KnowledgeConfidence;
  createdAt: string;
  updatedAt: string;
  staleAt?: string;
  staleReasons?: string[];
  sourceRunId?: string;
  hitCount?: number;
  lastHitAt?: string;
}

export interface SaveKnowledgeCardInput {
  question: string;
  answer: string;
  repoScope?: string[];
  evidence?: KnowledgeEvidence[];
  confidence?: KnowledgeConfidence;
  sourceRunId?: string;
}

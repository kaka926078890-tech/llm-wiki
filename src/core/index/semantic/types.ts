export interface EmbeddingClient {
  probe(): Promise<boolean>;
  embed(inputs: string[]): Promise<number[][]>;
}

export interface EmbeddingClientOptions {
  baseUrl: string;
  model: string;
}

export interface SemanticChunk {
  id: string;
  repo: string;
  path: string;
  startLine: number;
  endLine: number;
  text: string;
}

export interface SemanticVectorRecord extends SemanticChunk {
  embedding: number[];
}

export interface SemanticIndexFile {
  version: 1;
  repo: string;
  model: string;
  generatedAt: string;
  records: SemanticVectorRecord[];
}

export interface SemanticSearchHit extends SemanticChunk {
  score: number;
}

import { loadSemanticIndex } from "./index-store.js";
import type { EmbeddingClient, SemanticIndexFile, SemanticSearchHit, SemanticVectorRecord } from "./types.js";

export interface SemanticSearchIndexRef {
  repo: string;
  indexDir: string;
}

export interface SemanticSearchEngineOptions {
  client: EmbeddingClient;
  expectedModel: string;
  indexes: SemanticSearchIndexRef[];
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let aMag = 0;
  let bMag = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    dot += a[i]! * b[i]!;
    aMag += a[i]! * a[i]!;
    bMag += b[i]! * b[i]!;
  }
  if (aMag === 0 || bMag === 0) return 0;
  return dot / (Math.sqrt(aMag) * Math.sqrt(bMag));
}

export class SemanticSearchEngine {
  private readonly client: EmbeddingClient;
  private readonly expectedModel: string;
  private readonly indexRefs: SemanticSearchIndexRef[];
  private loaded: SemanticIndexFile[] | null = null;

  constructor(opts: SemanticSearchEngineOptions) {
    this.client = opts.client;
    this.expectedModel = opts.expectedModel;
    this.indexRefs = opts.indexes;
  }

  private async loadIndexes(): Promise<SemanticIndexFile[]> {
    if (this.loaded) return this.loaded;
    const indexes = [];
    for (const ref of this.indexRefs) {
      const index = await loadSemanticIndex(ref.indexDir);
      if (!index || index.records.length === 0) continue;
      if (index.model !== this.expectedModel) {
        console.warn(
          `[llm-wiki] semantic index model mismatch for ${ref.repo}: `
          + `index=${index.model} expected=${this.expectedModel}; skipping`,
        );
        continue;
      }
      indexes.push(index);
    }
    this.loaded = indexes;
    return indexes;
  }

  async probe(): Promise<boolean> {
    if (!await this.client.probe()) return false;
    const indexes = await this.loadIndexes();
    return indexes.length > 0;
  }

  async search(query: string, opts: { topK: number; repo?: string }): Promise<SemanticSearchHit[]> {
    const indexes = await this.loadIndexes();
    const [queryVector] = await this.client.embed([query]);
    if (!queryVector) return [];

    const records: SemanticVectorRecord[] = indexes
      .filter((index) => !opts.repo || index.repo === opts.repo)
      .flatMap((index) => index.records);

    return records
      .map((record) => ({
        id: record.id,
        repo: record.repo,
        path: record.path,
        startLine: record.startLine,
        endLine: record.endLine,
        text: record.text,
        score: Number(cosine(queryVector, record.embedding).toFixed(6)),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, opts.topK);
  }
}

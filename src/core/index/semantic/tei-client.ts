import type { EmbeddingClient, EmbeddingClientOptions } from "./types.js";

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

function isVectorArray(value: unknown): value is number[][] {
  return Array.isArray(value) && value.every(
    (row) => Array.isArray(row) && row.every((n) => typeof n === "number" && Number.isFinite(n)),
  );
}

export class TeiEmbeddingClient implements EmbeddingClient {
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(opts: EmbeddingClientOptions) {
    this.baseUrl = normalizeBaseUrl(opts.baseUrl);
    this.model = opts.model;
  }

  async probe(): Promise<boolean> {
    if (!this.baseUrl) return false;
    try {
      const res = await fetch(`${this.baseUrl}/health`);
      if (res.ok) return true;
    } catch {
      return false;
    }
    try {
      const vectors = await this.embed(["llm-wiki semantic probe"]);
      return vectors.length === 1 && vectors[0]!.length > 0;
    } catch {
      return false;
    }
  }

  async embed(inputs: string[]): Promise<number[][]> {
    if (!this.baseUrl) throw new Error("TEI base URL is not configured");
    if (inputs.length === 0) return [];

    const res = await fetch(`${this.baseUrl}/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inputs }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`TEI embed failed: ${res.status} ${body}`.trim());
    }

    const json = await res.json();
    if (isVectorArray(json)) return json;
    if (json && typeof json === "object" && isVectorArray((json as { embeddings?: unknown }).embeddings)) {
      return (json as { embeddings: number[][] }).embeddings;
    }
    throw new Error(`TEI embed returned unexpected response for model ${this.model}`);
  }
}

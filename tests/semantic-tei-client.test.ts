import { afterEach, describe, expect, it, vi } from "vitest";

import { TeiEmbeddingClient } from "../src/core/index/semantic/tei-client.js";

describe("TeiEmbeddingClient", () => {
  afterEach(() => vi.restoreAllMocks());

  it("probes health and returns false when base URL is empty", async () => {
    const client = new TeiEmbeddingClient({ baseUrl: "", model: "BAAI/bge-m3" });
    await expect(client.probe()).resolves.toBe(false);
  });

  it("embeds text through a TEI-compatible endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [[0.1, 0.2, 0.3]],
      })),
    );

    const client = new TeiEmbeddingClient({
      baseUrl: "http://127.0.0.1:8080",
      model: "BAAI/bge-m3",
    });

    await expect(client.embed(["hello"])).resolves.toEqual([[0.1, 0.2, 0.3]]);
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8080/embed",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inputs: ["hello"] }),
      }),
    );
  });

  it("throws a useful error for failed embed calls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
        text: async () => "not ready",
      })),
    );

    const client = new TeiEmbeddingClient({
      baseUrl: "http://127.0.0.1:8080",
      model: "BAAI/bge-m3",
    });

    await expect(client.embed(["hello"])).rejects.toThrow("TEI embed failed: 503 not ready");
  });
});

# Optional Semantic Search with TEI/BGE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional TEI/BGE-backed semantic code search to llm-wiki without making embedding infrastructure required for normal startup or normal repository QA.

**Architecture:** Keep the existing read-only lexical tools as the guaranteed baseline. Add a separate `src/core/index/semantic/*` subsystem for embedding providers, local vector index persistence, index building, and search. Register `semantic_search` only when configuration and runtime probes confirm semantic search is usable, so deployments without TEI/BGE behave exactly like today.

**Tech Stack:** TypeScript, Node.js filesystem APIs, Fastify route registration, existing `ToolRegistry`, TEI-compatible HTTP embeddings endpoint, local JSON index files under each repo's `.reasonix/semantic/`.

---

## Current Context

The relevant existing files are:

- `src/config.ts`: loads `.env`, repo roots, host, port, and DeepSeek settings.
- `src/loop-runner.ts`: creates `ToolRegistry`, registers read-only repo tools, builds the system prompt.
- `src/tools/multi-root-readonly.ts`: current read-only code search and file tools.
- `src/prompt-code.ts`: current tool-selection guidance for exact search and broad descriptive questions.
- `src/routes/mcp.ts`: MCP endpoint exposes `ask_llm_wiki` directly; no result/cursor tool should be reintroduced.
- `package.json`: currently has no `index` command.

The target repo roots remain:

- `code/chatkit-middleware`
- `code/chatkit-web`
- `code/finclaw`

### `code/` directory

`llm-wiki/code/` is **not** part of the llm-wiki git tree. It holds the three **external code repositories** that the agent reads. `code/.gitignore` ignores everything except `.gitignore` and `.gitkeep`, so cloned repos and anything generated inside them stay local.

Workflow:

1. `npm run sync:code` — clone or pull the three repos into `code/`.
2. Configure optional TEI env vars (see below).
3. `npm run index` — manually build per-repo semantic indexes when TEI is reachable.
4. Start llm-wiki; `semantic_search` registers only when TEI and at least one index exist.

The target semantic index locations (inside each cloned repo, **not committed to llm-wiki**):

- `code/chatkit-middleware/.reasonix/semantic/index.json`
- `code/chatkit-web/.reasonix/semantic/index.json`
- `code/finclaw/.reasonix/semantic/index.json`

## Product Decisions

These items are decided; implementers should not reopen them:

| Topic | Decision |
|-------|----------|
| Index files in git | **No.** Indexes live under each cloned repo's `.reasonix/semantic/`. They are local artifacts; initialize manually via `npm run index` after `npm run sync:code`. |
| Embedding model | **Env-driven.** Default in `.env.example` is `BAAI/bge-m3` (multilingual). Operators override via `LLM_WIKI_TEI_MODEL`; query-time model must match the model stored in each `index.json`. |
| TEI deployment | **Out of scope for implementation.** Document how to enable semantic search; do not ship Docker/infra. Operators provide any TEI-compatible URL. |
| Index refresh | **Manual only.** Re-run `npm run index` after meaningful code changes or model changes. No watch, CI hook, or incremental indexer in v1. |
| File filtering during index build | **Full shared filters from `src/core/index/config.ts`.** Use `resolveIndexConfig()` + `compileFilters()` for exclude dirs/files/exts/patterns and `maxFileBytes`. When `respectGitignore` is true (default), honor each repo's root `.gitignore` during the file walk. v1 loads the repo-root `.gitignore` only (not nested per-directory rules). This is stricter than current lexical tools, which skip named dirs/exts but do not parse `.gitignore` yet. |
| `LLM_WIKI_SEMANTIC_ENABLED=true` when unavailable | **Required:** log a clear `console.warn` at startup with the reason (TEI unreachable, no indexes, or all indexes skipped), then continue without `semantic_search`. No health-endpoint field in v1. |
| Index model vs TEI model mismatch | **README must explain clearly** that embeddings are model-specific: after changing `LLM_WIKI_TEI_MODEL` or the TEI service model, operators must re-run `npm run index` for all repos. **Implementation:** skip mismatched indexes at load time with `console.warn` (do not search stale vectors). |

## File Structure

Create these focused files:

- `src/core/index/semantic/types.ts`: shared types for providers, chunks, vectors, indexes, and search results.
- `src/core/index/semantic/tei-client.ts`: TEI-compatible embedding client with health probe and embed calls.
- `src/core/index/semantic/chunker.ts`: deterministic text chunking for code and docs.
- `src/core/index/semantic/index-store.ts`: read/write local `.reasonix/semantic/index.json` files.
- `src/core/index/semantic/build-index.ts`: walk files, chunk, embed, and persist one repo index.
- `src/core/index/semantic/search.ts`: embed query and cosine-search across repo indexes.
- `src/tools/semantic-search.ts`: registers `semantic_search` when semantic search is available.
- `src/semantic-index.ts`: CLI entrypoint used by `npm run index`.

Modify these existing files:

- `src/config.ts`: add optional semantic config and env loading.
- `src/loop-runner.ts`: conditionally register semantic tools.
- `src/prompt-code.ts`: prefer `semantic_search` for descriptive questions only when available.
- `package.json`: add `index` script.
- `.env.example`: document optional semantic variables.
- `README.md`: document optional semantic search setup (env vars, `npm run index`, no TEI required for default dev).

Create or modify tests:

- `tests/semantic-config.test.ts`
- `tests/semantic-tei-client.test.ts`
- `tests/semantic-chunker.test.ts`
- `tests/semantic-index-store.test.ts`
- `tests/semantic-build-index.test.ts`
- `tests/semantic-search.test.ts`
- `tests/semantic-tool-registration.test.ts`
- Update `tests/prompt.test.ts` if prompt text is asserted.

## Environment Contract

Use these optional env vars:

```env
LLM_WIKI_SEMANTIC_ENABLED=auto
LLM_WIKI_EMBEDDING_PROVIDER=tei
LLM_WIKI_TEI_BASE_URL=http://127.0.0.1:8080
LLM_WIKI_TEI_MODEL=BAAI/bge-m3
LLM_WIKI_SEMANTIC_TOP_K=8
LLM_WIKI_SEMANTIC_CHUNK_CHARS=1400
LLM_WIKI_SEMANTIC_CHUNK_OVERLAP=200
LLM_WIKI_SEMANTIC_INDEX_DIR=.reasonix/semantic
```

Meanings:

- `LLM_WIKI_SEMANTIC_ENABLED=auto`: enable only when TEI probe succeeds and indexes exist.
- `LLM_WIKI_SEMANTIC_ENABLED=true`: attempt to enable; if probe or index fails, **log reason to console at startup** and continue without `semantic_search` (same runtime behavior as unavailable `auto`).
- `LLM_WIKI_SEMANTIC_ENABLED=false`: disable semantic search completely.
- `LLM_WIKI_EMBEDDING_PROVIDER=tei`: only TEI is implemented in this plan.
- `LLM_WIKI_TEI_BASE_URL`: base URL of the TEI-compatible service.
- `LLM_WIKI_TEI_MODEL`: embedding model id; stored in each `index.json` and must match at search time (see README — change model → re-run `npm run index`).
- `LLM_WIKI_SEMANTIC_TOP_K`: default result count for `semantic_search`.
- `LLM_WIKI_SEMANTIC_CHUNK_CHARS`: max chunk size.
- `LLM_WIKI_SEMANTIC_CHUNK_OVERLAP`: overlap between adjacent chunks.
- `LLM_WIKI_SEMANTIC_INDEX_DIR`: index directory relative to each repo root.

## Task 1: Add Semantic Config

**Files:**

- Modify: `src/config.ts`
- Modify: `.env.example`
- Create: `tests/semantic-config.test.ts`

- [ ] **Step 1: Write failing config tests**

Create `tests/semantic-config.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";

function env(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    DEEPSEEK_API_KEY: "test-key",
    ...overrides,
  };
}

describe("semantic config", () => {
  it("defaults semantic search to auto and TEI provider", () => {
    const cfg = loadConfig(env());
    expect(cfg.semantic.enabled).toBe("auto");
    expect(cfg.semantic.provider).toBe("tei");
    expect(cfg.semantic.teiBaseUrl).toBe("");
    expect(cfg.semantic.topK).toBe(8);
    expect(cfg.semantic.chunkChars).toBe(1400);
    expect(cfg.semantic.chunkOverlap).toBe(200);
    expect(cfg.semantic.indexDir).toBe(".reasonix/semantic");
  });

  it("parses semantic env overrides", () => {
    const cfg = loadConfig(
      env({
        LLM_WIKI_SEMANTIC_ENABLED: "true",
        LLM_WIKI_EMBEDDING_PROVIDER: "tei",
        LLM_WIKI_TEI_BASE_URL: "http://127.0.0.1:8080",
        LLM_WIKI_TEI_MODEL: "BAAI/bge-large-zh-v1.5",
        LLM_WIKI_SEMANTIC_TOP_K: "5",
        LLM_WIKI_SEMANTIC_CHUNK_CHARS: "1200",
        LLM_WIKI_SEMANTIC_CHUNK_OVERLAP: "160",
        LLM_WIKI_SEMANTIC_INDEX_DIR: ".reasonix/semantic-custom",
      }),
    );

    expect(cfg.semantic).toMatchObject({
      enabled: true,
      provider: "tei",
      teiBaseUrl: "http://127.0.0.1:8080",
      teiModel: "BAAI/bge-large-zh-v1.5",
      topK: 5,
      chunkChars: 1200,
      chunkOverlap: 160,
      indexDir: ".reasonix/semantic-custom",
    });
  });

  it("clamps unsafe semantic numeric values", () => {
    const cfg = loadConfig(
      env({
        LLM_WIKI_SEMANTIC_TOP_K: "999",
        LLM_WIKI_SEMANTIC_CHUNK_CHARS: "20",
        LLM_WIKI_SEMANTIC_CHUNK_OVERLAP: "9999",
      }),
    );

    expect(cfg.semantic.topK).toBe(50);
    expect(cfg.semantic.chunkChars).toBe(300);
    expect(cfg.semantic.chunkOverlap).toBe(299);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- tests/semantic-config.test.ts
```

Expected: FAIL because `cfg.semantic` does not exist.

- [ ] **Step 3: Implement config types and parsing**

Modify `src/config.ts`:

```ts
export type SemanticEnabled = true | false | "auto";
export type EmbeddingProvider = "tei";

export interface SemanticConfig {
  enabled: SemanticEnabled;
  provider: EmbeddingProvider;
  teiBaseUrl: string;
  teiModel: string;
  topK: number;
  chunkChars: number;
  chunkOverlap: number;
  indexDir: string;
}
```

Add `semantic: SemanticConfig;` to `LlmWikiConfig`.

Add helpers:

```ts
function parseSemanticEnabled(raw: string | undefined): SemanticEnabled {
  const normalized = raw?.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return "auto";
}

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(raw ?? "");
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}
```

Inside `loadConfig`, compute:

```ts
const chunkChars = clampInt(env.LLM_WIKI_SEMANTIC_CHUNK_CHARS, 1400, 300, 8000);
const rawOverlap = clampInt(env.LLM_WIKI_SEMANTIC_CHUNK_OVERLAP, 200, 0, 2000);
const chunkOverlap = Math.min(rawOverlap, chunkChars - 1);
```

Return:

```ts
semantic: {
  enabled: parseSemanticEnabled(env.LLM_WIKI_SEMANTIC_ENABLED),
  provider: "tei",
  teiBaseUrl: env.LLM_WIKI_TEI_BASE_URL?.trim() || "",
  teiModel: env.LLM_WIKI_TEI_MODEL?.trim() || "BAAI/bge-m3",
  topK: clampInt(env.LLM_WIKI_SEMANTIC_TOP_K, 8, 1, 50),
  chunkChars,
  chunkOverlap,
  indexDir: env.LLM_WIKI_SEMANTIC_INDEX_DIR?.trim() || ".reasonix/semantic",
},
```

- [ ] **Step 4: Document env vars**

Append to `.env.example`:

```env
# Optional semantic search. If disabled or unavailable, llm-wiki still runs with lexical tools.
LLM_WIKI_SEMANTIC_ENABLED=auto
LLM_WIKI_EMBEDDING_PROVIDER=tei
LLM_WIKI_TEI_BASE_URL=
LLM_WIKI_TEI_MODEL=BAAI/bge-m3
LLM_WIKI_SEMANTIC_TOP_K=8
LLM_WIKI_SEMANTIC_CHUNK_CHARS=1400
LLM_WIKI_SEMANTIC_CHUNK_OVERLAP=200
LLM_WIKI_SEMANTIC_INDEX_DIR=.reasonix/semantic
```

- [ ] **Step 5: Verify**

Run:

```bash
npm test -- tests/semantic-config.test.ts
npm run typecheck
```

Expected: all pass.

## Task 2: Add TEI Embedding Client

**Files:**

- Create: `src/core/index/semantic/types.ts`
- Create: `src/core/index/semantic/tei-client.ts`
- Create: `tests/semantic-tei-client.test.ts`

- [ ] **Step 1: Write failing client tests**

Create `tests/semantic-tei-client.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- tests/semantic-tei-client.test.ts
```

Expected: FAIL because files do not exist.

- [ ] **Step 3: Add shared types**

Create `src/core/index/semantic/types.ts`:

```ts
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
```

- [ ] **Step 4: Implement TEI client**

Create `src/core/index/semantic/tei-client.ts`:

```ts
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
```

- [ ] **Step 5: Verify**

Run:

```bash
npm test -- tests/semantic-tei-client.test.ts
npm run typecheck
```

Expected: all pass.

## Task 3: Add Chunking

**Files:**

- Create: `src/core/index/semantic/chunker.ts`
- Create: `tests/semantic-chunker.test.ts`

- [ ] **Step 1: Write failing chunker tests**

Create `tests/semantic-chunker.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { chunkText } from "../src/core/index/semantic/chunker.js";

describe("chunkText", () => {
  it("returns one chunk for short text with line numbers", () => {
    const chunks = chunkText({
      repo: "chatkit-web",
      path: "src/App.tsx",
      text: "one\ntwo\nthree",
      maxChars: 100,
      overlapChars: 10,
    });

    expect(chunks).toEqual([
      {
        id: "chatkit-web:src/App.tsx:1-3:0",
        repo: "chatkit-web",
        path: "src/App.tsx",
        startLine: 1,
        endLine: 3,
        text: "one\ntwo\nthree",
      },
    ]);
  });

  it("splits long text with overlap and stable ids", () => {
    const text = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"].join("\n");
    const chunks = chunkText({
      repo: "chatkit-web",
      path: "src/file.ts",
      text,
      maxChars: 18,
      overlapChars: 5,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]!.id).toBe("chatkit-web:src/file.ts:1-3:0");
    expect(chunks[0]!.text).toContain("alpha");
    expect(chunks[1]!.startLine).toBeLessThanOrEqual(chunks[0]!.endLine);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- tests/semantic-chunker.test.ts
```

Expected: FAIL because `chunker.ts` does not exist.

- [ ] **Step 3: Implement chunker**

Create `src/core/index/semantic/chunker.ts`:

```ts
import type { SemanticChunk } from "./types.js";

export interface ChunkTextInput {
  repo: string;
  path: string;
  text: string;
  maxChars: number;
  overlapChars: number;
}

function lineForOffset(lineStarts: number[], offset: number): number {
  let line = 1;
  for (let i = 0; i < lineStarts.length; i += 1) {
    if (lineStarts[i]! > offset) break;
    line = i + 1;
  }
  return line;
}

export function chunkText(input: ChunkTextInput): SemanticChunk[] {
  const text = input.text.trim();
  if (!text) return [];
  const maxChars = Math.max(300, Math.floor(input.maxChars));
  const overlapChars = Math.max(0, Math.min(Math.floor(input.overlapChars), maxChars - 1));
  const lineStarts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") lineStarts.push(i + 1);
  }

  const chunks: SemanticChunk[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + maxChars);
    if (end < text.length) {
      const newline = text.lastIndexOf("\n", end);
      if (newline > start + Math.floor(maxChars * 0.5)) end = newline;
    }
    const chunk = text.slice(start, end).trim();
    if (chunk) {
      const startLine = lineForOffset(lineStarts, start);
      const endLine = lineForOffset(lineStarts, Math.max(start, end - 1));
      chunks.push({
        id: `${input.repo}:${input.path}:${startLine}-${endLine}:${chunks.length}`,
        repo: input.repo,
        path: input.path,
        startLine,
        endLine,
        text: chunk,
      });
    }
    if (end >= text.length) break;
    start = Math.max(0, end - overlapChars);
  }
  return chunks;
}
```

- [ ] **Step 4: Verify**

Run:

```bash
npm test -- tests/semantic-chunker.test.ts
npm run typecheck
```

Expected: all pass.

## Task 4: Add Index Store

**Files:**

- Create: `src/core/index/semantic/index-store.ts`
- Create: `tests/semantic-index-store.test.ts`

- [ ] **Step 1: Write failing store tests**

Create `tests/semantic-index-store.test.ts`:

```ts
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadSemanticIndex, saveSemanticIndex } from "../src/core/index/semantic/index-store.js";
import type { SemanticIndexFile } from "../src/core/index/semantic/types.js";

let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-semantic-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("semantic index store", () => {
  it("saves and loads an index file", async () => {
    const index: SemanticIndexFile = {
      version: 1,
      repo: "chatkit-web",
      model: "BAAI/bge-m3",
      generatedAt: "2026-06-06T00:00:00.000Z",
      records: [{
        id: "chatkit-web:a.ts:1-1:0",
        repo: "chatkit-web",
        path: "a.ts",
        startLine: 1,
        endLine: 1,
        text: "hello",
        embedding: [1, 0],
      }],
    };

    await saveSemanticIndex(dir, index);
    await expect(loadSemanticIndex(dir)).resolves.toEqual(index);
  });

  it("returns null when index is missing", async () => {
    await expect(loadSemanticIndex(dir)).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- tests/semantic-index-store.test.ts
```

Expected: FAIL because `index-store.ts` does not exist.

- [ ] **Step 3: Implement index store**

Create `src/core/index/semantic/index-store.ts`:

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SemanticIndexFile } from "./types.js";

const INDEX_FILE = "index.json";

export function semanticIndexPath(indexDir: string): string {
  return path.join(indexDir, INDEX_FILE);
}

function isSemanticIndexFile(value: unknown): value is SemanticIndexFile {
  const candidate = value as SemanticIndexFile;
  return !!candidate
    && candidate.version === 1
    && typeof candidate.repo === "string"
    && typeof candidate.model === "string"
    && Array.isArray(candidate.records);
}

export async function loadSemanticIndex(indexDir: string): Promise<SemanticIndexFile | null> {
  try {
    const raw = await readFile(semanticIndexPath(indexDir), "utf-8");
    const parsed = JSON.parse(raw);
    if (!isSemanticIndexFile(parsed)) return null;
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function saveSemanticIndex(indexDir: string, index: SemanticIndexFile): Promise<void> {
  await mkdir(indexDir, { recursive: true });
  await writeFile(semanticIndexPath(indexDir), `${JSON.stringify(index, null, 2)}\n`, "utf-8");
}
```

- [ ] **Step 4: Verify**

Run:

```bash
npm test -- tests/semantic-index-store.test.ts
npm run typecheck
```

Expected: all pass.

## Task 5: Build Semantic Index

**Files:**

- Create: `src/core/index/semantic/build-index.ts`
- Create: `src/semantic-index.ts`
- Modify: `package.json`
- Modify: `tsconfig.json` (remove `src/core/index/config.ts` from `exclude` so `build-index.ts` can import it)
- Create: `tests/semantic-build-index.test.ts`

- [ ] **Step 1: Write failing build-index test**

Create `tests/semantic-build-index.test.ts`:

```ts
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildSemanticIndexForRepo } from "../src/core/index/semantic/build-index.js";
import type { EmbeddingClient } from "../src/core/index/semantic/types.js";

let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-build-semantic-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("buildSemanticIndexForRepo", () => {
  it("chunks files, embeds records, and writes index.json", async () => {
    await writeFile(path.join(dir, "a.ts"), "export const alpha = 1;\nexport const beta = 2;\n", "utf-8");

    const client: EmbeddingClient = {
      probe: async () => true,
      embed: async (inputs) => inputs.map((input, i) => [input.length, i]),
    };

    const result = await buildSemanticIndexForRepo({
      repo: "chatkit-web",
      repoRoot: dir,
      indexDir: path.join(dir, ".reasonix", "semantic"),
      model: "test-model",
      client,
      chunkChars: 300,
      chunkOverlap: 20,
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]!.path).toBe("a.ts");
    expect(result.records[0]!.embedding).toEqual([45, 0]);

    const raw = await readFile(path.join(dir, ".reasonix", "semantic", "index.json"), "utf-8");
    expect(JSON.parse(raw)).toMatchObject({
      version: 1,
      repo: "chatkit-web",
      model: "test-model",
    });
  });

  it("skips lock files, excluded dirs, and gitignored paths", async () => {
    const { mkdir } = await import("node:fs/promises");
    await writeFile(path.join(dir, "a.ts"), "export const alpha = 1;\n", "utf-8");
    await writeFile(path.join(dir, "package-lock.json"), "{}", "utf-8");
    await writeFile(path.join(dir, ".gitignore"), "ignored.ts\n", "utf-8");
    await writeFile(path.join(dir, "ignored.ts"), "export const hidden = 1;\n", "utf-8");
    await mkdir(path.join(dir, "node_modules", "pkg"), { recursive: true });
    await writeFile(path.join(dir, "node_modules", "pkg", "index.js"), "module.exports = {};\n", "utf-8");

    const client: EmbeddingClient = {
      probe: async () => true,
      embed: async (inputs) => inputs.map((input) => [input.length]),
    };

    const result = await buildSemanticIndexForRepo({
      repo: "chatkit-web",
      repoRoot: dir,
      indexDir: path.join(dir, ".reasonix", "semantic"),
      model: "test-model",
      client,
      chunkChars: 300,
      chunkOverlap: 20,
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]!.path).toBe("a.ts");
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- tests/semantic-build-index.test.ts
```

Expected: FAIL because `build-index.ts` does not exist.

- [ ] **Step 3: Implement index builder**

Create `src/core/index/semantic/build-index.ts`:

```ts
import { readFile } from "node:fs/promises";
import { promises as fs } from "node:fs";
import path from "node:path";
import ignore, { type Ignore } from "ignore";
import { compileFilters, resolveIndexConfig, type IndexFilters } from "../config.js";
import { chunkText } from "./chunker.js";
import { saveSemanticIndex } from "./index-store.js";
import type { EmbeddingClient, SemanticIndexFile, SemanticVectorRecord } from "./types.js";

export interface BuildSemanticIndexOptions {
  repo: string;
  repoRoot: string;
  indexDir: string;
  model: string;
  client: EmbeddingClient;
  chunkChars: number;
  chunkOverlap: number;
}

async function loadRepoGitignore(repoRoot: string): Promise<Ignore> {
  const ig = ignore();
  try {
    const raw = await readFile(path.join(repoRoot, ".gitignore"), "utf-8");
    ig.add(raw);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  return ig;
}

function shouldSkipName(name: string, filters: IndexFilters): boolean {
  const lower = name.toLowerCase();
  return filters.dirSet.has(name)
    || filters.fileSet.has(name)
    || [...filters.extSet].some((ext) => lower.endsWith(ext));
}

async function collectFiles(
  root: string,
  filters: IndexFilters,
  gitignore: Ignore | null,
  dir = root,
): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full).replaceAll("\\", "/");
    if (shouldSkipName(entry.name, filters) || filters.patternMatch(rel)) continue;
    if (gitignore?.ignores(rel)) continue;
    if (entry.isDirectory()) {
      files.push(...await collectFiles(root, filters, gitignore, full));
    } else if (entry.isFile()) {
      const stat = await fs.stat(full);
      if (stat.size <= filters.maxFileBytes) files.push(full);
    }
  }
  return files;
}

export async function buildSemanticIndexForRepo(
  opts: BuildSemanticIndexOptions,
): Promise<SemanticIndexFile> {
  const filters = compileFilters(resolveIndexConfig());
  const gitignore = filters.respectGitignore ? await loadRepoGitignore(opts.repoRoot) : null;
  const files = await collectFiles(opts.repoRoot, filters, gitignore);
  const chunks = [];
  for (const file of files) {
    const rel = path.relative(opts.repoRoot, file).replaceAll("\\", "/");
    const text = await fs.readFile(file, "utf-8").catch(() => "");
    chunks.push(...chunkText({
      repo: opts.repo,
      path: rel,
      text,
      maxChars: opts.chunkChars,
      overlapChars: opts.chunkOverlap,
    }));
  }

  const vectors = await opts.client.embed(chunks.map((chunk) => chunk.text));
  const records: SemanticVectorRecord[] = chunks.map((chunk, i) => ({
    ...chunk,
    embedding: vectors[i] ?? [],
  })).filter((record) => record.embedding.length > 0);

  const index: SemanticIndexFile = {
    version: 1,
    repo: opts.repo,
    model: opts.model,
    generatedAt: new Date().toISOString(),
    records,
  };
  await saveSemanticIndex(opts.indexDir, index);
  return index;
}
```

- [ ] **Step 4: Add CLI entrypoint**

Create `src/semantic-index.ts`:

```ts
import path from "node:path";
import { loadConfig, loadEnvFile } from "./config.js";
import { TeiEmbeddingClient } from "./core/index/semantic/tei-client.js";
import { buildSemanticIndexForRepo } from "./core/index/semantic/build-index.js";

function repoEntries(cfg: ReturnType<typeof loadConfig>): Array<{ repo: string; root: string }> {
  return [
    { repo: "chatkit-middleware", root: cfg.repos.middleware },
    { repo: "chatkit-web", root: cfg.repos.web },
    { repo: "finclaw", root: cfg.repos.finclaw },
  ];
}

async function main(): Promise<void> {
  loadEnvFile();
  const cfg = loadConfig();
  if (!cfg.semantic.teiBaseUrl) {
    throw new Error("LLM_WIKI_TEI_BASE_URL is required to build semantic indexes");
  }

  const client = new TeiEmbeddingClient({
    baseUrl: cfg.semantic.teiBaseUrl,
    model: cfg.semantic.teiModel,
  });
  const ok = await client.probe();
  if (!ok) throw new Error(`TEI embedding service unavailable at ${cfg.semantic.teiBaseUrl}`);

  for (const entry of repoEntries(cfg)) {
    const indexDir = path.join(entry.root, cfg.semantic.indexDir);
    const index = await buildSemanticIndexForRepo({
      repo: entry.repo,
      repoRoot: entry.root,
      indexDir,
      model: cfg.semantic.teiModel,
      client,
      chunkChars: cfg.semantic.chunkChars,
      chunkOverlap: cfg.semantic.chunkOverlap,
    });
    console.log(`indexed ${entry.repo}: ${index.records.length} chunks -> ${indexDir}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 5: Add npm script**

Modify `package.json` scripts:

```json
"index": "tsx src/semantic-index.ts"
```

Keep existing scripts unchanged.

- [ ] **Step 5b: Unblock config import**

In `tsconfig.json`, remove `"src/core/index/config.ts"` from the `exclude` array. That file is currently excluded from compilation but is now imported by `build-index.ts`.

- [ ] **Step 6: Verify**

Run:

```bash
npm test -- tests/semantic-build-index.test.ts
npm run typecheck
```

Expected: all pass.

## Task 6: Add Semantic Search Runtime

**Files:**

- Create: `src/core/index/semantic/search.ts`
- Create: `tests/semantic-search.test.ts`

- [ ] **Step 1: Write failing search tests**

Create `tests/semantic-search.test.ts`:

```ts
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { saveSemanticIndex } from "../src/core/index/semantic/index-store.js";
import { SemanticSearchEngine } from "../src/core/index/semantic/search.js";
import type { EmbeddingClient, SemanticIndexFile } from "../src/core/index/semantic/types.js";

let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-search-semantic-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("SemanticSearchEngine", () => {
  it("loads indexes and ranks hits by cosine similarity", async () => {
    const index: SemanticIndexFile = {
      version: 1,
      repo: "chatkit-web",
      model: "test-model",
      generatedAt: "2026-06-06T00:00:00.000Z",
      records: [
        { id: "a", repo: "chatkit-web", path: "a.ts", startLine: 1, endLine: 1, text: "billing", embedding: [1, 0] },
        { id: "b", repo: "chatkit-web", path: "b.ts", startLine: 1, endLine: 1, text: "chat", embedding: [0, 1] },
      ],
    };
    await saveSemanticIndex(path.join(dir, ".reasonix", "semantic"), index);

    const client: EmbeddingClient = {
      probe: async () => true,
      embed: async () => [[0, 1]],
    };
    const engine = new SemanticSearchEngine({
      client,
      expectedModel: "test-model",
      indexes: [{ repo: "chatkit-web", indexDir: path.join(dir, ".reasonix", "semantic") }],
    });

    await expect(engine.probe()).resolves.toBe(true);
    const hits = await engine.search("chat UI", { topK: 1 });
    expect(hits).toEqual([
      {
        id: "b",
        repo: "chatkit-web",
        path: "b.ts",
        startLine: 1,
        endLine: 1,
        text: "chat",
        score: 1,
      },
    ]);
  });

  it("is unavailable when no indexes exist", async () => {
    const client: EmbeddingClient = {
      probe: async () => true,
      embed: async () => [[1, 0]],
    };
    const engine = new SemanticSearchEngine({
      client,
      expectedModel: "test-model",
      indexes: [{ repo: "chatkit-web", indexDir: path.join(dir, ".reasonix", "semantic") }],
    });

    await expect(engine.probe()).resolves.toBe(false);
  });

  it("skips indexes built with a different embedding model", async () => {
    const index: SemanticIndexFile = {
      version: 1,
      repo: "chatkit-web",
      model: "old-model",
      generatedAt: "2026-06-06T00:00:00.000Z",
      records: [
        { id: "a", repo: "chatkit-web", path: "a.ts", startLine: 1, endLine: 1, text: "chat", embedding: [1, 0] },
      ],
    };
    await saveSemanticIndex(path.join(dir, ".reasonix", "semantic"), index);

    const client: EmbeddingClient = {
      probe: async () => true,
      embed: async () => [[1, 0]],
    };
    const engine = new SemanticSearchEngine({
      client,
      expectedModel: "test-model",
      indexes: [{ repo: "chatkit-web", indexDir: path.join(dir, ".reasonix", "semantic") }],
    });

    await expect(engine.probe()).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- tests/semantic-search.test.ts
```

Expected: FAIL because `search.ts` does not exist.

- [ ] **Step 3: Implement search engine**

Create `src/core/index/semantic/search.ts`:

```ts
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
        console.warn(`[llm-wiki] semantic index model mismatch for ${ref.repo}: index=${index.model} expected=${this.expectedModel}; skipping`);
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
```

- [ ] **Step 4: Verify**

Run:

```bash
npm test -- tests/semantic-search.test.ts
npm run typecheck
```

Expected: all pass.

## Task 7: Register Optional `semantic_search` Tool

**Files:**

- Create: `src/tools/semantic-search.ts`
- Modify: `src/loop-runner.ts`
- Modify: `src/routes/ask.ts` (`BuildLoopFn` → async, `await buildLoopFn(cfg)`)
- Modify: `src/routes/mcp.ts` (`await buildLoopFn(cfg)` in `tools/call`)
- Create: `tests/semantic-tool-registration.test.ts`

- [ ] **Step 1: Write failing tool registration tests**

Create `tests/semantic-tool-registration.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { ToolRegistry } from "../src/core/tools.js";
import { registerSemanticSearchTool } from "../src/tools/semantic-search.js";
import type { SemanticSearchEngine } from "../src/core/index/semantic/search.js";

describe("registerSemanticSearchTool", () => {
  it("registers semantic_search when engine is available", async () => {
    const registry = new ToolRegistry({ autoFlatten: true });
    const engine = {
      probe: async () => true,
      search: async () => [{
        id: "hit-1",
        repo: "chatkit-web",
        path: "src/App.tsx",
        startLine: 1,
        endLine: 3,
        text: "chat feature",
        score: 0.9,
      }],
    } as unknown as SemanticSearchEngine;

    await registerSemanticSearchTool(registry, { engine, defaultTopK: 8 });
    expect(registry.specs().some((spec) => spec.name === "semantic_search")).toBe(true);

    const result = await registry.call("semantic_search", { query: "chat feature" });
    expect(result).toContain("[chatkit-web] src/App.tsx:1-3 score=0.9");
    expect(result).toContain("chat feature");
  });

  it("does not register semantic_search when engine is unavailable", async () => {
    const registry = new ToolRegistry({ autoFlatten: true });
    const engine = {
      probe: async () => false,
      search: async () => [],
    } as unknown as SemanticSearchEngine;

    await registerSemanticSearchTool(registry, { engine, defaultTopK: 8 });
    expect(registry.specs().some((spec) => spec.name === "semantic_search")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- tests/semantic-tool-registration.test.ts
```

Expected: FAIL because `semantic-search.ts` does not exist.

- [ ] **Step 3: Implement semantic tool registration**

Create `src/tools/semantic-search.ts`:

```ts
import type { ToolRegistry } from "../core/tools.js";
import type { SemanticSearchEngine } from "../core/index/semantic/search.js";

export interface RegisterSemanticSearchToolOptions {
  engine: SemanticSearchEngine;
  defaultTopK: number;
}

export async function registerSemanticSearchTool(
  registry: ToolRegistry,
  opts: RegisterSemanticSearchToolOptions,
): Promise<boolean> {
  const available = await opts.engine.probe();
  if (!available) return false;

  registry.register({
    name: "semantic_search",
    readOnly: true,
    parallelSafe: true,
    stormExempt: true,
    description:
      "Semantic search over prebuilt repo indexes. Use first for broad descriptive questions, feature discovery, architecture discovery, and conceptually related code. For exact symbols, routes, env vars, and error strings, use search_content instead.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural-language search query." },
        repo: {
          type: "string",
          description: "Optional repo filter: chatkit-middleware, chatkit-web, or finclaw.",
        },
        top_k: {
          type: "integer",
          description: "Number of semantic hits to return. Default comes from config.",
        },
      },
      required: ["query"],
    },
    fn: async (args: { query: string; repo?: string; top_k?: number }) => {
      const topK = Math.max(1, Math.min(50, Math.floor(args.top_k ?? opts.defaultTopK)));
      const hits = await opts.engine.search(args.query, { topK, repo: args.repo });
      if (hits.length === 0) return "No semantic matches found. Fall back to search_content, glob, directory_tree, and read_file.";
      return hits.map((hit) => [
        `[${hit.repo}] ${hit.path}:${hit.startLine}-${hit.endLine} score=${hit.score}`,
        hit.text,
      ].join("\n")).join("\n\n---\n\n");
    },
  });

  return true;
}
```

- [ ] **Step 4: Wire tool into loop runner**

Modify `src/loop-runner.ts`:

```ts
import path from "node:path";
import { TeiEmbeddingClient } from "./core/index/semantic/tei-client.js";
import { SemanticSearchEngine } from "./core/index/semantic/search.js";
import { registerSemanticSearchTool } from "./tools/semantic-search.js";
```

Change `buildLoop` to support async tool registration. If `buildLoop` cannot become async because route code expects sync, add a separate helper:

```ts
async function tryRegisterSemanticTools(tools: ToolRegistry, cfg: LlmWikiConfig): Promise<void> {
  if (cfg.semantic.enabled === false) return;
  if (!cfg.semantic.teiBaseUrl) return;

  const client = new TeiEmbeddingClient({
    baseUrl: cfg.semantic.teiBaseUrl,
    model: cfg.semantic.teiModel,
  });
  const engine = new SemanticSearchEngine({
    client,
    expectedModel: cfg.semantic.teiModel,
    indexes: [
      { repo: "chatkit-middleware", indexDir: path.join(cfg.repos.middleware, cfg.semantic.indexDir) },
      { repo: "chatkit-web", indexDir: path.join(cfg.repos.web, cfg.semantic.indexDir) },
      { repo: "finclaw", indexDir: path.join(cfg.repos.finclaw, cfg.semantic.indexDir) },
    ],
  });

  const registered = await registerSemanticSearchTool(tools, {
    engine,
    defaultTopK: cfg.semantic.topK,
  });
  if (cfg.semantic.enabled === true && !registered) {
    console.warn(
      "[llm-wiki] LLM_WIKI_SEMANTIC_ENABLED=true but semantic_search is unavailable "
      + "(TEI unreachable, missing indexes, or index model mismatch with LLM_WIKI_TEI_MODEL). "
      + "Continuing with lexical tools only. If you changed the embedding model, re-run `npm run index`.",
    );
  }
}
```

Then update the route-facing loop construction:

- Change `BuildLoopFn` in `src/routes/ask.ts` to `(cfg: LlmWikiConfig) => Promise<CacheFirstLoop>`.
- `await buildLoopFn(cfg)` in `src/routes/ask.ts` and `src/routes/mcp.ts` (`tools/call` handler).
- Update `tests/loop-smoke.test.ts` to `await buildLoop(...)` if it calls the real `buildLoop`.

The final `buildLoop` should:

```ts
export async function buildLoop(cfg: LlmWikiConfig): Promise<CacheFirstLoop> {
  const tools = new ToolRegistry({ autoFlatten: true });
  registerMultiRootReadonlyTools(tools, { roots: cfg.repos });
  await tryRegisterSemanticTools(tools, cfg);
  ...
}
```

Update all call sites from:

```ts
const loop = buildLoopFn(cfg);
```

to:

```ts
const loop = await buildLoopFn(cfg);
```

- [ ] **Step 5: Verify**

Run:

```bash
npm test -- tests/semantic-tool-registration.test.ts tests/loop-smoke.test.ts
npm run typecheck
```

Expected: all pass.

## Task 8: Prompt Strategy Update

**Files:**

- Modify: `src/prompt-code.ts`
- Modify: `tests/prompt.test.ts`

- [ ] **Step 1: Write failing prompt test**

Add to `tests/prompt.test.ts`:

```ts
it("mentions optional semantic_search strategy", () => {
  const prompt = codeSystemBase("deepseek-chat");
  expect(prompt).toContain("If semantic_search is available");
  expect(prompt).toContain("descriptive questions");
  expect(prompt).toContain("For exact symbols");
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- tests/prompt.test.ts
```

Expected: FAIL because prompt does not mention `semantic_search`.

- [ ] **Step 3: Update prompt**

Modify the `# Exploration` section in `src/prompt-code.ts` to include:

```text
If `semantic_search` is available, use it first for broad descriptive questions, feature discovery, architecture discovery, and conceptually related code. Treat its results as candidates, then verify important claims with `read_file`, `search_content`, `get_symbols`, or `find_in_code`. If `semantic_search` is unavailable, continue with `directory_tree`, `glob`, `search_files`, `search_content`, and `read_file`. For exact symbols, routes, table names, env vars, or error strings, prefer `search_content` rather than semantic search.
```

Keep the rest of the existing evidence/citation rules intact.

- [ ] **Step 4: Verify**

Run:

```bash
npm test -- tests/prompt.test.ts
npm run typecheck
```

Expected: all pass.

## Task 9: Document Optional Semantic Search

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Add optional semantic search section**

Append a section to `README.md` covering:

- Semantic search is **optional**; default dev (`npm run dev`) works without TEI.
- Prerequisites when enabling: TEI-compatible HTTP embeddings service at `LLM_WIKI_TEI_BASE_URL`, plus indexes built under each repo.
- Workflow: `npm run sync:code` → set env vars from `.env.example` → `npm run index` → restart server.
- `LLM_WIKI_SEMANTIC_ENABLED=auto` (default): register `semantic_search` only when TEI probe succeeds and at least one index exists.
- `LLM_WIKI_SEMANTIC_ENABLED=true`: if semantic search cannot start, llm-wiki prints a **startup warning** and continues with lexical tools only.
- Indexes are local files under `code/<repo>/.reasonix/semantic/`; not part of llm-wiki git.
- Index build uses shared exclude rules from `src/core/index/config.ts` (dirs/files/exts/patterns, max file size) and each repo's root `.gitignore`.

- [ ] **Step 2: Add a dedicated subsection — embedding model and re-indexing**

This subsection must be **prominent** (own `###` heading, not buried in a bullet list). Include:

**Why model matters:** Semantic vectors are tied to the embedding model. Each `index.json` stores the model id used at build time (`LLM_WIKI_TEI_MODEL`). Query embeddings at runtime must use the **same** model, or similarity scores are meaningless.

**When to re-run `npm run index`:**

| Trigger | Action |
|---------|--------|
| First-time setup | After `npm run sync:code`, run `npm run index` once TEI is up |
| Code changes | Re-run `npm run index` when you want search to reflect new/changed files (manual; no auto-sync in v1) |
| **`LLM_WIKI_TEI_MODEL` changed** | **Must** re-run `npm run index` for all three repos before expecting semantic search to work |
| TEI service switched to a different model | Update `LLM_WIKI_TEI_MODEL` to match, then re-run `npm run index` |

**Example after model change:**

```bash
# .env — switched from bge-m3 to another model
LLM_WIKI_TEI_MODEL=BAAI/bge-large-zh-v1.5
LLM_WIKI_TEI_BASE_URL=http://127.0.0.1:8080

npm run index          # rebuild all repo indexes with the new model
npm run dev:server     # restart so semantic_search picks up fresh indexes
```

**If you forget to re-index:** llm-wiki skips indexes whose stored `model` does not match `LLM_WIKI_TEI_MODEL` and logs a warning; `semantic_search` may not register until indexes are rebuilt.

Do **not** add Docker compose, TEI install scripts, or deployment runbooks — only document the feature and env contract.

- [ ] **Step 3: Add `npm run index` to Commands table**

| 命令 | 说明 |
|------|------|
| `npm run index` | （可选）在 TEI 可用时为 `code/` 下三个 repo 构建语义索引；**更换 embedding 模型后必须重新执行** |

## Task 10: End-to-End Manual Verification

**Files:**

- No production file changes.

- [ ] **Step 1: Verify no TEI service path**

Run without TEI env:

```bash
unset LLM_WIKI_TEI_BASE_URL
LLM_WIKI_SEMANTIC_ENABLED=auto npm run dev:server
```

Expected:

- Server starts normally.
- MCP `tools/list` does not include `semantic_search`.
- Existing `ask_llm_wiki` works.

Use this curl in another terminal:

```bash
curl -s http://127.0.0.1:3001/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Expected: response contains `ask_llm_wiki` and does not contain `semantic_search`.

- [ ] **Step 2: Verify TEI service detection (optional manual step)**

If you have TEI available locally, start a service whose model matches `LLM_WIKI_TEI_MODEL` (default `BAAI/bge-m3`). Example Docker command:

```bash
docker run --rm -p 8080:80 ghcr.io/huggingface/text-embeddings-inference:cpu-1.7 --model-id BAAI/bge-m3
```

Then:

```bash
curl -s http://127.0.0.1:8080/health
```

Expected: HTTP 200 or a healthy response.

**Important:** the TEI container model id must match `LLM_WIKI_TEI_MODEL` used during `npm run index` and at server runtime. If you use a different model, set `LLM_WIKI_TEI_MODEL` to that id before indexing.

- [ ] **Step 3: Build indexes**

Run:

```bash
LLM_WIKI_TEI_BASE_URL=http://127.0.0.1:8080 \
LLM_WIKI_TEI_MODEL=BAAI/bge-m3 \
npm run index
```

Expected output:

```text
indexed chatkit-middleware: <N> chunks -> <repo>/.reasonix/semantic
indexed chatkit-web: <N> chunks -> <repo>/.reasonix/semantic
indexed finclaw: <N> chunks -> <repo>/.reasonix/semantic
```

Verify files exist:

```bash
test -f code/chatkit-middleware/.reasonix/semantic/index.json
test -f code/chatkit-web/.reasonix/semantic/index.json
test -f code/finclaw/.reasonix/semantic/index.json
```

Expected: each command exits 0.

- [ ] **Step 4: Verify semantic tool appears**

Run server:

```bash
LLM_WIKI_SEMANTIC_ENABLED=auto \
LLM_WIKI_TEI_BASE_URL=http://127.0.0.1:8080 \
LLM_WIKI_TEI_MODEL=BAAI/bge-m3 \
npm run dev:server
```

Query tools:

```bash
curl -s http://127.0.0.1:3001/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Expected: response includes both `ask_llm_wiki` and internal loop tool specs containing `semantic_search` in the llm-wiki model prompt path. If MCP only exposes `ask_llm_wiki`, verify by asking a descriptive question and checking llm-wiki trace logs for `semantic_search`.

- [ ] **Step 5: Verify fallback after TEI stops**

Stop TEI, then restart llm-wiki with:

```bash
LLM_WIKI_SEMANTIC_ENABLED=auto \
LLM_WIKI_TEI_BASE_URL=http://127.0.0.1:8080 \
npm run dev:server
```

Expected:

- Server starts normally.
- `semantic_search` is not registered inside the loop.
- Descriptive questions still work through lexical tools.

## Task 11: Final Verification Suite

**Files:**

- No production file changes.

- [ ] **Step 1: Run focused semantic tests**

Run:

```bash
npm test -- \
  tests/semantic-config.test.ts \
  tests/semantic-tei-client.test.ts \
  tests/semantic-chunker.test.ts \
  tests/semantic-index-store.test.ts \
  tests/semantic-build-index.test.ts \
  tests/semantic-search.test.ts \
  tests/semantic-tool-registration.test.ts
```

Expected: all pass.

- [ ] **Step 2: Run full test suite**

Run:

```bash
npm test
```

Expected: all tests pass. If sandbox blocks tests that bind `127.0.0.1` with `listen EPERM`, rerun outside the sandbox and record that the failure was environmental.

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: pass.

- [ ] **Step 4: Run build**

Run:

```bash
npm run build
```

Expected: frontend and TypeScript build pass.

## Rollout Notes

- Default behavior must be safe: if TEI/BGE is absent, llm-wiki starts and answers exactly as before.
- Do not make `npm run dev` depend on Docker, TEI, BGE, GPUs, or network downloads.
- Do not register `semantic_search` when it cannot work; exposing unavailable tools causes the outer agent to waste calls.
- Do not reintroduce `read_llm_wiki_result`, `cursor`, or `max_chars` for MCP result handling.
- Semantic indexes live under each cloned repo at `.reasonix/semantic/index.json`. They are **local artifacts** (inside `code/`, which llm-wiki git already ignores). Do not commit them to llm-wiki; operators run `npm run sync:code` then `npm run index` to create them.
- TEI/BGE deployment is operator-owned. README must document optional env vars and the manual index workflow; implementation does not ship TEI infra.
- Index updates are manual: re-run `npm run index` after code or model changes.
- If `LLM_WIKI_SEMANTIC_ENABLED=true` but TEI or indexes are missing, log a clear message at startup and continue without `semantic_search`.
- If `LLM_WIKI_TEI_MODEL` differs from an index file's stored `model`, skip that index and `console.warn`; README must explain that operators must re-run `npm run index` after any model change.
- v1 embeds all chunks for a repo in one TEI request during `npm run index`; very large repos may need future batching (out of scope for this plan).

## Acceptance Criteria

- llm-wiki starts with no TEI/BGE service.
- llm-wiki starts with an unreachable TEI URL when `LLM_WIKI_SEMANTIC_ENABLED=auto`.
- `npm run index` builds per-repo indexes when TEI is reachable.
- `semantic_search` is registered only when TEI probe succeeds and at least one index exists.
- Descriptive questions use semantic search when available, then verify with file/search tools.
- Exact-token questions still prefer lexical search.
- All focused tests, full test suite, typecheck, and build pass.
- README documents optional semantic search without requiring TEI for default dev.
- README includes a dedicated subsection on embedding model changes and mandatory re-indexing.

## Self-Review

- Spec coverage: optional config, TEI probing, index building, per-repo indexes, conditional tool registration, prompt strategy, fallback behavior, and verification are covered.
- Placeholder scan: no placeholder implementation steps are left; every task includes exact paths, commands, and expected outcomes.
- Type consistency: semantic config, embedding client, index records, search hits, and tool registration names are consistent across tasks.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface AuthorizedRoots {
  middleware: string;
  web: string;
  finclaw: string;
}

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

export interface LlmWikiConfig {
  projectRoot: string;
  deepseekApiKey: string;
  deepseekBaseUrl: string;
  deepseekModel: string;
  port: number;
  host: string;
  repos: AuthorizedRoots;
  semantic: SemanticConfig;
}

const DEFAULT_REPO_MIDDLEWARE = "code/chatkit-middleware";
const DEFAULT_REPO_WEB = "code/chatkit-web";
const DEFAULT_REPO_FINCLAW = "code/finclaw";

export function getProjectRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..");
}

/** Load `llm-wiki/.env` into process.env (does not override existing vars). */
export function loadEnvFile(env: NodeJS.ProcessEnv = process.env): void {
  const envPath = path.join(getProjectRoot(), ".env");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && env[key] === undefined) env[key] = value;
  }
}

function resolveRepoPath(
  projectRoot: string,
  envValue: string | undefined,
  defaultRelative: string,
): string {
  const raw = envValue?.trim() || defaultRelative;
  return path.resolve(projectRoot, raw);
}

function parseSemanticEnabled(raw: string | undefined): SemanticEnabled {
  const normalized = raw?.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return "auto";
}

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): LlmWikiConfig {
  const apiKey = env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is required");
  }

  const projectRoot = getProjectRoot();
  const chunkChars = clampInt(env.LLM_WIKI_SEMANTIC_CHUNK_CHARS, 1400, 300, 8000);
  const rawOverlap = clampInt(env.LLM_WIKI_SEMANTIC_CHUNK_OVERLAP, 200, 0, 2000);
  const chunkOverlap = Math.min(rawOverlap, chunkChars - 1);

  return {
    projectRoot,
    deepseekApiKey: apiKey,
    deepseekBaseUrl: env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com",
    deepseekModel: env.DEEPSEEK_MODEL?.trim() || "deepseek-chat",
    port: Number(env.LLM_WIKI_PORT ?? "3001"),
    host: env.LLM_WIKI_HOST?.trim() || "127.0.0.1",
    repos: {
      middleware: resolveRepoPath(
        projectRoot,
        env.REPO_CHATKIT_MIDDLEWARE,
        DEFAULT_REPO_MIDDLEWARE,
      ),
      web: resolveRepoPath(projectRoot, env.REPO_CHATKIT_WEB, DEFAULT_REPO_WEB),
      finclaw: resolveRepoPath(
        projectRoot,
        env.REPO_FINCLAW,
        DEFAULT_REPO_FINCLAW,
      ),
    },
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
  };
}

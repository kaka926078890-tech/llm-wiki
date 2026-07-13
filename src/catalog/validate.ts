import type { CatalogListKind, CatalogRepo, FeatureItem, RepoFeatureLists } from "./types.js";

export const FEATURE_LIST_SCHEMA_VERSION = 1;

const VALID_REPOS = new Set<CatalogRepo>([
  "chatkit-middleware",
  "chatkit-web",
  "finclaw",
]);

const VALID_LIST_KINDS = new Set<CatalogListKind>([
  "services",
  "apps",
  "libs",
  "admin-features",
  "modules",
  "cli",
  "not-microservice",
]);

export class CatalogStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogStoreError";
  }
}

function isFeatureItem(v: unknown): v is FeatureItem {
  if (!v || typeof v !== "object") return false;
  const o = v as FeatureItem;
  return (
    typeof o.id === "string"
    && typeof o.title === "string"
    && Array.isArray(o.sources)
    && (o.confidence === "high" || o.confidence === "medium" || o.confidence === "low")
  );
}

/** Backfill missing middleware edition tags from pre-Phase-4 JSON. */
export function normalizeFeatureLists(data: RepoFeatureLists): RepoFeatureLists {
  if (data.repo !== "chatkit-middleware") return data;
  const services = data.lists.services;
  if (!services?.length) return data;

  let changed = false;
  const normalized = services.map((item) => {
    if (item.editions?.length) return item;
    changed = true;
    return { ...item, editions: ["basic", "advance"] as const };
  });

  if (!changed) return data;
  return {
    ...data,
    lists: { ...data.lists, services: normalized as FeatureItem[] },
  };
}

export function parseRepoFeatureLists(raw: unknown): RepoFeatureLists {
  if (!raw || typeof raw !== "object") {
    throw new CatalogStoreError("feature list JSON must be an object");
  }
  const o = raw as RepoFeatureLists;
  if (!VALID_REPOS.has(o.repo)) {
    throw new CatalogStoreError(`invalid repo: ${String(o.repo)}`);
  }
  if (typeof o.generatedAt !== "string" || Number.isNaN(Date.parse(o.generatedAt))) {
    throw new CatalogStoreError("missing or invalid generatedAt");
  }
  if (!o.lists || typeof o.lists !== "object") {
    throw new CatalogStoreError("missing lists object");
  }

  for (const [kind, items] of Object.entries(o.lists)) {
    if (!VALID_LIST_KINDS.has(kind as CatalogListKind)) {
      throw new CatalogStoreError(`unknown list kind: ${kind}`);
    }
    if (!Array.isArray(items)) {
      throw new CatalogStoreError(`lists.${kind} must be an array`);
    }
    for (const item of items) {
      if (!isFeatureItem(item)) {
        throw new CatalogStoreError(`invalid item in lists.${kind}`);
      }
    }
  }

  return normalizeFeatureLists(o);
}

export function catalogListIsStale(
  data: RepoFeatureLists,
  staleDays: number,
  now = Date.now(),
): boolean {
  if (staleDays <= 0) return false;
  const ageMs = now - Date.parse(data.generatedAt);
  return ageMs > staleDays * 86_400_000;
}

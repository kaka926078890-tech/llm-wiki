import type { CatalogRepo } from "./types.js";

const SCOPE_ALIASES: Record<string, CatalogRepo> = {
  middleware: "chatkit-middleware",
  "chatkit-middleware": "chatkit-middleware",
  web: "chatkit-web",
  "chatkit-web": "chatkit-web",
  finclaw: "finclaw",
};

export const CATALOG_REPO_IDS: CatalogRepo[] = [
  "chatkit-middleware",
  "chatkit-web",
  "finclaw",
];

export function repoScopeToCatalogRepo(scope?: string): CatalogRepo | null {
  const s = scope?.trim().toLowerCase();
  if (!s || s === "all") return null;
  return SCOPE_ALIASES[s] ?? null;
}

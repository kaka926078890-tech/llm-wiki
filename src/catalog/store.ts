import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CatalogStoreError, parseRepoFeatureLists } from "./validate.js";
import type { CatalogRepo, RepoFeatureLists } from "./types.js";

export { CatalogStoreError };

export function featureListsDir(projectRoot: string): string {
  return path.join(projectRoot, ".reasonix", "feature-lists");
}

export function featureListPath(projectRoot: string, repo: CatalogRepo): string {
  return path.join(featureListsDir(projectRoot), `${repo}.json`);
}

export function loadRepoFeatureLists(
  projectRoot: string,
  repo: CatalogRepo,
): RepoFeatureLists | null {
  const file = featureListPath(projectRoot, repo);
  if (!existsSync(file)) return null;
  try {
    return parseRepoFeatureLists(JSON.parse(readFileSync(file, "utf-8")));
  } catch (err) {
    if (err instanceof CatalogStoreError) throw err;
    throw new CatalogStoreError(
      `failed to parse ${file}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function saveRepoFeatureLists(
  projectRoot: string,
  data: RepoFeatureLists,
): void {
  const dir = featureListsDir(projectRoot);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    featureListPath(projectRoot, data.repo),
    `${JSON.stringify(data, null, 2)}\n`,
    "utf-8",
  );
}

export function exportBenchmarkCatalog(
  projectRoot: string,
  data: RepoFeatureLists,
  listKind: keyof RepoFeatureLists["lists"],
): void {
  const items = data.lists[listKind];
  if (!items?.length) return;
  const dir = path.join(projectRoot, "benchmarks", "catalogs");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, `${data.repo}.${listKind}.json`),
    `${JSON.stringify({ repo: data.repo, listKind, names: items.map((i) => i.title), ids: items.map((i) => i.id), generatedAt: data.generatedAt }, null, 2)}\n`,
  );
}

export function appendCatalogDriftRecord(
  projectRoot: string,
  record: { at: string; repo: CatalogRepo; drifts: unknown[] },
): void {
  const dir = path.join(projectRoot, ".reasonix");
  mkdirSync(dir, { recursive: true });
  appendFileSync(
    path.join(dir, "catalog-drift.jsonl"),
    `${JSON.stringify(record)}\n`,
    "utf-8",
  );
}

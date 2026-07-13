import type { CatalogListKind, CatalogRepo, FeatureItem, RepoFeatureLists } from "./types.js";

export interface ListDrift {
  listKind: string;
  added: string[];
  removed: string[];
  summaryChanged: string[];
}

function titlesById(items: FeatureItem[]): Map<string, FeatureItem> {
  return new Map(items.map((i) => [i.id, i]));
}

export function diffRepoFeatureLists(
  prev: RepoFeatureLists | null,
  next: RepoFeatureLists,
): ListDrift[] {
  const kinds = new Set<CatalogListKind>([
    ...(Object.keys(prev?.lists ?? {}) as CatalogListKind[]),
    ...(Object.keys(next.lists) as CatalogListKind[]),
  ]);
  const drifts: ListDrift[] = [];

  for (const listKind of kinds) {
    const oldItems = prev?.lists[listKind] ?? [];
    const newItems = next.lists[listKind] ?? [];
    const oldMap = titlesById(oldItems);
    const newMap = titlesById(newItems);

    const added = [...newMap.keys()]
      .filter((id) => !oldMap.has(id))
      .map((id) => newMap.get(id)!.title);
    const removed = [...oldMap.keys()]
      .filter((id) => !newMap.has(id))
      .map((id) => oldMap.get(id)!.title);
    const summaryChanged = [...newMap.keys()]
      .filter((id) => {
        const o = oldMap.get(id);
        const n = newMap.get(id)!;
        return o !== undefined && o.summary !== n.summary;
      })
      .map((id) => newMap.get(id)!.title);

    if (added.length || removed.length || summaryChanged.length) {
      drifts.push({ listKind, added, removed, summaryChanged });
    }
  }

  return drifts;
}

/** ponytail: stdout + jsonl; upgrade path = structured log / CI gate */
export function logCatalogDrift(
  repo: CatalogRepo,
  drifts: ListDrift[],
  hasBaseline: boolean,
): void {
  if (!hasBaseline) {
    console.log(`[catalog:drift] ${repo}: first run (no baseline)`);
    return;
  }
  if (!drifts.length) {
    console.log(`[catalog:drift] ${repo}: no changes`);
    return;
  }
  for (const d of drifts) {
    const parts: string[] = [];
    if (d.added.length) parts.push(`+${d.added.join(", ")}`);
    if (d.removed.length) parts.push(`-${d.removed.join(", ")}`);
    if (d.summaryChanged.length) parts.push(`~summary:${d.summaryChanged.join(", ")}`);
    console.log(`[catalog:drift] ${repo}/${d.listKind}: ${parts.join(" ")}`);
  }
}

import type { AnswerProfile, LlmWikiConfig } from "../config.js";
import { detectCatalogIntent } from "./intent.js";
import { loadCatalogRules } from "./rules.js";
import { loadRepoFeatureLists } from "./store.js";
import type {
  CatalogListKind,
  FeatureItem,
  MiddlewareEdition,
  RepoFeatureLists,
} from "./types.js";
import { renderFeatureListAnswer } from "./render.js";

export function isCatalogListingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const n = env.LLM_WIKI_CATALOG_LISTING?.trim().toLowerCase();
  return n === "true" || n === "1" || n === "yes";
}

export function missingCatalogRefuseMessage(): string {
  return (
    "功能清单尚未生成，无法回答该清单类问题。请先运行：npm run sync:code:full"
  );
}

function filterMiddlewareEdition(
  items: FeatureItem[],
  edition: MiddlewareEdition,
): FeatureItem[] {
  if (edition === "advance") return items;
  return items.filter((i) => i.editions?.includes("basic"));
}

function itemsForIntent(
  lists: RepoFeatureLists,
  listKind: CatalogListKind,
  editionFilter?: MiddlewareEdition,
): FeatureItem[] {
  if (listKind === "not-microservice") return [];
  let items = lists.lists[listKind] ?? [];
  if (editionFilter && lists.repo === "chatkit-middleware" && listKind === "services") {
    items = filterMiddlewareEdition(items, editionFilter);
  }
  return items;
}

export function buildCatalogListingAnswer(input: {
  cfg: LlmWikiConfig;
  question: string;
  repoScope?: string;
  profile: AnswerProfile;
}): string | null {
  const intent = detectCatalogIntent(input.question, input.repoScope);
  if (!intent) return null;

  const lists = loadRepoFeatureLists(input.cfg.projectRoot, intent.repo);
  if (!lists) return missingCatalogRefuseMessage();

  const items = itemsForIntent(lists, intent.listKind, intent.editionFilter);
  if (
    intent.listKind !== "not-microservice" &&
    items.length === 0 &&
    loadCatalogRules(input.cfg.projectRoot).shared.missingListBehavior === "refuse_sync_hint"
  ) {
    return missingCatalogRefuseMessage();
  }

  return renderFeatureListAnswer({
    lists,
    listKind: intent.listKind,
    items,
    profile: input.profile,
    projectRoot: input.cfg.projectRoot,
    alsoAppsNote: intent.listKind === "admin-features",
    editionFilter: intent.editionFilter,
  });
}

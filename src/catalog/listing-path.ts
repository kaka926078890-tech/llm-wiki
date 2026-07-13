import type { AnswerProfile, LlmWikiConfig } from "../config.js";
import { detectCatalogIntent, type CatalogIntent } from "./intent.js";
import { lintCatalogAnswerSubset } from "./g3-lint.js";
import { loadCatalogRules } from "./rules.js";
import { loadRepoFeatureLists } from "./store.js";
import { catalogListIsStale } from "./validate.js";
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

export function g3SubsetRefuseMessage(extra: string[]): string {
  return (
    `清单答案含表外条目（${extra.join(", ")}），已拒绝返回。请检查 catalog:gen 与渲染逻辑。`
  );
}

export function staleCatalogWarnMessage(repo: string, generatedAt: string): string {
  return `[catalog] warning: ${repo} feature list may be stale (generatedAt=${generatedAt})`;
}

function filterMiddlewareEdition(
  items: FeatureItem[],
  edition: MiddlewareEdition,
): FeatureItem[] {
  if (edition === "advance") return items;
  return items.filter((i) => {
    if (!i.editions?.length) return true;
    return i.editions.includes("basic");
  });
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
  /** When provided, skip re-detecting intent (used by tryCatalogListingResult). */
  intent?: CatalogIntent;
}): string | null {
  const rules = loadCatalogRules(input.cfg.projectRoot);
  const intent =
    input.intent ?? detectCatalogIntent(input.question, input.repoScope, rules);
  if (!intent) return null;

  const lists = loadRepoFeatureLists(input.cfg.projectRoot, intent.repo);
  if (!lists) return missingCatalogRefuseMessage();

  if (catalogListIsStale(lists, rules.shared.catalogStaleDays)) {
    console.warn(staleCatalogWarnMessage(lists.repo, lists.generatedAt));
  }

  const items = itemsForIntent(lists, intent.listKind, intent.editionFilter);
  if (
    intent.listKind !== "not-microservice" &&
    items.length === 0 &&
    rules.shared.missingListBehavior === "refuse_sync_hint"
  ) {
    return missingCatalogRefuseMessage();
  }

  const answer = renderFeatureListAnswer({
    lists,
    listKind: intent.listKind,
    items,
    profile: input.profile,
    projectRoot: input.cfg.projectRoot,
    alsoAppsNote: intent.listKind === "admin-features",
    editionFilter: intent.editionFilter,
  });

  if (!rules.shared.allowExtraItems) {
    const g3Items =
      intent.listKind === "not-microservice"
        ? [...(lists.lists.modules ?? []), ...(lists.lists.cli ?? [])]
        : items;
    const violations = lintCatalogAnswerSubset(answer, g3Items, { allowExtraItems: false });
    if (violations.length) {
      console.warn(
        `[catalog] G3 subset refuse: ${violations.map((v) => v.token).join(", ")}`,
      );
      return g3SubsetRefuseMessage(violations.map((v) => v.token));
    }
  }

  return answer;
}

export function tryCatalogListingResult(input: {
  cfg: LlmWikiConfig;
  question: string;
  repoScope?: string;
  profile: AnswerProfile;
}): { answer: string; intent: CatalogIntent } | null {
  const rules = loadCatalogRules(input.cfg.projectRoot);
  const intent = detectCatalogIntent(input.question, input.repoScope, rules);
  if (!intent) return null;
  const answer = buildCatalogListingAnswer({ ...input, intent });
  if (answer === null) return null;
  return { answer, intent };
}

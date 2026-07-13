import type { CatalogListKind, CatalogRepo, MiddlewareEdition } from "./types.js";
import { repoScopeToCatalogRepo } from "./scope.js";
import { loadCatalogRules } from "./rules.js";
import type { CatalogRules } from "./rules.js";

const MW_RE = /chatkit-middleware|middleware/i;
const WEB_RE = /chatkit-web/i;
const FIN_RE = /finclaw/i;

export interface CatalogIntent {
  repo: CatalogRepo;
  listKind: CatalogListKind;
  editionFilter?: MiddlewareEdition;
}

export function detectMiddlewareEditionFilter(question: string): MiddlewareEdition | undefined {
  if (/基础版|basic\s*edition/i.test(question)) return "basic";
  if (/进阶版|高级版|advance\s*edition/i.test(question)) return "advance";
  return undefined;
}

function resolveWebListKind(q: string, scoped: boolean, rules: CatalogRules): CatalogListKind {
  if (/管理后台|admin/i.test(q)) return "admin-features";
  if (/应用|app|workspace|frontend|移动端/i.test(q)) return "apps";
  return rules.web.defaultFeatureList;
}

export function detectCatalogIntent(
  question: string,
  repoScope?: string,
  rules: CatalogRules = loadCatalogRules(),
): CatalogIntent | null {
  const q = question.trim();
  const scoped = repoScopeToCatalogRepo(repoScope);

  if (
    rules.finclaw.microserviceRedirect
    && FIN_RE.test(q)
    && /微服务/.test(q)
  ) {
    return { repo: "finclaw", listKind: "not-microservice" };
  }

  if ((scoped === "finclaw" || (!scoped && FIN_RE.test(q))) && /cli|子命令|命令/i.test(q)) {
    return { repo: "finclaw", listKind: "cli" };
  }
  if ((scoped === "finclaw" || (!scoped && FIN_RE.test(q))) && /模块|crate/i.test(q)) {
    return { repo: "finclaw", listKind: "modules" };
  }
  if (scoped === "finclaw" || (!scoped && FIN_RE.test(q) && /清单|列表|有哪些|功能/.test(q))) {
    return { repo: "finclaw", listKind: "modules" };
  }

  if (scoped === "chatkit-web" || (!scoped && WEB_RE.test(q))) {
    if (/管理后台|admin/i.test(q)) {
      return { repo: "chatkit-web", listKind: "admin-features" };
    }
    if (/应用|app|workspace|frontend|移动端/i.test(q)) {
      return { repo: "chatkit-web", listKind: "apps" };
    }
    if (/清单|列表|有哪些|功能/.test(q)) {
      return {
        repo: "chatkit-web",
        listKind: resolveWebListKind(q, scoped === "chatkit-web", rules),
      };
    }
  }

  if (
    scoped === "chatkit-middleware" ||
    (!scoped && MW_RE.test(q)) ||
    (/微服务|功能清单|服务清单|有哪些服务/.test(q) && !WEB_RE.test(q) && !FIN_RE.test(q))
  ) {
    const editionFilter = detectMiddlewareEditionFilter(q);
    return {
      repo: "chatkit-middleware",
      listKind: "services",
      ...(editionFilter ? { editionFilter } : {}),
    };
  }

  return null;
}

export function isCatalogListingQuestion(
  question: string,
  repoScope?: string,
  rules?: CatalogRules,
): boolean {
  return detectCatalogIntent(question, repoScope, rules) !== null;
}

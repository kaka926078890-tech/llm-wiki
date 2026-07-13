import type { CatalogListKind, CatalogRepo, MiddlewareEdition } from "./types.js";
import { repoScopeToCatalogRepo } from "./generate.js";

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

export function detectCatalogIntent(
  question: string,
  repoScope?: string,
): CatalogIntent | null {
  const q = question.trim();
  const scoped = repoScopeToCatalogRepo(repoScope);

  if (FIN_RE.test(q) && /微服务/.test(q)) {
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

  if ((scoped === "chatkit-web" || (!scoped && WEB_RE.test(q))) && /管理后台|admin/.test(q)) {
    return { repo: "chatkit-web", listKind: "admin-features" };
  }
  if ((scoped === "chatkit-web" || (!scoped && WEB_RE.test(q))) && /应用|app|workspace/.test(q)) {
    return { repo: "chatkit-web", listKind: "apps" };
  }
  if (scoped === "chatkit-web" || (!scoped && WEB_RE.test(q) && /清单|列表|有哪些|功能/.test(q))) {
    return { repo: "chatkit-web", listKind: "admin-features" };
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

export function isCatalogListingQuestion(question: string, repoScope?: string): boolean {
  return detectCatalogIntent(question, repoScope) !== null;
}

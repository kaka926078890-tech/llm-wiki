import type { AuthorizedRoots } from "../config.js";
import { diffRepoFeatureLists, logCatalogDrift } from "./drift.js";
import { exportBenchmarkCatalog, loadRepoFeatureLists, saveRepoFeatureLists } from "./store.js";
import type { CatalogRepo, RepoFeatureLists } from "./types.js";
import { extractMiddlewareServices } from "./extract/middleware.js";
import { extractChatkitWeb } from "./extract/chatkit-web.js";
import { extractFinclawCrates, extractFinclawCli } from "./extract/finclaw.js";

export function generateAllFeatureLists(
  projectRoot: string,
  repos: AuthorizedRoots,
): RepoFeatureLists[] {
  const now = new Date().toISOString();
  const out: RepoFeatureLists[] = [];

  const mw: RepoFeatureLists = {
    repo: "chatkit-middleware",
    generatedAt: now,
    lists: {
      services: extractMiddlewareServices(repos.middleware),
    },
  };
  logCatalogDrift(mw.repo, diffRepoFeatureLists(loadRepoFeatureLists(projectRoot, mw.repo), mw));
  saveRepoFeatureLists(projectRoot, mw);
  exportBenchmarkCatalog(projectRoot, mw, "services");
  out.push(mw);

  const webData = extractChatkitWeb(repos.web);
  const web: RepoFeatureLists = {
    repo: "chatkit-web",
    generatedAt: now,
    lists: {
      apps: webData.apps,
      libs: webData.libs,
      "admin-features": webData.adminFeatures,
    },
  };
  logCatalogDrift(web.repo, diffRepoFeatureLists(loadRepoFeatureLists(projectRoot, web.repo), web));
  saveRepoFeatureLists(projectRoot, web);
  exportBenchmarkCatalog(projectRoot, web, "apps");
  exportBenchmarkCatalog(projectRoot, web, "admin-features");
  out.push(web);

  const fin: RepoFeatureLists = {
    repo: "finclaw",
    generatedAt: now,
    lists: {
      modules: extractFinclawCrates(repos.finclaw),
      cli: extractFinclawCli(repos.finclaw),
    },
  };
  logCatalogDrift(fin.repo, diffRepoFeatureLists(loadRepoFeatureLists(projectRoot, fin.repo), fin));
  saveRepoFeatureLists(projectRoot, fin);
  exportBenchmarkCatalog(projectRoot, fin, "modules");
  exportBenchmarkCatalog(projectRoot, fin, "cli");
  out.push(fin);

  return out;
}

export function repoScopeToCatalogRepo(scope?: string): CatalogRepo | null {
  const s = scope?.trim().toLowerCase();
  if (!s || s === "all") return null;
  if (s === "middleware" || s === "chatkit-middleware") return "chatkit-middleware";
  if (s === "web" || s === "chatkit-web") return "chatkit-web";
  if (s === "finclaw") return "finclaw";
  return null;
}

import type { AuthorizedRoots } from "../config.js";
import { diffRepoFeatureLists, logCatalogDrift } from "./drift.js";
import { loadCatalogRules } from "./rules.js";
import {
  appendCatalogDriftRecord,
  exportBenchmarkCatalog,
  loadRepoFeatureLists,
  saveRepoFeatureLists,
} from "./store.js";
import type { RepoFeatureLists } from "./types.js";
import { extractMiddlewareServices } from "./extract/middleware.js";
import { extractChatkitWeb } from "./extract/chatkit-web.js";
import { extractFinclawCrates, extractFinclawCli } from "./extract/finclaw.js";

function saveWithDrift(projectRoot: string, data: RepoFeatureLists): void {
  const prev = loadRepoFeatureLists(projectRoot, data.repo);
  const drifts = diffRepoFeatureLists(prev, data);
  logCatalogDrift(data.repo, drifts, prev !== null);
  if (drifts.length) {
    appendCatalogDriftRecord(projectRoot, {
      at: new Date().toISOString(),
      repo: data.repo,
      drifts,
    });
  }
  saveRepoFeatureLists(projectRoot, data);
}

export function generateAllFeatureLists(
  projectRoot: string,
  repos: AuthorizedRoots,
): RepoFeatureLists[] {
  const rules = loadCatalogRules(projectRoot);
  const now = new Date().toISOString();
  const out: RepoFeatureLists[] = [];

  const mw: RepoFeatureLists = {
    repo: "chatkit-middleware",
    generatedAt: now,
    lists: {
      services: extractMiddlewareServices(repos.middleware, rules),
    },
  };
  saveWithDrift(projectRoot, mw);
  exportBenchmarkCatalog(projectRoot, mw, "services");
  out.push(mw);

  const webData = extractChatkitWeb(repos.web, rules);
  const web: RepoFeatureLists = {
    repo: "chatkit-web",
    generatedAt: now,
    lists: {
      apps: webData.apps,
      libs: webData.libs,
      "admin-features": webData.adminFeatures,
    },
  };
  saveWithDrift(projectRoot, web);
  exportBenchmarkCatalog(projectRoot, web, "apps");
  exportBenchmarkCatalog(projectRoot, web, "admin-features");
  out.push(web);

  const fin: RepoFeatureLists = {
    repo: "finclaw",
    generatedAt: now,
    lists: {
      modules: extractFinclawCrates(repos.finclaw, rules),
      cli: extractFinclawCli(repos.finclaw, rules),
    },
  };
  saveWithDrift(projectRoot, fin);
  exportBenchmarkCatalog(projectRoot, fin, "modules");
  exportBenchmarkCatalog(projectRoot, fin, "cli");
  out.push(fin);

  return out;
}

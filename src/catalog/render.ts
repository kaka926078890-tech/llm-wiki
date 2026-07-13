import type { AnswerProfile } from "../config.js";
import { loadCatalogRules } from "./rules.js";
import {
  finclawNotMicroserviceBody,
  webAdminAppsNote,
  webIncompleteDocsDisclaimer,
} from "./copy.js";
import type {
  CatalogListKind,
  FeatureItem,
  MiddlewareEdition,
  RepoFeatureLists,
} from "./types.js";
import { itemTitlesForMetrics } from "./metrics.js";

function sectionHeading(
  kind: CatalogListKind,
  repo: string,
  editionFilter?: MiddlewareEdition,
): string {
  switch (kind) {
    case "services":
      if (editionFilter === "basic") {
        return `${repo} 基础版微服务清单（共 {count} 项，来源：edition-manifest）`;
      }
      if (editionFilter === "advance") {
        return `${repo} 进阶版微服务清单（共 {count} 项，来源：edition-manifest）`;
      }
      return `${repo} 微服务清单（共 {count} 项，来源：edition-manifest）`;
    case "apps":
      return `${repo} 前端应用（共 {count} 项）`;
    case "libs":
      return `${repo} 共享库（共 {count} 项）`;
    case "admin-features":
      return `${repo} 管理后台功能入口（共 {count} 项）`;
    case "modules":
      return `${repo} 模块清单（共 {count} 项，Rust crates）`;
    case "cli":
      return `${repo} CLI 子命令（共 {count} 项）`;
    case "not-microservice":
      return "";
    default:
      return `${repo} 清单（共 {count} 项）`;
  }
}

export function renderNotMicroserviceAnswer(
  profile: AnswerProfile,
  projectRoot: string,
): string {
  return finclawNotMicroserviceBody(profile, loadCatalogRules(projectRoot));
}

export function renderFeatureListAnswer(input: {
  lists: RepoFeatureLists;
  listKind: CatalogListKind;
  items: FeatureItem[];
  profile: AnswerProfile;
  projectRoot: string;
  alsoAppsNote?: boolean;
  editionFilter?: MiddlewareEdition;
}): string {
  const rules = loadCatalogRules(input.projectRoot);
  const { items, listKind, lists, profile } = input;

  if (listKind === "not-microservice") {
    const mod = lists.lists.modules ?? [];
    const cli = lists.lists.cli ?? [];
    const parts = [renderNotMicroserviceAnswer(profile, input.projectRoot)];
    if (mod.length) {
      parts.push(renderSection("模块", mod, profile, rules.shared.publicShowPaths));
    }
    if (cli.length) {
      parts.push(renderSection("CLI 子命令", cli, profile, rules.shared.publicShowPaths));
    }
    return parts.join("\n\n");
  }

  const heading = sectionHeading(listKind, lists.repo, input.editionFilter).replace(
    "{count}",
    String(items.length),
  );
  const lines: string[] = [heading];

  if (input.alsoAppsNote && listKind === "admin-features") {
    lines.push(webAdminAppsNote(rules));
  }

  if (
    rules.web.incompleteDocsDisclaimer &&
    lists.repo === "chatkit-web" &&
    profile === "public"
  ) {
    lines.push(webIncompleteDocsDisclaimer(rules));
  }

  for (const item of items) {
    const bullet = item.summary
      ? `- **${item.title}**：${item.summary}`
      : `- **${item.title}**`;
    lines.push(bullet);
    if (profile === "debug" && rules.shared.publicShowPaths) {
      lines.push(`  - 来源：${item.sources.join(", ")}`);
    } else if (profile === "debug") {
      lines.push(`  - id: ${item.id}`);
    }
  }

  return lines.join("\n");
}

function renderSection(
  title: string,
  items: FeatureItem[],
  profile: AnswerProfile,
  showSources: boolean,
): string {
  const lines = [`### ${title}（共 ${items.length} 项）`];
  for (const item of items) {
    lines.push(`- **${item.title}**`);
    if (profile === "debug" && showSources) {
      lines.push(`  - 来源：${item.sources.join(", ")}`);
    }
  }
  return lines.join("\n");
}

export { itemTitlesForMetrics } from "./metrics.js";

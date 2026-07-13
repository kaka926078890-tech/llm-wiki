import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getProjectRoot } from "../config.js";
import type { MiddlewareEdition } from "./types.js";

export interface CatalogRules {
  middleware: {
    defaultFeatureList: "services";
    /** Always merge basic+advance for default answers; edition filter applied at query time. */
    editions: "merge_basic_and_advance";
    editionNames: MiddlewareEdition[];
    excludeKinds: string[];
  };
  web: {
    defaultFeatureList: "apps" | "admin-features";
    librariesInAppList: boolean;
    libDirPrefix: string;
    excludePaths: string[];
    incompleteDocsDisclaimer: boolean;
    adminAppPaths: { appTsx: string; zhLocale: string };
    adminSectionLayoutKeys: Record<string, string>;
    adminPageLayoutKeys: Record<string, string>;
    /** Explicit path → layout key (overrides heuristic / legacy redirect names). */
    adminPathLayoutKeys: Record<string, string>;
  };
  finclaw: {
    excludeVendor: boolean;
    vendorDirNames: string[];
    cratesDir: string;
    cliArgsPath: string;
    microserviceRedirect: boolean;
  };
  shared: {
    publicShowPaths: boolean;
    missingListBehavior: "refuse_sync_hint";
    allowExtraItems: boolean;
    catalogStaleDays: number;
    copy: {
      finclawNotMicroservice: string;
      webAdminAppsNote: string;
      webIncompleteDocsDisclaimer: string;
    };
  };
}

export const DEFAULT_CATALOG_RULES: CatalogRules = {
  middleware: {
    defaultFeatureList: "services",
    editions: "merge_basic_and_advance",
    editionNames: ["basic", "advance"],
    excludeKinds: ["infrastructure"],
  },
  web: {
    defaultFeatureList: "admin-features",
    librariesInAppList: false,
    libDirPrefix: "libs/",
    excludePaths: ["/login", "/"],
    incompleteDocsDisclaimer: true,
    adminAppPaths: {
      appTsx: "chatkit-admin-mt/src/App.tsx",
      zhLocale: "chatkit-admin-mt/src/locales/zh.json",
    },
    adminSectionLayoutKeys: {
      channels: "channels",
      "exec-policy": "execPolicy",
      "tool-policy": "toolInvocationPolicy",
      usage: "tokenUsage",
      "domain-allowlist": "domainAllowlist",
      "execution-logs": "executionLogs",
      llm: "llmConfig",
      users: "tenantUsers",
    },
    adminPageLayoutKeys: {
      PlatformSettingsPage: "platformSettings",
      UsersPage: "userManagement",
      PlatformSkillsPage: "platformSkillCatalog",
      TemplatesPage: "characterTemplates",
      TenantSkillsConfigPage: "sharedSkillCatalog",
      LLMConfigPage: "llmConfig",
      TenantsPage: "tenantManagement",
    },
    adminPathLayoutKeys: {
      "/shared/skills": "sharedSkillCatalog",
      "/admin/skills": "sharedSkillCatalog",
      "/platform/skills": "platformSkillCatalog",
    },
  },
  finclaw: {
    excludeVendor: true,
    vendorDirNames: ["vendor"],
    cratesDir: "crates",
    cliArgsPath: "hosts/cli/src/args.rs",
    microserviceRedirect: true,
  },
  shared: {
    publicShowPaths: false,
    missingListBehavior: "refuse_sync_hint",
    allowExtraItems: false,
    catalogStaleDays: 14,
    copy: {
      finclawNotMicroservice:
        "finclaw 不是微服务架构，而是 Rust 工作区单体/CLI 运行时。以下为模块与 CLI 能力清单。",
      webAdminAppsNote:
        "说明：另有用户端应用 finclaw-frontend 与移动端 chatkit-mobile（见应用清单）。",
      webIncompleteDocsDisclaimer:
        "说明：以下为界面/工程可枚举的功能入口，不是完整商业功能说明书。",
    },
  },
};

function parseInlineList(block: string, key: string): string[] {
  const m = block.match(new RegExp(`${key}:\\s*\\[([^\\]]*)\\]`));
  if (!m) return [];
  return m[1]!
    .split(",")
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

function parseScalar(block: string, key: string): string | undefined {
  const m = block.match(new RegExp(`^\\s*${key}:\\s*(.+?)\\s*$`, "m"));
  return m?.[1]?.trim().replace(/^['"]|['"]$/g, "");
}

function parseBoolVal(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return fallback;
}

function sectionBlock(text: string, name: string): string {
  const re = new RegExp(`^${name}:\\n([\\s\\S]*?)(?=^[a-z].*:|^shared:|$)`, "m");
  return text.match(re)?.[1] ?? "";
}

function parseStringMap(block: string, key: string): Record<string, string> {
  const lines = block.split("\n");
  const out: Record<string, string> = {};
  let inMap = false;
  for (const line of lines) {
    if (new RegExp(`^\\s*${key}:\\s*$`).test(line)) {
      inMap = true;
      continue;
    }
    if (inMap && /^\s{2}\w/.test(line) && !/^\s{4}/.test(line)) break;
    if (!inMap) continue;
    const m = line.match(/^\s{4}(\S+):\s*(.+?)\s*$/);
    if (m) out[m[1]!] = m[2]!.replace(/^['"]|['"]$/g, "");
  }
  return out;
}

export function parseCatalogRulesYaml(text: string): CatalogRules {
  const d = structuredClone(DEFAULT_CATALOG_RULES);
  const mw = sectionBlock(text, "middleware");
  const web = sectionBlock(text, "chatkit-web");
  const fin = sectionBlock(text, "finclaw");
  const shared = sectionBlock(text, "shared");

  if (parseScalar(mw, "default_feature_list") === "services") {
    d.middleware.defaultFeatureList = "services";
  }
  const editions = parseScalar(mw, "editions");
  if (editions === "merge_basic_and_advance") {
    d.middleware.editions = editions;
  }
  const mwEditionNames = parseInlineList(mw, "edition_names");
  if (mwEditionNames.length) {
    d.middleware.editionNames = mwEditionNames as MiddlewareEdition[];
  }
  const excludeKinds = parseInlineList(mw, "exclude_kinds");
  if (excludeKinds.length) d.middleware.excludeKinds = excludeKinds;

  if (parseScalar(web, "default_feature_list") === "apps") {
    d.web.defaultFeatureList = "apps";
  } else if (parseScalar(web, "default_feature_list") === "admin-features") {
    d.web.defaultFeatureList = "admin-features";
  }
  d.web.librariesInAppList = parseBoolVal(
    parseScalar(web, "libraries_in_app_list"),
    d.web.librariesInAppList,
  );
  const libPrefix = parseScalar(web, "lib_dir_prefix");
  if (libPrefix) d.web.libDirPrefix = libPrefix;
  const excludePaths = parseInlineList(web, "exclude_paths");
  if (excludePaths.length) d.web.excludePaths = excludePaths;
  d.web.incompleteDocsDisclaimer = parseBoolVal(
    parseScalar(web, "incomplete_docs_disclaimer"),
    d.web.incompleteDocsDisclaimer,
  );
  Object.assign(d.web.adminSectionLayoutKeys, parseStringMap(web, "admin_section_layout_keys"));
  Object.assign(d.web.adminPageLayoutKeys, parseStringMap(web, "admin_page_layout_keys"));
  Object.assign(d.web.adminPathLayoutKeys, parseStringMap(web, "admin_path_layout_keys"));
  const appPaths = parseStringMap(web, "admin_app_paths");
  if (appPaths.app_tsx) d.web.adminAppPaths.appTsx = appPaths.app_tsx;
  if (appPaths.zh_locale) d.web.adminAppPaths.zhLocale = appPaths.zh_locale;

  d.finclaw.excludeVendor = parseBoolVal(parseScalar(fin, "exclude_vendor"), d.finclaw.excludeVendor);
  const vendorDirs = parseInlineList(fin, "vendor_dir_names");
  if (vendorDirs.length) d.finclaw.vendorDirNames = vendorDirs;
  const cratesDir = parseScalar(fin, "crates_dir");
  if (cratesDir) d.finclaw.cratesDir = cratesDir;
  const cliPath = parseScalar(fin, "cli_args_path");
  if (cliPath) d.finclaw.cliArgsPath = cliPath;
  if (parseScalar(fin, "microservice_question") === "redirect_to_modules_cli") {
    d.finclaw.microserviceRedirect = true;
  } else if (parseScalar(fin, "microservice_question") === "false") {
    d.finclaw.microserviceRedirect = false;
  }

  d.shared.publicShowPaths = parseBoolVal(parseScalar(shared, "public_show_paths"), d.shared.publicShowPaths);
  d.shared.allowExtraItems = parseBoolVal(parseScalar(shared, "allow_extra_items"), d.shared.allowExtraItems);
  const staleDays = parseScalar(shared, "catalog_stale_days");
  if (staleDays && !Number.isNaN(Number(staleDays))) {
    d.shared.catalogStaleDays = Number(staleDays);
  }
  const copyLines = shared.match(/^\s{2}copy:\n([\s\S]*?)(?=^\s{2}\w|$)/m)?.[1] ?? "";
  const finMs = parseScalar(copyLines, "finclaw_not_microservice");
  if (finMs) d.shared.copy.finclawNotMicroservice = finMs;
  const appsNote = parseScalar(copyLines, "web_admin_apps_note");
  if (appsNote) d.shared.copy.webAdminAppsNote = appsNote;
  const inc = parseScalar(copyLines, "web_incomplete_docs_disclaimer");
  if (inc) d.shared.copy.webIncompleteDocsDisclaimer = inc;

  return d;
}

export function loadCatalogRules(projectRoot = getProjectRoot()): CatalogRules {
  const file = path.join(projectRoot, "config", "catalog-rules.yaml");
  if (!existsSync(file)) return DEFAULT_CATALOG_RULES;
  return parseCatalogRulesYaml(readFileSync(file, "utf-8"));
}

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getProjectRoot } from "../config.js";

export interface CatalogRules {
  middleware: {
    defaultFeatureList: "services";
  };
  web: {
    librariesInAppList: boolean;
    excludePaths: string[];
    incompleteDocsDisclaimer: boolean;
  };
  finclaw: {
    excludeVendor: boolean;
  };
  shared: {
    publicShowPaths: boolean;
    missingListBehavior: "refuse_sync_hint";
    allowExtraItems: boolean;
  };
}

const DEFAULTS: CatalogRules = {
  middleware: { defaultFeatureList: "services" },
  web: {
    librariesInAppList: false,
    excludePaths: ["/login", "/"],
    incompleteDocsDisclaimer: true,
  },
  finclaw: { excludeVendor: true },
  shared: {
    publicShowPaths: false,
    missingListBehavior: "refuse_sync_hint",
    allowExtraItems: false,
  },
};

export function loadCatalogRules(projectRoot = getProjectRoot()): CatalogRules {
  const file = path.join(projectRoot, "config", "catalog-rules.yaml");
  if (!existsSync(file)) return DEFAULTS;
  const text = readFileSync(file, "utf-8");
  return {
    middleware: {
      defaultFeatureList:
        /default_feature_list:\s*(\w+)/.test(text) &&
        text.match(/default_feature_list:\s*(\w+)/)?.[1] === "services"
          ? "services"
          : DEFAULTS.middleware.defaultFeatureList,
    },
    web: {
      librariesInAppList: /libraries_in_app_list:\s*false/.test(text)
        ? false
        : DEFAULTS.web.librariesInAppList,
      excludePaths: DEFAULTS.web.excludePaths,
      incompleteDocsDisclaimer: /incomplete_docs_disclaimer:\s*true/.test(text),
    },
    finclaw: {
      excludeVendor: /exclude_vendor:\s*true/.test(text),
    },
    shared: {
      publicShowPaths: !/public_show_paths:\s*false/.test(text)
        ? DEFAULTS.shared.publicShowPaths
        : false,
      missingListBehavior: "refuse_sync_hint",
      allowExtraItems: /allow_extra_items:\s*false/.test(text)
        ? false
        : DEFAULTS.shared.allowExtraItems,
    },
  };
}

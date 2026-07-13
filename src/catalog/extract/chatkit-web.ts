import { readFileSync } from "node:fs";
import path from "node:path";
import type { CatalogRules } from "../rules.js";
import type { FeatureItem } from "../types.js";

function kebabSegmentToLayoutKey(segment: string): string {
  return segment.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function resolveLayoutTitle(
  layout: Record<string, string>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const title = layout[key]?.trim();
    if (title) return title;
  }
  return undefined;
}

// Normalize tenant param routes to star form for path-key lookup.
function normalizeRoutePattern(routePath: string): string {
  return routePath.replace(/\/:[^/]+/g, "/*");
}

function routeContext(appTsx: string, routePath: string): string {
  const idx = appTsx.indexOf(`path="${routePath}"`);
  if (idx < 0) return "";
  return appTsx.slice(idx, idx + 800);
}

function layoutKeyForRoute(
  appTsx: string,
  routePath: string,
  rules: CatalogRules,
  seen = new Set<string>(),
): string {
  const pathOverride =
    rules.web.adminPathLayoutKeys[routePath]
    ?? rules.web.adminPathLayoutKeys[normalizeRoutePattern(routePath)];
  if (pathOverride) return pathOverride;

  if (seen.has(routePath)) {
    return kebabSegmentToLayoutKey(routePath.split("/").filter((s) => !s.startsWith(":")).pop() ?? "");
  }
  seen.add(routePath);
  const ctx = routeContext(appTsx, routePath);

  const sectionM = ctx.match(/section="([^"]+)"/);
  if (sectionM) {
    const section = sectionM[1]!;
    return rules.web.adminSectionLayoutKeys[section] ?? kebabSegmentToLayoutKey(section);
  }

  const tenantSection = routePath.match(/^\/tenants\/:[^/]+\/([^/]+)$/);
  if (tenantSection) {
    const section = tenantSection[1]!;
    return rules.web.adminSectionLayoutKeys[section] ?? kebabSegmentToLayoutKey(section);
  }

  const pageM = ctx.match(/<(\w+Page)\b/);
  if (pageM) {
    const page = pageM[1]!;
    return (
      rules.web.adminPageLayoutKeys[page]
      ?? kebabSegmentToLayoutKey(routePath.split("/").pop() ?? "")
    );
  }
  const redirectM = ctx.match(/Navigate to="([^"]+)"/);
  if (redirectM) {
    return layoutKeyForRoute(appTsx, redirectM[1]!, rules, seen);
  }
  return kebabSegmentToLayoutKey(
    routePath.split("/").filter((s) => s && !s.startsWith(":") && s !== "*").pop() ?? "",
  );
}

export function extractChatkitWeb(
  webRoot: string,
  rules: CatalogRules,
): {
  apps: FeatureItem[];
  libs: FeatureItem[];
  adminFeatures: FeatureItem[];
} {
  const pkg = JSON.parse(
    readFileSync(path.join(webRoot, "package.json"), "utf-8"),
  ) as { workspaces?: string[] };
  const workspaces = pkg.workspaces ?? [];
  const libPrefix = rules.web.libDirPrefix;

  const apps: FeatureItem[] = [];
  const libs: FeatureItem[] = [];
  for (const ws of workspaces) {
    const item: FeatureItem = {
      id: ws.startsWith(libPrefix) ? `lib:${ws}` : `app:${ws}`,
      title: ws,
      sources: ["package.json#workspaces"],
      confidence: "high",
      section: ws.startsWith(libPrefix) ? "libs" : "apps",
    };
    if (ws.startsWith(libPrefix)) {
      if (!rules.web.librariesInAppList) libs.push(item);
    } else {
      apps.push(item);
    }
  }

  const adminFeatures = extractAdminFeatures(webRoot, rules);
  return { apps, libs, adminFeatures };
}

function extractAdminFeatures(webRoot: string, rules: CatalogRules): FeatureItem[] {
  const appPath = path.join(webRoot, rules.web.adminAppPaths.appTsx);
  const zhPath = path.join(webRoot, rules.web.adminAppPaths.zhLocale);
  const appTsx = readFileSync(appPath, "utf-8");
  const zh = JSON.parse(readFileSync(zhPath, "utf-8")) as { layout?: Record<string, string> };
  const layout = zh.layout ?? {};

  const paths = new Set<string>();
  for (const m of appTsx.matchAll(/path="([^"]+)"/g)) {
    const p = m[1]!;
    if (rules.web.excludePaths.includes(p)) continue;
    if (p.includes("*")) continue;
    const isAdminish =
      p.startsWith("/admin/")
      || p.startsWith("/platform/")
      || p.startsWith("/shared/")
      || /^\/tenants\/:[^/]+\/[^/]+$/.test(p);
    if (!isAdminish) continue;
    paths.add(p);
  }

  const seenTitles = new Set<string>();
  const items: FeatureItem[] = [];
  for (const p of [...paths].sort()) {
    const layoutKey = layoutKeyForRoute(appTsx, p, rules);
    const title = resolveLayoutTitle(layout, [layoutKey, `${layoutKey}Management`]);
    if (!title) continue;
    if (seenTitles.has(title)) continue;
    seenTitles.add(title);
    items.push({
      id: `route:admin:${normalizeRoutePattern(p)}`,
      title,
      sources: [rules.web.adminAppPaths.appTsx, `${rules.web.adminAppPaths.zhLocale}#layout`],
      confidence: "high",
      section: "admin-features",
    });
  }
  return items;
}

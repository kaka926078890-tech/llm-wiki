import { readFileSync } from "node:fs";
import path from "node:path";
import type { FeatureItem } from "../types.js";

const LIB_PREFIX = "libs/";

const ADMIN_ROUTE_KEYS: Record<string, string> = {
  "/admin/channels": "channels",
  "/admin/domain-allowlist": "domainAllowlist",
  "/admin/exec-policy": "execPolicy",
  "/admin/tool-invocation-policy": "toolInvocationPolicy",
  "/admin/execution-logs": "executionLogs",
  "/admin/usage": "tokenUsage",
  "/admin/users": "tenantUsers",
  "/admin/llm": "llmConfig",
  "/platform/users": "userManagement",
  "/platform/llm": "llmConfig",
  "/platform/settings": "platformSettings",
  "/platform/skills": "platformSkillCatalog",
  "/shared/templates": "characterTemplates",
  "/shared/skills": "sharedSkillCatalog",
};

export function extractChatkitWeb(webRoot: string): {
  apps: FeatureItem[];
  libs: FeatureItem[];
  adminFeatures: FeatureItem[];
} {
  const pkg = JSON.parse(
    readFileSync(path.join(webRoot, "package.json"), "utf-8"),
  ) as { workspaces?: string[] };
  const workspaces = pkg.workspaces ?? [];

  const apps: FeatureItem[] = [];
  const libs: FeatureItem[] = [];
  for (const ws of workspaces) {
    const item: FeatureItem = {
      id: ws.startsWith(LIB_PREFIX) ? `lib:${ws}` : `app:${ws}`,
      title: ws,
      sources: ["package.json#workspaces"],
      confidence: "high",
      section: ws.startsWith(LIB_PREFIX) ? "libs" : "apps",
    };
    if (ws.startsWith(LIB_PREFIX)) libs.push(item);
    else apps.push(item);
  }

  const adminFeatures = extractAdminFeatures(webRoot);
  return { apps, libs, adminFeatures };
}

function extractAdminFeatures(webRoot: string): FeatureItem[] {
  const appTsx = readFileSync(
    path.join(webRoot, "chatkit-admin-mt", "src", "App.tsx"),
    "utf-8",
  );
  const zh = JSON.parse(
    readFileSync(
      path.join(webRoot, "chatkit-admin-mt", "src", "locales", "zh.json"),
      "utf-8",
    ),
  ) as { layout?: Record<string, string> };
  const layout = zh.layout ?? {};

  const paths = new Set<string>();
  for (const m of appTsx.matchAll(/path="([^"]+)"/g)) {
    const p = m[1]!;
    if (p === "/" || p === "/login" || p.includes(":") || p.includes("*")) continue;
    if (p.startsWith("/admin/") || p.startsWith("/platform/") || p.startsWith("/shared/")) {
      paths.add(p);
    }
  }

  const seenTitles = new Set<string>();
  const items: FeatureItem[] = [];
  for (const p of [...paths].sort()) {
    const key = ADMIN_ROUTE_KEYS[p];
    const title = key ? layout[key] : undefined;
    if (!title) continue;
    const norm = title.trim();
    if (seenTitles.has(norm)) continue;
    seenTitles.add(norm);
    items.push({
      id: `route:admin:${p}`,
      title: norm,
      sources: ["App.tsx", "locales/zh.json#layout"],
      confidence: "high",
      section: "admin-features",
    });
  }
  return items;
}

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { CatalogRules } from "../rules.js";
import type { FeatureItem, MiddlewareEdition } from "../types.js";

export type { MiddlewareEdition };

export interface EditionServiceRow {
  name: string;
  path?: string;
  editions: MiddlewareEdition[];
  kind?: string;
}

function editionFromLine(line: string, names: MiddlewareEdition[]): MiddlewareEdition | null {
  for (const name of names) {
    if (new RegExp(`^\\s{2}${name}:\\s*$`).test(line)) return name;
  }
  return null;
}

/** ponytail: line-scanner for edition-manifest; upgrade path = YAML parser */
export function parseEditionManifestDetailed(
  manifestText: string,
  editionNames: MiddlewareEdition[] = ["basic", "advance"],
  excludeKinds: string[] = ["infrastructure"],
): EditionServiceRow[] {
  const excluded = new Set(excludeKinds);
  const lines = manifestText.split("\n");
  let currentEdition: MiddlewareEdition | null = null;
  let currentKind: string | null = null;
  let pendingName: string | null = null;
  const byName = new Map<string, EditionServiceRow>();

  for (const line of lines) {
    const edition = editionFromLine(line, editionNames);
    if (edition) {
      currentEdition = edition;
      currentKind = null;
      continue;
    }
    const kindM = line.match(/^\s{4}(\w[\w-]*):\s*$/);
    if (currentEdition && kindM) {
      currentKind = kindM[1]!;
      continue;
    }
    if (!currentEdition || !currentKind || excluded.has(currentKind)) continue;

    const nameM = line.match(/^\s{6}-\s+name:\s+(\S+)/);
    if (nameM) {
      pendingName = nameM[1]!;
      const row = byName.get(pendingName) ?? {
        name: pendingName,
        editions: [],
        kind: currentKind,
      };
      if (!row.editions.includes(currentEdition)) row.editions.push(currentEdition);
      byName.set(pendingName, row);
      continue;
    }
    const pathM = line.match(/^\s{8}path:\s+(\S+)/);
    if (pathM && pendingName) {
      byName.get(pendingName)!.path = pathM[1]!;
    }
  }

  for (const row of byName.values()) {
    if (row.editions.includes("basic") && !row.editions.includes("advance")) {
      row.editions.push("advance");
    }
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function parseEditionManifestServices(
  manifestText: string,
  editionNames?: MiddlewareEdition[],
  excludeKinds?: string[],
): string[] {
  return parseEditionManifestDetailed(manifestText, editionNames, excludeKinds).map((s) => s.name);
}

function firstReadmeParagraph(readmePath: string): string | undefined {
  if (!existsSync(readmePath)) return undefined;
  const lines = readFileSync(readmePath, "utf-8").split("\n");
  const para: string[] = [];
  for (const line of lines) {
    if (line.startsWith("#")) continue;
    if (!line.trim()) {
      if (para.length) break;
      continue;
    }
    para.push(line.trim());
  }
  const text = para.join(" ").trim();
  if (!text) return undefined;
  return text.length > 200 ? `${text.slice(0, 197)}...` : text;
}

export function extractMiddlewareServices(
  middlewareRoot: string,
  rules: CatalogRules,
): FeatureItem[] {
  const manifestPath = path.join(middlewareRoot, "edition-manifest.yaml");
  const text = readFileSync(manifestPath, "utf-8");
  return parseEditionManifestDetailed(
    text,
    rules.middleware.editionNames,
    rules.middleware.excludeKinds,
  ).map((row) => {
    const summary = row.path
      ? firstReadmeParagraph(path.join(middlewareRoot, row.path, "README.md"))
      : undefined;
    return {
      id: `service:${row.name}`,
      title: row.name,
      ...(summary ? { summary } : {}),
      sources: ["edition-manifest.yaml"],
      confidence: "high" as const,
      section: "services",
      editions: row.editions,
    };
  });
}

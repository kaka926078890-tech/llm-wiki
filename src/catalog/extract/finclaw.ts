import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { CatalogRules } from "../rules.js";
import type { FeatureItem } from "../types.js";

export function extractFinclawCrates(finclawRoot: string, rules: CatalogRules): FeatureItem[] {
  const cratesDir = path.join(finclawRoot, rules.finclaw.cratesDir);
  const excluded = new Set(rules.finclaw.vendorDirNames.map((n) => n.toLowerCase()));
  return readdirSync(cratesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => !rules.finclaw.excludeVendor || !excluded.has(name.toLowerCase()))
    .sort()
    .map((name) => ({
      id: `crate:${name}`,
      title: name,
      sources: [`${rules.finclaw.cratesDir}/`],
      confidence: "high" as const,
      section: "modules",
    }));
}

export function parseClapSubcommands(argsText: string): string[] {
  const names: string[] = [];
  for (const m of argsText.matchAll(/^\s{4}([A-Z][a-zA-Z0-9]*)\(/gm)) {
    const pascal = m[1]!;
    names.push(pascal.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase());
  }
  return [...new Set(names)].sort();
}

export function extractFinclawCli(finclawRoot: string, rules: CatalogRules): FeatureItem[] {
  const argsPath = path.join(finclawRoot, rules.finclaw.cliArgsPath);
  const text = readFileSync(argsPath, "utf-8");
  return parseClapSubcommands(text).map((name) => ({
    id: `cli:${name}`,
    title: name,
    sources: [rules.finclaw.cliArgsPath],
    confidence: "high" as const,
    section: "cli",
  }));
}

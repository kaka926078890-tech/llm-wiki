import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { getProjectRoot } from "../src/config.js";
import { parseEditionManifestServices, extractMiddlewareServices, parseEditionManifestDetailed } from "../src/catalog/extract/middleware.js";
import { extractChatkitWeb } from "../src/catalog/extract/chatkit-web.js";
import {
  extractFinclawCrates,
  extractFinclawCli,
  parseClapSubcommands,
} from "../src/catalog/extract/finclaw.js";

const root = getProjectRoot();
const repos = {
  middleware: path.join(root, "code/chatkit-middleware"),
  web: path.join(root, "code/chatkit-web"),
  finclaw: path.join(root, "code/finclaw"),
};

describe("catalog extract middleware", () => {
  it("parses edition-manifest services (basic+advance, no infra)", () => {
    const manifest = readFileSync(
      path.join(repos.middleware, "edition-manifest.yaml"),
      "utf-8",
    );
    const names = parseEditionManifestServices(manifest);
    expect(names).toContain("api-gateway");
    expect(names).toContain("trigger-gateway");
    expect(names).not.toContain("postgres");
    expect(names.length).toBe(28);
  });

  it("extractMiddlewareServices matches manifest set", () => {
    const items = extractMiddlewareServices(repos.middleware);
    const manifest = parseEditionManifestServices(
      readFileSync(path.join(repos.middleware, "edition-manifest.yaml"), "utf-8"),
    );
    expect(items.map((i) => i.title).sort()).toEqual(manifest.sort());
  });

  it("tags basic vs advance-only services for M2 edition filter", () => {
    const manifest = readFileSync(
      path.join(repos.middleware, "edition-manifest.yaml"),
      "utf-8",
    );
    const rows = parseEditionManifestDetailed(manifest);
    const basicOnly = rows.filter((r) => r.editions.includes("basic"));
    const advanceOnly = rows.filter(
      (r) => r.editions.includes("advance") && !r.editions.includes("basic"),
    );
    expect(basicOnly.some((r) => r.name === "api-gateway")).toBe(true);
    expect(advanceOnly.some((r) => r.name === "trigger-gateway")).toBe(true);
    expect(basicOnly.length).toBeLessThan(rows.length);
  });

  it("fills summary from service README when present", () => {
    const items = extractMiddlewareServices(repos.middleware);
    const gw = items.find((i) => i.title === "api-gateway");
    expect(gw?.summary).toBeTruthy();
  });
});

describe("catalog extract chatkit-web", () => {
  it("splits workspaces into apps and libs", () => {
    const { apps, libs, adminFeatures } = extractChatkitWeb(repos.web);
    const appTitles = apps.map((a) => a.title);
    expect(appTitles).toEqual(
      expect.arrayContaining(["chatkit-admin-mt", "chatkit-mobile", "finclaw-frontend"]),
    );
    expect(libs.length).toBeGreaterThan(0);
    expect(adminFeatures.some((f) => f.title.includes("渠道"))).toBe(true);
    expect(adminFeatures.every((f) => !f.title.startsWith("/"))).toBe(true);
  });
});

describe("catalog extract finclaw", () => {
  it("lists crates without vendor", () => {
    const crates = extractFinclawCrates(repos.finclaw);
    expect(crates.length).toBeGreaterThan(0);
    expect(crates.every((c) => !c.title.includes("vendor"))).toBe(true);
  });

  it("parses CLI subcommands from args.rs", () => {
    const argsText = readFileSync(
      path.join(repos.finclaw, "hosts/cli/src/args.rs"),
      "utf-8",
    );
    const cmds = parseClapSubcommands(argsText);
    expect(cmds).toContain("chat");
    expect(cmds).toContain("serve");
    expect(extractFinclawCli(repos.finclaw).length).toBeGreaterThan(5);
  });
});

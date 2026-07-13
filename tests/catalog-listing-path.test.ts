import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { getProjectRoot, type LlmWikiConfig } from "../src/config.js";
import { detectCatalogIntent, detectMiddlewareEditionFilter } from "../src/catalog/intent.js";
import {
  buildCatalogListingAnswer,
  missingCatalogRefuseMessage,
} from "../src/catalog/listing-path.js";
import { generateAllFeatureLists } from "../src/catalog/generate.js";
import { lintPublicAnswer } from "../src/benchmark/public-answer-lint.js";

function cfgFor(root: string): LlmWikiConfig {
  return {
    projectRoot: root,
    repos: {
      middleware: path.join(getProjectRoot(), "code/chatkit-middleware"),
      web: path.join(getProjectRoot(), "code/chatkit-web"),
      finclaw: path.join(getProjectRoot(), "code/finclaw"),
    },
    answerProfiles: { agent: "debug", mcp: "public" },
  } as LlmWikiConfig;
}

describe("catalog intent", () => {
  it("detects listing questions per repo", () => {
    expect(detectCatalogIntent("chatkit-middleware 有哪些微服务？")?.listKind).toBe("services");
    expect(detectCatalogIntent("chatkit-web 有哪些应用？")?.listKind).toBe("apps");
    expect(detectCatalogIntent("finclaw 有哪些微服务？")?.listKind).toBe("not-microservice");
  });

  it("detects finclaw CLI listing intent before generic 有哪些", () => {
    expect(detectCatalogIntent("finclaw CLI 有哪些能力？")?.listKind).toBe("cli");
  });

  it("detects middleware edition filter (M2)", () => {
    expect(detectMiddlewareEditionFilter("基础版有哪些微服务")).toBe("basic");
    expect(detectMiddlewareEditionFilter("进阶版 middleware 服务清单")).toBe("advance");
    expect(
      detectCatalogIntent("chatkit-middleware 基础版有哪些微服务？")?.editionFilter,
    ).toBe("basic");
  });
});

describe("catalog listing path", () => {
  it("refuses when feature lists are missing", () => {
    const root = mkdtempSync(path.join(tmpdir(), "llm-wiki-cat-"));
    const answer = buildCatalogListingAnswer({
      cfg: cfgFor(root),
      question: "chatkit-middleware 有哪些微服务？",
      profile: "public",
    });
    expect(answer).toBe(missingCatalogRefuseMessage());
  });

  it("renders public answers without path leaks when lists exist", () => {
    const root = mkdtempSync(path.join(tmpdir(), "llm-wiki-cat-"));
    const c = cfgFor(root);
    c.projectRoot = root;
    generateAllFeatureLists(root, c.repos);

    const answer = buildCatalogListingAnswer({
      cfg: c,
      question: "chatkit-middleware 有哪些微服务？",
      profile: "public",
    });
    expect(answer).toContain("api-gateway");
    expect(answer).toMatch(/共 \d+ 项/);
    expect(lintPublicAnswer(answer!)).toEqual([]);
  });

  it("finclaw microservice question redirects to modules/cli", () => {
    const root = mkdtempSync(path.join(tmpdir(), "llm-wiki-cat-"));
    const c = cfgFor(root);
    c.projectRoot = root;
    generateAllFeatureLists(root, c.repos);

    const answer = buildCatalogListingAnswer({
      cfg: c,
      question: "finclaw 有哪些微服务？",
      profile: "public",
    });
    expect(answer).toContain("不是微服务架构");
    expect(answer).toMatch(/模块|CLI/);
  });

  it("filters middleware services for 基础版 edition", () => {
    const root = mkdtempSync(path.join(tmpdir(), "llm-wiki-cat-"));
    const c = cfgFor(root);
    c.projectRoot = root;
    generateAllFeatureLists(root, c.repos);

    const full = buildCatalogListingAnswer({
      cfg: c,
      question: "chatkit-middleware 有哪些微服务？",
      profile: "public",
    });
    const basic = buildCatalogListingAnswer({
      cfg: c,
      question: "chatkit-middleware 基础版有哪些微服务？",
      profile: "public",
    });
    expect(basic).toContain("基础版");
    expect(basic).toContain("api-gateway");
    expect(basic).not.toContain("trigger-gateway");
    expect(full).toContain("trigger-gateway");
  });

  it("renders title-only bullets when summary is absent", () => {
    const root = mkdtempSync(path.join(tmpdir(), "llm-wiki-cat-"));
    const c = cfgFor(root);
    c.projectRoot = root;
    generateAllFeatureLists(root, c.repos);

    const answer = buildCatalogListingAnswer({
      cfg: c,
      question: "chatkit-middleware 有哪些微服务？",
      profile: "public",
    });
    expect(answer).toMatch(/- \*\*ai-infra-rs\*\*(?!\s*：)/);
  });

  it("accepts legacy JSON without editions on basic filter", () => {
    const root = mkdtempSync(path.join(tmpdir(), "llm-wiki-cat-"));
    const c = cfgFor(root);
    c.projectRoot = root;
    generateAllFeatureLists(root, c.repos);
    const file = path.join(root, ".reasonix/feature-lists/chatkit-middleware.json");
    const raw = JSON.parse(readFileSync(file, "utf-8"));
    for (const svc of raw.lists.services) delete svc.editions;
    writeFileSync(file, JSON.stringify(raw, null, 2));

    const basic = buildCatalogListingAnswer({
      cfg: c,
      question: "chatkit-middleware 基础版有哪些微服务？",
      profile: "public",
    });
    expect(basic).toContain("api-gateway");
  });
});

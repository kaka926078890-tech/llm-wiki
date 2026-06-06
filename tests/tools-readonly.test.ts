import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getProjectRoot } from "../src/config.js";
import { ToolRegistry } from "../src/core/tools.js";
import {
  listRegisteredToolNames,
  registerMultiRootReadonlyTools,
} from "../src/tools/multi-root-readonly.js";

describe("tools-readonly", () => {
  let tempRoot: string | null = null;

  const roots = {
    middleware: getProjectRoot(),
    web: getProjectRoot(),
    finclaw: getProjectRoot(),
  };

  async function makeFixtureRoots() {
    tempRoot = await mkdtemp(join(tmpdir(), "llm-wiki-tools-"));
    const middleware = join(tempRoot, "chatkit-middleware");
    const web = join(tempRoot, "chatkit-web");
    const finclaw = join(tempRoot, "finclaw");
    await mkdir(join(middleware, "src"), { recursive: true });
    await mkdir(join(web, "src"), { recursive: true });
    await mkdir(join(finclaw, "crates", "memory"), { recursive: true });
    await mkdir(join(web, "node_modules", "ignored"), { recursive: true });
    await writeFile(join(middleware, "src", "router.ts"), "export const middlewareRoute = 1;\n");
    await writeFile(
      join(web, "src", "Widget.ts"),
      "export function renderWidget() {\n  return middlewareRoute;\n}\n",
    );
    await writeFile(
      join(finclaw, "crates", "memory", "lib.rs"),
      "pub fn memory_index() -> usize {\n    42\n}\n",
    );
    await writeFile(join(web, "node_modules", "ignored", "skip.ts"), "ignored\n");
    return { middleware, web, finclaw };
  }

  beforeEach(() => {
    tempRoot = null;
  });

  afterEach(async () => {
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
  });

  it("P1-TOOL-01 registry includes Reasonix-style read-only retrieval tools", () => {
    const registry = new ToolRegistry();
    registerMultiRootReadonlyTools(registry, { roots });
    const names = listRegisteredToolNames(registry);
    expect(names).toEqual(
      expect.arrayContaining([
        "search_files",
        "search_content",
        "read_file",
        "list_directory",
        "directory_tree",
        "glob",
        "get_file_info",
        "get_symbols",
        "find_in_code",
      ]),
    );
  });

  it("P1-TOOL-02 registry excludes mutating and shell tools", () => {
    const registry = new ToolRegistry();
    registerMultiRootReadonlyTools(registry, { roots });
    const names = listRegisteredToolNames(registry);
    expect(names).not.toContain("edit_file");
    expect(names).not.toContain("multi_edit");
    expect(names).not.toContain("delete_symbol");
    expect(names).not.toContain("run_command");
  });

  it("P1-TOOL-03 directory, glob, and grep tools aggregate all configured repos", async () => {
    const fixtureRoots = await makeFixtureRoots();
    const registry = new ToolRegistry();
    registerMultiRootReadonlyTools(registry, { roots: fixtureRoots });

    const list = await registry.dispatch("list_directory", { path: "." });
    expect(list).toContain("[chatkit-middleware]");
    expect(list).toContain("[chatkit-web]");
    expect(list).toContain("[finclaw]");
    expect(list).toContain("src/");
    expect(list).toContain("crates/");

    const tree = await registry.dispatch("directory_tree", { path: ".", max_depth: 3 });
    expect(tree).toContain("src/Widget.ts");
    expect(tree).toContain("crates/memory/lib.rs");
    expect(tree).not.toContain("node_modules");

    const glob = await registry.dispatch("glob", { pattern: "**/*.ts", sort_by: "name" });
    expect(glob).toContain("[chatkit-middleware]");
    expect(glob).toContain("src/router.ts");
    expect(glob).toContain("[chatkit-web]");
    expect(glob).toContain("src/Widget.ts");
    expect(glob).not.toContain("node_modules/ignored/skip.ts");

    const grep = await registry.dispatch("search_content", {
      pattern: "middlewareRoute",
      glob: "*.ts",
    });
    expect(grep).toContain("[chatkit-middleware]");
    expect(grep).toContain("src/router.ts:1:");
    expect(grep).toContain("[chatkit-web]");
    expect(grep).toContain("src/Widget.ts:2:");
  });

  it("P1-TOOL-04 file info and AST code-query tools work on authorized files", async () => {
    const fixtureRoots = await makeFixtureRoots();
    const registry = new ToolRegistry();
    registerMultiRootReadonlyTools(registry, { roots: fixtureRoots });
    const widgetPath = join(fixtureRoots.web, "src", "Widget.ts");

    const info = await registry.dispatch("get_file_info", { path: widgetPath });
    expect(info).toContain("[chatkit-web]");
    expect(info).toContain("src/Widget.ts");
    expect(info).toContain("type: file");

    const symbols = await registry.dispatch("get_symbols", { path: widgetPath });
    expect(symbols).toContain("[chatkit-web]");
    expect(symbols).toContain("renderWidget");

    const matches = await registry.dispatch("find_in_code", {
      path: widgetPath,
      name: "renderWidget",
      kind: "definition",
    });
    expect(matches).toContain("[chatkit-web]");
    expect(matches).toContain("renderWidget");
    expect(matches).toContain("definition");
  });
});

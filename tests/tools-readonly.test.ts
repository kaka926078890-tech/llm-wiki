import { describe, expect, it } from "vitest";

import { getProjectRoot } from "../src/config.js";
import { ToolRegistry } from "../src/core/tools.js";
import {
  listRegisteredToolNames,
  registerMultiRootReadonlyTools,
} from "../src/tools/multi-root-readonly.js";

describe("tools-readonly", () => {
  const roots = {
    middleware: getProjectRoot(),
    web: getProjectRoot(),
    finclaw: getProjectRoot(),
  };

  it("P1-TOOL-01 registry includes search_files, search_content, read_file", () => {
    const registry = new ToolRegistry();
    registerMultiRootReadonlyTools(registry, { roots });
    const names = listRegisteredToolNames(registry);
    expect(names).toContain("search_files");
    expect(names).toContain("search_content");
    expect(names).toContain("read_file");
  });

  it("P1-TOOL-02 registry excludes edit_file and run_command", () => {
    const registry = new ToolRegistry();
    registerMultiRootReadonlyTools(registry, { roots });
    const names = listRegisteredToolNames(registry);
    expect(names).not.toContain("edit_file");
    expect(names).not.toContain("run_command");
  });
});

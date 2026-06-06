import { describe, expect, it, vi, beforeEach } from "vitest";

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

import { getProjectRoot } from "../src/config.js";
import { ToolRegistry } from "../src/core/tools.js";
import { registerCodeGraphSearchTool } from "../src/tools/codegraph-search.js";

function invokeExecFileCallback(
  args: unknown[],
  err: NodeJS.ErrnoException | null,
  stdout: string,
  stderr = "",
): void {
  const callback = args.find((arg): arg is (error: NodeJS.ErrnoException | null, out: string, errOut: string) => void =>
    typeof arg === "function",
  );
  callback?.(err, stdout, stderr);
}

describe("registerCodeGraphSearchTool", () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  it("registers codegraph_search in the tool registry", () => {
    const registry = new ToolRegistry({ autoFlatten: true });
    registerCodeGraphSearchTool(registry, { projectRoot: getProjectRoot() });
    expect(registry.specs().some((spec) => spec.function.name === "codegraph_search")).toBe(true);
  });

  it("requires query for graph lookup operations", async () => {
    const registry = new ToolRegistry({ autoFlatten: true });
    registerCodeGraphSearchTool(registry, { projectRoot: getProjectRoot() });

    const result = await registry.dispatch("codegraph_search", { operation: "query" });
    expect(result).toContain("requires a non-empty query");
  });

  it("returns init guidance when codegraph fails", async () => {
    execFileMock.mockImplementation((...args) => {
      const err = new Error("ENOENT") as NodeJS.ErrnoException & { stderr?: string };
      err.stderr = "missing index";
      invokeExecFileCallback(args, err, "", "missing index");
    });
    const registry = new ToolRegistry({ autoFlatten: true });
    registerCodeGraphSearchTool(registry, { projectRoot: getProjectRoot() });

    const result = await registry.dispatch("codegraph_search", {
      operation: "query",
      query: "buildLoop",
    });
    expect(result).toContain("CodeGraph index is unavailable");
    expect(result).toContain("npm run codegraph:init");
  });
});

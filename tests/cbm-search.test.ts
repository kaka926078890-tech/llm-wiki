import { describe, expect, it, vi, beforeEach } from "vitest";

const runCbmCliMock = vi.hoisted(() => vi.fn());

vi.mock("../src/cbm/exec.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/cbm/exec.js")>();
  return {
    ...actual,
    runCbmCli: (...args: unknown[]) => runCbmCliMock(...args),
  };
});

import { getProjectRoot } from "../src/config.js";
import { ToolRegistry } from "../src/core/tools.js";
import { registerCbmSearchTool } from "../src/tools/cbm-search.js";

describe("registerCbmSearchTool", () => {
  beforeEach(() => {
    runCbmCliMock.mockReset();
  });

  it("registers cbm_search in the tool registry", () => {
    const registry = new ToolRegistry({ autoFlatten: true });
    registerCbmSearchTool(registry, {
      binary: "codebase-memory-mcp",
      projectRoot: getProjectRoot(),
      defaultTopK: 8,
    });
    expect(registry.specs().some((spec) => spec.function.name === "cbm_search")).toBe(true);
  });

  it("requires query for semantic operation", async () => {
    const registry = new ToolRegistry({ autoFlatten: true });
    registerCbmSearchTool(registry, {
      binary: "codebase-memory-mcp",
      projectRoot: getProjectRoot(),
      defaultTopK: 8,
    });

    const result = await registry.dispatch("cbm_search", { operation: "semantic" });
    expect(result).toContain("requires a non-empty query");
  });

  it("returns semantic hits from search_graph", async () => {
    runCbmCliMock.mockResolvedValue({
      ok: true,
      stdout: JSON.stringify([
        { name: "AuthService", score: 0.91, path: "src/auth.ts" },
      ]),
    });

    const registry = new ToolRegistry({ autoFlatten: true });
    registerCbmSearchTool(registry, {
      binary: "codebase-memory-mcp",
      projectRoot: getProjectRoot(),
      defaultTopK: 8,
      repoRoots: {
        "chatkit-web": getProjectRoot(),
        "chatkit-middleware": getProjectRoot(),
        finclaw: getProjectRoot(),
      },
    });

    const result = await registry.dispatch("cbm_search", {
      operation: "semantic",
      query: "authentication flow",
      repo: "chatkit-web",
    });
    expect(result).toContain("AuthService");
    expect(result).toContain("0.91");
    expect(runCbmCliMock).toHaveBeenCalledWith(
      "codebase-memory-mcp",
      "search_graph",
      expect.objectContaining({ semantic_query: "authentication flow" }),
      getProjectRoot(),
    );
  });

  it("returns init guidance when CBM fails", async () => {
    runCbmCliMock.mockResolvedValue({ ok: false, error: "not indexed" });

    const registry = new ToolRegistry({ autoFlatten: true });
    registerCbmSearchTool(registry, {
      binary: "codebase-memory-mcp",
      projectRoot: getProjectRoot(),
      defaultTopK: 8,
      repoRoots: {
        "chatkit-web": getProjectRoot(),
        "chatkit-middleware": getProjectRoot(),
        finclaw: getProjectRoot(),
      },
    });

    const result = await registry.dispatch("cbm_search", {
      operation: "semantic",
      query: "auth",
      repo: "chatkit-web",
    });
    expect(result).toContain("codebase-memory-mcp index is unavailable");
    expect(result).toContain("npm run cbm:init");
  });

  it("redacts secret-like text from cbm_search hits", async () => {
    runCbmCliMock.mockResolvedValue({
      ok: true,
      stdout: JSON.stringify([
        {
          name: "config",
          score: 0.8,
          snippet: "const token = 'Bearer abcdefghijklmnopqrstuvwxyz123456';",
        },
      ]),
    });

    const registry = new ToolRegistry({ autoFlatten: true });
    registerCbmSearchTool(registry, {
      binary: "codebase-memory-mcp",
      projectRoot: getProjectRoot(),
      defaultTopK: 8,
      repoRoots: {
        "chatkit-web": getProjectRoot(),
        "chatkit-middleware": getProjectRoot(),
        finclaw: getProjectRoot(),
      },
    });

    const result = await registry.dispatch("cbm_search", {
      operation: "semantic",
      query: "token config",
      repo: "chatkit-web",
    });
    expect(result).toContain("[REDACTED_BEARER_TOKEN]");
    expect(result).not.toContain("abcdefghijklmnopqrstuvwxyz123456");
  });
});

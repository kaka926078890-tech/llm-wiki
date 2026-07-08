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
import { buildCliCall, registerCbmSearchTool } from "../src/tools/cbm-search.js";

const PROJECT = "Users-apple-Desktop-llm-wiki-llm-wiki-code-chatkit-web";

function mockIndexedProject() {
  runCbmCliMock.mockImplementation(async (_binary, tool) => {
    if (tool === "list_projects") {
      return {
        ok: true,
        stdout: JSON.stringify({
          projects: [
            {
              name: PROJECT,
              root_path: getProjectRoot(),
              nodes: 10,
              edges: 20,
            },
          ],
        }),
      };
    }
    return { ok: true, stdout: JSON.stringify([{ name: "AuthService", score: 0.91, path: "src/auth.ts" }]) };
  });
}

describe("buildCliCall", () => {
  it("uses CBM project name and keyword array for semantic search", () => {
    const call = buildCliCall("semantic", PROJECT, { query: "authentication flow" }, 8);
    expect(call.tool).toBe("search_graph");
    expect(call.payload).toEqual({
      project: PROJECT,
      semantic_query: ["authentication", "flow"],
      limit: 8,
    });
  });

  it("uses project for architecture queries", () => {
    const call = buildCliCall("architecture", PROJECT, {}, 8);
    expect(call).toEqual({
      tool: "get_architecture",
      payload: { project: PROJECT },
    });
  });
});

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
    mockIndexedProject();

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
      expect.objectContaining({
        project: PROJECT,
        semantic_query: ["authentication", "flow"],
      }),
    );
    expect(runCbmCliMock.mock.calls.some((call) => call[3] !== undefined)).toBe(false);
  });

  it("returns architecture overview via get_architecture", async () => {
    runCbmCliMock.mockImplementation(async (_binary, tool) => {
      if (tool === "list_projects") {
        return {
          ok: true,
          stdout: JSON.stringify({
            projects: [{ name: PROJECT, root_path: getProjectRoot(), nodes: 3, edges: 2 }],
          }),
        };
      }
      return {
        ok: true,
        stdout: JSON.stringify({ project: PROJECT, total_nodes: 3, node_labels: [] }),
      };
    });

    const registry = new ToolRegistry({ autoFlatten: true });
    registerCbmSearchTool(registry, {
      binary: "codebase-memory-mcp",
      projectRoot: getProjectRoot(),
      defaultTopK: 8,
      repoRoots: { "chatkit-web": getProjectRoot() },
    });

    const result = await registry.dispatch("cbm_search", {
      operation: "architecture",
      repo: "chatkit-web",
    });
    expect(result).toContain("total_nodes");
    expect(runCbmCliMock).toHaveBeenCalledWith(
      "codebase-memory-mcp",
      "get_architecture",
      { project: PROJECT },
    );
  });

  it("returns init guidance when repo is not indexed", async () => {
    runCbmCliMock.mockResolvedValue({
      ok: true,
      stdout: JSON.stringify({ projects: [] }),
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
      query: "auth",
      repo: "chatkit-web",
    });
    expect(result).toContain("index is not available");
    expect(result).toContain("npm run cbm:init");
  });

  it("returns query failure when indexed project call fails", async () => {
    mockIndexedProject();
    runCbmCliMock.mockImplementation(async (_binary, tool) => {
      if (tool === "list_projects") {
        return {
          ok: true,
          stdout: JSON.stringify({
            projects: [{ name: PROJECT, root_path: getProjectRoot() }],
          }),
        };
      }
      return { ok: false, error: "timeout" };
    });

    const registry = new ToolRegistry({ autoFlatten: true });
    registerCbmSearchTool(registry, {
      binary: "codebase-memory-mcp",
      projectRoot: getProjectRoot(),
      defaultTopK: 8,
      repoRoots: { "chatkit-web": getProjectRoot() },
    });

    const result = await registry.dispatch("cbm_search", {
      operation: "semantic",
      query: "auth",
      repo: "chatkit-web",
    });
    expect(result).toContain("query failed");
    expect(result).toContain("timeout");
  });

  it("redacts secret-like text from cbm_search hits", async () => {
    runCbmCliMock.mockImplementation(async (_binary, tool) => {
      if (tool === "list_projects") {
        return {
          ok: true,
          stdout: JSON.stringify({
            projects: [{ name: PROJECT, root_path: getProjectRoot() }],
          }),
        };
      }
      return {
        ok: true,
        stdout: JSON.stringify([
          {
            name: "config",
            score: 0.8,
            snippet: "const token = 'Bearer abcdefghijklmnopqrstuvwxyz123456';",
          },
        ]),
      };
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

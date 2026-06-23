import { describe, expect, it } from "vitest";

import {
  matchProjectForRepo,
  parseDetectChanges,
  parseListProjects,
  resolveStale,
} from "../src/cbm/projects.js";

describe("cbm/projects", () => {
  it("parseListProjects reads projects array", () => {
    const parsed = parseListProjects({
      projects: [
        {
          name: "proj-web",
          root_path: "/tmp/code/chatkit-web",
          nodes: 100,
          edges: 200,
          size_bytes: 1024,
        },
      ],
    });
    expect(parsed).toEqual([
      {
        name: "proj-web",
        rootPath: "/tmp/code/chatkit-web",
        nodes: 100,
        edges: 200,
        sizeBytes: 1024,
      },
    ]);
  });

  it("matchProjectForRepo matches by root path suffix", () => {
    const projects = parseListProjects({
      projects: [{ name: "p1", root_path: "/Users/me/llm-wiki/code/finclaw" }],
    });
    expect(matchProjectForRepo(projects, "/Users/me/llm-wiki/code/finclaw")?.name).toBe("p1");
  });

  it("parseDetectChanges reads changed_count and files", () => {
    expect(
      parseDetectChanges({ changed_count: 2, changed_files: ["a.ts", "b.ts"] }),
    ).toEqual({ changedCount: 2, changedFiles: ["a.ts", "b.ts"] });
  });

  it("resolveStale marks unindexed and git changes", () => {
    expect(resolveStale({ indexed: false, changedCount: 0 })).toEqual({
      stale: true,
      staleReason: "not_indexed",
    });
    expect(resolveStale({ indexed: true, changedCount: 3 })).toEqual({
      stale: true,
      staleReason: "git_changes",
    });
    expect(resolveStale({ indexed: true, changedCount: 0 })).toEqual({ stale: false });
  });
});

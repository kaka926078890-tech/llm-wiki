import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const runCbmCliMock = vi.hoisted(() => vi.fn());
const probeCbmBinaryMock = vi.hoisted(() => vi.fn());
const readGitHeadMock = vi.hoisted(() => vi.fn());

vi.mock("../src/cbm/exec.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/cbm/exec.js")>();
  return {
    ...actual,
    runCbmCli: (...args: unknown[]) => runCbmCliMock(...args),
    probeCbmBinary: (...args: unknown[]) => probeCbmBinaryMock(...args),
  };
});

vi.mock("../src/cbm/git.js", () => ({
  readGitHead: (...args: unknown[]) => readGitHeadMock(...args),
  shortGitHead: (head: string) => head.slice(0, 7),
}));

vi.mock("../src/cbm/index-state.js", () => ({
  readCbmIndexState: () => ({
    updatedAt: "2026-06-23T10:15:00.000Z",
    repos: {
      "chatkit-web": {
        gitHead: "abc1234deadbeef",
        indexedAt: "2026-06-23T10:15:00.000Z",
        projectName: "proj-web",
      },
    },
  }),
}));

import { getProjectRoot, loadConfig } from "../src/config.js";
import { getCbmStatus } from "../src/cbm-status.js";

describe("getCbmStatus", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv, DEEPSEEK_API_KEY: "test-key" };
    runCbmCliMock.mockReset();
    probeCbmBinaryMock.mockReset();
    readGitHeadMock.mockReset();
    probeCbmBinaryMock.mockResolvedValue(true);
    readGitHeadMock.mockResolvedValue("abc1234deadbeef0000000000000000000000");
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("flags stale when detect_changes reports modified files", async () => {
    runCbmCliMock.mockImplementation(async (_binary, tool) => {
      if (tool === "list_projects") {
        return {
          ok: true,
          stdout: JSON.stringify({
            projects: [
              {
                name: "proj-web",
                root_path: loadConfig().repos.web,
                nodes: 10,
                edges: 20,
              },
            ],
          }),
        };
      }
      if (tool === "detect_changes") {
        return {
          ok: true,
          stdout: JSON.stringify({
            changed_count: 1,
            changed_files: ["src/app.ts"],
          }),
        };
      }
      if (tool === "index_status") {
        return { ok: true, stdout: JSON.stringify({ status: "ready" }) };
      }
      return { ok: false, error: "unexpected" };
    });

    const status = await getCbmStatus(loadConfig());
    const web = status.projects.find((p) => p.repo === "chatkit-web");
    expect(web?.stale).toBe(true);
    expect(web?.staleReason).toBe("git_changes");
    expect(web?.changedFiles).toEqual(["src/app.ts"]);
    expect(status.anyStale).toBe(true);
  });

  it("marks fresh when indexed and no git changes", async () => {
    const cfg = loadConfig();
    const allRepos = [
      { name: "proj-mw", root_path: cfg.repos.middleware },
      { name: "proj-web", root_path: cfg.repos.web },
      { name: "proj-fin", root_path: cfg.repos.finclaw },
    ];

    runCbmCliMock.mockImplementation(async (_binary, tool) => {
      if (tool === "list_projects") {
        return {
          ok: true,
          stdout: JSON.stringify({
            projects: allRepos.map((r) => ({ ...r, nodes: 10, edges: 20 })),
          }),
        };
      }
      if (tool === "detect_changes") {
        return {
          ok: true,
          stdout: JSON.stringify({ changed_count: 0, changed_files: [] }),
        };
      }
      if (tool === "index_status") {
        return { ok: true, stdout: JSON.stringify({ status: "ready" }) };
      }
      return { ok: false, error: "unexpected" };
    });

    const status = await getCbmStatus(cfg);
    expect(status.projects.every((p) => p.indexed && !p.stale)).toBe(true);
    expect(status.anyStale).toBe(false);
  });
});

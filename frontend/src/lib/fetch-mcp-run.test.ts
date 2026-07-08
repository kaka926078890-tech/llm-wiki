import { describe, expect, it } from "vitest";

import { pickMcpRunForQuestion } from "./fetch-mcp-run.js";

describe("pickMcpRunForQuestion", () => {
  const runs = [
    { runId: "a", question: "first question", surface: "mcp" },
    { runId: "b", question: "second question", surface: "mcp" },
    { runId: "c", question: "first question", surface: "agent" },
  ];

  it("returns the MCP run with an exact question match", () => {
    expect(pickMcpRunForQuestion(runs, "second question")).toEqual(runs[1]);
  });

  it("does not fall back to another MCP run when the question differs", () => {
    expect(pickMcpRunForQuestion(runs, "missing question")).toBeUndefined();
  });

  it("ignores agent runs even when the question matches", () => {
    expect(pickMcpRunForQuestion(runs, "first question")).toEqual(runs[0]);
  });
});

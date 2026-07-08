import { describe, expect, it } from "vitest";

import type { LoopEvent } from "./loop-types.js";
import { createAssistantState, reduceLoopEvent } from "./sse-reducer.js";

describe("sse-reducer", () => {
  it("P4-RED-01 tool_start + tool same callId merges into one tool segment", () => {
    let state = createAssistantState();
    state = reduceLoopEvent(state, {
      turn: 1,
      role: "tool_start",
      content: "",
      toolName: "read_file",
      toolArgs: '{"path":"a.ts"}',
      callId: "c1",
    });
    state = reduceLoopEvent(state, {
      turn: 1,
      role: "tool",
      content: "file contents",
      toolName: "read_file",
      callId: "c1",
    });
    expect(state.segments).toHaveLength(1);
    expect(state.segments[0]).toMatchObject({
      kind: "tool",
      callId: "c1",
      name: "read_file",
      args: '{"path":"a.ts"}',
      result: "file contents",
    });
  });

  it("P4-RED-02 assistant_delta reasoning appends to reasoning segment", () => {
    let state = createAssistantState();
    state = reduceLoopEvent(state, {
      turn: 1,
      role: "assistant_delta",
      content: "",
      reasoningDelta: "think ",
    });
    state = reduceLoopEvent(state, {
      turn: 1,
      role: "assistant_delta",
      content: "",
      reasoningDelta: "more",
    });
    expect(state.segments).toEqual([{ kind: "reasoning", text: "think more" }]);
  });

  it("P4-RED-03 assistant_delta content appends to text segment", () => {
    let state = createAssistantState();
    state = reduceLoopEvent(state, {
      turn: 1,
      role: "assistant_delta",
      content: "Hello ",
    });
    state = reduceLoopEvent(state, {
      turn: 1,
      role: "assistant_delta",
      content: "world",
    });
    expect(state.segments).toEqual([{ kind: "text", text: "Hello world" }]);
  });

  it("P4-RED-04 assistant_final sets pending=false", () => {
    let state = createAssistantState();
    state = reduceLoopEvent(state, {
      turn: 1,
      role: "assistant_delta",
      content: "done",
    } satisfies LoopEvent);
    expect(state.pending).toBe(true);
    state = reduceLoopEvent(state, {
      turn: 1,
      role: "assistant_final",
      content: "done",
    });
    expect(state.pending).toBe(false);
  });

  it("P4-RED-05 assistant_final content without prior deltas becomes text segment", () => {
    let state = createAssistantState();
    state = reduceLoopEvent(state, {
      turn: 1,
      role: "tool_start",
      content: "",
      toolName: "search_files",
      callId: "c1",
    });
    state = reduceLoopEvent(state, {
      turn: 1,
      role: "assistant_final",
      content: "",
    });
    state = reduceLoopEvent(state, {
      turn: 1,
      role: "assistant_final",
      content: "## Answer\n\nBody text.",
    });
    state = reduceLoopEvent(state, {
      turn: 1,
      role: "done",
      content: "## Answer\n\nBody text.",
    });
    expect(state.segments).toEqual([
      expect.objectContaining({ kind: "tool", callId: "c1" }),
      { kind: "text", text: "## Answer\n\nBody text." },
    ]);
    expect(state.pending).toBe(false);
  });

  it("P4-RED-06 short debug footer assistant_final does not clobber long answer", () => {
    let state = createAssistantState();
    state = reduceLoopEvent(state, {
      turn: 1,
      role: "assistant_final",
      content: "# Feature list\n\n".repeat(20),
    });
    state = reduceLoopEvent(state, {
      turn: 1,
      role: "assistant_final",
      content: "---\nevidence: 372 item(s), negative searches: 3",
    });
    const text = state.segments.find((s) => s.kind === "text");
    expect(text?.kind).toBe("text");
    if (text?.kind !== "text") return;
    expect(text.text).toContain("# Feature list");
    expect(text.text).toContain("evidence: 372 item(s)");
  });

  it("P4-RED-09 done-only event merges final answer text", () => {
    let state = createAssistantState();
    state = reduceLoopEvent(state, {
      turn: 1,
      role: "tool_start",
      content: "",
      toolName: "glob",
      callId: "c1",
    });
    state = reduceLoopEvent(state, {
      turn: 1,
      role: "done",
      content: "## Final answer\n\nOnly on done.",
    });
    expect(state.segments).toEqual([
      expect.objectContaining({ kind: "tool", callId: "c1" }),
      { kind: "text", text: "## Final answer\n\nOnly on done." },
    ]);
    expect(state.pending).toBe(false);
  });

  it("P4-RED-10 tool ok stays true when result mentions budget in prose", () => {
    let state = createAssistantState();
    state = reduceLoopEvent(state, {
      turn: 1,
      role: "tool",
      content: "The retrieval budget for listing questions is 26 tool calls.",
      toolName: "read_file",
      callId: "c1",
    });
    const tool = state.segments[0];
    expect(tool).toMatchObject({ kind: "tool", ok: true });
  });

  it("P4-RED-11 tool ok is false for structured budget error JSON", () => {
    let state = createAssistantState();
    state = reduceLoopEvent(state, {
      turn: 1,
      role: "tool",
      content: JSON.stringify({
        error: "read_file: per-tool limit reached (9). Switch tool or conclude.",
        budget: "per-tool",
      }),
      toolName: "read_file",
      callId: "c1",
    });
    const tool = state.segments[0];
    expect(tool).toMatchObject({ kind: "tool", ok: false });
  });

  it("P4-RED-08 done event does not duplicate force-summary answer", () => {
    let state = createAssistantState();
    const body = "## chatkit-web 详细功能清单\n\n" + "x".repeat(200);
    state = reduceLoopEvent(state, {
      turn: 1,
      role: "assistant_final",
      content: `errors.reasonBudget\n\n${body}`,
    });
    state = reduceLoopEvent(state, { turn: 1, role: "done", content: body });
    const text = state.segments.find((s) => s.kind === "text");
    expect(text?.kind).toBe("text");
    if (text?.kind !== "text") return;
    expect(text.text.match(/## chatkit-web 详细功能清单/g)?.length).toBe(1);
  });

  it("P4-RED-07 evidence event stores summary without appending text segment", () => {
    let state = createAssistantState();
    state = reduceLoopEvent(state, {
      turn: 1,
      role: "evidence",
      content: JSON.stringify({
        evidenceCount: 12,
        citationOrphans: 1,
        runId: "run-abc-def",
        items: [{ path: "a.ts" }],
      }),
    });
    expect(state.segments).toHaveLength(0);
    expect(state.evidenceMeta?.summary).toContain("Evidence: 12 item(s)");
    expect(state.evidenceMeta?.runId).toBe("run-abc-def");
  });
});

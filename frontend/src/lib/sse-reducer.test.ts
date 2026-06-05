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
});

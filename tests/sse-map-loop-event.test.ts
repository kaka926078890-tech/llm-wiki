import { describe, expect, it } from "vitest";

import { mapLoopEventToSse } from "../src/sse/map-loop-event.js";
import type { LoopEvent } from "../src/core/loop/types.js";

function parseSseFrame(frame: string): { event: string; data: LoopEvent } {
  const lines = frame.trimEnd().split("\n");
  const eventLine = lines.find((l) => l.startsWith("event: "));
  const dataLine = lines.find((l) => l.startsWith("data: "));
  expect(eventLine).toBeDefined();
  expect(dataLine).toBeDefined();
  return {
    event: eventLine!.slice("event: ".length),
    data: JSON.parse(dataLine!.slice("data: ".length)) as LoopEvent,
  };
}

describe("sse-map-loop-event", () => {
  it("P2-SSE-01 tool_start maps to event loop with tool fields", () => {
    const ev: LoopEvent = {
      turn: 1,
      role: "tool_start",
      content: "",
      toolName: "search_content",
      callId: "call-abc",
    };
    const frame = mapLoopEventToSse(ev);
    expect(frame).toMatch(/^event: loop\n/);
    const { event, data } = parseSseFrame(frame);
    expect(event).toBe("loop");
    expect(data.role).toBe("tool_start");
    expect(data.toolName).toBe("search_content");
    expect(data.callId).toBe("call-abc");
  });

  it("P2-SSE-02 assistant_delta preserves reasoningDelta", () => {
    const ev: LoopEvent = {
      turn: 2,
      role: "assistant_delta",
      content: "answer bit",
      reasoningDelta: "thinking step",
    };
    const { data } = parseSseFrame(mapLoopEventToSse(ev));
    expect(data.reasoningDelta).toBe("thinking step");
    expect(data.content).toBe("answer bit");
  });

  it("P2-SSE-03 tool result does not truncate output", () => {
    const longOutput = "x".repeat(50_000);
    const ev: LoopEvent = {
      turn: 1,
      role: "tool",
      content: longOutput,
      toolName: "read_file",
      callId: "call-1",
    };
    const { data } = parseSseFrame(mapLoopEventToSse(ev));
    expect(data.content).toBe(longOutput);
    expect(data.content.length).toBe(50_000);
  });
});

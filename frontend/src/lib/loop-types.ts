/** Mirrors backend `src/core/loop/types.ts` for SSE payloads. */
export type EventRole =
  | "assistant_delta"
  | "assistant_final"
  | "tool_call_delta"
  | "tool_start"
  | "tool"
  | "done"
  | "error"
  | "warning"
  | "status"
  | "steer"
  | "evidence";

export interface LoopEvent {
  turn: number;
  role: EventRole;
  content: string;
  severity?: "low" | "high";
  reasoningDelta?: string;
  toolName?: string;
  toolArgs?: string;
  callId?: string;
  error?: string;
}

export type AssistantSegment =
  | { kind: "text"; text: string }
  | { kind: "reasoning"; text: string }
  | {
      kind: "tool";
      callId: string;
      name: string;
      args?: string;
      result?: string;
      ok?: boolean;
    };

export type AssistantMessageState = {
  segments: AssistantSegment[];
  pending: boolean;
};

export type ChatMessage =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "assistant"; segments: AssistantSegment[]; pending: boolean };

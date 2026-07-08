import type { AssistantMessageState, AssistantSegment, LoopEvent } from "./loop-types.js";

export function createAssistantState(): AssistantMessageState {
  return { segments: [], pending: true };
}

function appendSegment(
  segments: AssistantSegment[],
  kind: "text" | "reasoning",
  chunk: string,
): AssistantSegment[] {
  if (!chunk) return segments;
  const last = segments[segments.length - 1];
  if (last?.kind === kind) {
    return [...segments.slice(0, -1), { ...last, text: last.text + chunk }];
  }
  return [...segments, { kind, text: chunk }];
}

function upsertToolSegment(
  segments: AssistantSegment[],
  patch: {
    callId: string;
    name: string;
    args?: string;
    result?: string;
    ok?: boolean;
  },
): AssistantSegment[] {
  const idx = segments.findIndex(
    (s): s is Extract<AssistantSegment, { kind: "tool" }> =>
      s.kind === "tool" && s.callId === patch.callId,
  );
  if (idx >= 0) {
    const prev = segments[idx] as Extract<AssistantSegment, { kind: "tool" }>;
    const next: AssistantSegment = {
      kind: "tool",
      callId: patch.callId,
      name: patch.name || prev.name,
      args: patch.args ?? prev.args,
      result: patch.result ?? prev.result,
      ok: patch.ok ?? prev.ok,
    };
    return [...segments.slice(0, idx), next, ...segments.slice(idx + 1)];
  }
  return [
    ...segments,
    {
      kind: "tool",
      callId: patch.callId,
      name: patch.name,
      args: patch.args,
      result: patch.result,
      ok: patch.ok,
    },
  ];
}

/** Budget/router blocks return JSON like `{"error":"…","budget":"per-tool"}` — not prose mentions of budget. */
function isToolResultError(content: string): boolean {
  const trimmed = content.trim();
  if (/^error\b/i.test(trimmed)) return true;
  if (!trimmed.startsWith("{")) return false;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return (
      typeof parsed === "object"
      && parsed !== null
      && "error" in parsed
      && typeof (parsed as { error: unknown }).error === "string"
    );
  } catch {
    return false;
  }
}

function mergeFinalText(lastText: string, newText: string): string {
  if (lastText === newText) return lastText;
  if (lastText.includes(newText)) return lastText;
  if (newText.includes(lastText)) return newText;
  const anchor = newText.slice(0, Math.min(120, newText.length)).trim();
  if (anchor.length >= 40 && lastText.includes(anchor)) return lastText;
  if (newText.length < lastText.length) {
    return `${lastText}\n\n${newText}`;
  }
  return newText;
}

/** Apply one LoopEvent to the in-flight assistant message state. */
export function reduceLoopEvent(
  state: AssistantMessageState,
  ev: LoopEvent,
): AssistantMessageState {
  switch (ev.role) {
    case "assistant_delta": {
      let segments = state.segments;
      if (ev.reasoningDelta) {
        segments = appendSegment(segments, "reasoning", ev.reasoningDelta);
      }
      if (ev.content) {
        segments = appendSegment(segments, "text", ev.content);
      }
      return { segments, pending: true, evidenceMeta: state.evidenceMeta };
    }
    case "assistant_final":
    case "done": {
      let segments = state.segments;
      const text = ev.content?.trim();
      if (text) {
        const last = segments[segments.length - 1];
        if (last?.kind === "text") {
          segments = [
            ...segments.slice(0, -1),
            { kind: "text", text: mergeFinalText(last.text, text) },
          ];
        } else {
          segments = [...segments, { kind: "text", text }];
        }
      }
      return { segments, pending: false, evidenceMeta: state.evidenceMeta };
    }
    case "tool_start": {
      const callId = ev.callId ?? `tool-${state.segments.length}`;
      return {
        ...state,
        segments: upsertToolSegment(state.segments, {
          callId,
          name: ev.toolName ?? "tool",
          args: ev.toolArgs,
        }),
        pending: true,
      };
    }
    case "tool": {
      const callId = ev.callId ?? `tool-${state.segments.length}`;
      const ok = !isToolResultError(ev.content);
      return {
        ...state,
        segments: upsertToolSegment(state.segments, {
          callId,
          name: ev.toolName ?? "tool",
          args: ev.toolArgs,
          result: ev.content,
          ok,
        }),
        pending: true,
      };
    }
    case "evidence": {
      try {
        const data = JSON.parse(ev.content) as {
          evidenceCount?: number;
          citationOrphans?: number;
          runId?: string;
          evidenceRefused?: boolean;
          policyNotes?: string[];
          items?: Array<{
            path?: string;
            line?: number;
            lineEnd?: number;
            excerptHash?: string;
            redaction?: string;
          }>;
        };
        const summary =
          `Evidence: ${data.evidenceCount ?? 0} item(s), `
          + `${data.citationOrphans ?? 0} orphan citation(s)`
          + (data.runId ? ` · run ${data.runId.slice(0, 8)}` : "")
          + (data.evidenceRefused ? " · refused (no evidence)" : "");
        return {
          segments: state.segments,
          pending: false,
          evidenceMeta: {
            runId: data.runId,
            summary,
            items: data.items ?? [],
          },
        };
      } catch {
        return state;
      }
    }
    case "error":
      return {
        segments: appendSegment(state.segments, "text", ev.error ?? ev.content ?? "Error"),
        pending: false,
      };
    default:
      return state;
  }
}

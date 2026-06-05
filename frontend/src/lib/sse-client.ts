import type { LoopEvent } from "./loop-types.js";

export type AgentRunMessage = { role: string; content: string };

export type StreamAgentRunOptions = {
  messages: AgentRunMessage[];
  signal?: AbortSignal;
  onEvent: (ev: LoopEvent) => void;
};

function parseSseBlock(block: string): LoopEvent | null {
  const lines = block.trim().split("\n");
  if (!lines.length) return null;
  const dataLine = lines.find((l) => l.startsWith("data: "));
  if (!dataLine) return null;
  try {
    return JSON.parse(dataLine.slice("data: ".length)) as LoopEvent;
  } catch {
    return null;
  }
}

/** POST /agent/run and invoke `onEvent` for each `event: loop` frame. */
export async function streamAgentRun(opts: StreamAgentRunOptions): Promise<void> {
  const res = await fetch("/agent/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: opts.messages }),
    signal: opts.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Agent run failed (${res.status})`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep = buffer.indexOf("\n\n");
    while (sep >= 0) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const ev = parseSseBlock(block);
      if (ev) opts.onEvent(ev);
      sep = buffer.indexOf("\n\n");
    }
  }

  if (buffer.trim()) {
    const ev = parseSseBlock(buffer);
    if (ev) opts.onEvent(ev);
  }
}

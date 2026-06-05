import type { LoopEvent } from "../core/loop/types.js";

/** Serialize a LoopEvent as an SSE frame (`event: loop` + full JSON payload). */
export function mapLoopEventToSse(event: LoopEvent): string {
  return `event: loop\ndata: ${JSON.stringify(event)}\n\n`;
}

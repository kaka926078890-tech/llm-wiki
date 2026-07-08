import type { AssistantSegment } from "./loop-types.js";

/** Strip debug footers and forced-summary prefixes from streamed agent text. */
export function cleanStreamedAnswer(raw: string): string {
  return raw
    .replace(/errors\.reason(?:Stuck|Aborted|ContextGuard|Budget)/g, "")
    .replace(/\n---\nEvidence bundle:[\s\S]*$/m, "")
    .replace(/\n---\nevidence:[\s\S]*$/im, "")
    .replace(/\n---\n\*\*Evidence policy:\*\*[\s\S]*$/m, "")
    .trim();
}

export function hasSubstantiveAnswer(text: string): boolean {
  const cleaned = cleanStreamedAnswer(text);
  if (cleaned.length < 40) return false;
  return /^#{1,3}\s/m.test(cleaned) || /\|.+\|/.test(cleaned) || cleaned.length >= 120;
}

export function answerFromSegments(segments: AssistantSegment[]): string {
  const parts = segments
    .filter((segment): segment is Extract<AssistantSegment, { kind: "text" }> =>
      segment.kind === "text" && Boolean(segment.text?.trim()),
    )
    .map((segment) => segment.text.trim());
  if (parts.length === 0) return "";
  const cleaned = parts.map((part) => cleanStreamedAnswer(part)).filter(Boolean);
  if (cleaned.length === 0) return "";
  return cleaned.sort((a, b) => b.length - a.length)[0] ?? "";
}

export async function resolveAnswerForSave(input: {
  segments: AssistantSegment[];
  runId?: string;
}): Promise<string> {
  const fromSegments = answerFromSegments(input.segments);
  if (!input.runId) return fromSegments;

  try {
    const res = await fetch(`/api/runs/${encodeURIComponent(input.runId)}`);
    if (!res.ok) return fromSegments;
    const run = (await res.json()) as { finalAnswer?: string };
    const fromRun = run.finalAnswer ? cleanStreamedAnswer(run.finalAnswer) : "";
    if (fromRun.length > fromSegments.length) return fromRun;
    return fromSegments || fromRun;
  } catch {
    return fromSegments;
  }
}

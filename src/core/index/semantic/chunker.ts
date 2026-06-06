import type { SemanticChunk } from "./types.js";

export interface ChunkTextInput {
  repo: string;
  path: string;
  text: string;
  maxChars: number;
  overlapChars: number;
}

function lineForOffset(lineStarts: number[], offset: number): number {
  let line = 1;
  for (let i = 0; i < lineStarts.length; i += 1) {
    if (lineStarts[i]! > offset) break;
    line = i + 1;
  }
  return line;
}

export function chunkText(input: ChunkTextInput): SemanticChunk[] {
  const text = input.text.trim();
  if (!text) return [];
  const maxChars = Math.max(300, Math.floor(input.maxChars));
  const overlapChars = Math.max(0, Math.min(Math.floor(input.overlapChars), maxChars - 1));
  const lineStarts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") lineStarts.push(i + 1);
  }

  const chunks: SemanticChunk[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + maxChars);
    if (end < text.length) {
      const newline = text.lastIndexOf("\n", end);
      if (newline > start + Math.floor(maxChars * 0.5)) end = newline;
    }
    const chunk = text.slice(start, end).trim();
    if (chunk) {
      const startLine = lineForOffset(lineStarts, start);
      const endLine = lineForOffset(lineStarts, Math.max(start, end - 1));
      chunks.push({
        id: `${input.repo}:${input.path}:${startLine}-${endLine}:${chunks.length}`,
        repo: input.repo,
        path: input.path,
        startLine,
        endLine,
        text: chunk,
      });
    }
    if (end >= text.length) break;
    start = Math.max(0, end - overlapChars);
  }
  return chunks;
}

import { countTokens, countTokensBounded } from "./tokenizer.js";

export const DEFAULT_MAX_RESULT_CHARS = 32_000;
export const DEFAULT_MAX_RESULT_TOKENS = 8_000;

export function truncateForModel(s: string, maxChars: number, extraNote?: string): string {
  if (s.length <= maxChars) return s;
  const tailBudget = Math.min(1024, Math.floor(maxChars * 0.1));
  const headBudget = Math.max(0, maxChars - tailBudget);
  const head = sliceAlignedToCodepoint(s, headBudget);
  const tail = sliceSuffixAlignedToCodepoint(s, tailBudget);
  const dropped = s.length - head.length - tail.length;
  const note = extraNote ? ` — ${extraNote}` : "";
  return `${head}\n\n[…truncated ${dropped} chars — raise maxResultChars, or call the tool with a narrower scope${note}…]\n\n${tail}`;
}

function sliceAlignedToCodepoint(s: string, end: number): string {
  if (end <= 0) return "";
  if (end >= s.length) return s;
  const last = s.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) return s.slice(0, end - 1);
  return s.slice(0, end);
}

function sliceSuffixAlignedToCodepoint(s: string, len: number): string {
  if (len <= 0) return "";
  if (len >= s.length) return s;
  const start = s.length - len;
  const first = s.charCodeAt(start);
  if (first >= 0xdc00 && first <= 0xdfff) return s.slice(start + 1);
  return s.slice(start);
}

export function truncateForModelByTokens(s: string, maxTokens: number, extraNote?: string): string {
  if (maxTokens <= 0) return "";
  if (s.length <= maxTokens) return s;
  if (s.length <= maxTokens * 4) {
    const est = countTokensBounded(s);
    if (Math.ceil(est * 1.15) <= maxTokens) return s;
    if (est <= maxTokens) {
      const tokens = countTokens(s);
      if (tokens <= maxTokens) return s;
    }
  }

  const markerOverhead = 48;
  const contentBudget = Math.max(0, maxTokens - markerOverhead);
  const tailBudget = Math.min(256, Math.floor(contentBudget * 0.1));
  const headBudget = Math.max(0, contentBudget - tailBudget);

  const head = sizePrefixToTokens(s, headBudget);
  const tail = sizeSuffixToTokens(s, tailBudget);
  const droppedChars = s.length - head.length - tail.length;
  const headTokens = head ? countTokens(head) : 0;
  const tailTokens = tail ? countTokens(tail) : 0;
  const sampleChars = head.length + tail.length;
  const sampleTokens = headTokens + tailTokens;
  const ratio = sampleChars > 0 ? sampleTokens / sampleChars : 0.3;
  const estTotalTokens = Math.ceil(s.length * ratio);
  const droppedTokens = Math.max(0, estTotalTokens - sampleTokens);
  const note = extraNote ? ` — ${extraNote}` : "";
  return `${head}\n\n[…truncated ~${droppedTokens} tokens (${droppedChars} chars)${note}…]\n\n${tail}`;
}

function sizePrefixToTokens(s: string, budget: number): string {
  if (budget <= 0 || s.length === 0) return "";
  let size = Math.min(s.length, budget * 4);
  for (let iter = 0; iter < 6; iter++) {
    if (size <= 0) return "";
    const slice = sliceAlignedToCodepoint(s, size);
    const count = countTokens(slice);
    if (count <= budget) return slice;
    const next = Math.floor(size * (budget / count) * 0.95);
    if (next >= size) return sliceAlignedToCodepoint(s, Math.max(0, size - 1));
    size = next;
  }
  return sliceAlignedToCodepoint(s, Math.max(0, size));
}

function sizeSuffixToTokens(s: string, budget: number): string {
  if (budget <= 0 || s.length === 0) return "";
  let size = Math.min(s.length, budget * 4);
  for (let iter = 0; iter < 6; iter++) {
    if (size <= 0) return "";
    const slice = sliceSuffixAlignedToCodepoint(s, size);
    const count = countTokens(slice);
    if (count <= budget) return slice;
    const next = Math.floor(size * (budget / count) * 0.95);
    if (next >= size) return sliceSuffixAlignedToCodepoint(s, Math.max(0, size - 1));
    size = next;
  }
  return sliceSuffixAlignedToCodepoint(s, Math.max(0, size));
}

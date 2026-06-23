import { createHash } from "node:crypto";

export type EvidenceRedaction = "allow" | "redact" | "metadata_only";

export interface EvidenceItem {
  id: string;
  tool: string;
  path?: string;
  line?: number;
  lineEnd?: number;
  query?: string;
  repo?: string;
  redaction: EvidenceRedaction;
  excerptHash?: string;
}

export interface EvidenceBundle {
  runId: string;
  question: string;
  items: EvidenceItem[];
  negativeSearches: string[];
  collectedAt: string;
}

export interface CitationRef {
  path: string;
  line?: number;
  lineEnd?: number;
  raw: string;
}

export interface CitationReport {
  citations: CitationRef[];
  supported: CitationRef[];
  orphans: CitationRef[];
  hasEvidence: boolean;
}

export function normalizeEvidencePath(input: string): string {
  return input
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .toLowerCase();
}

function hashExcerpt(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

let nextEvidenceId = 0;
function evidenceId(): string {
  nextEvidenceId += 1;
  return `ev-${nextEvidenceId}`;
}

function repoFromPath(pathValue: string): string | undefined {
  for (const repo of ["chatkit-middleware", "chatkit-web", "finclaw"]) {
    if (pathValue === repo || pathValue.startsWith(`${repo}/`)) return repo;
  }
  return undefined;
}

function parseReadHeader(text: string): { path?: string; line?: number; lineEnd?: number } {
  const range = text.match(/^\[([^\]]+)\s+range\s+(\d+)-(\d+)\]/);
  if (range) {
    return { path: range[1], line: Number(range[2]), lineEnd: Number(range[3]) };
  }
  const head = text.match(/^\[([^\]]+)\s+head\s+(\d+)\]/);
  if (head) return { path: head[1], line: 1, lineEnd: Number(head[2]) };
  const tail = text.match(/^\[([^\]]+)\s+tail\s+(\d+)\]/);
  if (tail) return { path: tail[1], line: undefined, lineEnd: undefined };
  const plain = text.match(/^\[([^\]]+)\]/);
  if (plain) return { path: plain[1] };
  return {};
}

function pathsFromText(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(
    /(?:^|[\s"'`(])([\w.-]+(?:\/[\w./-]+)+\.(?:tsx?|jsx?|json|ya?ml|md|rs|py|go|java))(?::(\d+)(?:-(\d+))?)?/gi,
  )) {
    const p = match[1];
    if (p) found.add(p);
  }
  return [...found];
}

export class EvidenceCollector {
  private readonly items: EvidenceItem[] = [];
  private readonly negativeSearches = new Set<string>();

  constructor(
    private readonly runId: string,
    private readonly question: string,
  ) {}

  onToolStart(name: string, args: Record<string, unknown>): void {
    if (name === "search_content" || name === "search_files") {
      const query = typeof args.query === "string" ? args.query.trim()
        : typeof args.pattern === "string" ? args.pattern.trim()
          : "";
      if (query) this.negativeSearches.add(query);
    }
  }

  onToolResult(name: string, args: Record<string, unknown>, result: string): void {
    const redaction: EvidenceRedaction = result.includes("security: content withheld")
      ? "metadata_only"
      : result.includes("security: redacted")
        ? "redact"
        : "allow";

    if (name === "read_file" && typeof args.path === "string") {
      const parsed = parseReadHeader(result);
      const pathValue = parsed.path ?? args.path;
      this.items.push({
        id: evidenceId(),
        tool: name,
        path: normalizeEvidencePath(pathValue),
        line: parsed.line,
        lineEnd: parsed.lineEnd,
        repo: repoFromPath(pathValue),
        redaction,
        excerptHash: hashExcerpt(result.slice(0, 400)),
      });
      return;
    }

    if (name === "glob" || name === "search_files") {
      for (const p of pathsFromText(result)) {
        this.items.push({
          id: evidenceId(),
          tool: name,
          path: normalizeEvidencePath(p),
          repo: repoFromPath(p),
          redaction,
        });
      }
      return;
    }

    if (name === "search_content" || name === "cbm_search" || name === "find_in_code" || name === "get_symbols") {
      for (const p of pathsFromText(result)) {
        this.items.push({
          id: evidenceId(),
          tool: name,
          path: normalizeEvidencePath(p),
          repo: repoFromPath(p),
          redaction,
        });
      }
      if (name === "search_content" && typeof args.query === "string") {
        this.negativeSearches.add(args.query.trim());
      }
    }
  }

  toBundle(): EvidenceBundle {
    return {
      runId: this.runId,
      question: this.question,
      items: [...this.items],
      negativeSearches: [...this.negativeSearches],
      collectedAt: new Date().toISOString(),
    };
  }
}

const CITATION_LINK =
  /\[[^\]]+\]\(([^)\s]+?)(?::(\d+)(?:-(\d+))?)?\)/g;
const CITATION_BACKTICK =
  /`([^`\n]+?\.(?:tsx?|jsx?|json|ya?ml|md|rs|py|go|java))(?::(\d+)(?:-(\d+))?)?`/g;

export function extractCitations(text: string): CitationRef[] {
  const refs: CitationRef[] = [];
  const push = (raw: string, path: string, line?: number, lineEnd?: number) => {
    const normalized = path.replace(/^\([^)]*\)/, "").trim();
    if (!normalized.includes("/") && !normalized.includes(".")) return;
    refs.push({
      raw,
      path: normalizeEvidencePath(normalized),
      line,
      lineEnd,
    });
  };

  for (const match of text.matchAll(CITATION_LINK)) {
    push(match[0]!, match[1]!, match[2] ? Number(match[2]) : undefined, match[3] ? Number(match[3]) : undefined);
  }
  for (const match of text.matchAll(CITATION_BACKTICK)) {
    push(match[0]!, match[1]!, match[2] ? Number(match[2]) : undefined, match[3] ? Number(match[3]) : undefined);
  }
  return refs;
}

function citationSupported(citation: CitationRef, items: EvidenceItem[]): boolean {
  return items.some((item) => {
    if (!item.path) return false;
    const itemPath = item.path;
    const citePath = citation.path;
    if (itemPath !== citePath && !itemPath.endsWith(`/${citePath}`) && !citePath.endsWith(`/${itemPath}`)) {
      return false;
    }
    if (citation.line == null) return true;
    if (item.line == null && item.lineEnd == null) return true;
    const start = item.line ?? 1;
    const end = item.lineEnd ?? start;
    return citation.line >= start && citation.line <= end;
  });
}

export function validateCitations(answer: string, bundle: EvidenceBundle): CitationReport {
  const citations = extractCitations(answer);
  const supported: CitationRef[] = [];
  const orphans: CitationRef[] = [];
  for (const citation of citations) {
    if (citationSupported(citation, bundle.items)) supported.push(citation);
    else orphans.push(citation);
  }
  return {
    citations,
    supported,
    orphans,
    hasEvidence: bundle.items.length > 0 || bundle.negativeSearches.length > 0,
  };
}

export function stripOrphanCitations(answer: string, orphans: CitationRef[]): string {
  let next = answer;
  for (const orphan of orphans) {
    next = next.replaceAll(orphan.raw, orphan.raw.replace(/\[[^\]]+\]\([^)]+\)/, "[unsupported]"));
    next = next.replaceAll(orphan.raw, "");
  }
  return next.replace(/\n{3,}/g, "\n\n").trim();
}

export function formatEvidenceFooter(bundle: EvidenceBundle, report: CitationReport): string {
  const lines = [
    "---",
    `evidence: ${bundle.items.length} item(s), negative searches: ${bundle.negativeSearches.length}`,
  ];
  if (report.orphans.length > 0) {
    lines.push(`citation warnings: ${report.orphans.length} unsupported reference(s)`);
    for (const orphan of report.orphans.slice(0, 5)) {
      lines.push(`- unsupported: ${orphan.path}${orphan.line ? `:${orphan.line}` : ""}`);
    }
  }
  if (!report.hasEvidence) {
    lines.push("note: no tool evidence recorded for this answer");
  }
  return lines.join("\n");
}

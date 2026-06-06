import { promises as fs } from "node:fs";
import * as path from "node:path";
import picomatch from "picomatch";

import { grammarForPath } from "../core/code-query/grammar-map.js";
import type { CodeMatchKind, FindInCodeOptions } from "../core/code-query/find-in-code.js";
import { DEFAULT_INDEX_EXCLUDES } from "../core/index-excludes.js";
import type { ToolRegistry } from "../core/tools.js";
import { globFiles } from "../core/tools/fs/glob.js";
import { searchContent, searchFiles } from "../core/tools/fs/search.js";
import type { AuthorizedRoots } from "../config.js";
import { isAuthorized, resolveAuthorizedPath } from "../path/authorized-roots.js";

function pathIsUnder(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function displayRel(rootDir: string, full: string): string {
  return path.relative(rootDir, full).replaceAll("\\", "/");
}

function compileNameFilter(
  filter: string | null | undefined,
): ((name: string, rel: string) => boolean) | null {
  if (!filter) return null;
  if (/[*?[\]{}()!+@]/.test(filter)) {
    const isMatch = picomatch(filter, { dot: true, nocase: true });
    return (name, rel) => isMatch(rel) || isMatch(name);
  }
  const lower = filter.toLowerCase();
  return (_name, rel) => rel.toLowerCase().includes(lower) || _name.toLowerCase().includes(lower);
}

const SKIP_DIR_NAMES: ReadonlySet<string> = new Set(
  DEFAULT_INDEX_EXCLUDES.dirs.filter((d) => d !== ".reasonix"),
);

const MAX_LIST_BYTES = 256 * 1024;

export interface MultiRootReadonlyOptions {
  roots: AuthorizedRoots;
}

function rootEntries(roots: AuthorizedRoots): Array<{ label: string; path: string }> {
  return [
    { label: "chatkit-middleware", path: path.resolve(roots.middleware) },
    { label: "chatkit-web", path: path.resolve(roots.web) },
    { label: "finclaw", path: path.resolve(roots.finclaw) },
  ];
}

function resolveSearchStart(
  raw: string | undefined,
  roots: AuthorizedRoots,
): Array<{ label: string; startAbs: string }> {
  if (!raw || raw === "." || raw === "") {
    return rootEntries(roots).map((r) => ({ label: r.label, startAbs: r.path }));
  }
  const abs = resolveAuthorizedPath(raw, roots);
  const hit = rootEntries(roots).find((r) => pathIsUnder(abs, r.path));
  if (!hit) throw new Error(`path escapes authorized roots: ${raw}`);
  return [{ label: hit.label, startAbs: abs }];
}

function prefixResult(label: string, body: string): string {
  return `[${label}]\n${body}`;
}

function resolveSinglePath(
  raw: string,
  roots: AuthorizedRoots,
): { label: string; rootPath: string; abs: string; rel: string } {
  const abs = resolveAuthorizedPath(raw, roots);
  if (!isAuthorized(abs, roots)) {
    throw new Error(`path escapes authorized roots: ${raw}`);
  }
  const root = rootEntries(roots).find((r) => pathIsUnder(abs, r.path));
  if (!root) throw new Error(`path escapes authorized roots: ${raw}`);
  return { label: root.label, rootPath: root.path, abs, rel: displayRel(root.path, abs) };
}

function toolMaxDepth(args: { max_depth?: number; maxDepth?: number }): number {
  const raw = args.max_depth ?? args.maxDepth ?? 2;
  return Math.max(1, Math.min(8, Math.floor(raw)));
}

async function listDirectoryBody(
  rootDir: string,
  dirAbs: string,
  includeDeps: boolean,
): Promise<string> {
  const entries = await fs.readdir(dirAbs, { withFileTypes: true });
  const filtered = entries
    .filter((entry) => includeDeps || !SKIP_DIR_NAMES.has(entry.name))
    .sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  if (filtered.length === 0) return "(empty)";
  return filtered
    .map((entry) => {
      const full = path.join(dirAbs, entry.name);
      const rel = displayRel(rootDir, full);
      return entry.isDirectory() ? `${rel}/` : rel;
    })
    .join("\n");
}

async function directoryTreeBody(
  rootDir: string,
  startAbs: string,
  args: { max_depth?: number; maxDepth?: number; include_deps?: boolean },
): Promise<string> {
  const maxDepth = toolMaxDepth(args);
  const includeDeps = args.include_deps === true;
  const out: string[] = [];
  let totalBytes = 0;
  let truncated = false;
  const push = (line: string): void => {
    if (truncated) return;
    if (totalBytes + line.length + 1 > MAX_LIST_BYTES) {
      out.push("[... directory tree truncated - narrow path or depth ...]");
      truncated = true;
      return;
    }
    out.push(line);
    totalBytes += line.length + 1;
  };
  const walk = async (dir: string): Promise<void> => {
    if (truncated) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const entry of entries) {
      if (truncated) return;
      if (!includeDeps && SKIP_DIR_NAMES.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      const rel = displayRel(rootDir, full);
      const depth = rel.split("/").filter(Boolean).length;
      if (depth > maxDepth) continue;
      push(entry.isDirectory() ? `${rel}/` : rel);
      if (entry.isDirectory() && depth < maxDepth) {
        await walk(full);
      }
    }
  };
  await walk(startAbs);
  return out.length === 0 ? "(empty)" : out.join("\n");
}

export function registerMultiRootReadonlyTools(
  registry: ToolRegistry,
  opts: MultiRootReadonlyOptions,
): void {
  const { roots } = opts;
  const ctxBase = {
    maxListBytes: MAX_LIST_BYTES,
    skipDirNames: SKIP_DIR_NAMES,
    isBinaryByName: (name: string) =>
      DEFAULT_INDEX_EXCLUDES.exts.some((ext) => name.toLowerCase().endsWith(ext)),
    nameMatch: null as ReturnType<typeof compileNameFilter>,
  };

  registry.register({
    name: "list_directory",
    readOnly: true,
    parallelSafe: true,
    stormExempt: true,
    description:
      "List immediate files and directories under authorized repo roots. Defaults to all configured repos.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory to list (default: all repo roots)." },
        include_deps: { type: "boolean" },
      },
    },
    fn: async (args: { path?: string; include_deps?: boolean }) => {
      const starts = resolveSearchStart(args.path, roots);
      const parts: string[] = [];
      for (const { label, startAbs } of starts) {
        const root = rootEntries(roots).find((r) => r.label === label)!;
        const body = await listDirectoryBody(root.path, startAbs, args.include_deps === true);
        parts.push(prefixResult(label, body));
      }
      return parts.join("\n\n");
    },
  });

  registry.register({
    name: "directory_tree",
    readOnly: true,
    parallelSafe: true,
    stormExempt: true,
    description:
      "Show a shallow file tree under authorized repo roots. Defaults to all configured repos; dependencies are skipped unless include_deps is true.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory to inspect (default: all repo roots)." },
        max_depth: { type: "integer", description: "Maximum depth, 1-8. Default 2." },
        maxDepth: { type: "integer", description: "Alias for max_depth." },
        include_deps: { type: "boolean" },
      },
    },
    fn: async (args: {
      path?: string;
      max_depth?: number;
      maxDepth?: number;
      include_deps?: boolean;
    }) => {
      const starts = resolveSearchStart(args.path, roots);
      const parts: string[] = [];
      for (const { label, startAbs } of starts) {
        const root = rootEntries(roots).find((r) => r.label === label)!;
        const body = await directoryTreeBody(root.path, startAbs, args);
        parts.push(prefixResult(label, body));
      }
      return parts.join("\n\n");
    },
  });

  registry.register({
    name: "search_files",
    readOnly: true,
    parallelSafe: true,
    stormExempt: true,
    description:
      "Search file names under authorized repo roots. pattern matches file names (substring or regex).",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Filename pattern." },
        path: {
          type: "string",
          description: "Directory to search (default: all repo roots).",
        },
        include_deps: { type: "boolean" },
      },
      required: ["pattern"],
    },
    fn: async (args: {
      pattern: string;
      path?: string;
      include_deps?: boolean;
    }) => {
      const starts = resolveSearchStart(args.path, roots);
      const parts: string[] = [];
      for (const { label, startAbs } of starts) {
        const body = await searchFiles(
          { rootDir: startAbs, maxListBytes: MAX_LIST_BYTES, skipDirNames: SKIP_DIR_NAMES },
          startAbs,
          { pattern: args.pattern, include_deps: args.include_deps },
        );
        parts.push(prefixResult(label, body));
      }
      return parts.join("\n\n");
    },
  });

  registry.register({
    name: "search_content",
    readOnly: true,
    parallelSafe: true,
    description: "Search file contents (grep) under authorized repo roots.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regex or literal pattern." },
        path: {
          type: "string",
          description: "File or directory scope (default: all roots).",
        },
        glob: {
          type: "string",
          description: "Optional file glob/substring filter, e.g. '**/*.ts'.",
        },
        case_sensitive: { type: "boolean" },
        context: { type: "integer", description: "Lines of context around hits." },
        summary_only: { type: "boolean", description: "Return per-file match counts only." },
        include_deps: { type: "boolean" },
      },
      required: ["pattern"],
    },
    fn: async (args: {
      pattern: string;
      path?: string;
      glob?: string;
      case_sensitive?: boolean;
      context?: number;
      summary_only?: boolean;
      include_deps?: boolean;
    }) => {
      const starts = resolveSearchStart(args.path, roots);
      const parts: string[] = [];
      for (const { label, startAbs } of starts) {
        const body = await searchContent(
          {
            ...ctxBase,
            rootDir: startAbs,
            nameMatch: compileNameFilter(args.glob),
          },
          startAbs,
          {
            pattern: args.pattern,
            case_sensitive: args.case_sensitive,
            context: args.context,
            summary_only: args.summary_only,
            include_deps: args.include_deps,
          },
        );
        parts.push(prefixResult(label, body));
      }
      return parts.join("\n\n");
    },
  });

  registry.register({
    name: "read_file",
    readOnly: true,
    parallelSafe: true,
    skipTruncationSave: true,
    stormExempt: true,
    description: "Read a text file under an authorized repo root.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to a repo root or absolute." },
        head: { type: "integer" },
        tail: { type: "integer" },
        range: { type: "string" },
      },
      required: ["path"],
    },
    fn: async (args: { path: string; head?: number; tail?: number; range?: string }) => {
      const abs = resolveAuthorizedPath(args.path, roots);
      if (!isAuthorized(abs, roots)) {
        throw new Error(`path escapes authorized roots: ${args.path}`);
      }
      const root = rootEntries(roots).find((r) => pathIsUnder(abs, r.path))!;
      const rel = displayRel(root.path, abs);
      const raw = await fs.readFile(abs);
      const text = raw.toString("utf8");
      let lines = text.split(/\r?\n/);
      if (lines.length > 0 && lines[lines.length - 1] === "") lines = lines.slice(0, -1);
      const totalLines = lines.length;

      if (typeof args.range === "string" && /^\d+\s*-\s*\d+$/.test(args.range)) {
        const [rawStart, rawEnd] = args.range.split("-").map((s) => Number.parseInt(s, 10));
        const start = Math.max(1, rawStart ?? 1);
        const end = Math.min(totalLines, Math.max(start, rawEnd ?? totalLines));
        const slice = lines.slice(start - 1, end);
        return prefixResult(
          root.label,
          `[${rel} range ${start}-${end}]\n${slice.join("\n")}`,
        );
      }
      if (typeof args.head === "number" && args.head > 0) {
        const count = Math.min(args.head, totalLines);
        return prefixResult(root.label, `[${rel} head ${count}]\n${lines.slice(0, count).join("\n")}`);
      }
      if (typeof args.tail === "number" && args.tail > 0) {
        const count = Math.min(args.tail, totalLines);
        return prefixResult(
          root.label,
          `[${rel} tail ${count}]\n${lines.slice(totalLines - count).join("\n")}`,
        );
      }
      return prefixResult(root.label, `[${rel}]\n${lines.join("\n")}`);
    },
  });

  registry.register({
    name: "glob",
    readOnly: true,
    parallelSafe: true,
    stormExempt: true,
    description:
      "Find files by glob pattern under authorized repo roots. Defaults to all repos and skips dependencies unless include_deps is true.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob pattern, e.g. '**/*.ts'." },
        path: { type: "string", description: "Directory scope (default: all repo roots)." },
        sort_by: { type: "string", enum: ["mtime", "name"] },
        include_deps: { type: "boolean" },
        limit: { type: "integer" },
      },
      required: ["pattern"],
    },
    fn: async (args: {
      pattern: string;
      path?: string;
      sort_by?: "mtime" | "name";
      include_deps?: boolean;
      limit?: number;
    }) => {
      const starts = resolveSearchStart(args.path, roots);
      const parts: string[] = [];
      for (const { label, startAbs } of starts) {
        const body = await globFiles(
          { rootDir: startAbs, skipDirNames: SKIP_DIR_NAMES },
          startAbs,
          {
            pattern: args.pattern,
            sort_by: args.sort_by,
            include_deps: args.include_deps,
            limit: args.limit,
          },
        );
        parts.push(prefixResult(label, body));
      }
      return parts.join("\n\n");
    },
  });

  registry.register({
    name: "get_file_info",
    readOnly: true,
    parallelSafe: true,
    stormExempt: true,
    description: "Return basic metadata for a file or directory under an authorized repo root.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File or directory path." },
      },
      required: ["path"],
    },
    fn: async (args: { path: string }) => {
      const target = resolveSinglePath(args.path, roots);
      const st = await fs.stat(target.abs);
      const kind = st.isDirectory() ? "directory" : st.isFile() ? "file" : "other";
      const lines = [
        target.rel,
        `type: ${kind}`,
        `size_bytes: ${st.size}`,
        `modified: ${st.mtime.toISOString()}`,
      ];
      return prefixResult(target.label, lines.join("\n"));
    },
  });

  registry.register({
    name: "get_symbols",
    readOnly: true,
    parallelSafe: true,
    stormExempt: true,
    description:
      "Outline a single TS/TSX/JS/JSX/Python/Go/Rust/Java file via tree-sitter. Use after locating candidate files.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path under an authorized repo root." },
      },
      required: ["path"],
    },
    fn: async (args: { path: string }) => {
      const target = resolveSinglePath(args.path, roots);
      if (!grammarForPath(target.abs)) {
        return prefixResult(
          target.label,
          JSON.stringify({
            path: target.rel,
            error:
              "language not supported (TS/TSX/JS/JSX/Python/Go/Rust/Java); use search_content",
          }),
        );
      }
      const source = await fs.readFile(target.abs, "utf8");
      const { extractSymbols } = await import("../core/code-query/symbols.js");
      const symbols = await extractSymbols(target.abs, source);
      return prefixResult(target.label, JSON.stringify({ path: target.rel, symbols }));
    },
  });

  registry.register({
    name: "find_in_code",
    readOnly: true,
    parallelSafe: true,
    stormExempt: true,
    description:
      "Find an exact identifier in one TS/TSX/JS/JSX/Python/Go/Rust/Java file, AST-filtered to skip comments and strings.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path under an authorized repo root." },
        name: { type: "string", description: "Exact identifier text." },
        kind: {
          type: "string",
          enum: ["any", "call", "definition", "reference"],
          description: "Filter by syntactic role. Default 'any'.",
        },
      },
      required: ["path", "name"],
    },
    fn: async (args: { path: string; name: string; kind?: string }) => {
      const target = resolveSinglePath(args.path, roots);
      if (!grammarForPath(target.abs)) {
        return prefixResult(
          target.label,
          JSON.stringify({
            path: target.rel,
            error:
              "language not supported (TS/TSX/JS/JSX/Python/Go/Rust/Java); use search_content",
          }),
        );
      }
      const source = await fs.readFile(target.abs, "utf8");
      const kind = (args.kind ?? "any") as CodeMatchKind | "any";
      const findOpts: FindInCodeOptions = kind === "any" ? {} : { kind };
      const { findInCode } = await import("../core/code-query/find-in-code.js");
      const matches = await findInCode(target.abs, source, args.name, findOpts);
      return prefixResult(target.label, JSON.stringify({ path: target.rel, matches }));
    },
  });
}

export function listRegisteredToolNames(registry: ToolRegistry): string[] {
  return registry.specs().map((s) => s.function.name);
}

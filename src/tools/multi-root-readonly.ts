import { promises as fs } from "node:fs";
import * as path from "node:path";

import { DEFAULT_INDEX_EXCLUDES } from "../core/index-excludes.js";
import type { ToolRegistry } from "../core/tools.js";
import { searchContent, searchFiles } from "../core/tools/fs/search.js";

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
  const lower = filter.toLowerCase();
  return (_name, rel) => rel.toLowerCase().includes(lower) || _name.toLowerCase().includes(lower);
}
import type { AuthorizedRoots } from "../config.js";
import { isAuthorized, resolveAuthorizedPath } from "../path/authorized-roots.js";

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
        context: { type: "integer", description: "Lines of context around hits." },
        include_deps: { type: "boolean" },
      },
      required: ["pattern"],
    },
    fn: async (args: {
      pattern: string;
      path?: string;
      context?: number;
      include_deps?: boolean;
    }) => {
      const starts = resolveSearchStart(args.path, roots);
      const parts: string[] = [];
      for (const { label, startAbs } of starts) {
        const body = await searchContent(
          {
            ...ctxBase,
            rootDir: startAbs,
            nameMatch: compileNameFilter(undefined),
          },
          startAbs,
          {
            pattern: args.pattern,
            context: args.context,
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
}

export function listRegisteredToolNames(registry: ToolRegistry): string[] {
  return registry.specs().map((s) => s.function.name);
}

import path from "node:path";

import { formatCbmJson, runCbmCli } from "../cbm/exec.js";
import { matchProjectForRepo, parseListProjects } from "../cbm/projects.js";
import type { ToolRegistry } from "../core/tools.js";
import {
  guardToolResult,
  maybeRecordSecurityAudit,
  type SecurityAuditLogger,
} from "../core/security/index.js";

const REPO_NAMES = ["chatkit-middleware", "chatkit-web", "finclaw"] as const;

export type CbmOperation =
  | "semantic"
  | "query"
  | "trace"
  | "architecture"
  | "impact"
  | "cypher"
  | "status";

export interface RegisterCbmSearchToolOptions {
  binary: string;
  projectRoot: string;
  defaultTopK: number;
  repoRoots?: Partial<Record<(typeof REPO_NAMES)[number], string>>;
  securityAudit?: SecurityAuditLogger;
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function resolveRepoPaths(opts: RegisterCbmSearchToolOptions): Array<{ repo: string; path: string }> {
  const codeRoot = path.join(opts.projectRoot, "code");
  return REPO_NAMES.map((repo) => ({
    repo,
    path: opts.repoRoots?.[repo] ?? path.join(codeRoot, repo),
  }));
}

function namePattern(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return ".*";
  if (trimmed.includes("*") || trimmed.startsWith(".*")) return trimmed;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return `.*${escaped}.*`;
}

function semanticQueryKeywords(query: string): string[] {
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2);
  const unique = [...new Set(tokens)];
  if (unique.length > 0) return unique.slice(0, 8);
  const fallback = query.trim().slice(0, 48);
  return fallback ? [fallback] : [];
}

export function buildCliCall(
  operation: CbmOperation,
  project: string,
  args: {
    query?: string;
    function_name?: string;
    direction?: string;
    top_k?: number;
    label?: string;
  },
  defaultTopK: number,
): { tool: string; payload: Record<string, unknown> } {
  const limit = clampInt(args.top_k, defaultTopK, 1, 50);

  switch (operation) {
    case "semantic":
      if (!args.query?.trim()) throw new Error("cbm_search semantic requires a non-empty query");
      return {
        tool: "search_graph",
        payload: { project, semantic_query: semanticQueryKeywords(args.query), limit },
      };
    case "query":
      if (!args.query?.trim()) throw new Error("cbm_search query requires a non-empty query");
      return {
        tool: "search_graph",
        payload: {
          project,
          name_pattern: namePattern(args.query),
          ...(args.label?.trim() ? { label: args.label.trim() } : {}),
          limit,
        },
      };
    case "trace": {
      const fn = args.function_name?.trim() || args.query?.trim();
      if (!fn) throw new Error("cbm_search trace requires function_name or query");
      const direction = args.direction === "inbound" || args.direction === "outbound"
        ? args.direction
        : "both";
      return {
        tool: "trace_path",
        payload: { project, function_name: fn, direction, depth: 5 },
      };
    }
    case "architecture":
      return { tool: "get_architecture", payload: { project } };
    case "impact":
      return { tool: "detect_changes", payload: { project } };
    case "cypher":
      if (!args.query?.trim()) throw new Error("cbm_search cypher requires a non-empty query");
      return { tool: "query_graph", payload: { project, query: args.query.trim() } };
    case "status":
      return { tool: "index_status", payload: { project } };
  }
}

function guardOutput(body: string, audit?: SecurityAuditLogger): string {
  const guarded = guardToolResult({ toolName: "cbm_search", result: body });
  maybeRecordSecurityAudit(audit, {
    surface: "tool",
    toolName: "cbm_search",
    ...guarded.audit,
  });
  return guarded.text;
}

function missingIndexMessage(repoPaths: Array<{ repo: string; path: string }>): string {
  return [
    "codebase-memory-mcp index is not available for the requested repo(s).",
    "Install: curl -fsSL https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh | bash",
    "Then run `npm run sync:code` and `npm run cbm:init`.",
    "Expected repos:",
    ...repoPaths.map((entry) => `- ${entry.repo}: ${entry.path}`),
  ].join("\n");
}

function queryFailedMessage(detail: string): string {
  return [
    "codebase-memory-mcp query failed for the indexed project(s).",
    detail,
  ].join("\n\n");
}

async function resolveCbmProjects(
  binary: string,
  targets: Array<{ repo: string; path: string }>,
): Promise<
  | { ok: true; entries: Array<{ repo: string; path: string; project: string }> }
  | { ok: false; error: string }
> {
  const listed = await runCbmCli(binary, "list_projects", {});
  if (!listed.ok) return { ok: false, error: listed.error };
  let projects;
  try {
    projects = parseListProjects(JSON.parse(listed.stdout.trim()));
  } catch {
    return { ok: false, error: "invalid list_projects JSON" };
  }
  const entries = targets
    .map((target) => {
      const matched = matchProjectForRepo(projects, target.path);
      return matched ? { ...target, project: matched.name } : null;
    })
    .filter((entry): entry is { repo: string; path: string; project: string } => entry !== null);
  return { ok: true, entries };
}

function mergeRankedResults(parsed: unknown[], topK: number): unknown[] {
  const rows = parsed.flatMap((value) => (Array.isArray(value) ? value : [value]));
  const scored = rows.filter((row): row is { score?: number } & Record<string, unknown> =>
    row !== null && typeof row === "object",
  );
  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return scored.slice(0, topK);
}

function selectRepos(
  repoPaths: Array<{ repo: string; path: string }>,
  repo?: string,
): Array<{ repo: string; path: string }> {
  if (!repo?.trim() || repo === "all") return repoPaths;
  const match = repoPaths.find((entry) => entry.repo === repo.trim());
  if (!match) {
    throw new Error(`cbm_search repo must be one of: ${REPO_NAMES.join(", ")}, or all`);
  }
  return [match];
}

export function registerCbmSearchTool(
  registry: ToolRegistry,
  opts: RegisterCbmSearchToolOptions,
): void {
  const repoPaths = resolveRepoPaths(opts);

  registry.register({
    name: "cbm_search",
    readOnly: true,
    parallelSafe: true,
    stormExempt: true,
    description:
      "Search codebase-memory-mcp graph indexes (structure + on-device semantic embeddings). "
      + "Use semantic for broad/feature/architecture questions; query/trace for symbols and call chains; "
      + "architecture for repo overview; impact for git diff blast radius. "
      + "Requires `npm run sync:code` and `npm run cbm:init`.",
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["semantic", "query", "trace", "architecture", "impact", "cypher", "status"],
          description: "semantic=meaning-based search; query=name/label graph search; trace=call chain.",
        },
        query: {
          type: "string",
          description: "Natural-language query (semantic), symbol pattern (query), or Cypher (cypher).",
        },
        function_name: {
          type: "string",
          description: "Function name for trace operation.",
        },
        direction: {
          type: "string",
          enum: ["inbound", "outbound", "both"],
          description: "Call direction for trace. Default both.",
        },
        label: {
          type: "string",
          description: "Optional graph label filter for query, e.g. Function, Class, Route.",
        },
        repo: {
          type: "string",
          description: "chatkit-middleware, chatkit-web, finclaw, or all (default all).",
        },
        top_k: {
          type: "integer",
          description: "Max hits for semantic/query. Default from config.",
        },
      },
    },
    fn: async (args: {
      operation?: CbmOperation;
      query?: string;
      function_name?: string;
      direction?: string;
      label?: string;
      repo?: string;
      top_k?: number;
    }) => {
      const operation = args.operation ?? "semantic";
      const targets = selectRepos(repoPaths, args.repo);
      const topK = clampInt(args.top_k, opts.defaultTopK, 1, 50);

      if (operation === "status") {
        const list = await runCbmCli(opts.binary, "list_projects", {});
        if (!list.ok) {
          return [missingIndexMessage(repoPaths), list.error].filter(Boolean).join("\n\n");
        }
        return guardOutput(formatCbmJson(list.stdout), opts.securityAudit);
      }

      try {
        buildCliCall(operation, "_", args, topK);
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }

      const resolved = await resolveCbmProjects(opts.binary, targets);
      if (!resolved.ok) {
        return [missingIndexMessage(targets), resolved.error].filter(Boolean).join("\n\n");
      }
      if (resolved.entries.length === 0) {
        return missingIndexMessage(targets);
      }

      let cliCall: { tool: string; payload: Record<string, unknown> };
      try {
        cliCall = buildCliCall(operation, resolved.entries[0]!.project, args, topK);
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }

      const results = await Promise.all(
        resolved.entries.map(async (entry) => {
          const call = operation === "architecture" || operation === "impact" || operation === "cypher"
            ? buildCliCall(operation, entry.project, args, topK)
            : { ...cliCall, payload: { ...cliCall.payload, project: entry.project } };
          const result = await runCbmCli(opts.binary, call.tool, call.payload);
          return { repo: entry.repo, ...result };
        }),
      );

      const failures = results.filter((result) => !result.ok);
      const successes = results.filter((result) => result.ok);

      if (successes.length === 0) {
        const detail = failures.map((result) => `${result.repo}: ${result.error}`).join("\n\n");
        return queryFailedMessage(detail);
      }

      const skipped = targets
        .filter((target) => !resolved.entries.some((entry) => entry.repo === target.repo))
        .map((target) => `${target.repo}: not indexed`);
      const skippedNote = skipped.length > 0 ? `\n\nSkipped (not indexed): ${skipped.join("; ")}` : "";

      if (operation === "architecture" || operation === "impact") {
        return guardOutput(
          successes.map((result) => `## ${result.repo}\n${formatCbmJson(result.stdout)}`).join("\n\n")
            + skippedNote,
          opts.securityAudit,
        );
      }

      if (operation === "semantic" || operation === "query" || operation === "cypher") {
        const parsed = successes.flatMap((result) => {
          try {
            const json = JSON.parse(result.stdout.trim()) as unknown;
            const rows = Array.isArray(json)
              ? json
              : json && typeof json === "object" && Array.isArray((json as { results?: unknown }).results)
                ? (json as { results: unknown[] }).results
                : [json];
            return rows.map((row) => ({ ...(typeof row === "object" && row ? row : { value: row }), repo: result.repo }));
          } catch {
            return [{ repo: result.repo, raw: result.stdout.trim() }];
          }
        });
        const merged = mergeRankedResults(parsed, topK);
        if (merged.length === 0) {
          return `No CBM matches. Fall back to search_content, glob, or read_file.${skippedNote}`;
        }
        return guardOutput(JSON.stringify(merged, null, 2) + skippedNote, opts.securityAudit);
      }

      return guardOutput(
        successes.map((result) => `## ${result.repo}\n${formatCbmJson(result.stdout)}`).join("\n\n")
          + skippedNote,
        opts.securityAudit,
      );
    },
  });
}

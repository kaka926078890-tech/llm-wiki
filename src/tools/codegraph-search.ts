import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { ToolRegistry } from "../core/tools.js";

const execFileAsync = promisify(execFile);
const MAX_OUTPUT_BYTES = 512 * 1024;
const REPO_NAMES = ["chatkit-middleware", "chatkit-web", "finclaw"] as const;

type CodeGraphOperation = "query" | "callers" | "callees" | "impact" | "files" | "status";

export interface RegisterCodeGraphSearchToolOptions {
  projectRoot: string;
  repoRoots?: Partial<Record<(typeof REPO_NAMES)[number], string>>;
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function resolveRepoPaths(opts: RegisterCodeGraphSearchToolOptions): Array<{ repo: string; path: string }> {
  const codeRoot = path.join(opts.projectRoot, "code");
  return REPO_NAMES.map((repo) => ({
    repo,
    path: opts.repoRoots?.[repo] ?? path.join(codeRoot, repo),
  }));
}

function buildArgs(
  projectPath: string,
  args: {
    operation?: CodeGraphOperation;
    query?: string;
    top_k?: number;
    kind?: string;
    filter?: string;
    pattern?: string;
    format?: string;
    max_depth?: number;
  },
): string[] {
  const operation = args.operation ?? "query";
  const limit = String(clampInt(args.top_k, operation === "query" ? 10 : 20, 1, 100));

  if (operation === "status") {
    return ["status", "--json", projectPath];
  }

  if (operation === "files") {
    const command = ["files", "--json", "--path", projectPath];
    if (args.filter?.trim()) command.push("--filter", args.filter.trim());
    if (args.pattern?.trim()) command.push("--pattern", args.pattern.trim());
    if (args.format && ["tree", "flat", "grouped"].includes(args.format)) {
      command.push("--format", args.format);
    }
    if (args.max_depth !== undefined) {
      command.push("--max-depth", String(clampInt(args.max_depth, 3, 1, 12)));
    }
    return command;
  }

  const query = args.query?.trim();
  if (!query) throw new Error(`codegraph_search ${operation} requires a non-empty query`);

  const command = [operation, query, "--json", "--path", projectPath, "--limit", limit];
  if (operation === "query" && args.kind?.trim()) {
    command.push("--kind", args.kind.trim());
  }
  return command;
}

function formatOutput(stdout: string): string {
  const trimmed = stdout.trim();
  if (!trimmed) return "(codegraph returned no output)";
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return trimmed;
  }
}

function missingIndexMessage(repoPaths: Array<{ repo: string; path: string }>): string {
  return [
    "CodeGraph index is unavailable or the query failed.",
    "Expected indexes under:",
    ...repoPaths.map((entry) => `- ${entry.repo}: ${entry.path}`),
    "Run `npm run sync:code` then `npm run codegraph:init`, or `npm run codegraph:sync` after code changes.",
  ].join("\n");
}

async function runCodegraph(
  projectRoot: string,
  projectPath: string,
  args: Parameters<typeof buildArgs>[1],
): Promise<{ ok: true; stdout: string } | { ok: false; error: string }> {
  const commandArgs = buildArgs(projectPath, args);
  try {
    const { stdout } = await execFileAsync("codegraph", commandArgs, {
      cwd: projectRoot,
      maxBuffer: MAX_OUTPUT_BYTES,
      timeout: 30_000,
    });
    return { ok: true, stdout };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stderr = typeof (err as { stderr?: unknown }).stderr === "string"
      ? (err as { stderr: string }).stderr.trim()
      : "";
    return { ok: false, error: [stderr, message].filter(Boolean).join("\n") };
  }
}

function mergeRankedResults(parsed: unknown[], topK: number): unknown[] {
  const rows = parsed.flatMap((value) => (Array.isArray(value) ? value : [value]));
  const scored = rows.filter((row): row is { score?: number } & Record<string, unknown> =>
    row !== null && typeof row === "object",
  );
  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return scored.slice(0, topK);
}

export function registerCodeGraphSearchTool(
  registry: ToolRegistry,
  opts: RegisterCodeGraphSearchToolOptions,
): void {
  const repoPaths = resolveRepoPaths(opts);

  registry.register({
    name: "codegraph_search",
    readOnly: true,
    parallelSafe: true,
    stormExempt: true,
    description:
      "Search local CodeGraph indexes for code symbols and relationships across chatkit-middleware, chatkit-web, and finclaw. Use for symbol lookup, callers, callees, impact analysis, indexed file listings, and index status. Requires `npm run sync:code` and `npm run codegraph:init` first.",
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["query", "callers", "callees", "impact", "files", "status"],
          description: "CodeGraph operation. Default query.",
        },
        query: {
          type: "string",
          description: "Symbol/name search text, required for query/callers/callees/impact.",
        },
        top_k: {
          type: "integer",
          description: "Maximum results for query/callers/callees/impact. Default 10 or 20.",
        },
        kind: {
          type: "string",
          description: "Optional node kind filter for query, such as function, class, method, route, or component.",
        },
        filter: {
          type: "string",
          description: "Optional directory filter for files operation.",
        },
        pattern: {
          type: "string",
          description: "Optional glob pattern for files operation.",
        },
        format: {
          type: "string",
          enum: ["tree", "flat", "grouped"],
          description: "Output format for files operation. Default tree.",
        },
        max_depth: {
          type: "integer",
          description: "Maximum tree depth for files operation.",
        },
      },
    },
    fn: async (args: {
      operation?: CodeGraphOperation;
      query?: string;
      top_k?: number;
      kind?: string;
      filter?: string;
      pattern?: string;
      format?: string;
      max_depth?: number;
    }) => {
      const operation = args.operation ?? "query";
      const topK = clampInt(args.top_k, operation === "query" ? 10 : 20, 1, 100);
      const results = await Promise.all(
        repoPaths.map(async (entry) => ({
          repo: entry.repo,
          ...(await runCodegraph(opts.projectRoot, entry.path, args)),
        })),
      );

      const failures = results.filter((result) => !result.ok);
      const successes = results.filter((result) => result.ok);

      if (successes.length === 0) {
        const detail = failures.map((result) => `${result.repo}: ${result.error}`).join("\n\n");
        return [missingIndexMessage(repoPaths), detail].filter(Boolean).join("\n\n");
      }

      if (operation === "status") {
        const payload = Object.fromEntries(
          successes.map((result) => [result.repo, JSON.parse(result.stdout.trim())]),
        );
        return JSON.stringify(payload, null, 2);
      }

      if (operation === "files") {
        return successes.map((result) => `## ${result.repo}\n${formatOutput(result.stdout)}`).join("\n\n");
      }

      const parsed = successes.map((result) => {
        try {
          return JSON.parse(result.stdout.trim()) as unknown;
        } catch {
          return result.stdout.trim();
        }
      });
      if (operation === "query" || operation === "callers" || operation === "callees" || operation === "impact") {
        const merged = mergeRankedResults(
          parsed.filter((value) => value !== null && value !== undefined),
          topK,
        );
        return JSON.stringify(merged, null, 2);
      }

      return successes.map((result) => `## ${result.repo}\n${formatOutput(result.stdout)}`).join("\n\n");
    },
  });
}

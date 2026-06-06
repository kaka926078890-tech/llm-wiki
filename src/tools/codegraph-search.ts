import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { ToolRegistry } from "../core/tools.js";

const execFileAsync = promisify(execFile);
const MAX_OUTPUT_BYTES = 512 * 1024;

type CodeGraphOperation = "query" | "callers" | "callees" | "impact" | "files" | "status";

export interface RegisterCodeGraphSearchToolOptions {
  projectRoot: string;
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function codeFolder(projectRoot: string): string {
  return path.join(projectRoot, "code");
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

function missingIndexMessage(projectPath: string): string {
  return [
    "CodeGraph index is unavailable or the query failed.",
    `Expected project path: ${projectPath}`,
    "Run `npm run codegraph:init` to create and index `code/`, or `npm run codegraph:sync` after code changes.",
  ].join("\n");
}

export function registerCodeGraphSearchTool(
  registry: ToolRegistry,
  opts: RegisterCodeGraphSearchToolOptions,
): void {
  const projectPath = codeFolder(opts.projectRoot);

  registry.register({
    name: "codegraph_search",
    readOnly: true,
    parallelSafe: true,
    stormExempt: true,
    description:
      "Search the local CodeGraph index for code symbols and relationships under the project code/ folder. Use for symbol lookup, callers, callees, impact analysis, indexed file listings, and index status. Requires `npm run codegraph:init` first.",
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
      const commandArgs = buildArgs(projectPath, args);
      try {
        const { stdout } = await execFileAsync("codegraph", commandArgs, {
          cwd: opts.projectRoot,
          maxBuffer: MAX_OUTPUT_BYTES,
          timeout: 30_000,
        });
        return formatOutput(stdout);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const stderr = typeof (err as { stderr?: unknown }).stderr === "string"
          ? (err as { stderr: string }).stderr.trim()
          : "";
        return [missingIndexMessage(projectPath), stderr || message].filter(Boolean).join("\n\n");
      }
    },
  });
}

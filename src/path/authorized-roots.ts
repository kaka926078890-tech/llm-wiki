import path from "node:path";

import type { AuthorizedRoots } from "../config.js";

export type { AuthorizedRoots };

function pathIsUnder(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function normalizeRoots(roots: AuthorizedRoots): string[] {
  return [
    path.resolve(roots.middleware),
    path.resolve(roots.web),
    path.resolve(roots.finclaw),
  ];
}

export function isAuthorized(
  resolvedPath: string,
  roots: AuthorizedRoots,
): boolean {
  const abs = path.resolve(resolvedPath);
  return normalizeRoots(roots).some((root) => pathIsUnder(abs, root));
}

export function resolveAuthorizedPath(
  raw: string,
  roots: AuthorizedRoots,
): string {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error("path must be a non-empty string");
  }

  const rootList = normalizeRoots(roots);

  if (path.isAbsolute(raw)) {
    const abs = path.resolve(raw);
    if (isAuthorized(abs, roots)) {
      return abs;
    }
    throw new Error(`path escapes authorized roots: ${raw}`);
  }

  for (const root of rootList) {
    const resolved = path.resolve(root, raw);
    if (pathIsUnder(resolved, root)) {
      return resolved;
    }
  }

  throw new Error(`path escapes authorized roots: ${raw}`);
}

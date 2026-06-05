import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import type { AuthorizedRoots } from "../src/path/authorized-roots.js";
import {
  isAuthorized,
  resolveAuthorizedPath,
} from "../src/path/authorized-roots.js";

describe("path authorized-roots", () => {
  const originalEnv = { ...process.env };
  let roots: AuthorizedRoots;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.DEEPSEEK_API_KEY = "test-key";
    roots = loadConfig().repos;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("P0-PATH-01 path inside middleware root is authorized", () => {
    const inside = path.join(roots.middleware, "package.json");
    expect(isAuthorized(inside, roots)).toBe(true);
  });

  it("P0-PATH-02 path inside web root is authorized", () => {
    const inside = path.join(roots.web, "package.json");
    expect(isAuthorized(inside, roots)).toBe(true);
  });

  it("P0-PATH-03 path inside finclaw root is authorized", () => {
    const inside = path.join(roots.finclaw, "package.json");
    expect(isAuthorized(inside, roots)).toBe(true);
  });

  it("P0-PATH-04 paths outside authorized roots are rejected", () => {
    expect(isAuthorized("/etc/passwd", roots)).toBe(false);

    const escaped = path.resolve(roots.middleware, "../../outside");
    expect(isAuthorized(escaped, roots)).toBe(false);
  });

  it("P0-PATH-05 resolveAuthorizedPath throws on path escape", () => {
    expect(() => resolveAuthorizedPath("../../outside", roots)).toThrow(
      /escapes authorized roots/i,
    );
    expect(() => resolveAuthorizedPath("/etc/passwd", roots)).toThrow(
      /escapes authorized roots/i,
    );
  });
});

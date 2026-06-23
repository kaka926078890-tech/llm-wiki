import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ToolRegistry } from "../src/core/tools.js";
import { registerMultiRootReadonlyTools } from "../src/tools/multi-root-readonly.js";

describe("readonly tools security harness", () => {
  let tempRoot: string | null = null;

  afterEach(async () => {
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  async function makeRoots() {
    tempRoot = await mkdtemp(join(tmpdir(), "llm-wiki-security-tools-"));
    const middleware = join(tempRoot, "chatkit-middleware");
    const web = join(tempRoot, "chatkit-web");
    const finclaw = join(tempRoot, "finclaw");
    await mkdir(join(middleware, "src"), { recursive: true });
    await mkdir(join(web, "config"), { recursive: true });
    await mkdir(join(finclaw, "src"), { recursive: true });
    await writeFile(join(web, ".env.production"), "API_KEY=sk-abcdefghijklmnopqrstuvwxyz1234567890\n");
    await writeFile(
      join(middleware, "src", "settings.ts"),
      [
        "export const publicName = 'chatkit';",
        "export const token = 'Bearer abcdefghijklmnopqrstuvwxyz123456';",
      ].join("\n"),
    );
    return { middleware, web, finclaw };
  }

  it("does not return sensitive file contents from read_file", async () => {
    const roots = await makeRoots();
    const registry = new ToolRegistry();
    registerMultiRootReadonlyTools(registry, { roots });

    const result = await registry.dispatch("read_file", { path: join(roots.web, ".env.production") });

    expect(result).toContain("security: content withheld");
    expect(result).toContain("sensitive_path");
    expect(result).not.toContain("sk-abcdefghijklmnopqrstuvwxyz1234567890");
  });

  it("redacts secret-like content from search_content results", async () => {
    const roots = await makeRoots();
    const registry = new ToolRegistry();
    registerMultiRootReadonlyTools(registry, { roots });

    const result = await registry.dispatch("search_content", {
      pattern: "Bearer",
      path: roots.middleware,
      context: 0,
    });

    expect(result).toContain("[REDACTED_BEARER_TOKEN]");
    expect(result).not.toContain("abcdefghijklmnopqrstuvwxyz123456");
    expect(result).toContain("security: redacted");
  });
});

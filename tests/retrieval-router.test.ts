import { describe, expect, it } from "vitest";

import { RetrievalRouter } from "../src/retrieval/router.js";
import { preferredTools } from "../src/retrieval/plan.js";

describe("retrieval router", () => {
  it("exposes preferred tools per plan kind", () => {
    expect(preferredTools("config")).toEqual(["glob", "search_content"]);
    expect(preferredTools("symbol")).toEqual(["cbm_search"]);
    expect(preferredTools("general")).toEqual([]);
  });

  it("blocks read_file for config until preferred tools run", () => {
    const router = new RetrievalRouter("config", true);
    const blocked = router.beforeCall("read_file");
    expect(blocked).toContain("routing");
    expect(blocked).toContain("glob");
  });

  it("unlocks after a successful preferred tool result", () => {
    const router = new RetrievalRouter("config", true);
    router.afterResult("glob", "vite.config.ts\npackage.json");
    expect(router.isUnlocked).toBe(true);
    expect(router.beforeCall("read_file")).toBeNull();
  });

  it("unlocks after all preferred tools attempted even if empty", () => {
    const router = new RetrievalRouter("config", true);
    router.afterResult("glob", "");
    expect(router.isUnlocked).toBe(false);
    router.afterResult("search_content", "no matches");
    expect(router.isUnlocked).toBe(true);
  });

  it("does not block for general questions", () => {
    const router = new RetrievalRouter("general", true);
    expect(router.beforeCall("directory_tree")).toBeNull();
  });
});

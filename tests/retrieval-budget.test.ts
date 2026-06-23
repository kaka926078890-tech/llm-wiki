import { describe, expect, it } from "vitest";

import { ToolRegistry } from "../src/core/tools.js";
import { RetrievalBudget, registerRetrievalBudget, loadRetrievalBudgetForQuestion } from "../src/retrieval/budget.js";

describe("retrieval budget", () => {
  it("blocks duplicate tool calls", () => {
    const budget = new RetrievalBudget({ enabled: true, totalMax: 10 });
    expect(budget.beforeCall("glob", { pattern: "*.yaml" })).toBeNull();
    const blocked = budget.beforeCall("glob", { pattern: "*.yaml" });
    expect(blocked).toContain("duplicate");
  });

  it("stops after total budget", () => {
    const budget = new RetrievalBudget({ enabled: true, totalMax: 2 });
    expect(budget.beforeCall("glob", { pattern: "a" })).toBeNull();
    expect(budget.beforeCall("glob", { pattern: "b" })).toBeNull();
    expect(budget.beforeCall("glob", { pattern: "c" })).toContain("budget exhausted");
  });

  it("tracks empty streak on search tools", () => {
    const budget = new RetrievalBudget({
      enabled: true,
      totalMax: 20,
      emptyStreakStop: 2,
    });
    budget.beforeCall("search_content", { query: "x" });
    budget.afterResult("");
    budget.beforeCall("search_content", { query: "y" });
    budget.afterResult("no matches");
    const blocked = budget.beforeCall("search_content", { query: "z" });
    expect(blocked).toContain("empty results");
  });

  it("raises config question budget floor above a low env total", () => {
    const opts = loadRetrievalBudgetForQuestion("chatkit-web 有哪些配置项", {
      LLM_WIKI_TOOL_BUDGET_TOTAL: "14",
    });
    expect(opts.totalMax).toBe(28);
    expect(opts.perToolMax?.read_file).toBe(10);
  });

  it("registers interceptor on ToolRegistry", async () => {
    const tools = new ToolRegistry();
    tools.register({
      name: "echo",
      fn: async (args: { x: string }) => JSON.stringify(args),
    });
    registerRetrievalBudget(tools, { enabled: true, totalMax: 1 });
    const first = await tools.dispatch("echo", { x: "1" });
    expect(first).toContain('"x":"1"');
    const second = await tools.dispatch("echo", { x: "1" });
    expect(second).toContain("duplicate");
  });
});

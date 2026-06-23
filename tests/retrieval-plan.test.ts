import { describe, expect, it } from "vitest";

import {
  augmentQuestionWithRetrievalPlan,
  classifyRetrievalPlan,
} from "../src/retrieval/plan.js";

describe("retrieval plan", () => {
  it("classifies config questions", () => {
    expect(classifyRetrievalPlan("chatkit-web 有哪些环境变量配置").kind).toBe("config");
  });

  it("classifies symbol questions", () => {
    expect(classifyRetrievalPlan("finclaw agent loop 入口在哪").kind).toBe("symbol");
  });

  it("classifies listing questions", () => {
    expect(classifyRetrievalPlan("chatkit-middleware 功能清单").kind).toBe("listing");
  });

  it("prepends hint to question", () => {
    const out = augmentQuestionWithRetrievalPlan("模块列表");
    expect(out).toContain("[Retrieval plan:");
    expect(out).toContain("模块列表");
  });
});

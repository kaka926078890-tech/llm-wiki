import { describe, expect, it } from "vitest";

import {
  detectGuessCountViolation,
  pairwiseJaccardStability,
  scoreSetOverlap,
  tokenSet,
} from "../src/benchmark/listing-scoring.js";

describe("listing set scoring", () => {
  it("scores perfect overlap", () => {
    const gold = tokenSet(["api-gateway", "orchestrator"]);
    const pred = tokenSet(["api-gateway", "orchestrator"]);
    const m = scoreSetOverlap(pred, gold);
    expect(m.f1).toBe(1);
    expect(m.jaccard).toBe(1);
  });

  it("detects guess count violations on primary heading only", () => {
    expect(detectGuessCountViolation("共 5 项", 29)).toBe(false);
    expect(detectGuessCountViolation("（共 29 项，来源", 29)).toBe(false);
    expect(detectGuessCountViolation("（共 5 项）", 29)).toBe(true);
    expect(detectGuessCountViolation("### 模块（共 12 项）", 43, "not-microservice")).toBe(false);
  });

  it("measures stability across runs", () => {
    const a = tokenSet(["a", "b", "c"]);
    const b = tokenSet(["a", "b", "c"]);
    expect(pairwiseJaccardStability([a, b, b])).toBe(1);
  });
});

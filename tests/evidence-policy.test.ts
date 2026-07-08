import { describe, expect, it } from "vitest";

import {
  EvidenceCollector,
  NO_EVIDENCE_ANSWER,
  applyEvidencePolicy,
  validateCitations,
} from "../src/core/evidence/index.js";

describe("evidence policy", () => {
  it("refuses answers when no tool evidence was collected", () => {
    const bundle = new EvidenceCollector("run-1", "guess?").toBundle();
    const report = validateCitations("Maybe it lives in src/foo.ts", bundle);
    const result = applyEvidencePolicy("Maybe it lives in src/foo.ts", bundle, report, {
      strict: true,
      refuseEmpty: true,
    });
    expect(result.refused).toBe(true);
    expect(result.answer).toBe(NO_EVIDENCE_ANSWER);
  });

  it("allows negative-search-only runs", () => {
    const collector = new EvidenceCollector("run-2", "missing symbol");
    collector.onToolStart("search_content", { query: "not-found" });
    const bundle = collector.toBundle();
    const report = validateCitations("No matches for not-found.", bundle);
    const result = applyEvidencePolicy("No matches for not-found.", bundle, report, {
      strict: true,
      refuseEmpty: true,
    });
    expect(result.refused).toBe(false);
  });

  it("strips orphan citations in strict mode for any surface", () => {
    const collector = new EvidenceCollector("run-3", "path?");
    collector.onToolResult(
      "read_file",
      { path: "chatkit-web/src/real.ts" },
      "[chatkit-web/src/real.ts range 1-2]\nexport {}",
    );
    const bundle = collector.toBundle();
    const answer = "Real [real.ts](chatkit-web/src/real.ts:1) and fake [x](chatkit-web/src/fake.ts:9).";
    const report = validateCitations(answer, bundle);
    const result = applyEvidencePolicy(answer, bundle, report, {
      strict: true,
      refuseEmpty: true,
    });
    expect(result.refused).toBe(false);
    expect(result.policyNotes).toContain("orphan_citations_stripped");
    expect(result.answer).not.toContain("fake.ts");
  });
});

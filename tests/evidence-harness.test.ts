import { describe, expect, it } from "vitest";

import {
  EvidenceCollector,
  extractCitations,
  validateCitations,
} from "../src/core/evidence/index.js";
import { classifyPathSensitivity, defaultSecurityPolicy } from "../src/core/security/policy.js";
import { guardFinalAnswer } from "../src/core/security/guard.js";

describe("evidence bundle", () => {
  it("collects read_file paths and validates markdown citations", () => {
    const collector = new EvidenceCollector("run-1", "where is health?");
    collector.onToolResult(
      "read_file",
      { path: "chatkit-middleware/src/routes/health.ts" },
      "[chatkit-middleware/src/routes/health.ts range 10-12]\nexport async function health() {}",
    );

    const bundle = collector.toBundle();
    const answer = "Health route is registered [health.ts](chatkit-middleware/src/routes/health.ts:11).";
    const report = validateCitations(answer, bundle);

    expect(bundle.items).toHaveLength(1);
    expect(extractCitations(answer)).toHaveLength(1);
    expect(report.orphans).toHaveLength(0);
  });

  it("flags orphan citations not backed by tool evidence", () => {
    const collector = new EvidenceCollector("run-2", "fake path");
    const bundle = collector.toBundle();
    const answer = "See [fake.ts](chatkit-web/src/fake.ts:9).";
    const report = validateCitations(answer, bundle);
    expect(report.orphans).toHaveLength(1);
  });
});

describe("dependency path policy", () => {
  it("treats node_modules paths as sensitive", () => {
    const result = classifyPathSensitivity("chatkit-web/node_modules/foo/index.js");
    expect(result.sensitive).toBe(true);
    expect(result.reasons.some((r) => r.includes("dependency_path"))).toBe(true);
  });
});

describe("source line limit", () => {
  it("truncates long consecutive source-like output in final answers", () => {
    const lines = Array.from({ length: 25 }, (_, i) => `import x${i} from "y${i}";`);
    const guarded = guardFinalAnswer(lines.join("\n"), defaultSecurityPolicy());
    expect(guarded.text).toContain("[source output truncated by security policy]");
    expect(guarded.audit.reasons).toContain("source_line_limit");
  });
});

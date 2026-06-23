import { describe, expect, it } from "vitest";

import { lintPublicAnswer } from "../src/benchmark/public-answer-lint.js";
import {
  scoreChecklistHits,
  scorePolarity,
  scoreQuestionStability,
  type GoldenQuestion,
  type RunScore,
} from "../src/benchmark/scoring.js";

describe("public answer lint", () => {
  it("flags code blocks, paths, env vars, and secrets", () => {
    const violations = lintPublicAnswer(
      [
        "```ts",
        "const x = 1",
        "```",
        "See src/routes/health.ts:12",
        "VITE_PROXY_AGENT_TARGET=http://localhost:26100",
        "Bearer abcdefghijklmnopqrstuvwxyz123456",
      ].join("\n"),
    );
    const rules = new Set(violations.map((v) => v.rule));
    expect(rules.has("code_block")).toBe(true);
    expect(rules.has("file_path")).toBe(true);
    expect(rules.has("env_var")).toBe(true);
    expect(rules.has("local_url")).toBe(true);
    expect(rules.has("secret_bearer")).toBe(true);
  });

  it("allows abstract category summaries", () => {
    const violations = lintPublicAnswer(
      "涉及前端代理目标配置、认证服务配置、管理后台接口。部分底层实现细节已按安全策略省略。",
    );
    expect(violations).toEqual([]);
  });
});

describe("benchmark scoring", () => {
  const question: GoldenQuestion = {
    id: "sample",
    category: "listing",
    question: "sample?",
    core: [
      { id: "feishu", patterns: ["飞书", "feishu"] },
      { id: "dingtalk", patterns: ["钉钉"] },
      { id: "wecom", patterns: ["企微", "wecom", "企业微信"] },
    ],
    polarity: [
      {
        id: "channels",
        positive: ["飞书", "钉钉"],
        negative: ["不支持飞书"],
      },
    ],
  };

  it("scores checklist hits", () => {
    const { hits, misses } = scoreChecklistHits("支持飞书与钉钉集成", question.core);
    expect(hits).toEqual(expect.arrayContaining(["feishu", "dingtalk"]));
    expect(misses).toContain("wecom");
  });

  it("passes stable runs with full union and high intersection", () => {
    const mkRun = (text: string, runIndex: number): RunScore => {
      const { hits, misses } = scoreChecklistHits(text, question.core);
      return {
        runIndex,
        answer: text,
        lintViolations: lintPublicAnswer(text),
        coreHits: hits,
        coreMisses: misses,
        polarityIssues: scorePolarity(text, question.polarity),
        latencyMs: 1,
        toolCalls: 1,
      };
    };
    const runs = [
      mkRun("支持飞书、钉钉与企业微信频道", 0),
      mkRun("飞书、钉钉、企微均已集成", 1),
      mkRun("IM 频道含飞书、钉钉与 WeCom", 2),
    ];
    const score = scoreQuestionStability(question, runs, {
      minCoreIntersectionRatio: 0.8,
      maxCoreMissPerRun: 2,
    });
    expect(score.passed).toBe(true);
    expect(score.intersectionRatio).toBeGreaterThanOrEqual(0.8);
  });

  it("fails when lint violations appear in any run", () => {
    const bad: RunScore = {
      runIndex: 0,
      answer: "配置见 VITE_PROXY_AGENT_TARGET",
      lintViolations: lintPublicAnswer("配置见 VITE_PROXY_AGENT_TARGET"),
      coreHits: ["feishu", "dingtalk", "wecom"],
      coreMisses: [],
      polarityIssues: [],
      latencyMs: 1,
      toolCalls: 1,
    };
    const good: RunScore = { ...bad, runIndex: 1, answer: "飞书钉钉企微", lintViolations: [], coreHits: ["feishu", "dingtalk", "wecom"] };
    const score = scoreQuestionStability(question, [bad, good, good], {
      minCoreIntersectionRatio: 0.8,
      maxCoreMissPerRun: 2,
    });
    expect(score.passed).toBe(false);
    expect(score.failReasons).toContain("public_answer_lint_failed");
  });
});

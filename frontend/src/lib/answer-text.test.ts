import { describe, expect, it } from "vitest";

import { answerFromSegments, cleanStreamedAnswer, hasSubstantiveAnswer } from "./answer-text.js";

describe("answer-text", () => {
  it("strips debug evidence footer", () => {
    const raw = "Full answer body\n\n---\nevidence: 372 item(s), negative searches: 3";
    expect(cleanStreamedAnswer(raw)).toBe("Full answer body");
  });

  it("strips inline budget prefix glued to planning text", () => {
    const raw =
      "Now let me read READMEs.errors.reasonBudget\n\n## Features\n\nBody.";
    expect(cleanStreamedAnswer(raw)).toBe("Now let me read READMEs.\n\n## Features\n\nBody.");
  });

  it("detects substantive markdown answers", () => {
    expect(hasSubstantiveAnswer("short")).toBe(false);
    expect(hasSubstantiveAnswer("## Title\n\n" + "x".repeat(100))).toBe(true);
  });

  it("picks longest cleaned text segment", () => {
    const answer = answerFromSegments([
      { kind: "text", text: "Now let me search..." },
      { kind: "tool", callId: "c1", name: "glob" },
      { kind: "text", text: "# Features\n\nLong markdown answer." },
    ]);
    expect(answer).toBe("# Features\n\nLong markdown answer.");
  });
});

import type { AnswerProfile } from "../../config.js";
import { guardFinalAnswer, type GuardedText } from "./guard.js";
import { sanitizeMcpPublicAnswer } from "./mcp-public.js";

export function applyAnswerProfile(text: string, profile: AnswerProfile): GuardedText {
  if (profile === "debug") {
    return {
      text,
      audit: {
        action: "allow",
        reasons: ["answer_profile:debug"],
        findings: [],
      },
    };
  }

  if (profile === "internal") {
    const guarded = guardFinalAnswer(text);
    return {
      text: guarded.text,
      audit: {
        ...guarded.audit,
        reasons: ["answer_profile:internal", ...guarded.audit.reasons],
      },
    };
  }

  const sanitized = sanitizeMcpPublicAnswer(text);
  const guarded = guardFinalAnswer(sanitized.text);
  return {
    text: guarded.text,
    audit: {
      ...guarded.audit,
      reasons: [
        "answer_profile:public",
        ...sanitized.findings.map((finding) => `mcp_public:${finding.kind}`),
        ...guarded.audit.reasons,
      ],
    },
  };
}

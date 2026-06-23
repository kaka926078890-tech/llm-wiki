import { defaultSecurityPolicy, type SecurityPolicy } from "./policy.js";

export interface RedactionFinding {
  kind: string;
  count: number;
}

export interface RedactionResult {
  text: string;
  findings: RedactionFinding[];
}

type RedactionRule = {
  kind: string;
  replacement: string | ((match: string, ...captures: string[]) => string);
  pattern: RegExp;
};

const REDACTION_RULES: RedactionRule[] = [
  {
    kind: "private_key",
    replacement: "[REDACTED_PRIVATE_KEY]",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
  {
    kind: "bearer_token",
    replacement: "Bearer [REDACTED_BEARER_TOKEN]",
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/g,
  },
  {
    kind: "openai_style_key",
    replacement: "[REDACTED_SECRET]",
    pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    kind: "jwt",
    replacement: "[REDACTED_JWT]",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}\b/g,
  },
  {
    kind: "database_url_password",
    replacement: (_match, prefix: string, _password: string, suffix: string) =>
      `${prefix}[REDACTED_SECRET]${suffix}`,
    pattern: /\b((?:postgres|postgresql|mysql|mongodb|redis):\/\/[^:\s/@]+:)([^@\s]+)(@[^)\]'"`\s]+)/gi,
  },
  {
    kind: "assignment_secret",
    replacement: (_match, prefix: string) => `${prefix}[REDACTED_SECRET]`,
    pattern: /\b((?:api[_-]?key|token|password|passwd|pwd|credential)\s*[:=]\s*['"]?)[A-Za-z0-9._~+/=-]{12,}/gi,
  },
];

function pushFinding(findings: Map<string, number>, kind: string, count: number): void {
  findings.set(kind, (findings.get(kind) ?? 0) + count);
}

export function redactText(
  text: string,
  _policy: SecurityPolicy = defaultSecurityPolicy(),
): RedactionResult {
  let redacted = text;
  const findings = new Map<string, number>();

  for (const rule of REDACTION_RULES) {
    let count = 0;
    redacted = redacted.replace(rule.pattern, (...args: string[]) => {
      count += 1;
      if (typeof rule.replacement === "function") {
        const [match, ...captures] = args;
        return rule.replacement(match ?? "", ...captures);
      }
      return rule.replacement;
    });
    if (count > 0) pushFinding(findings, rule.kind, count);
  }

  return {
    text: redacted,
    findings: [...findings.entries()].map(([kind, count]) => ({ kind, count })),
  };
}

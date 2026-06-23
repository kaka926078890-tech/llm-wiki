import {
  classifyPathSensitivity,
  defaultSecurityPolicy,
  type SecurityAction,
  type SecurityPolicy,
} from "./policy.js";
import { redactText, type RedactionFinding } from "./redactor.js";

export interface SecurityAudit {
  action: SecurityAction;
  reasons: string[];
  findings: RedactionFinding[];
}

export interface GuardedText {
  text: string;
  audit: SecurityAudit;
}

export interface GuardToolResultOptions {
  toolName: string;
  path?: string;
  result: string;
  policy?: SecurityPolicy;
}

function metadataOnlyResult(toolName: string, path: string | undefined, reasons: string[]): string {
  return [
    "security: content withheld",
    `tool: ${toolName}`,
    path ? `path: ${path}` : null,
    `reasons: ${reasons.join(", ")}`,
  ].filter(Boolean).join("\n");
}

function appendRedactionNotice(text: string, findings: RedactionFinding[]): string {
  if (findings.length === 0) return text;
  const summary = findings.map((finding) => `${finding.kind}=${finding.count}`).join(", ");
  return `${text}\n\nsecurity: redacted (${summary})`;
}

export function guardToolResult(opts: GuardToolResultOptions): GuardedText {
  const policy = opts.policy ?? defaultSecurityPolicy();
  const pathSensitivity = classifyPathSensitivity(opts.path, policy);
  if (pathSensitivity.sensitive) {
    return {
      text: metadataOnlyResult(opts.toolName, opts.path, pathSensitivity.reasons),
      audit: {
        action: "metadata_only",
        reasons: pathSensitivity.reasons,
        findings: [],
      },
    };
  }

  const redacted = redactText(opts.result, policy);
  return {
    text: appendRedactionNotice(redacted.text, redacted.findings),
    audit: {
      action: redacted.findings.length > 0 ? "redact" : "allow",
      reasons: redacted.findings.length > 0 ? ["secret_detected"] : [],
      findings: redacted.findings,
    },
  };
}

function looksLikeSourceLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.startsWith("```")) return false;
  if (/^\d+\s*[|:]\s*\S/.test(t)) return true;
  if (/^(import |export |function |class |const |let |var |async |public |private |protected )/.test(t)) {
    return true;
  }
  return /[{}();]/.test(t) && /[a-zA-Z_$]/.test(t) && !t.startsWith("|");
}

function truncateConsecutiveSourceLines(
  text: string,
  maxLines: number,
): { text: string; truncated: boolean } {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let streak = 0;
  let truncated = false;

  for (const line of lines) {
    if (looksLikeSourceLine(line)) {
      streak += 1;
      if (streak > maxLines) {
        truncated = true;
        continue;
      }
    } else {
      streak = 0;
    }
    out.push(line);
  }

  if (truncated) {
    out.push("", "[source output truncated by security policy]");
  }
  return { text: out.join("\n"), truncated };
}

export function guardFinalAnswer(
  text: string,
  policy: SecurityPolicy = defaultSecurityPolicy(),
): GuardedText {
  const sourceLimited = truncateConsecutiveSourceLines(
    text,
    policy.maxConsecutiveSourceLines,
  );
  const redacted = redactText(sourceLimited.text, policy);
  const reasons = [...(redacted.findings.length > 0 ? ["secret_detected"] : [])];
  if (sourceLimited.truncated) reasons.push("source_line_limit");
  return {
    text: appendRedactionNotice(redacted.text, redacted.findings),
    audit: {
      action: redacted.findings.length > 0 || sourceLimited.truncated ? "redact" : "allow",
      reasons,
      findings: redacted.findings,
    },
  };
}

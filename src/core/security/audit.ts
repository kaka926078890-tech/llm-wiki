import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import type { SecurityAudit } from "./guard.js";

export interface SecurityAuditEvent {
  timestamp: string;
  surface: "tool" | "answer";
  action: SecurityAudit["action"];
  reasons: string[];
  findings: SecurityAudit["findings"];
  toolName?: string;
  path?: string;
}

export interface SecurityAuditLogger {
  record(event: Omit<SecurityAuditEvent, "timestamp">): void;
}

export function createSecurityAuditLogger(filePath: string): SecurityAuditLogger {
  return {
    record(event) {
      try {
        mkdirSync(path.dirname(filePath), { recursive: true });
        appendFileSync(
          filePath,
          `${JSON.stringify({ timestamp: new Date().toISOString(), ...event })}\n`,
          "utf8",
        );
      } catch {
        /* audit logging must never affect the request path */
      }
    },
  };
}

export function maybeRecordSecurityAudit(
  logger: SecurityAuditLogger | undefined,
  event: Omit<SecurityAuditEvent, "timestamp">,
): void {
  if (!logger || event.action === "allow") return;
  logger.record(event);
  if (process.env.LLM_WIKI_DEBUG_TOOLS === "true" || process.env.LLM_WIKI_DEBUG_SECURITY === "true") {
    console.error(`[llm-wiki][security] ${JSON.stringify(event)}`);
  }
}

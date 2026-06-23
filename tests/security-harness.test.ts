import { describe, expect, it } from "vitest";

import {
  classifyPathSensitivity,
  defaultSecurityPolicy,
  guardFinalAnswer,
  guardToolResult,
  redactText,
} from "../src/core/security/index.js";

describe("security harness", () => {
  it("classifies common secret-bearing paths as sensitive", () => {
    const policy = defaultSecurityPolicy();

    expect(classifyPathSensitivity("apps/api/.env", policy).sensitive).toBe(true);
    expect(classifyPathSensitivity("certs/private.pem", policy).sensitive).toBe(true);
    expect(classifyPathSensitivity("config/client-secret.json", policy).sensitive).toBe(true);
    expect(classifyPathSensitivity("src/components/Button.tsx", policy).sensitive).toBe(false);
  });

  it("redacts token, JWT, database URL password, and private key material", () => {
    const text = [
      "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456",
      "OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz1234567890",
      "SESSION=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.signature",
      "DATABASE_URL=postgres://user:super-secret@localhost:5432/app",
      "-----BEGIN PRIVATE KEY-----",
      "abc123",
      "-----END PRIVATE KEY-----",
    ].join("\n");

    const result = redactText(text, defaultSecurityPolicy());

    expect(result.text).not.toContain("abcdefghijklmnopqrstuvwxyz1234567890");
    expect(result.text).not.toContain("super-secret");
    expect(result.text).not.toContain("abc123");
    expect(result.text).toContain("[REDACTED_BEARER_TOKEN]");
    expect(result.text).toContain("[REDACTED_SECRET]");
    expect(result.text).toContain("postgres://user:[REDACTED_SECRET]@localhost:5432/app");
    expect(result.text).toContain("[REDACTED_PRIVATE_KEY]");
    expect(result.findings.length).toBeGreaterThanOrEqual(4);
  });

  it("guards sensitive file tool output with metadata-only response", () => {
    const guarded = guardToolResult({
      toolName: "read_file",
      path: "services/.env.production",
      result: "[.env.production]\nAPI_KEY=sk-abcdefghijklmnopqrstuvwxyz1234567890",
      policy: defaultSecurityPolicy(),
    });

    expect(guarded.text).toContain("security: content withheld");
    expect(guarded.text).toContain("sensitive_path");
    expect(guarded.text).not.toContain("sk-abcdefghijklmnopqrstuvwxyz1234567890");
    expect(guarded.audit.action).toBe("metadata_only");
  });

  it("guards final answers by redacting detected secrets", () => {
    const guarded = guardFinalAnswer(
      "The token is Bearer abcdefghijklmnopqrstuvwxyz123456",
      defaultSecurityPolicy(),
    );

    expect(guarded.text).not.toContain("abcdefghijklmnopqrstuvwxyz123456");
    expect(guarded.text).toContain("[REDACTED_BEARER_TOKEN]");
    expect(guarded.audit.findings.length).toBeGreaterThan(0);
  });
});

# Security Harness P0-A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an engineering-level safety harness that prevents sensitive files and secrets from leaking through tool output or streamed final answers.

**Architecture:** Implement a small `core/security` package with policy, path classification, secret detection, redaction, audit events, and answer guarding. Integrate it at the current choke points: readonly retrieval tools, `cbm_search` output, and `/agent/run` SSE final answer events.

**Tech Stack:** TypeScript, Vitest, Fastify route tests, existing ToolRegistry and loop event SSE mapping.

---

### Task 1: Core Security Module

**Files:**
- Create: `src/core/security/policy.ts`
- Create: `src/core/security/redactor.ts`
- Create: `src/core/security/guard.ts`
- Create: `src/core/security/index.ts`
- Test: `tests/security-harness.test.ts`

- [x] Write failing tests for sensitive path classification and text redaction.
- [x] Run `npm test -- tests/security-harness.test.ts` and verify missing module failures.
- [x] Implement default policy, path classification, secret redaction, and answer guard.
- [x] Run `npm test -- tests/security-harness.test.ts` and verify pass.

### Task 2: Readonly Tool Guard

**Files:**
- Modify: `src/tools/multi-root-readonly.ts`
- Test: `tests/tools-readonly-security.test.ts`

- [x] Write failing tests that `.env` reads are blocked/metadata-only and grep results redact secrets.
- [x] Run `npm test -- tests/tools-readonly-security.test.ts` and verify failures.
- [x] Apply `guardToolResult` to `read_file` and `search_content`.
- [x] Run `npm test -- tests/tools-readonly-security.test.ts` and verify pass.

### Task 3: Semantic and CodeGraph Output Guard

**Files:**
- Modify: `src/tools/cbm-search.ts`
- Test: `tests/cbm-search.test.ts`

- [x] Extend semantic_search tests with a secret-bearing chunk.
- [x] Run the targeted test and verify failure.
- [x] Redact semantic and CodeGraph text output through the security guard.
- [x] Run targeted tests and verify pass.

### Task 4: Final Answer Guard

**Files:**
- Modify: `src/routes/ask.ts`
- Test: `tests/routes-ask-security.test.ts`

- [x] Write a failing route test where a mock assistant_final contains a private key/token.
- [x] Run `npm test -- tests/routes-ask-security.test.ts` and verify failure.
- [x] Guard assistant final/text events before serializing SSE.
- [x] Run targeted route security test and verify pass.

### Task 5: Verification

**Files:**
- No additional files expected.

- [x] Run all targeted security tests.
- [x] Run `npm test`.
- [x] Update this plan checklist if any scope changes occurred.

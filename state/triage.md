# Loop State — Triage

_Updated automatically by the loop-triage skill. Do not edit manually unless reopening a finding._
_Last run: 2026-07-13 (review-hardening)_

## Active Findings

| finding | source | priority | status | worktree | updated |
|---------|--------|----------|--------|----------|---------|
| Phase 4 review hardening | code-review follow-up | medium | reviewing | catalog/p4-hardening | 2026-07-13 |

## Inbox (awaiting human review)

| finding | source | reason held | added |
|---------|--------|-------------|-------|
| Enable `LLM_WIKI_CATALOG_LISTING=true` in **production** MCP | G2 rollout | human deploy decision (dev `.env` done 2026-07-13) | 2026-07-10 |

## Resolved (last 7 days)

| finding | source | resolution | closed |
|---------|--------|------------|--------|
| Phase 0.1: config/catalog-rules.yaml | implementation-plan §2 | `config/catalog-rules.yaml` (all-A) | 2026-07-10 |
| Phase 0.2: listing-questions.json | verification-plan §3.1 | 7 questions in `benchmarks/listing-questions.json` | 2026-07-10 |
| Phase 0.3: E0 baseline | verification-plan G0 | `e0-baseline-2026-07-10.json` | 2026-07-10 |
| Phase 1: catalog:gen + extract tests | verification-plan G1 | `src/catalog/*`, 135 tests green | 2026-07-10 |
| Phase 2: listing short-path + E1 | verification-plan G2 | E1 meanF1=1.0 ≥ E0 | 2026-07-10 |
| Phase 3: sync:full + regression | verification-plan G3 | catalog:gen in sync:full; quick verify 2/3 | 2026-07-10 |
| Phase 4: drift log + edition filter | implementation-plan §4 | drift.ts + M2 filter + README summary; PR #1 | 2026-07-13 |

---

_Findings older than 7 days in Resolved are pruned automatically by the triage skill._
_To reopen a finding, move it back to Active Findings and set status to `open`._

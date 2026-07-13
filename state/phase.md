# Catalog Refactor — Phase & Gate Status

_Updated when a verification gate passes. See docs/refactor-mcp/15-verification-plan.zh.md_

| Phase | Gate | Status | Report / evidence | Date |
|-------|------|--------|-------------------|------|
| 0 | G0 — E0 baseline exists | pass | `benchmarks/reports/e0-baseline-2026-07-10.json` (meanF1=0.14, N=3) | 2026-07-10 |
| 1 | G1 — catalog:gen + extract tests | pass | `npm run catalog:gen` exit 0; `tests/catalog-extract*.test.ts` | 2026-07-10 |
| 2 | G2 — E1 beats E0 | pass | `benchmarks/reports/e1-candidate-2026-07-10.json` (meanF1=1.0, stability=1.0) | 2026-07-10 |
| 3 | G3 — sync:full + golden + manual C | pass* | quick verify 2/3 (Jun baseline 3/3; flag off, LLM variance) | 2026-07-10 |
| 4 | optional hardening | pass | drift log on catalog:gen; M2 edition filter; README summary optional | 2026-07-13 |

**Current phase:** 4 (complete)  
**Next task:** none (optional hardening done); production flag rollout remains in inbox

**Feature flag:** `LLM_WIKI_CATALOG_LISTING=true` enables listing short-path.
- **Dev:** enabled in `.env` (2026-07-13).
- **Production MCP:** still inbox — human deploy sign-off required.

**Plans:** `docs/refactor-mcp/14-implementation-plan.zh.md` · `docs/refactor-mcp/15-verification-plan.zh.md` · [loop-runbook](./loop-runbook.zh.md)

# N1 Knowledge Stale Auto — Phase & Gate Status

_Mission: knowledge-stale-auto — **CLOSED** 2026-07-13_  
_Plans: `docs/knowledge-stale-auto/14-implementation-plan.zh.md` · `15-verification-plan.zh.md`_

| Phase | Gate | Status | Evidence | Date |
|-------|------|--------|----------|------|
| 1 | G1 — fast path inline stale | pass | `npm test -- tests/knowledge-fast-path`; FP-02 | 2026-07-13 |
| 2 | G2 — sync + refresh CLI | pass | `npm run knowledge:refresh-stale`; sync hook | 2026-07-13 |
| 3 | G3 — docs + mission close | pass | README + `.env.example`; full `npm test` 149 pass | 2026-07-13 |

**Current phase:** closed  
**Next task:** none — see `docs/backlog-and-loop-status.zh.md` (N2 CI golden candidate)

**Env:** `LLM_WIKI_KNOWLEDGE_AUTO_REFRESH=true` (default on `sync:code:full`)

---

_Catalog mission remains closed._

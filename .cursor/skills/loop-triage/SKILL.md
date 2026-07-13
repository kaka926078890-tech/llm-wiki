---
name: loop-triage
description: >
  Three-phase dev-session loop for llm-wiki: triage backlog (state/triage.md) →
  worktree implement → mandatory loop-reviewer. Active mission: N1 knowledge-stale-auto.
  Catalog mission closed (regression only). Use fixed /loop trigger — not per-task prompts.
---

# Loop Triage — llm-wiki

Writes findings to `./state/triage.md`. **Active mission:** N1 knowledge-stale-auto. **Closed:** catalog refactor (regression only).

## Which plan to read

Read `state/phase.md` first:

| Mission | Plans | When |
|---------|-------|------|
| **N1 knowledge-stale-auto** (active) | `docs/knowledge-stale-auto/14-implementation-plan.zh.md`, `15-verification-plan.zh.md` | Default — all new work |
| Catalog (closed) | `docs/refactor-mcp/14-15` | Only if `src/catalog/**` tests fail |

Runbook: `docs/knowledge-stale-auto/loop-runbook.zh.md`

## Read (Discovery inputs — N1)

1. **Previous state** — `./state/triage.md` (skip duplicates with `open`/`fixing`)
2. **Phase progress** — `./state/phase.md` (N1 phases 1–3, gates G1–G3):
   - Phase 1: `src/core/knowledge/fast-path.ts` inline `checkCardStale`; `tests/knowledge-fast-path` FP-02
   - Phase 2: `scripts/knowledge-refresh-stale.ts`, `npm run knowledge:refresh-stale`, sync hook in `sync-code-repos.mjs`
   - Phase 3: README + `.env.example` + mission close in `state/phase.md`
3. **CI / local test** — `npm run typecheck`, `npm test` (failures under `src/core/knowledge/**` → high)
4. **Inbox** — `./inbox/`
5. **Catalog regression** — if catalog tests red, add **one** regression finding; do not reopen Phase 0–4

Do **not** invent tasks outside N1 doc 14 unless catalog regression or explicit inbox promotion.

## Judge

| Rule | Action |
|------|--------|
| Blocks current N1 gate (G1–G3) | `priority:high` |
| Already in triage `open`/`fixing` | skip |
| Needs `DEEPSEEK_API_KEY` | → **inbox** (N1 does not need API) |
| Touches security harness / MCP sanitizer | → **inbox** |
| Confidence < high | → **inbox** |
| >1 phase of work | split per task id (1.1, 2.1, …) |
| Noise | skip |

Aim **1–2 findings** per run. **Phase order strict:** G1 before Phase 2 tasks.

## Hand off (N1)

```
worktree=knowledge-stale/<phase>-<slug>
goal=<from docs/knowledge-stale-auto/15-verification-plan.zh.md G1|G2|G3>
description=<task id from doc 14>
docs=docs/knowledge-stale-auto/14-implementation-plan.zh.md
```

**Stop conditions:**

| Task | Stop condition |
|------|----------------|
| 1.1–1.3 | `npm test -- tests/knowledge-fast-path` green; FP-02 passes |
| 2.1–2.3 | `npm run knowledge:refresh-stale` exit 0; sync hook present |
| 3.1–3.3 | README + `.env.example`; full `npm test` green |

## Stop (non-negotiable)

- Never merge to `main`. Never push directly to `main`.
- Never expose secrets.
- `loop-reviewer` REJECT → finding stays `open`; max 3 cycles → inbox.
- One primary variable per PR.
- Catalog: no table-external listing items (if touching catalog regression only).

## Implement / Verify

Same three-phase flow as catalog loop:

1. Worktree: `git worktree add ../llm-wiki-<slug> -b knowledge-stale/<slug>`
2. Max **2** findings per full `/loop` run (N1 is small).
3. Phase 3: mandatory `loop-reviewer` → `state/verdicts.jsonl`

## Trigger (fixed — N1 daily driver)

**Full cycle:**

```
/loop Run loop-triage end-to-end for N1 knowledge-stale-auto: Phase 1 read state/triage.md and docs/knowledge-stale-auto/14-15; Phase 2 implement highest-priority open finding in isolated worktree (max 2); Phase 3 launch loop-reviewer Task subagent (readonly), append verdict to state/verdicts.jsonl; update state/phase.md and open PR only on PASS. Budget 80k tokens.
```

**Triage only:**

```
/loop Run loop-triage Phase 1 only for N1 knowledge-stale-auto: discover findings, update state/triage.md. Budget 30k tokens.
```

Mission: `00-mission-loop.mdc`. Workers: `13-knowledge-stale-loop`, `11-mcp-runtime-loop`, `10-catalog-loop` (regression only).

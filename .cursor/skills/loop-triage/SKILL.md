---
name: loop-triage
description: >
  Three-phase dev-session loop for llm-wiki. Active mission: P2 graph-artifact.
  Closed: N1 knowledge-stale, Catalog (regression only). Fixed /loop trigger.
---

# Loop Triage — llm-wiki

Writes findings to `./state/triage.md`. **Active mission:** P2 graph-artifact.

## Which plan to read

| Mission | Plans | When |
|---------|-------|------|
| **P2 graph-artifact** (active) | `docs/p2-graph-artifact/14-15`, `loop-runbook.zh.md` | Default |
| N1 knowledge-stale | `docs/knowledge-stale-auto/` | Closed — regression only |
| Catalog | `docs/refactor-mcp/14-15` | Closed — `src/catalog/**` test failures only |

Read `state/phase.md` first.

## Read (Discovery — P2)

1. `./state/triage.md` — skip duplicates `open`/`fixing`
2. `./state/phase.md` — phases 0–3, G0–G3
3. Artifacts:
   - G0: `src/graph/types.ts`, `store.ts`
   - G1: `scripts/graph-gen.ts`, `.reasonix/graph.json`, `tests/graph-generate.test.ts`
   - G2: `src/routes/graph.ts`, `tests/routes-graph.test.ts`
   - G3: `frontend/src/ui/map-panel.tsx`, `build:frontend`
4. `npm run typecheck` / `npm test` failures → high priority
5. Prerequisite: `.reasonix/feature-lists/*.json` (from `catalog:gen`)

Do **not** invent tasks outside P2 doc 14 unless blocking gate or catalog/graph regression.

## Judge

| Rule | Action |
|------|--------|
| Blocks G0–G3 | `priority:high` |
| Already `open`/`fixing` | skip |
| Needs DEEPSEEK | → inbox (P2 does not) |
| CBM query_graph full import | → inbox (post-MVP) |
| >1 phase | split by task id |
| Phase N+1 before G(N) | skip |

Aim **1–2 findings** per run.

## Hand off (P2)

```
worktree=graph/p<phase>-<slug>
goal=<from docs/p2-graph-artifact/15-verification-plan G0|G1|G2|G3>
description=<task id from doc 14>
docs=docs/p2-graph-artifact/14-implementation-plan.zh.md
```

## Stop

- Never merge to `main` directly.
- loop-reviewer REJECT → max 3 cycles → inbox.
- One primary variable per PR.

## Trigger (P2 daily driver)

**Full cycle:**

```
/loop Run loop-triage end-to-end for P2 graph-artifact: Phase 1 read state/triage.md and docs/p2-graph-artifact/14-15; Phase 2 implement highest-priority open finding in isolated worktree (max 2); Phase 3 launch loop-reviewer Task subagent (readonly), append verdict to state/verdicts.jsonl; update state/phase.md and open PR only on PASS. Budget 120k tokens.
```

**Triage only:**

```
/loop Run loop-triage Phase 1 only for P2 graph-artifact: discover findings, update state/triage.md. Budget 30k tokens.
```

Workers: `14-graph-loop`, `13-knowledge-stale-loop` (regression), `10-catalog-loop` (regression).

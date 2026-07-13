---
name: loop-triage
description: >
  Three-phase dev-session loop for llm-wiki: triage backlog (state/triage.md) →
  worktree implement → mandatory loop-reviewer. Use with fixed /loop trigger —
  not per-task prompts. Also: catalog-refactor discovery after CI failure.
---

# Loop Triage — llm-wiki Catalog Refactor

Discovers work for the **feature-list / catalog** refactor and writes it to `./state/triage.md`.

**Authoritative plans (read every run):**

- `docs/refactor-mcp/14-implementation-plan.zh.md` — phases & file targets
- `docs/refactor-mcp/15-verification-plan.zh.md` — gates G0–G3, E0/E1 metrics
- `docs/refactor-mcp/16-decision-scope-all-A.zh.md` — scope rules baseline
- `docs/refactor-mcp/requirements-goals-solution.zh.md` — goals & non-goals
- `state/phase.md` — current phase & gate status (update when a gate passes)

## Read (Discovery inputs)

1. **Previous state** — `./state/triage.md` (skip duplicates with status `open` or `fixing`)
2. **Phase progress** — `./state/phase.md` and artifact checks:
   - Phase 0: `config/catalog-rules.yaml`, `benchmarks/listing-questions.json`, `benchmarks/reports/e0-baseline-*.json`
   - Phase 1: `scripts/catalog-gen.mjs`, `.reasonix/feature-lists/*.json`, `tests/catalog-extract*.test.ts`
   - Phase 2: `src/catalog/intent.ts`, `LLM_WIKI_CATALOG_LISTING`, E1 report beats E0
   - Phase 3: `sync:code:full` includes catalog:gen, G3 signed in `state/phase.md`
3. **CI / local test output** — `npm run typecheck`, `npm test` in `llm-wiki/` (failures → high priority)
4. **Verification scripts** (when present):
   - `npm run verify:listing -- --baseline|--candidate`
   - `npm run verify:upgrade -- --quick`
5. **Recent commits** on branch touching `src/catalog/`, `scripts/catalog*`, `config/catalog-rules.yaml`, `benchmarks/`
6. **Inbox** — `./inbox/` items not yet promoted

Do **not** invent tasks outside the implementation plan unless they block a gate.

## Judge

For each candidate:

| Rule | Action |
|------|--------|
| Blocks current phase gate (G0–G3) | `priority:high` |
| Already in triage with `open`/`fixing` | skip |
| Needs `DEEPSEEK_API_KEY` / live MCP for E0/E1 and key missing | → **inbox** (cannot verify stop condition in CI) |
| Touches security harness, MCP public sanitizer, or `.env` | → **inbox** |
| Confidence < high | → **inbox** |
| More than one phase worth of work | split into **one finding per phase sub-task** (0.1, 1.2, …) |
| Noise (docs-only typo, unrelated refactor) | skip |

Aim for **1–3 findings** per run (serial phases). More than 5 means the filter is too loose.

**Phase order is strict:** do not start Phase N+1 until gate G(N) is recorded in `state/phase.md`.

## Write (Persistence output)

Append to `./state/triage.md`:

| finding | source | priority | status | worktree | updated |
|---------|--------|----------|--------|----------|---------|

Commit before exit: `chore: loop triage YYYY-MM-DD`

Update `./state/phase.md` when a gate passes (date, report path, pass/fail).

## Hand off

For each kept finding, emit:

```
worktree=catalog/<phase>-<slug>
goal=<verifiable stop condition from 15-verification-plan>
description=<one line from 14-implementation-plan task id>
docs=docs/refactor-mcp/14-implementation-plan.zh.md#phase-N
```

**Stop condition examples (must be verifiable):**

| Task | Stop condition |
|------|----------------|
| 0.1 | `config/catalog-rules.yaml` exists; covers M/W/F/G per doc 16 |
| 0.2 | `benchmarks/listing-questions.json` has ≥7 questions per doc 15 |
| 0.3 | `benchmarks/reports/e0-baseline-*.json` exists with runs=3 |
| 1.5 | `npm run catalog:gen` exit 0; three JSON under `.reasonix/feature-lists/` |
| 1.x tests | `npm test -- tests/catalog-extract` all green |
| 2.x E1 | `npm run verify:listing -- --candidate` F1_mean ≥ 0.95 and ≥ E0 |
| 3.1 | `npm run sync:code:full` runs catalog:gen (see package.json script) |
| 3.3 | `npm run verify:upgrade -- --quick` does not regress baseline |

If stop condition requires API keys not available in this environment → **inbox**, not worktree.

## Stop (non-negotiable)

- Never merge to `main`. Never push directly to `main`.
- Never delete files unless the finding explicitly requires deletion.
- Never expose secrets in commits or reports.
- Catalog listing path: **no table-external items** (G3=A); reject PRs that let the model invent list entries.
- If evaluator `loop-reviewer` returns REJECT → fix or move finding back to `open`; do not mark gate passed.
- One primary variable per PR (plan §验证原则 item 3).

## Phase 2 — Implement (isolated worktree)

For each task line (max **3** per `/loop` run):

1. `git worktree add ../llm-wiki-<slug> -b catalog/<slug>` (or project worktree convention).
2. Set triage row `status: fixing`.
3. Minimal fix; run stop-condition commands as smoke only — **not** self-approval.
4. Set `status: reviewing` → Phase 3.

Never open PR in Phase 2. Never skip Phase 3.

## Phase 3 — Verify (mandatory loop-reviewer)

1. Launch **Task subagent** `loop-reviewer` with `readonly: true` on the worktree diff.
2. Reviewer must run `npm test` / gate commands — not read-only diff review.
3. Parse final line: `VERDICT: PASS` or `VERDICT: REJECT`.
4. Append to `state/verdicts.jsonl`: `{"finding":"<slug>","verdict":"pass|reject","reason":"...","at":"ISO8601"}`.
5. **PASS:** update `state/phase.md` if gate passed; finding → `pr-open`; open PR.
6. **REJECT:** finding → `open`; max **3** generate→review cycles then → `inbox/`.

Generator must not self-approve. Separate agent contexts.

## Trigger (fixed — use every time)

**Full cycle (daily driver — do not rewrite per task):**

```
/loop Run loop-triage end-to-end: Phase 1 read state/triage.md and docs/refactor-mcp/14–15; Phase 2 implement highest-priority open finding in isolated worktree (max 3); Phase 3 launch loop-reviewer Task subagent (readonly), append verdict to state/verdicts.jsonl; update state/phase.md and open PR only on PASS. Budget 100k tokens.
```

**Triage only:**

```
/loop Run loop-triage Phase 1 only: discover catalog-refactor findings, update state/triage.md. Budget 30k tokens.
```

**Loop discovery (which worker applies — not the daily driver):**

```bash
./scripts/dev/loop-dispatcher.sh
```

Mission rule `00-mission-loop.mdc` is always active. Worker rules: `10-catalog-loop`, `11-mcp-runtime-loop`, `12-benchmark-loop`.

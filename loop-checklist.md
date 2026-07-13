# Loop Engineering Checklist — llm-wiki Catalog Refactor

**Status: CLOSED (2026-07-13).** Catalog mission complete; checklist retained for audit. Next mission: see `docs/backlog-and-loop-status.zh.md`.

Before running the catalog loop unattended, verify every item.

## Architecture
- [x] Mission rule `.cursor/rules/00-mission-loop.mdc` (alwaysApply)
- [x] Worker rules: catalog / mcp-runtime / benchmark
- [x] Registry `.github/agent-loops/agent-loops.yaml`
- [x] Fixed `/loop` trigger documented in `docs/refactor-mcp/loop-runbook.zh.md`
- [x] Dispatcher `scripts/dev/loop-dispatcher.sh` for discovery only

## Discovery
- [x] Triage skill reads live sources (phase artifacts, tests, plans in `docs/refactor-mcp/`)
- [x] Skill is in `.cursor/skills/loop-triage/SKILL.md`
- [x] Skill skips noise (only phase-aligned tasks from doc 14)

## Handoff
- [x] Findings use branch `catalog/<phase>-<slug>` (worktree when practical)
- [ ] Two agents never write the same working directory simultaneously

## Verification
- [x] Evaluator at `.cursor/agents/loop-reviewer.md` (defaults to doubt)
- [x] Evaluator runs `npm test` / gate commands (Phase 4 PASS recorded)
- [x] Gate pass recorded in `state/phase.md` only after reviewer PASS

## Persistence
- [x] `./state/triage.md` committed after each triage run
- [x] `./state/phase.md` tracks G0–G3 (+ Phase 4 optional)
- [x] `./state/verdicts.jsonl` for reviewer PASS/REJECT audit
- [x] `./inbox/` exists for DEEPSEEK-dependent E0/E1 runs
- [x] PRs opened for completed work; never auto-merge to main (PR #1)

## Scheduling
- [x] GitHub Actions: `.github/workflows/loop-triage.yml` (test gate + workflow_dispatch)
- [x] Local: Cursor `@loop-triage` or mention loop-triage (see `docs/refactor-mcp/loop-runbook.zh.md`)
- [x] Budget: 50k tokens/run triage; 200k/day cap documented in runbook

## Safety
- [x] Loop cannot merge to main without human PR review
- [x] Security/MCP sanitizer / `.env` changes go to inbox
- [x] Know how to stop: cancel workflow, stop Cursor agent, set findings `status:paused`

## Catalog-specific
- [x] `config/catalog-rules.yaml` matches doc 16 (all A) and is runtime-authoritative
- [x] Listing answers never add items outside generated JSON (G3 lint → refuse)
- [x] E1 beat E0 before Phase 3 (doc 15 G2; report 2026-07-10)
- [x] Production `LLM_WIKI_CATALOG_LISTING=true` sign-off (2026-07-13)
- [x] Mission closed — no new Phase tasks unless regression

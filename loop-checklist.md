# Loop Engineering Checklist — llm-wiki Catalog Refactor

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
- [ ] Skill skips noise (only phase-aligned tasks from doc 14)

## Handoff
- [ ] Each finding uses isolated worktree `catalog/<phase>-<slug>`
- [ ] Two agents never write the same working directory simultaneously

## Verification
- [x] Evaluator at `.cursor/agents/loop-reviewer.md` (defaults to doubt)
- [ ] Evaluator runs `npm test` / gate commands, not only reads diff
- [ ] Gate pass recorded in `state/phase.md` only after reviewer PASS

## Persistence
- [x] `./state/triage.md` committed after each triage run
- [x] `./state/phase.md` tracks G0–G3
- [x] `./state/verdicts.jsonl` for reviewer PASS/REJECT audit
- [x] `./inbox/` exists for DEEPSEEK-dependent E0/E1 runs
- [ ] PRs opened for completed work; never auto-merge to main

## Scheduling
- [x] GitHub Actions: `.github/workflows/loop-triage.yml` (test gate + workflow_dispatch)
- [x] Local: Cursor `@loop-triage` or mention loop-triage (see `docs/refactor-mcp/loop-runbook.zh.md`)
- [x] Budget: 50k tokens/run triage; 200k/day cap documented in runbook

## Safety
- [ ] Loop cannot merge to main without human PR review
- [ ] Security/MCP sanitizer / `.env` changes go to inbox
- [ ] Know how to stop: cancel workflow, stop Cursor agent, set findings `status:paused`

## Catalog-specific
- [ ] `config/catalog-rules.yaml` matches doc 16 (all A)
- [ ] Listing answers never add items outside generated JSON (G3)
- [ ] E1 must beat E0 before Phase 3 (doc 15 G2)

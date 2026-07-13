#!/usr/bin/env bash
# Select llm-wiki worker loops from changed files or issue text (discovery only).
# Daily driver: fixed /loop trigger in docs/refactor-mcp/loop-runbook.zh.md

set -euo pipefail

MISSION_RULE="00-mission-loop"
EXPLICIT_FILES=""
ISSUE_TEXT=""

usage() {
  printf '%s\n' \
    'Usage:' \
    '  scripts/dev/loop-dispatcher.sh' \
    '  scripts/dev/loop-dispatcher.sh --files "src/catalog/intent.ts"' \
    '  scripts/dev/loop-dispatcher.sh --issue "listing F1 regressed"' \
    '' \
    'Note: fixed /loop trigger is the daily driver — not per-issue prompts.'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --files)
      [[ $# -ge 2 ]] || { echo '--files requires a value' >&2; exit 2; }
      EXPLICIT_FILES="$2"
      shift 2
      ;;
    --issue)
      [[ $# -ge 2 ]] || { echo '--issue requires a value' >&2; exit 2; }
      ISSUE_TEXT="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

normalize_words_to_lines() {
  printf '%s\n' "$1" | tr ' ' '\n' | awk 'NF { print }'
}

if [[ -n "$EXPLICIT_FILES" ]]; then
  CHANGED="$(normalize_words_to_lines "$EXPLICIT_FILES")"
elif [[ -n "$ISSUE_TEXT" ]]; then
  CHANGED=""
else
  CHANGED="$(git diff --name-only HEAD 2>/dev/null || true)"
  if [[ -z "$CHANGED" ]]; then
    CHANGED="$(git diff --name-only HEAD~1 2>/dev/null || true)"
  fi
fi

CONTEXT="$CHANGED
$ISSUE_TEXT"
SELECTED_LOOPS=()

add_loop() {
  local candidate="$1"
  local existing
  for existing in "${SELECTED_LOOPS[@]:-}"; do
    [[ "$existing" == "$candidate" ]] && return 0
  done
  SELECTED_LOOPS+=("$candidate")
}

context_matches() {
  local regex="$1"
  printf '%s\n' "$CONTEXT" | rg -qi "$regex"
}

if context_matches 'src/catalog/|catalog-rules|catalog-gen|listing-questions|catalog-extract|feature-list|listing|读表'; then
  add_loop 'catalog-loop'
fi
if context_matches 'src/routes/|src/core/|mcp|ask\.ts|loop-runner|sse/|sanitizer|answer profile'; then
  add_loop 'mcp-runtime-loop'
fi
if context_matches 'benchmarks/|verify-listing|verify-upgrade|e0-|e1-|meanF1|mean f1|f1 regressed'; then
  add_loop 'benchmark-loop'
fi

if [[ ${#SELECTED_LOOPS[@]} -eq 0 ]]; then
  SELECTED_LOOPS=("mission-only")
fi

printf '== Dispatcher ==\n' >&2
printf 'Selected loops:\n' >&2
printf '  - %s\n' "${SELECTED_LOOPS[@]}" >&2
printf '\nDaily driver: fixed /loop in loop-runbook.zh.md\n\n' >&2

LOOPS_STR=$(IFS=', '; echo "${SELECTED_LOOPS[*]}")

LOOP_RULES_SECTION=""
for loop in "${SELECTED_LOOPS[@]}"; do
  if [[ "$loop" != "mission-only" ]]; then
    LOOP_RULES_SECTION+="  - @${loop} (worker loop rule)
"
  fi
done

PROMPT=$(cat <<PROMPT
FinClaw-style loop discovery for llm-wiki (optional bootstrap prompt).

Active rules:
  - @${MISSION_RULE} (mission loop, always active)
${LOOP_RULES_SECTION}Selected worker loops: ${LOOPS_STR}

Prefer the fixed /loop trigger from loop-runbook.zh.md for unattended work.
PROMPT
)

printf '%s\n' "$PROMPT"

# P2 Loop — 知识图谱 + Project Map

日期：2026-07-13  
关联：[14 实施计划](./14-implementation-plan.zh.md) · [15 验证计划](./15-verification-plan.zh.md)

---

## 访谈结论

| # | 选择 |
|---|------|
| 1 触发 | 手动 `/loop` + CI test 失败 + graph 路径 push |
| 2 完成标准 | G0–G3（doc 15） |
| 3 工具链 | Cursor |
| 4 运行位置 | 本机（无 API key） |
| 5 PR | 开 PR，不 auto-merge |
| 6 Worker | `.cursor/rules/14-graph-loop.mdc` |
| 7 预算 | 分诊 30k；全流程 120k tokens/次 |

---

## 固定触发句

**全流程：**

```
/loop Run loop-triage end-to-end for P2 graph-artifact: Phase 1 read state/triage.md and docs/p2-graph-artifact/14-15; Phase 2 implement highest-priority open finding in isolated worktree (max 2); Phase 3 launch loop-reviewer Task subagent (readonly), append verdict to state/verdicts.jsonl; update state/phase.md and open PR only on PASS. Budget 120k tokens.
```

**仅分诊：**

```
/loop Run loop-triage Phase 1 only for P2 graph-artifact: discover findings, update state/triage.md. Budget 30k tokens.
```

---

## Worktree

`graph/p<phase>-<slug>` — 例：`graph/p0-schema`

---

## Phase → Gate

| Phase | Gate | 命令 |
|-------|------|------|
| 0 | G0 | store 单测 |
| 1 | G1 | `graph:gen` + generate 单测 |
| 2 | G2 | `routes-graph` + sync hook |
| 3 | G3 | `build:frontend` + 全量 test |

---

## 前置

跑 P2 前建议：

```bash
npm run typecheck && npm test          # 基线绿
npm run catalog:gen                    # feature-lists 就绪
```

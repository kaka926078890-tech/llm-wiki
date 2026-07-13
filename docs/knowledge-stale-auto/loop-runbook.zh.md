# N1 Loop — 知识 stale 自动化运行手册

日期：2026-07-13  
关联：[14 实施计划](./14-implementation-plan.zh.md) · [15 验证计划](./15-verification-plan.zh.md)

---

## 访谈结论

| # | 问题 | 选择 |
|---|------|------|
| 1 | 触发 | 手动 Cursor `/loop` + `src/core/knowledge/**` 测试失败 |
| 2 | 完成标准 | G1–G3（doc 15）；`npm test` |
| 3 | 工具链 | Cursor |
| 4 | 运行位置 | 本机 Agent（无 API key 依赖） |
| 5 | PR | Agent 开 PR，不 auto-merge |
| 6 | 规则 | `.cursor/rules/13-knowledge-stale-loop.mdc` |
| 7 | 预算 | 分诊 30k；全流程 80k tokens/次 |

---

## 固定触发句

**全流程：**

```
/loop Run loop-triage end-to-end for N1 knowledge-stale-auto: Phase 1 read state/triage.md and docs/knowledge-stale-auto/14-15; Phase 2 implement highest-priority open finding in isolated worktree (max 2); Phase 3 launch loop-reviewer Task subagent (readonly), append verdict to state/verdicts.jsonl; update state/phase.md and open PR only on PASS. Budget 80k tokens.
```

**仅分诊：**

```
/loop Run loop-triage Phase 1 only for N1 knowledge-stale-auto: discover findings, update state/triage.md. Budget 30k tokens.
```

---

## Worktree 命名

`knowledge-stale/<phase>-<slug>` — 例：`knowledge-stale/p1-inline-check`

---

## Phase → Gate

| Phase | Gate | 关键命令 |
|-------|------|----------|
| 1 | G1 | `npm test -- tests/knowledge-fast-path` |
| 2 | G2 | `npm run knowledge:refresh-stale` |
| 3 | G3 | `npm test` + 文档 |

---

## 停止

- Catalog mission 已 closed；不要混做 catalog Phase 任务。  
- 三 cycle REJECT → inbox。  
- cancel Agent / `status:paused` in triage。

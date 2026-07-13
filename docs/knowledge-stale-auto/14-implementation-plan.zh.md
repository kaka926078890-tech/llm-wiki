# 实施计划：知识卡片 stale 自动化（N1）

日期：2026-07-13  
状态：**可执行计划**  
前置：[backlog-and-loop-status](../backlog-and-loop-status.zh.md) · [验证计划](./15-verification-plan.zh.md)

---

## 0. 范围与假设

| 项 | 内容 |
|----|------|
| 做 | fast path 命中前 inline `checkCardStale`；`sync:code:full` / cbm sync 后批量 `refreshKnowledgeStale`；env 开关；单测 |
| 不做（本期） | embedding 检索；按时间 TTL；CBM `detect_changes` 增量 path→card 索引；每次问答全量 refresh 所有卡 |
| 口径 | 仍以 evidence 行段 hash 为准（现有 `stale.ts`） |
| 门禁 | 每 Phase 结束过 G1–G3（见验证计划） |

### 问题陈述

verified 知识卡片在证据文件变更后，若无人调用 `POST /api/knowledge/refresh-stale`，`staleAt` 未写入，fast path 仍可能返回旧答案。

### 目标行为

```
代码变更 → sync:code:full（或 cbm:sync + refresh 脚本）
              → refreshKnowledgeStale 标记 stale 卡

用户提问 → tryKnowledgeFastPath 命中 top-1 卡
              → checkCardStale（仅该卡）
              → stale 则 markStale + 放弃 fast path，走 Agent
```

---

## 1. 目标架构落点（文件级）

```
src/core/knowledge/
  fast-path.ts              # inline stale check + markStale on hit card
  stale.ts                  # （现有，不改算法除非测红）

scripts/
  knowledge-refresh-stale.ts   # CLI：load config → refreshKnowledgeStale → 打印 updatedCount
  sync-code-repos.mjs          # autoSync 块末尾可选调用 refresh CLI
  cbm-sync.mjs                 # 可选：sync 完成后调用 refresh（与上面二选一，优先 sync-code-repos）

.env.example                   # LLM_WIKI_KNOWLEDGE_AUTO_REFRESH
README.md                      # sync:full 与 stale 一句

tests/
  knowledge-fast-path.test.ts  # 新增：改文件未 refresh API 时 fast path miss
  knowledge-stale-sync.test.ts # 可选：mock/spawn refresh CLI 或纯函数集成测
```

**不新增依赖。** refresh CLI 用 `tsx` + 现有 `loadKnowledgeStore` / `refreshKnowledgeStale`。

---

## 2. Phase 划分

### Phase 1 — Fast path inline 校验（约 0.5 天）

| # | 任务 | 完成定义 |
|---|------|----------|
| 1.1 | `tryKnowledgeFastPath`：在 `isCardEvidenceFresh` 前对命中卡调 `checkCardStale` | stale → `store.markStale(id, reasons)` → return `null` |
| 1.2 | 移除 `fast-path.ts` 未使用的 dead import 或让 `isCardEvidenceFresh` 委托单卡检查（二选一，保持最小 diff） | `tsc` 无 unused 警告 |
| 1.3 | 单测：verified 卡 + 改 evidence 文件、无 `staleAt` → `tryKnowledgeFastPath` 返回 `null` 且卡带 `staleAt` | `npm test -- tests/knowledge-fast-path` 绿 |

**出口门 G1：** Phase 1 单测 + 全量 `npm test` 绿。

---

### Phase 2 — Sync 后批量 refresh（约 0.5 天）

| # | 任务 | 完成定义 |
|---|------|----------|
| 2.1 | `scripts/knowledge-refresh-stale.ts`：读 project root + repos，`refreshKnowledgeStale`，exit 0，stdout 打印 `updatedCount` | 手动 `tsx scripts/knowledge-refresh-stale.ts` 可跑 |
| 2.2 | `package.json` 增加 `"knowledge:refresh-stale": "tsx scripts/knowledge-refresh-stale.ts"` | 命令存在 |
| 2.3 | `sync-code-repos.mjs`：当 `--cbm-sync` / `LLM_WIKI_CBM_AUTO_SYNC` / `sync:code:full` 路径时，若 `LLM_WIKI_KNOWLEDGE_AUTO_REFRESH` 为 true（**默认 true**），在 cbm sync **之后**跑 refresh CLI | `sync:code:full` 日志可见 refresh 步骤 |
| 2.4 | 单测或脚本 smoke：`refreshKnowledgeStale` 在 hash 变化后 mark stale（可复用 `tests/knowledge.test.ts` 模式） | G2 命令绿 |

**出口门 G2：** `npm run knowledge:refresh-stale` 绿；sync 串联 smoke（可文档化 manual 若 spawn 难测）。

---

### Phase 3 — 文档与 env（约 0.25 天）

| # | 任务 | 完成定义 |
|---|------|----------|
| 3.1 | `.env.example` + README：说明 `LLM_WIKI_KNOWLEDGE_AUTO_REFRESH` | 可读 |
| 3.2 | 更新 `docs/backlog-and-loop-status.zh.md`：N1 完成态指针 | 文档一致 |
| 3.3 | `state/phase.md` 标 N1 closed | 门禁签字 |

**出口门 G3：** 全量 `npm test` + `npm run typecheck` 绿。

---

## 3. 建议排期（单人）

| 日 | 内容 |
|----|------|
| D1 AM | Phase 1 |
| D1 PM | Phase 2 |
| D2 | Phase 3 + loop-reviewer PASS + PR |

---

## 4. 回滚

| 手段 | 做法 |
|------|------|
| Env | `LLM_WIKI_KNOWLEDGE_AUTO_REFRESH=false` 跳过 sync 后 refresh |
| Code | revert fast-path inline 检查 → 回仅认 `staleAt`（不推荐） |
| Git | 单分支单 PR；红则不 merge |

---

## 5. 风险与缓解

| 风险 | 缓解 |
|------|------|
| bad path → 误 mark stale | 仅 fast path **命中 1 张卡** inline；全量 refresh 仍用现有 `resolveRepoPath` |
| sync 变慢 | refresh 仅 JSONL + 有 hash 的 evidence 读盘；卡少时可忽略 |
| 双写 stale | `markStale` 幂等；已 stale 不重复写 |

---

## 6. 与验证计划衔接

Phase 出口对应 [15-verification-plan](./15-verification-plan.zh.md) 的 **G1 / G2 / G3**。

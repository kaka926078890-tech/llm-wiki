# 验证计划：知识卡片 stale 自动化（N1）

日期：2026-07-13  
状态：**可执行**  
关联：[implementation-plan](./14-implementation-plan.zh.md)

---

## 1. 验证原则

1. **正确性优先**：证据变更后 fast path 不得返回旧答案。  
2. **一次一主变量**：先 Phase 1 inline，再 Phase 2 sync hook。  
3. **可回滚**：env 关 auto refresh 即回手动-only 批量检测。  
4. **红即停**：未过 G(N) 不进 Phase N+1。

---

## 2. 指标定义

| 指标 | 含义 | 门槛 |
|------|------|------|
| Fast path stale block | 改 evidence 文件、未调 API，`tryKnowledgeFastPath` 返回 `null` | **必须** |
| staleAt persisted | 上述场景卡写入 `staleAt` + `staleReasons` | **必须** |
| Sync refresh | `knowledge:refresh-stale` exit 0；hash 变后 `updatedCount ≥ 1` | **必须** |
| Regression | 全量 vitest + typecheck | **0 失败** |
| 猜数 / 清单 | 不触及 catalog | N/A |

---

## 3. 测试用例（单测必须覆盖）

### 3.1 Fast path inline（Phase 1）

| id | 步骤 | 期望 |
|----|------|------|
| FP-01 | verified 卡，evidence 未变 | fast path 命中 |
| FP-02 | verified 卡，改 evidence 行内容，无 prior `staleAt` | fast path `null`；卡 `staleAt` 已设 |
| FP-03 | draft 卡 | fast path `null`（现有行为保持） |
| FP-04 | 已 `markStale` 卡 | fast path `null`（现有行为保持） |

### 3.2 批量 refresh（Phase 2）

| id | 步骤 | 期望 |
|----|------|------|
| RF-01 | `checkCardStale` hash 变 | `{ stale: true, reasons 含 hash_changed }` |
| RF-02 | `refreshKnowledgeStale` | store 中卡 `staleAt` 写入 |
| RF-03 | hash 恢复一致后再 refresh | `clearStale`（现有 `stale.ts` 行为） |

---

## 4. 门禁（与实施 Phase 对齐）

### G1 — Phase 1 出口（fast path inline）

| 检查 | 通过条件 |
|------|----------|
| 单测 | `npm test -- tests/knowledge-fast-path` 全绿，含 FP-02 |
| 类型 | `npm run typecheck` exit 0 |
| 回归 | `npm test` 全绿 |

```bash
npm run typecheck
npm test -- tests/knowledge-fast-path
npm test
```

---

### G2 — Phase 2 出口（sync + CLI）

| 检查 | 通过条件 |
|------|----------|
| CLI | `npm run knowledge:refresh-stale` exit 0 |
| 脚本存在 | `scripts/knowledge-refresh-stale.ts` |
| sync 串联 | `sync-code-repos.mjs` 在 autoSync 且 flag true 时调用 refresh（读代码或 manual smoke 日志） |
| 单测 | `npm test -- tests/knowledge` 或 dedicated stale-sync 测绿 |

```bash
npm run knowledge:refresh-stale
npm test -- tests/knowledge
```

**Manual smoke（可选记录）：**

```bash
# temp card + change file + sync:code:full 或 knowledge:refresh-stale
npm run knowledge:refresh-stale
# expect updatedCount >= 1 in stdout
```

---

### G3 — Phase 3 出口（文档 + mission close）

| 检查 | 通过条件 |
|------|----------|
| 文档 | README + `.env.example` 含 `LLM_WIKI_KNOWLEDGE_AUTO_REFRESH` |
| 全量 | `npm test` + `npm run typecheck` |
| 状态 | `state/phase.md` N1 mission closed |

---

## 5. Loop 验收（loop-reviewer）

Reviewer 必须：

1. 读 diff，确认仅 N1 范围文件。  
2. 跑 G1–G3 中已完成 Phase 的命令。  
3. 输出 `VERDICT: PASS` 或 `VERDICT: REJECT`。

**PASS 后：** 更新 `state/phase.md`；finding → `pr-open`；开 PR（不 auto-merge）。

---

## 6. 固定验证命令（copy-paste）

```bash
cd llm-wiki
npm run typecheck
npm test -- tests/knowledge-fast-path tests/knowledge
npm run knowledge:refresh-stale   # after Phase 2
npm test
```

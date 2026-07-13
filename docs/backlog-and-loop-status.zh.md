# llm-wiki 进度、Backlog 与 Loop 状态

更新日期：2026-07-13  
用途：单一事实来源——Catalog 收尾决策、剩余优化 backlog、下一期 loop 准入条件。

相关文档：

- [progress.zh.md](./progress.zh.md) — 阶段完成度总览
- [knowledge-stale-auto/14-implementation-plan.zh.md](./knowledge-stale-auto/14-implementation-plan.zh.md) — N1（closed）
- [p2-graph-artifact/14-implementation-plan.zh.md](./p2-graph-artifact/14-implementation-plan.zh.md) — **P2 活跃 mission**
- [p2-graph-artifact/loop-runbook.zh.md](./p2-graph-artifact/loop-runbook.zh.md) — P2 固定 `/loop` 句
- [refactor-mcp/SUMMARY.zh.md](./refactor-mcp/SUMMARY.zh.md) — Catalog 重构（已归档）

---

## 1. Catalog 重构：已收尾

### 1.1 门禁状态（G0–G4 全部 pass）

| Phase | Gate | 状态 | 证据 |
|-------|------|------|------|
| 0 | G0 E0 基线 | pass | `benchmarks/reports/e0-baseline-2026-07-10.json` |
| 1 | G1 抽取器 | pass | `npm run catalog:gen`；`tests/catalog-extract*.test.ts` |
| 2 | G2 读表路径 E1 | pass | `e1-candidate-2026-07-10.json` meanF1=1.0 |
| 3 | G3 sync + golden | pass* | `sync:code:full` 含 catalog:gen；quick verify 2/3 |
| 4 | 加固（drift / M2 / G3 lint） | pass | PR #1；review-hardening 2026-07-13 |

### 1.2 人审拍板（2026-07-13）

| 事项 | 决策 | 说明 |
|------|------|------|
| 生产 MCP 开启 `LLM_WIKI_CATALOG_LISTING=true` | **是（需要）** | 清单题走离线 JSON 读表短路径；部署时在 production 环境变量设为 `true` |
| Catalog loop 继续自动发现新 Phase 任务 | **否** | Phase 0–4 已完成；loop 仅处理 catalog 回归（测试失败） |

**生产部署检查清单：**

1. `LLM_WIKI_CATALOG_LISTING=true`
2. 定期或发版前跑 `npm run sync:code:full`（生成 `.reasonix/feature-lists/*.json` + CBM 索引）
3. 回滚：`LLM_WIKI_CATALOG_LISTING=false` 即回旧 Agent 路径

### 1.3 Catalog loop 归档说明

- `state/phase.md` 标记 **closed**
- `state/triage.md` inbox 已清空；无 Active Findings 为正常状态
- 固定 `/loop` 句仍可用于 **catalog 路径回归**（`src/catalog/**` 测试红时）
- **不要**再按 doc 14 开新 Phase；下一批工作需新 mission + 新 implementation plan

---

## 2. 知识卡片：过期机制（现状摘要）

| 问题 | 答案 |
|------|------|
| 会过期吗？ | 会——证据文件 hash 变化或文件缺失 → `staleAt` |
| 按时间 TTL？ | **无** |
| 如何触发检测？ | 手动 `POST /api/knowledge/refresh-stale` 或 UI **Check stale** |
| Fast path 风险 | 未 refresh 前 verified 卡仍可能走 fast path（只认 `staleAt` 标志） |

**建议下一 mission（未开工）：** sync 后 auto refresh + fast path 命中前单卡 `checkCardStale`。见 §4.1。

---

## 3. 剩余 Backlog（Catalog 之外）

按投入/价值排序；**均不足以直接用现有 catalog loop-triage 驱动**——缺 doc 14/15 式 task id 与 gate。

### 3.1 高优先级（建议下一 loop mission）

| ID | 项 | 缺口 | 建议 stop condition |
|----|-----|------|---------------------|
| N1 | 知识 stale 自动化 | **closed** 2026-07-13 | inline check + sync refresh |
| N2 | P7 CI golden | GHA 不跑 verify | nightly `verify:upgrade --quick`；PR 仍 npm test |
| N3 | 文档同步 | progress 滞后 | progress.zh.md 反映 Catalog closed + 本文件 |

### 3.2 产品路线图（大项，需新 plan）

| 阶段 | 主题 | 状态 |
|------|------|------|
| P2 | 知识图谱 artifact（`.reasonix/graph.json`） | **closed** 2026-07-13 |
| P3 | 知识卡片 embedding 语义检索 | 部分完成（lexical only） |
| P4 | Evidence-bound 融合引擎 | 未开始 |
| P5 | Project Map UI | **MVP closed**（Map tab + `/api/graph`） |
| P6 | OKF / wiki 文档摄入（见仓库根 `Gemini.md` 设想） | 未开始 |
| P7 | golden 发版门禁（完整） | 起步 |
| P8 | 多 workspace 平台化 | 未开始 |

文档建议顺序：**P7 CI → P2 图谱 + Map → P4 引擎**。

### 3.3 体验与运维

| 项 | 现状 |
|----|------|
| 非清单 MCP 耗时 | 仍常 ~50–90s |
| CBM 增量 sync | 仅 full re-index |
| `docs/progress.zh.md` | 更新至 2026-06-23，未含 Catalog 完成态 |

---

## 4. Loop Engineering 评估

### 4.1 Catalog loop（已完成）

| 五要素 | 评价 |
|--------|------|
| 发现 | doc 14/15 + state 产物检查 |
| 交接 | worktree + 可验证 goal |
| 验证 | loop-reviewer + gate 命令 |
| 持久化 | triage / phase / verdicts |
| 调度 | 固定 `/loop` + GHA test gate |

**反模式：** Catalog 完成后若仍跑同一 triage 且无新 plan → 易陷入「手动循环」（人决定下一项做什么）。

### 4.2 开下一 loop 的前置条件（loop-engineering BUILD）

**N1 closed（2026-07-13）。**

**P2 closed（2026-07-13）：** catalog → `graph:gen` → `GET /api/graph` → Map UI；156 tests；已合并 main。

**N2 及以后仍需 BUILD 流程：**

1. 访谈定 mission（N2 CI golden 或 P2 图谱）
2. 写 implementation + verification plan
3. 扩展 triage discovery
4. 重置 `state/phase.md`
5. 启用固定 `/loop` 句

### 4.3 不能直接 loop 的内容

- `Gemini.md` OKF 方案：概念清楚，缺 schema、export 命令、测试
- P4 融合引擎：需 phase 拆分
- 生产 flag 本身：已是 **是**，属 deploy 配置而非代码 task

---

## 5. 决策记录

| 日期 | 决策 | 决策者 |
|------|------|--------|
| 2026-07-13 | Catalog Phase 0–4 正式 closed | 工程验收 + review-hardening PASS |
| 2026-07-13 | 生产 MCP 启用 `LLM_WIKI_CATALOG_LISTING=true` | **是（需要）** |
| 2026-07-13 | **P2 graph-artifact** | **closed** — G0–G3 pass；merged main |
| 2026-07-13 | N1 知识 stale 自动化 | **closed** — G1–G3 pass |
| 2026-07-13 | 下一 loop 候选：**N2 P7 CI golden** | 待 BUILD |

---

## 6. 相关命令速查

```bash
# Catalog 产物刷新
npm run sync:code:full

# 清单评测（需 DEEPSEEK_API_KEY）
npm run verify:listing -- --candidate --runs 3

# Golden 冒烟
npm run verify:upgrade -- --quick

# 知识 stale 检测（仍手动）
curl -X POST http://127.0.0.1:3001/api/knowledge/refresh-stale
```

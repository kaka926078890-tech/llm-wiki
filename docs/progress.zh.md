# llm-wiki 项目进度

更新日期：2026-07-13

## 一句话

**三仓库代码问答原型已可用**（Agent + MCP + CBM + 安全 harness + 证据闭环 + 检索控制 + 知识卡片 + 索引生命周期 + **Catalog 清单读表路径已收尾**）；**还不是**完整知识库产品（无 Project Map / P2 图谱、无 P4 融合引擎）。

Backlog 与 loop 状态见 [backlog-and-loop-status.zh.md](./backlog-and-loop-status.zh.md)。

---

## 架构（当前）

```
用户 / MCP 客户端
    ├── POST /agent/run     → SSE（Agent Stream，debug profile）
    ├── POST /mcp           → ask_llm_wiki（public profile）
    ├── GET  /health        → repo 路径 + CBM 状态
    ├── GET  /api/index/status → stale + sync job
    ├── POST /api/index/sync   → 后台 CBM re-index
    ├── GET  /api/knowledge    → 知识卡片列表（?sourceRunId= 过滤）
    └── GET  /api/runs      → 问答 telemetry 列表/详情
              ↓
         知识卡片 fast path（verified + hash 新鲜 → 跳过 tool loop）
              ↓
         Agent loop（DeepSeek）
              ├── 词法工具：glob / search_content / read_file / …
              ├── cbm_search → codebase-memory-mcp CLI（project API）
              ├── retrieval plan（分类 + preferred 提示）
              ├── retrieval router（硬路由：先 preferred 再 read）
              ├── tool budget（按题型下限 + 去重 + total 用尽早停）
              └── finalize：evidence 校验 + telemetry 落盘
              ↓
         core/security（tool guard + MCP public 降敏）
              ↓
         .reasonix/runs/<runId>.json
         .reasonix/knowledge-cards.jsonl
         .reasonix/security-audit.jsonl
```

---

## 阶段完成度总览

| 阶段 | 主题 | 状态 | 说明 |
|------|------|------|------|
| **P0-A** | 安全 Harness | ✅ 完成 | redaction、敏感路径、answer profile、audit |
| **P0** | 证据约束 | ✅ 完成 | bundle、双端引用校验、无证据拒答、Agent evidence SSE |
| **P0-B** | 检索计划与预算 | ✅ 完成 | plan、按题型 budget、硬路由、**total 用尽 loop 早停** |
| **P1** | 索引生命周期 | ✅ 完成 | stale、`/api/index/*`、Index 页 Re-index、`sync:code:full`（含 catalog:gen） |
| **Catalog** | 功能清单读表 | ✅ 完成 | G0–G4 pass；生产 `LLM_WIKI_CATALOG_LISTING=true` 已拍板 |
| **P2** | 知识图谱 artifact | ❌ 未开始 | `.reasonix/graph.json` 等 |
| **P3** | 知识卡片 | 🔶 大部分完成 | 存储、fast path、去重合并、aliases、hit 统计、MCP 保存；无 embedding 语义索引 |
| **P4** | Evidence-bound 引擎 | ❌ 未开始 | 多源融合 |
| **P5** | 产品 UI | 🔶 进行中 | Chat + Runs（含保存知识）+ Index + **Knowledge**；无 Map |
| **P6** | 文档/wiki 摄入 | ❌ 未开始 | OKF / Karpathy LLM-Wiki |
| **P7** | 评测回归 | 🔶 起步 | golden 15 题 + `verify:upgrade`；无 CI 门禁 |
| **P8** | 平台化 | ❌ 未开始 | 多 workspace |

图例：✅ 完成 · ⚠️/🔶 部分完成 · ❌ 未开始

---

## 近期交付（2026-06-23）

| 项 | 说明 |
|----|------|
| CBM 修复 | `cbm_search` 使用 `project` + keyword array，不再误报 index unavailable |
| Budget 早停 | `total` 预算用尽后 loop 强制 summary 并结束，减少无效 blocked 重试 |
| MCP 加速 | listing / architecture 问题默认跳过 Summary Agent 二次 LLM |
| Listing hint | 强化「CBM architecture 一次后转 glob/read，勿重复 cbm_search」 |
| 知识 fast path | verified 卡片 + evidence hash 新鲜 → Agent/MCP 直接返回答案 |
| Runs 联动 | 详情展示 finalAnswer；一键 Save as knowledge；按 sourceRunId 查关联卡片 |
| **P3.1 问法匹配** | 归一化 + 双向 token + bigram；`questionAliases` 参与打分 |
| **P3.1 保存去重** | score≥0.65 合并到同卡，更新答案/evidence |
| **MCP Chat 保存** | MCP 回答后可 Save；自动关联最近 run evidence |

---

## 已完成能力清单

### 问答与出口

| 能力 | 路径/命令 |
|------|-----------|
| Agent SSE 流 | `POST /agent/run` |
| MCP 单次问答 | `POST /mcp` → `ask_llm_wiki` |
| 知识卡片 fast path | `src/core/knowledge/fast-path.ts` |
| 三 repo 只读工具 | `src/tools/multi-root-readonly.ts` |
| CBM 检索 | `cbm_search`、`npm run cbm:init/sync` |
| Answer profile | `debug` / `internal` / `public` |

### P0 证据

| 能力 | 说明 |
|------|------|
| Evidence 采集 | `src/core/evidence/` |
| 双端引用校验 | `LLM_WIKI_EVIDENCE_STRICT`（默认 true） |
| 无证据拒答 | `LLM_WIKI_EVIDENCE_REFUSE_EMPTY`（默认 true） |
| Run telemetry | `.reasonix/runs/<runId>.json`（含 `finalAnswer`、`knowledgeCardId`） |
| Agent evidence SSE | 流结束发 `role: evidence` 事件 |

### P3 知识卡片

| 能力 | 说明 |
|------|------|
| JSONL 存储 | `.reasonix/knowledge-cards.jsonl` |
| CRUD API | `GET/POST/PATCH/DELETE /api/knowledge` |
| stale 检测 | `POST /api/knowledge/refresh-stale` + hash；**sync:full 自动 refresh**；fast path inline 校验 |
| 检索 hint | prompt 注入相关卡片（非 fast path 时） |
| fast path | verified + hash 新鲜 → 跳过 tool loop；命中时 `hitCount++` |
| 去重合并 | 相似问法保存合并；`questionAliases` 记录别称 |
| UI | Knowledge 页（hits / aliases / Re-verify）；Agent+MCP Chat 保存；Runs 补存 |

### P0-B 检索

| 能力 | 说明 |
|------|------|
| 问题分类 | config / symbol / listing / architecture / general |
| 按题型 budget 下限 | config=28、listing=26、symbol=18… |
| total 用尽早停 | loop `retrievalStopCheck` → forced summary |
| 硬路由 | `src/retrieval/router.ts` |
| Runs 查看 | 前端 **Runs** 页 + `GET /api/runs` |

### 测试

- **121** 条 vitest 用例（30 个测试文件）
- `tsc --noEmit` 通过

---

## 已知缺口 / 建议下一步

详见 [backlog-and-loop-status.zh.md](./backlog-and-loop-status.zh.md)。

| 项 | 缺口 |
|----|------|
| P3 | **stale 自动 refresh**（N1 done）；**无 embedding** | 部分完成 |
| P3 | 未反哺 P2 图谱 |
| P7 | CI 自动 golden 回归 |
| P2 + P5 | Project Map / 图谱 artifact |
| P4 | planner/retriever 分层重构 |
| MCP 耗时 | 清单题已走 catalog 短路径；非清单仍 ~50–90s |

建议下一 loop mission：**N1 知识 stale 自动化** 或 **N2 P7 CI** → 再 **P2 图谱 + Map**

---

## 运维命令速查

```bash
npm run sync:code:full     # 拉取 + CBM re-index
npm run dev                # 前后端
npm test                   # 116 条单测
npm run verify:upgrade -- --quick
```

### 相关环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `LLM_WIKI_EVIDENCE_STRICT` | true | 剥离无证据引用 |
| `LLM_WIKI_EVIDENCE_REFUSE_EMPTY` | true | 无证据拒答 |
| `LLM_WIKI_MCP_SKIP_SUMMARY` | false | true 时所有 MCP 问题跳过 Summary Agent |
| `LLM_WIKI_TOOL_BUDGET_TOTAL` | 按题型 floor | 不可压低下限 |

---

## 相关文档

| 文档 | 用途 |
|------|------|
| [backlog-and-loop-status.zh.md](./backlog-and-loop-status.zh.md) | Backlog、Catalog 收尾、loop 状态 |
| [knowledge-stale-auto/14-implementation-plan.zh.md](./knowledge-stale-auto/14-implementation-plan.zh.md) | N1 活跃 mission |
| [productization-roadmap.zh.md](./productization-roadmap.zh.md) | 分阶段设计 |
| [codebase-memory-mcp-integration-plan.zh.md](./codebase-memory-mcp-integration-plan.zh.md) | CBM 运维 |
| [README](../README.md) | 安装与 dev |

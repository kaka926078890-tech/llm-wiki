# llm-wiki 项目进度

更新日期：2026-06-23

## 一句话

**三仓库代码问答原型已可用**（Agent + MCP + CBM + 安全 harness + 证据/检索控制 + 索引生命周期 + 升级验证）；**还不是**可复用知识库产品（无知识卡片、无 Project Map / Knowledge UI）。

---

## 架构（当前）

```
用户 / MCP 客户端
    ├── POST /agent/run     → SSE（Agent Stream，debug profile）
    ├── POST /mcp           → ask_llm_wiki（public profile）
    ├── GET  /health        → repo 路径 + CBM 状态
    ├── GET  /api/index/status → stale + sync job
    ├── POST /api/index/sync   → 后台 CBM re-index
    └── GET  /api/runs      → 问答 telemetry 列表/详情
              ↓
         Agent loop（DeepSeek）
              ├── 词法工具：glob / search_content / read_file / …
              ├── cbm_search → codebase-memory-mcp CLI
              ├── retrieval plan（分类 + preferred 提示）
              ├── retrieval router（硬路由：先 preferred 再 read）
              ├── tool budget（按题型下限 + 去重 + 空结果熔断）
              └── finalize：evidence 校验 + telemetry 落盘
              ↓
         core/security（tool guard + MCP public 降敏）
              ↓
         .reasonix/runs/<runId>.json
         .reasonix/security-audit.jsonl
```

---

## 阶段完成度总览

| 阶段 | 主题 | 状态 | 说明 |
|------|------|------|------|
| **P0-A** | 安全 Harness | ✅ 完成 | redaction、敏感路径、answer profile、audit |
| **P0** | 证据约束 | ⚠️ 大部分完成 | bundle + MCP 引用校验 + telemetry；缺无证据拒答、Agent 引用校验 |
| **P0-B** | 检索计划与预算 | ✅ 完成 | plan、按题型 budget、硬路由、去重、Runs UI |
| **P1** | 索引生命周期 | ✅ 完成 | stale、`/api/index/*`、Index 页 Re-index、`sync:code:full` / `LLM_WIKI_CBM_AUTO_SYNC` |
| **P2** | 知识图谱 artifact | ❌ 未开始 | `.llm-wiki/graph.json` 等 |
| **P3** | 知识卡片 | ❌ 未开始 | 结构化 Q&A 沉淀 |
| **P4** | Evidence-bound 引擎 | ❌ 未开始 | 多源融合、无证据拒答 |
| **P5** | 产品 UI | 🔶 起步 | Chat + **Runs** + **Index**；无 Map / Knowledge |
| **P6** | 文档/wiki 摄入 | ❌ 未开始 | OKF / Karpathy LLM-Wiki |
| **P7** | 评测回归 | 🔶 起步 | golden 15 题 + `verify:upgrade`；无 CI 门禁 |
| **P8** | 平台化 | ❌ 未开始 | 多 workspace |

图例：✅ 完成 · ⚠️/🔶 部分完成 · ❌ 未开始

---

## 已完成能力清单

### 问答与出口

| 能力 | 路径/命令 |
|------|-----------|
| Agent SSE 流 | `POST /agent/run` |
| MCP 单次问答 | `POST /mcp` → `ask_llm_wiki` |
| 三 repo 只读工具 | `src/tools/multi-root-readonly.ts` |
| CBM 检索 | `cbm_search`、`npm run cbm:init/sync` |
| Answer profile | `debug` / `internal` / `public` |

### P0 安全

| 能力 | 说明 |
|------|------|
| Tool-output guard | `read_file`、`search_content`、`cbm_search` |
| MCP public 降敏 | 路径/env/代码块 → 类别摘要（`mcp-public.ts`） |
| Final-answer guard | secret redaction + 连续源码行截断 |
| Dependency 路径 | `node_modules`、`dist` 等 metadata-only |
| 审计 | `.reasonix/security-audit.jsonl` |

### P0 证据

| 能力 | 说明 |
|------|------|
| Evidence 采集 | `src/core/evidence/` |
| MCP 引用校验 | `LLM_WIKI_EVIDENCE_STRICT`（默认 true） |
| Run telemetry | `.reasonix/runs/<runId>.json` |
| Agent evidence SSE | 流结束发 `role: evidence` 事件 |

### P1 索引

| 能力 | 说明 |
|------|------|
| Stale 检测 | CBM `detect_changes` per project |
| git HEAD | 各 repo 当前 commit（展示用） |
| 索引状态 API | `GET /api/index/status`（`/health` 的 `cbm` 段同结构） |
| Index 页 | 前端顶栏 **Index** |
| 同步记录 | `cbm:init/sync` 写入 `.reasonix/cbm-index-state.json` |
| 后台 re-index | `POST /api/index/sync`（单进程全局锁） |
| Index 页 Re-index | stale 时一键触发 |
| 拉代码后自动索引 | `npm run sync:code:full` 或 `LLM_WIKI_CBM_AUTO_SYNC=true` |

### P0-B 检索

| 能力 | 说明 |
|------|------|
| 问题分类 | config / symbol / listing / architecture / general |
| 按题型 budget 下限 | config=28、listing=26、symbol=18…（完整率优先） |
| 硬路由 | `src/retrieval/router.ts`，`LLM_WIKI_RETRIEVAL_ROUTING_ENABLED` |
| 重复调用去重 | 相同工具+参数 fingerprint |
| Runs 查看 | 前端 **Runs** 页 + `GET /api/runs` |

### 评测与技能

| 资产 | 路径 |
|------|------|
| Golden 题集（15 题） | `benchmarks/golden-questions.json` |
| 升级验证脚本 | `npm run verify:upgrade` |
| Cursor skill | `.cursor/skills/llm-wiki-upgrade-verify/SKILL.md` |

### 测试

- **98** 条 vitest 用例（25 个测试文件）
- `tsc --noEmit` 通过

---

## 部分完成 / 已知缺口

| 项 | 已有 | 缺口 |
|----|------|------|
| 证据引擎 | MCP orphan 剥离 | **无证据拒答**；Agent 答案未做引用校验 |
| 索引 | stale 检测 + Re-index API | — |
| 评测 | 本地 `verify:upgrade` | **CI 自动回归**；15 题全量发版门禁 |
| 前端 | Chat、Runs | Project Map、Index Status、Knowledge、Evidence 详情面板 |
| Agent 出口 | 刻意 debug 全量 | 若对内也要降敏需单独产品决策 |

---

## 未开始（按路线图）

1. **P2** — 从 CBM 导出项目图谱 artifact  
2. **P3** — Knowledge card 生成与检索  
4. **P4** — 证据绑定问答引擎（融合 lexical + CBM + 卡片 + graph）  
5. **P5** — 除 Runs/Index 外的产品视图  
6. **P6** — OKF / 文档 wiki 摄入  
7. **P8** — 多项目平台化  

---

## 建议下一步（优先级）

1. **P3 首批知识卡片** — 在 evidence + golden 稳定后沉淀高频问答  
2. **P2 + P5** — 图谱导出 + Project Map 最小 UI  
3. **P0 补强** — 无证据拒答、Agent 引用校验  

---

## 运维命令速查

```bash
npm run sync:code          # 拉取三 repo
npm run sync:code:full     # 拉取 + CBM re-index
npm run cbm:setup          # sync + 首次索引
npm run cbm:sync           # 代码变更后重索引
npm run dev                # 前后端（Chat + Runs）
npm test                   # 98 条单测
npm run verify:upgrade -- --quick   # golden 冒烟（需 DEEPSEEK_API_KEY）
npm run verify:upgrade              # golden 全量 15×3
```

---

## 验证记录（近期）

| 时间 | 场景 | 结果 |
|------|------|------|
| 2026-06-23 | `verify:upgrade --quick`（budget=14 时） | 2/3 通过；config 题打满 14 次工具上限 |
| 2026-06-23 | 按题型 budget 下限（config=28）后单题复验 | `web-config-inventory` **通过**（3/3 次） |

---

## 本地可选清理

```bash
rm -rf .tei-hf-cache code/*/.codegraph
# .env 可删：LLM_WIKI_TEI_*、LLM_WIKI_SEMANTIC_*、固定 LLM_WIKI_TOOL_BUDGET_TOTAL=14
```

---

## 相关文档

| 文档 | 用途 |
|------|------|
| [progress.zh.md](./progress.zh.md) | **主进度文档**（阶段表、缺口、命令、验证记录） |
| [productization-roadmap.zh.md](./productization-roadmap.zh.md) | 分阶段设计与原则 |
| [codebase-memory-mcp-integration-plan.zh.md](./codebase-memory-mcp-integration-plan.zh.md) | CBM 架构与运维 |
| [README](../README.md) | 安装、dev、verify:upgrade |

**文档同步（2026-06-23）**：`README`、`integration-plan`、`roadmap` 已与 `progress.zh.md` 对齐；路线图正文 P1 等章节已改为 CBM-only 表述。

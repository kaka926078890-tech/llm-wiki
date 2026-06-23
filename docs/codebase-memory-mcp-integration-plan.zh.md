# codebase-memory-mcp 接入 llm-wiki 落地方案

日期：2026-06-23（2026-06-24 更新：TEI / CodeGraph 已移除；2026-06-23 同步 P0/P0-B 进度，见 [progress.zh.md](./progress.zh.md)）

## 文档目的

在 [研究总结](./codebase-memory-mcp-research.zh.md) 基础上，记录 llm-wiki 以 **codebase-memory-mcp（CBM）** 作为唯一结构/语义检索后端的实现与后续演进。目标 repo：`chatkit-web`、`chatkit-middleware`、`finclaw`。

**当前状态：Phase 1 已完成；P0-B 检索控制已完成。** `cbm_search` 已接入 loop；TEI、CodeGraph 已删除。

---

## 0. 前置条件与现状

### 0.1 llm-wiki 已有能力

| 能力 | 位置 | 状态 |
|------|------|------|
| 检索计划分类 | `src/retrieval/plan.ts` | ✅ |
| 硬路由（preferred 先行） | `src/retrieval/router.ts` | ✅ |
| 工具调用预算（按题型下限） | `src/retrieval/budget.ts` | ✅ |
| CBM 封装 | `src/tools/cbm-search.ts` | ✅ |
| CBM 健康状态 | `src/cbm-status.ts`、`GET /health` | ✅ |
| 安全 Harness | `src/core/security/` | ✅ P0-A |
| 证据 bundle + telemetry | `src/core/evidence/`、`src/telemetry/` | ✅ P0 |
| Run 查看 API / UI | `GET /api/runs`、前端 Runs 页 | ✅ P0-B |
| Golden 升级验证 | `benchmarks/`、`npm run verify:upgrade` | ✅ P7 起步 |

### 0.2 已移除（不再维护）

- Docker TEI + BGE 语义索引（`compose.tei.yaml`、`semantic_search` 等）
- CodeGraph CLI 封装（`codegraph_search`、`@colbymchenry/codegraph`）
- 各 repo 内 `.reasonix/semantic/`、`.codegraph/` 本地 artifact（可手动删除）

### 0.3 明确不做的事（YAGNI）

- 不把 CBM 的 14 个 MCP 工具直接暴露给外部 MCP 客户端（仍只暴露 `ask_llm_wiki`）。
- 不在 llm-wiki 内嵌 3D 图 UI（使用 CBM 自带 UI 或后续产品前端）。
- 不自研 C 级索引引擎。

---

## 1. 总体架构（当前态）

```
用户 / MCP 客户端
       │
       ▼
  ask_llm_wiki（llm-wiki Agent loop）
       │
       ├── lexical 工具（glob / search_content / read_file）
       └── cbm_search ──► codebase-memory-mcp CLI
                    │
                    ▼
            ~/.cache/codebase-memory-mcp/
```

**检索路由（plan + router + budget）：**

| 问题类型 | Preferred（硬路由先行） | Budget 总上限下限 |
|----------|-------------------------|-------------------|
| `config` | `glob`, `search_content` | 28 |
| `symbol` | `cbm_search` | 18 |
| `listing` | `cbm_search`, `glob` | 26 |
| `architecture` | `cbm_search` | 24 |
| `general` | （无硬路由） | 20 |

---

## 2. 运维命令

```bash
npm run sync:code      # 拉取三 repo 最新代码
npm run cbm:setup      # sync + 首次索引
npm run cbm:sync       # 代码变更后重索引
npm run cbm:status     # 查看已索引项目
```

环境变量：`.env.example` 中 `LLM_WIKI_CBM_*`。

---

## 3. 后续演进

| 优先级 | 项 | 状态 |
|--------|-----|------|
| P1 | 索引 stale 检测、Index 管理页 | ✅ 完成 |
| P2 | 从 CBM 导出 `.llm-wiki/graph.json` | 未开始 |
| P3 | knowledge card + evidence bundle | 未开始 |
| P7 | golden 进 CI | 未开始 |

完整进度：[progress.zh.md](./progress.zh.md)

---

## 附录：历史分阶段设计（归档）

> 以下 Phase 0–4 为 2026-06 初稿，含 CodeGraph / TEI 双轨描述，**已过时**，仅作考古参考。实施请以本文第 0–3 节与 [progress.zh.md](./progress.zh.md) 为准。

### Phase 0：评估与本地试点（归档）

**目标：** 在三个 repo 上验证 CBM 索引质量与查询延迟，产出 Go/No-Go 数据。

#### 2.0.1 安装 CBM

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh | bash

# 验证
codebase-memory-mcp --version
echo '{}' | codebase-memory-mcp   # 应输出 JSON-RPC 相关内容
```

#### 2.0.2 索引三个 repo

```bash
cd /path/to/llm-wiki/llm-wiki
npm run sync:code

# 对每个 repo 单独索引（CBM 按 repo 管理 project）
codebase-memory-mcp cli index_repository \
  '{"repo_path": "'$(pwd)'/code/chatkit-web"}'
codebase-memory-mcp cli index_repository \
  '{"repo_path": "'$(pwd)'/code/chatkit-middleware"}'
codebase-memory-mcp cli index_repository \
  '{"repo_path": "'$(pwd)'/code/finclaw"}'

codebase-memory-mcp cli list_projects
```

#### 2.0.3 评估问题集（手工或脚本）

对每类至少跑 3 题，记录：工具调用次数、答案是否 grounded、CBM vs CodeGraph 谁更快更准。

| 类型 | 示例问题 |
|------|----------|
| 符号/调用链 | `chatkit-middleware 里谁调用了 MCP 注册逻辑？` |
| 影响分析 | `改 finclaw 的 auth 入口会影响哪些调用方？` |
| 架构 | `chatkit-web monorepo 有哪些子 package？` |
| 路由 | `finclaw-frontend 暴露了哪些 API 代理路径？` |
| 配置 | `chatkit-web 有哪些 VITE 环境变量？`（预期 CBM 弱，lexical 强） |

#### 2.0.4 CLI 探针命令

```bash
# 架构总览
codebase-memory-mcp cli get_architecture \
  '{"repo_path": "'$(pwd)'/code/chatkit-web"}'

# 调用链
codebase-memory-mcp cli trace_path \
  '{"function_name": "buildLoop", "direction": "both", "repo_path": "'$(pwd)'/code/chatkit-web"}'

# Cypher
codebase-memory-mcp cli query_graph \
  '{"query": "MATCH (r:Route) RETURN r.name LIMIT 20", "repo_path": "'$(pwd)'/code/chatkit-web"}'

# git diff 影响（在有未提交改动时）
codebase-memory-mcp cli detect_changes \
  '{"repo_path": "'$(pwd)'/code/chatkit-web"}'
```

#### 2.0.5 Phase 0 验收标准

- [ ] 三个 repo 均能成功 `index_repository`，`list_projects` 有节点/边计数。
- [ ] `trace_path`、`get_architecture` 在 TS/Go 代码上返回非空、可人工核对的结果。
- [ ] 记录每 repo 全量索引耗时（写入评估表）。
- [ ] 产出 **Go/No-Go 备忘录**（1 页）：结构类问题 CBM 是否明显优于 CodeGraph。

**No-Go 条件：** 对 chatkit-web TS monorepo 调用链准确率明显低于 CodeGraph，且无法通过 Hybrid LSP 配置改善。

---

### Phase 1：封装 `cbm_search` 工具（3–5 天）

**目标：** 在 llm-wiki Agent loop 内新增只读工具，不改动 MCP 对外接口。

#### 2.1.1 新增文件

```
src/tools/cbm-search.ts          # 类似 codegraph-search.ts
scripts/cbm-init.mjs             # 三 repo 批量 index
scripts/cbm-sync.mjs             # 增量（依赖 CBM watcher 或 re-index）
tests/cbm-search.test.ts         # mock CLI 输出
```

#### 2.1.2 工具 API 设计（与 codegraph_search 平行）

```typescript
// operation 映射到 CBM MCP/CLI 工具
type CbmOperation =
  | "query"           // search_graph
  | "trace"           // trace_path
  | "architecture"    // get_architecture
  | "impact"          // detect_changes
  | "cypher"          // query_graph
  | "status";         // index_status / list_projects

// 参数
{
  operation?: CbmOperation;
  query?: string;           // search_graph / cypher
  function_name?: string;   // trace_path
  direction?: "inbound" | "outbound" | "both";
  repo?: "chatkit-web" | "chatkit-middleware" | "finclaw" | "all";
  top_k?: number;
}
```

实现要点：

1. 通过 `execFile("codebase-memory-mcp", ["cli", toolName, jsonArgs])` 调用，与 `codegraph-search.ts` 同模式。
2. `repo: "all"` 时并行三 repo，合并结果（复用 `mergeRankedResults` 思路）。
3. 输出经 `guardToolResult`（`toolName: "cbm_search"`）脱敏。
4. 索引缺失时返回与 CodeGraph 类似的 init 提示，指向 `npm run cbm:init`。

#### 2.1.3 package.json 脚本

```json
{
  "cbm:init": "node scripts/cbm-init.mjs",
  "cbm:sync": "node scripts/cbm-sync.mjs",
  "cbm:status": "codebase-memory-mcp cli list_projects"
}
```

#### 2.1.4 注册与预算

在 `src/loop-runner.ts`：

- `registerCbmSearchTool(registry, opts)` — 与 codegraph 并列注册。
- `src/retrieval/budget.ts` 增加 `cbm_search: 4`（与 `codegraph_search` 相同上限）。
- `src/retrieval/plan.ts` 的 `symbol` / `architecture` hint 改为优先 `cbm_search`（Phase 1 可用 feature flag 控制）。

环境变量（建议）：

```bash
# .env.example 追加
LLM_WIKI_CBM_ENABLED=auto          # auto | true | false
LLM_WIKI_CBM_BINARY=codebase-memory-mcp
```

`auto`：二进制在 PATH 且 `list_projects` 含三 repo 时注册工具。

#### 2.1.5 prompt 调整

`src/prompt-code.ts` 补充一句：

> 若 `cbm_search` 可用，结构/调用链/影响面/架构总览优先于 `codegraph_search`；配置与精确字符串仍用 `search_content`。

#### 2.1.6 Phase 1 验收标准

- [ ] `cbm_search` 在 CBM 已索引时返回 JSON，经 security guard。
- [ ] CBM 未安装时 `auto` 模式不注册工具，服务正常启动。
- [ ] `npm test` 通过；新增 `cbm-search.test.ts` 覆盖 mock CLI。
- [ ] 符号类 benchmark 问题工具调用次数 ≤ 当前 CodeGraph 路径。

---

### Phase 2：索引生命周期与统一状态（3–5 天）

**目标：** 对齐 productization-roadmap P1——索引可观测、可增量、可文档化。

#### 2.2.1 扩展 `GET /health`

在 `src/routes/health.ts` 增加 `cbm` 段：

```json
{
  "cbm": {
    "binaryFound": true,
    "projects": [
      {
        "repo": "chatkit-web",
        "indexed": true,
        "nodeCount": 12345,
        "edgeCount": 67890,
        "stale": false
      }
    ],
    "cbmSearchReady": true
  }
}
```

实现：`codebase-memory-mcp cli list_projects` + 对比各 repo 当前 `git rev-parse HEAD` 与 CBM 记录的 commit（若 API 无 commit 字段，ponytail: 先用文件 mtime + `index_status` 近似，后续再接 CBM 元数据）。

#### 2.2.2 团队共享 artifact（可选）

若索引耗时可接受且团队愿意提交二进制：

```bash
# 各 repo 根目录（在 repo 自己的 git 里，非 llm-wiki）
.codebase-memory/graph.db.zst
```

在 `sync:code` 后、`cbm:init` 时检测 artifact：存在则 import + 增量，不存在则全量。

文档化：README 增加「CBM 索引」章节，与 CodeGraph / semantic 并列。

#### 2.2.3 CI 钩子（可选）

```yaml
# .github/workflows/cbm-index.yml（示例，按实际 CI 调整）
- run: codebase-memory-mcp cli index_repository '{"repo_path": "..."}'
- run: # 上传 graph.db.zst 为 artifact 或 commit 到 repo（需团队决策）
```

#### 2.2.4 Phase 2 验收标准

- [ ] `/health` 能反映三 repo CBM 索引是否就绪。
- [ ] `npm run cbm:sync` 在 `git pull` 后可增量更新（或文档说明需 re-index 的条件）。
- [ ] README 有完整 CBM 启用/禁用说明。

---

### Phase 3：检索路由硬化与 CodeGraph 去留决策（5–7 天）

**目标：** 完成 P0-B 闭环；用 benchmark 决定 CodeGraph 是否降级为 fallback。

#### 2.3.1 硬化 retrieval plan

将 `src/retrieval/plan.ts` 从「hint 注入」升级为「硬路由建议」：

```typescript
export function preferredTools(plan: RetrievalPlanKind): string[] {
  switch (plan) {
    case "config": return ["glob", "search_content"];
    case "symbol": return ["cbm_search", "codegraph_search", "find_in_code"];
    case "architecture": return ["semantic_search", "cbm_search"];
    // ...
  }
}
```

在 budget 拦截器：非 preferred 工具在连续空结果后降级推荐（返回附加 context，不阻断）。

#### 2.3.2 固定 benchmark 集

在 `scripts/batch-scenario-test.ts` 或新文件 `tests/benchmark-retrieval.test.ts` 固化 ≥15 题，每题记录：

- tool count
- empty result count
- answer profile
- security redaction hits

对比维度：仅 lexical / +CodeGraph / +CBM / +semantic 全开。

#### 2.3.3 CodeGraph 去留决策表

| 条件 | 决策 |
|------|------|
| CBM 在 symbol/architecture 类 90%+ 优于 CodeGraph | 默认 `cbm_search`，CodeGraph 作 fallback |
| 互有胜负 | 双轨，`plan.ts` 按问题类型分流 |
| CBM 在 TS monorepo 明显更差 | 保留 CodeGraph 默认，`cbm_search` 仅用于 impact/trace |

#### 2.3.4 Phase 3 验收标准

- [ ] benchmark 报告存档于 `docs/benchmarks/cbm-vs-codegraph-YYYY-MM-DD.md`。
- [ ] 「chatkit-web 都有哪些配置」类问题工具调用 ≤ 8 次（当前常见 >10）。
- [ ] 团队对 CodeGraph 去留有书面决策。

---

### Phase 4：图谱与知识沉淀衔接（后续，对齐 P2–P3）

**不在 Phase 0–3 实现，仅定接口：**

1. **P2 图谱 artifact**
   - 从 CBM 导出：`query_graph` 拉取 module/route 子图 → 写入 `.llm-wiki/graph.json`（llm-wiki 自有 schema，CBM 为上游）。
   - 或 ponytail: 直接读 CBM SQLite 只读副本做投影（需评估 license 与 schema 稳定性）。

2. **P3 knowledge card**
   - 高质量问答保存时，evidence 引用 CBM `qualified name`（`get_code_snippet`）而不仅是 file:line。
   - `staleWhen` 监听 repo commit 变化 + CBM `detect_changes` 输出。

3. **OKF 导出（P6）**
   - knowledge card → `knowledge/<topic>.md` + YAML frontmatter（`source_commit`、`cbm_node_id`）。

---

## 3. 风险与缓解

| 风险 | 缓解 |
|------|------|
| CBM 写入 agent 配置与 llm-wiki 冲突 | llm-wiki 只用 CLI 模式，不跑 `codebase-memory-mcp install` |
| 二进制供应链 | 校验 SHA-256；优先 GitHub Release + `gh attestation verify` |
| TS monorepo 调用链不准 | Phase 0 必测；不准则 symbol 类仍走 CodeGraph |
| 索引 artifact 体积大 | 默认不 commit；仅 CI artifact；`.gitignore` 可配置 |
| 与 semantic 功能重叠 | 分工：CBM `semantic_query` 不替代 TEI；架构问题 TEI 优先，符号问题 CBM 优先 |
| MCP public profile 泄露路径 | `cbm_search` 输出同样走 `guardToolResult` |

---

## 4. 任务清单（可直接开 issue）

### Sprint 1 — 评估

- [ ] 安装 CBM，索引三 repo，填写评估表
- [ ] 跑 15 题探针，对比 CodeGraph
- [ ] Go/No-Go 评审

### Sprint 2 — 工具封装

- [ ] `src/tools/cbm-search.ts` + tests
- [ ] `scripts/cbm-init.mjs` / `cbm-sync.mjs`
- [ ] `loop-runner` 注册 + budget + plan hint
- [ ] `.env.example` + README

### Sprint 3 — 可观测

- [ ] `/health` cbm 段
- [ ] `npm run cbm:status`
- [ ] benchmark 脚本初版

### Sprint 4 — 决策

- [ ] 硬化 preferredTools
- [ ] benchmark 报告
- [ ] CodeGraph 去留决策 + 文档更新

---

## 5. 配置参考

### 5.1 .env 追加项（Phase 1 起）

```bash
# codebase-memory-mcp（结构索引，可选）
LLM_WIKI_CBM_ENABLED=auto
LLM_WIKI_CBM_BINARY=codebase-memory-mcp

# 现有项保持不变
LLM_WIKI_TOOL_BUDGET_ENABLED=true
LLM_WIKI_TOOL_BUDGET_TOTAL=14
LLM_WIKI_AGENT_ANSWER_PROFILE=debug
LLM_WIKI_MCP_ANSWER_PROFILE=public
```

### 5.2 开发机一键流程（目标态）

```bash
npm run sync:code
npm run cbm:init          # Phase 1 新增
npm run semantic:setup    # 可选
npm run codegraph:init    # Phase 0–2 保留
npm run dev
```

### 5.3 与 productization-roadmap 对齐

| 本方案阶段 | roadmap 阶段 |
|-----------|--------------|
| Phase 0–1 | P0-B（工具效率）+ P1（索引）铺垫 |
| Phase 2 | P1 索引生命周期产品化 |
| Phase 3 | P0-B 验收 + P7 评估体系初版 |
| Phase 4 | P2 图谱 + P3 知识沉淀 |

---

## 6. 成功标准（整体）

1. **效率**：结构类 benchmark 平均工具调用下降 ≥30%，token 成本下降（人工抽样对比）。
2. **质量**：benchmark 回答 groundedness 不低于 CodeGraph 路径。
3. **安全**：`cbm_search` 输出无 secret 明文泄露（现有 security 测试覆盖）。
4. **运维**：`/health` 可判断 CBM 是否就绪；新成员按 README 30 分钟内可复现索引。
5. **决策**：Phase 3 结束时有 CodeGraph 去留的书面结论，避免双引擎长期无治理地并存。

---

## 7. 相关文档

- [研究总结](./codebase-memory-mcp-research.zh.md)
- [产品化路线](./productization-roadmap.zh.md)
- [CBM 官方 README](https://github.com/DeusData/codebase-memory-mcp)

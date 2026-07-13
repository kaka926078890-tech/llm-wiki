# 实施计划：P2 知识图谱 Artifact + Project Map（MVP）

日期：2026-07-13  
状态：**可执行计划**  
前置：[productization-roadmap](../productization-roadmap.zh.md) §P2 · [codebase-memory-mcp-integration-plan](../codebase-memory-mcp-integration-plan.zh.md) §Phase 4 · [验证计划](./15-verification-plan.zh.md)

---

## 0. 范围与假设

| 项 | 内容 |
|----|------|
| 做 | llm-wiki 自有 `graph.json` schema；从 **Catalog feature-lists** 投影 repo/module 节点；`graph:gen`；`GET /api/graph`；前端 **Map** 只读页 |
| 不做（本期） | 完整 CBM `query_graph` 全量导入；Neo4j；3D 图；symbol/calls 边；LLM 摘要节点；图谱 stale 增量（后续） |
| 上游 | `.reasonix/feature-lists/*.json`（Catalog 已 closed）；`.reasonix/cbm-index-state.json`（commit 元数据） |
| 产物 | `.reasonix/graph.json` |
| 门禁 | G0–G3（见验证计划） |

### 问题陈述

问答有 Catalog（清单）、CBM（检索）、Knowledge（FAQ），但缺少 **跨三仓的稳定结构视图** 供 UI 展示与后续 P3/P4 挂载。

### MVP 目标行为

```
catalog:gen（已有）→ graph:gen → .reasonix/graph.json
                              ↓
                    GET /api/graph → 前端 Map 页列表展示
```

**ponytail:** 第一期只用 Catalog 条目做 `repo` + `module`/`app`/`service` 节点与 `contains` 边；够验证 schema + API + UI，CBM 子图导入后置。

---

## 1. 目标架构落点（文件级）

```
src/graph/
  types.ts           # GraphNode, GraphEdge, ProjectGraph, meta
  store.ts           # read/write .reasonix/graph.json
  project.ts         # loadGraph / graphFromCatalog
  generate.ts        # 三仓 catalog → 节点/边

scripts/
  graph-gen.ts       # CLI 入口

src/routes/
  graph.ts           # GET /api/graph

src/app.ts           # registerGraphRoutes

frontend/src/
  ui/map-panel.tsx   # Project Map（repo → 子节点列表）
  App.tsx            # view=map 导航

tests/
  graph-generate.test.ts
  routes-graph.test.ts

.reasonix/
  graph.json         # 生成物（gitignore 或 commit 均可；与 feature-lists 一致不 commit）
```

挂接 sync（Phase 2 可选）：

```
scripts/sync-code-repos.mjs  # catalog:gen 之后 graph:gen（LLM_WIKI_GRAPH_AUTO_GEN=true 默认 on）
package.json                  # "graph:gen": "tsx scripts/graph-gen.ts"
```

---

## 2. Graph Schema（MVP）

```json
{
  "version": 1,
  "generatedAt": "ISO8601",
  "sources": {
    "catalog": [".reasonix/feature-lists/chatkit-middleware.json", "..."],
    "cbmIndexState": ".reasonix/cbm-index-state.json"
  },
  "nodes": [
    { "id": "repo:chatkit-middleware", "type": "repo", "title": "chatkit-middleware", "repo": "chatkit-middleware" },
    { "id": "mw:service:gateway", "type": "module", "title": "gateway", "repo": "chatkit-middleware", "source": ["edition-manifest"] }
  ],
  "edges": [
    { "from": "repo:chatkit-middleware", "to": "mw:service:gateway", "type": "contains" }
  ]
}
```

节点 `type` MVP 枚举：`repo` | `module` | `app` | `route`（web admin 路由可选 Phase 1.4）  
边 `type` MVP：`contains`  only

---

## 3. Phase 划分

### Phase 0 — Schema 与 fixture（约 0.5 天）

| # | 任务 | 完成定义 |
|---|------|----------|
| 0.1 | `src/graph/types.ts` + `store.ts` | 读写 JSON；单测 round-trip |
| 0.2 | `tests/fixtures/minimal-graph.json` 或内联 fixture | schema 测试有锚点 |

**出口门 G0：** `npm test -- tests/graph-generate` 中 schema/store 测绿（可先只测 store）。

---

### Phase 1 — 从 Catalog 生成（约 1 天）

| # | 任务 | 完成定义 |
|---|------|----------|
| 1.1 | `generate.ts`：读三份 feature-lists → nodes/edges | middleware services、web apps、finclaw crates 非空 |
| 1.2 | `scripts/graph-gen.ts` + `npm run graph:gen` | exit 0；写入 `.reasonix/graph.json` |
| 1.3 | 单测：mock catalog JSON → 节点数 / 边数 / id 稳定 | `tests/graph-generate.test.ts` |
| 1.4 | （可选）web admin 路由条目 → `type: route` 节点 | 有则测，无则跳过 |

**出口门 G1：** `npm run graph:gen` 绿；generate 单测绿；graph.json 三 repo 均有 `repo:*` 节点。

---

### Phase 2 — API + sync 挂载（约 0.5 天）

| # | 任务 | 完成定义 |
|---|------|----------|
| 2.1 | `GET /api/graph` 返回 graph 或 404+hint | `tests/routes-graph.test.ts` |
| 2.2 | `sync:code:full` 在 catalog:gen 后跑 graph:gen（env 开关） | 日志可见 graph:gen |
| 2.3 | README 一句 | 文档 |

**出口门 G2：** routes 单测 + `npm test` 全绿。

---

### Phase 3 — Project Map UI（约 1 天）

| # | 任务 | 完成定义 |
|---|------|----------|
| 3.1 | `map-panel.tsx`：拉 `/api/graph`，按 repo 分组展示子节点 | 手动或 frontend  smoke |
| 3.2 | `App.tsx` 增加 Map 导航（与 Index/Knowledge 并列） | 可切换 |
| 3.3 | 无 graph 时显示「运行 graph:gen / sync:code:full」 | 空态 copy |

**出口门 G3：** `npm run build:frontend` 绿；`npm test` 全绿；`state/phase.md` P2 closed。

---

## 4. 回滚

| 手段 | 做法 |
|------|------|
| Env | `LLM_WIKI_GRAPH_AUTO_GEN=false` |
| UI | Map 页隐藏或显示 empty（graph 可选） |
| Git | 单 PR；红则不 merge |

---

## 5. 风险与缓解

| 风险 | 缓解 |
|------|------|
| Catalog 未生成 | graph:gen 失败 fast fail，提示 `catalog:gen` |
| Schema 膨胀 | MVP 仅 contains + 4 类节点 |
| CBM 不同步 | sources 记录 cbm gitHead；完整 CBM 导入放 P2.1 后续 |

---

## 6. 后置（不在本 mission）

- CBM `query_graph` 导入 symbol/calls 边
- 图谱 stale 与 index detect_changes 联动
- 问答检索融合 graph 节点（P4）

# 验证计划：P2 知识图谱 Artifact + Map（MVP）

日期：2026-07-13  
状态：**可执行**  
关联：[implementation-plan](./14-implementation-plan.zh.md)

---

## 1. 验证原则

1. **可生成、可读、可展示** — 无 graph.json 则 API/UI 明确 empty，不 silent fail。  
2. **Catalog 为结构真相源（MVP）** — graph 节点 id 集合与 catalog 条目可追溯。  
3. **一次一 Phase** — G0 schema → G1 gen → G2 API → G3 UI。  
4. **红即停** — 未过 G(N) 不进 Phase N+1。  
5. **不需 DEEPSEEK** — 本 mission 门禁均为单测 + CLI + build。

---

## 2. 指标定义

| 指标 | 门槛 |
|------|------|
| graph.json 存在 | `npm run graph:gen` exit 0 |
| 三 repo 根节点 | nodes 含 `repo:chatkit-middleware`、`repo:chatkit-web`、`repo:finclaw` |
| 子节点非空 | 每 repo 至少 1 条 `contains` 出边（catalog 非空前提下） |
| API | `GET /api/graph` 200 + `{ graph: { nodes, edges } }` |
| 回归 | `npm test` + `npm run typecheck` 0 失败 |
| 前端 | `npm run build:frontend` exit 0 |

---

## 3. 测试用例

### 3.1 Store / schema（G0）

| id | 期望 |
|----|------|
| GR-01 | 写入再读取 graph JSON 字段一致 |
| GR-02 | `version === 1` |

### 3.2 Generate（G1）

| id | 期望 |
|----|------|
| GG-01 | mock middleware catalog → 含 service 模块节点 |
| GG-02 | 每条 catalog item 有 `repo:*` → item 的 contains 边 |
| GG-03 | 重复 `graph:gen` 节点 id 稳定（同 catalog 输入） |

### 3.3 API（G2）

| id | 期望 |
|----|------|
| API-01 | 有 graph 文件时 GET 200 |
| API-02 | 无 graph 文件时 404 或 `{ graph: null, hint: "..." }`（实现择一，单测钉死） |

### 3.4 UI（G3）

| id | 期望 |
|----|------|
| UI-01 | `build:frontend` 成功 |
| UI-02 | Map 组件存在且 fetch `/api/graph`（单测可选；manual 抽检） |

---

## 4. 门禁

### G0 — Phase 0

```bash
npm run typecheck
npm test -- tests/graph-generate   # store 部分
```

| 检查 | 通过条件 |
|------|----------|
| types + store | 单测绿 |

---

### G1 — Phase 1

```bash
npm run catalog:gen    # 前置：feature-lists 存在
npm run graph:gen
npm test -- tests/graph-generate
```

| 检查 | 通过条件 |
|------|----------|
| CLI | graph:gen exit 0 |
| 产物 | `.reasonix/graph.json` 含三 repo 节点 |
| 单测 | GG-01–03 绿 |

---

### G2 — Phase 2

```bash
npm test -- tests/routes-graph
npm test
```

| 检查 | 通过条件 |
|------|----------|
| API 路由 | routes-graph 全绿 |
| sync  hook | 代码审查或 smoke：`sync:code:full` 含 graph:gen |

---

### G3 — Phase 3（mission close）

```bash
npm run typecheck
npm test
npm run build:frontend
```

| 检查 | 通过条件 |
|------|----------|
| 全量测试 | 149+ 测试 0 失败（允许新增 graph 测） |
| 前端构建 | build:frontend exit 0 |
| 状态 | `state/phase.md` P2 closed |

---

## 5. Loop reviewer

1. Diff 范围符合 P2 doc 14。  
2. 跑当前 Phase 对应 gate 命令。  
3. `VERDICT: PASS` | `REJECT`。

---

## 6. 固定命令块

```bash
cd llm-wiki
npm run typecheck
npm run catalog:gen && npm run graph:gen
npm test -- tests/graph-generate tests/routes-graph
npm test
npm run build:frontend
```

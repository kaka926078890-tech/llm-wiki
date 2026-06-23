# codebase-memory-mcp 研究总结

日期：2026-06-23

## 文档目的

本文档总结 [DeusData/codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp)（以下简称 **CBM**）的技术定位、架构能力与评测结论，并说明其与 `llm-wiki` 产品化路线、Karpathy LLM-Wiki 设想及 OKF 知识格式的关系。

配套可落地方案见：[codebase-memory-mcp-integration-plan.zh.md](./codebase-memory-mcp-integration-plan.zh.md)。

---

## 1. 项目概览

| 项 | 内容 |
|----|------|
| 仓库 | https://github.com/DeusData/codebase-memory-mcp |
| 许可 | MIT |
| 语言 | C（~88%）+ C++ |
| Stars | ~11.6k（2026-06） |
| 最新版 | v0.8.1 |
| 论文 | [arXiv:2603.27277](https://arxiv.org/html/2603.27277v1) |
| 官网 | https://deusdata.github.io/codebase-memory-mcp/ |

**一句话定位：** 面向 AI 编程助手的 **代码结构情报 MCP 服务器**——把代码库索引为持久化知识图谱，通过 14 个 MCP 工具暴露亚毫秒级结构查询，**本身不含 LLM**。

---

## 2. 要解决什么问题

当前 LLM 编程 Agent 的典型探索方式是：

```
grep → read_file → grep → read_file → …（数十轮）
```

这种方式有三个根本缺陷：

1. **无结构理解**：问题是「谁调用了 X」「改 Y 影响什么」，Agent 却在文本里逐段摸索。
2. **Token 成本高**：论文报告，5 个结构类查询若靠文件探索约需 **41.2 万 token**；CBM 约 **3,400 token**（~99% 削减）。
3. **无持久记忆**：每次会话重新发现同一套调用关系。

CBM 的论点是：**把代码库结构提升为一等公民、可查询的知识图谱**，Agent 只负责把自然语言翻译成图查询。

---

## 3. 架构四层模型

```
┌─────────────────────────────────────────────────────────────┐
│ L4  Agent 层 — Claude Code / Cursor / Codex 等 11 款 Agent   │
│     14 个 MCP 工具（search_graph / trace_path / …）          │
├─────────────────────────────────────────────────────────────┤
│ L3  查询层 — SQLite 图存储 + Cypher 子集 + Louvain 社区      │
├─────────────────────────────────────────────────────────────┤
│ L2  索引层 — RAM-first + LZ4 + 内存 SQLite + watcher 增量   │
├─────────────────────────────────────────────────────────────┤
│ L1  解析层 — 158 种 tree-sitter + Hybrid LSP（9+ 语言）    │
└─────────────────────────────────────────────────────────────┘
```

### 3.1 解析层（L1）

- **158 种语言**：tree-sitter grammar 全部 vendored 编译进单一静态二进制，无需运行时安装。
- **Hybrid LSP**：对 Python、TS/JS/JSX、Go、Rust、Java、C/C++、C#、Kotlin、PHP 等做类型感知调用解析；内嵌轻量 C 实现，不启动独立 language server。
- 两层叠加：tree-sitter 做快速语法抽取，Hybrid LSP 精化 `CALLS`、`USAGE`、`RESOLVED_CALLS` 等边。

### 3.2 索引层（L2）

- **RAM-first 管道**：全量读入内存 → LZ4 压缩 → 内存 SQLite 建图 → 一次性落盘，索引完释放内存。
- **增量同步**：后台 watcher + git 变更检测 + 内容 hash，只重索引变更文件。
- **团队共享 artifact**：`.codebase-memory/graph.db.zst`（zstd 压缩 SQLite），clone 后导入 + 增量索引，跳过全量重建。

### 3.3 查询层（L3）

**节点类型（节选）：** `Project`、`Package`、`File`、`Function`、`Method`、`Class`、`Route`、`Resource`（K8s）、`Module`（Kustomize）等。

**边类型（节选）：** `CALLS`、`IMPORTS`、`HTTP_CALLS`、`ASYNC_CALLS`、`EMITS`/`LISTENS_ON`、`DATA_FLOWS`、`SIMILAR_TO`、`SEMANTICALLY_RELATED` 等。

支持 **openCypher 只读子集**（`MATCH`、`WHERE`、`RETURN`、聚合、`EXISTS` 等），在本地 SQLite 上执行。

### 3.4 Agent 接口层（L4）

CBM **不内置 LLM**。MCP 客户端（Claude Code、Cursor 等）负责 NL → 图查询翻译；CBM 只建图、查图。这样避免多一层 NL→Query 模型的 API 成本。

---

## 4. 14 个 MCP 工具

| 类别 | 工具 | 用途 |
|------|------|------|
| 索引 | `index_repository`、`list_projects`、`delete_project`、`index_status` | 建索引、查状态 |
| 结构查询 | `search_graph`、`trace_path`、`query_graph`、`get_graph_schema` | 按标签/名称搜、调用链、Cypher |
| 分析 | `get_architecture`、`detect_changes`、`get_code_snippet` | 架构总览、git diff 影响面、按 qualified name 取源码 |
| 搜索 | `search_code` | 图增强 grep（仅索引文件） |
| 语义 | `semantic_query` | 内嵌 nomic-embed-code，无需 API key |
| 高级 | `manage_adr`、`ingest_traces` | 架构决策记录、运行时 trace 校验 HTTP 边 |

---

## 5. 性能与评测（论文 + README）

基准环境：Apple M3 Pro；31 个真实仓库、12 类问题。

| 指标 | CBM | 文件探索 Agent | 说明 |
|------|-----|----------------|------|
| 回答质量 | **83%** | 92% | 结构类问题 CBM 在 19/31 语言上匹配或超越 |
| Token 消耗 | **~3,400**（5 查询） | ~412,000 | ~10× 减少 |
| 工具调用 | **2.1× 更少** | 基线 | 探索性问题未必更少 |
| Linux kernel 全量索引 | **3 min** | — | 2800 万 LOC、7.5 万文件 |
| Django 全量索引 | **~6 s** | — | 4.9 万节点 |
| Cypher 查询 | **<1 ms** | — | 关系遍历 |
| trace_path（depth=5） | **<10 ms** | — | BFS |

**适用边界：**

- 适合：中大型仓库、结构/调用链/影响分析问题、Python/TS/Go/Rust 等 Hybrid LSP 语言。
- 谨慎：纯文本搜索（TODO、注释）、<10k LOC 小项目、Haskell/Elixir 等无 LSP 增强语言。
- 不适合：运行时动态生成代码、严重混淆/minify 产物。

---

## 6. 与其他方案对比

| 维度 | grep/read | RAG / embedding | LSP / CodeQL | CBM |
|------|-----------|-----------------|--------------|-----|
| 数据形态 | 文本片段 | 向量块 | 专业查询 | **代码事实图谱** |
| 部署 | 无 | 向量库/Ollama | 重量级 DB | **单二进制 + SQLite** |
| 查询 | 字符串匹配 | 语义相似 | 静态分析 DSL | **调用链/影响面/路由** |
| Agent 集成 | 内置 | 需胶水 | 非 MCP 原生 | **14 MCP 工具** |
| 安全模型 | — | 向量库可能泄露 | — | 全本地；写入 agent 配置需注意审计 |

与 **Memento MCP**（Neo4j 通用记忆）、**MemoryMesh**（Schema 驱动对话记忆）不同：那些偏 Agent **长期上下文记忆**；CBM 偏 **代码库结构情报**，抽象层不同。

与 **Cursor codebase indexing**、**Serena**、**Aider repo map** 不同：后者仍在「文本窗口里挑选」；CBM 做「代码事实图谱化 + MCP 原生查询」。

---

## 7. 安全与分发

- 单一静态二进制，零运行时依赖；所有处理 **100% 本地**。
- Release：SLSA 3、Sigstore cosign、SHA-256 checksums、VirusTotal 扫描。
- `install` 自动配置 11 款 Agent 的 MCP、hooks、skills；会 **写入 agent 配置文件**，上线前建议审计。
- 数据目录默认：`~/.cache/codebase-memory-mcp/`。

---

## 8. 与 llm-wiki 的关系

### 8.1 抽象层差异

| | llm-wiki | CBM |
|--|----------|-----|
| 角色 | **三 repo 问答产品 / Agent** | **结构索引后端** |
| 智能层 | DeepSeek Agent loop | 无 LLM |
| 结构 + 语义检索 | `cbm_search` → codebase-memory-mcp | 内嵌 nomic-embed-code + 知识图谱 |
| MCP 暴露 | `ask_llm_wiki`（整轮 Agent） | 14 个细粒度图工具 |
| 安全 | answer profile + redaction + audit | 全本地，无 public 降敏层 |
| 知识沉淀 | 路线图中 knowledge card | `manage_adr` + graph.db.zst |

**结论：CBM 是引擎，llm-wiki 是带安全边界的产品。互补，非替代。**

### 8.2 与 productization-roadmap 的映射

| llm-wiki 阶段 | CBM 可贡献 | llm-wiki 仍需自研 |
|---------------|-----------|-------------------|
| P0 安全 Harness | — | public/internal profile、redaction |
| P0-B 检索预算 | 论文验证少查、少 token | query plan、budget 拦截（已部分落地） |
| P1 索引生命周期 | watcher、artifact、status 工具 | 跨三 repo 统一 stale 检测（`/health` 已暴露 CBM 状态） |
| P2 知识图谱 Artifact | 完整图模型 + Cypher + 3D UI | `.llm-wiki/graph.json` 叠加层、跨 repo claim |
| P3 知识沉淀 | ADR 雏形 | knowledge card、stale 检测、用户校准 |
| P4 Evidence-bound 问答 | `get_code_snippet` 结构化结果 | evidence bundle 落盘、引用校验 |
| P5 产品 UI | localhost:9749 图可视化 | Chat、Index Status、Evidence 追踪 |
| P6 文档/wiki | — | OKF Markdown 摄取 |

### 8.3 与 Karpathy LLM-Wiki / OKF 愿景

- **Karpathy LLM-Wiki**：AI 维护的、持续累积的专属知识库（persistent, compounding artifact）。
- **Google OKF**：Markdown + YAML frontmatter + 目录结构，人类与 Agent 共通的知识格式。
- **CBM**：解决「如何从代码自动提取结构事实」。
- **llm-wiki**：解决「在安全约束下，如何把结构事实 + 问答沉淀成可对外服务、可校验、可演进的知识产品」。

合理分层：

```
代码仓库
  → CBM / CodeGraph / tree-sitter     （结构事实）
  → Agent 问答 + evidence bundle      （可验证结论）
  → Knowledge Card / OKF .md          （可复用、可 stale 检测的知识）
```

---

## 9. 参考资料

- 官方 README：https://github.com/DeusData/codebase-memory-mcp
- 论文：https://arxiv.org/html/2603.27277v1
- 中文架构拆解：https://txtmix.com/posts/tech/deusdata-codebase-memory-mcp-code-intelligence-guide/
- llm-wiki 产品路线：[productization-roadmap.zh.md](./productization-roadmap.zh.md)
- llm-wiki OKF 背景：仓库根目录 `Gemini.md`

---

## 10. 研究结论

1. CBM 是 2026 年代码情报领域的代表性工程实现：**图谱化 + MCP-native + 零依赖单二进制**。
2. 在结构类问题上，用可接受的质量差距（83% vs 92%）换取 **10× token、2.1× 工具调用** 削减，已被论文和工程基准支撑。
3. llm-wiki **不应再造 CBM**，而应评估将其作为 **P1/P2 结构索引后端**，继续深耕安全、证据、知识沉淀与产品 UI。
4. 推荐策略：**CBM 统一负责结构检索与语义检索**；lexical 工具负责配置与精确字符串匹配。

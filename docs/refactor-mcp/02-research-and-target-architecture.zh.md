# llm-wiki 知识问答重构：市面调研与目标架构设计

日期：2026-07-10  
状态：**方案草案（待评审确认后进入 decision / plan）**  
关联：
- [00 kickoff](./00-discussion-kickoff.zh.md)
- [01 目标修正与市面概览](./01-discussion-market-approaches-and-goal-correction.zh.md)
- 现状：[progress](../progress.zh.md) · [productization-roadmap](../productization-roadmap.zh.md) · [CBM 接入](../codebase-memory-mcp-integration-plan.zh.md)

---

## 0. 一句话结论

**不要为 MCP 协议重构；要为「可验收的知识质量」重构架构。**

市面成熟做法不是「更猛的单次 RAG」，而是：

> **权威目录（Catalog）管完整率与稳定性 + 结构图（Graph）管关系题 + 词法/语义检索管细节题 + Agent 只做编排与表达 + 评测门禁证明变好。**

`llm-wiki` 已有 Agent / CBM / 安全 / 知识卡片雏形 / MCP 出口。缺口在 **Catalog 层、确定性 listing 管线、多源融合、评测闭环**，不是缺协议。

验收按你的要求 **A+B+C+D 全要**：清单 F1 + golden 整体提升 + 人工可读/不泄密抽检 + 架构可演进。

---

## 1. 问题定义与验收（ABCD）

### 1.1 业务问题（你给的反例）

问：`chatkit-middleware` 详细功能清单 / 微服务清单

| 失败模式 | 表现 | 根因（架构层） |
|----------|------|----------------|
| 错误 | 「总共 10 个微服务」 | 无权威集合；模型在摘要上猜数 |
| 不完整 | 只列部分服务 | 检索预算截断 / 无 completeness check |
| 不稳定 | 同问异答 | 每次重新从代码「发现」清单 |

实测资产侧：`services/` 下可识别的可部署单元约 **29+**（gateways / platform / pulse / enterprise 等），再加 `ai-infra-rs` 等——**「微服务」本身需要产品定义**，不能等于「有 package.json 的目录」。

### 1.2 验收矩阵（A+B+C+D）

| ID | 维度 | 度量方式 | 建议门槛（草案，可调） |
|----|------|----------|------------------------|
| **A** | 清单/架构集合准确 | 对权威集合算 Precision / Recall / F1；同问 N 次集合 Jaccard | listing F1 ≥ 0.95；Jaccard ≥ 0.95（N=3） |
| **B** | Golden 整体 | `verify:upgrade` 全量 + 扩题 | core 通过率不低于基线，且 listing/architecture 子集提升 |
| **C** | 人工抽检 | 非技术可读、够用、不泄密 | 抽检通过率 ≥ 90%；public lint 零硬违规 |
| **D** | 架构调整 | 本文目标架构落地 | Catalog + 题型管线 + 评测门禁可运行 |

### 1.3 非目标

- 不为「支持 MCP」而重构（已支持）。
- 不把 CBM 的 14 个工具直接暴露给外部客户端。
- 不先做多租户平台（P8）——先把三仓闭环做对。
- 不默认引入重型 Sourcegraph 自建集群（可作为远期选项，见 §3.5）。

---

## 2. 市面详细调研

### 2.1 三条哲学（2026 共识）

| 哲学 | 代表 | 核心机制 | 适合题型 | 对清单题 |
|------|------|----------|----------|----------|
| **Index-first** | Cursor、Augment、Copilot Enterprise | 预建 embedding / 符号索引，问答时 top-k | 语义相似、找相关文件 | 弱：易漏、易猜数 |
| **Agentic search** | Claude Code 等 | 少索引，grep/read 现场探索 | 灵活排错、最新代码 | 弱：贵、不稳、易截断 |
| **Graph-augmented** | Sourcegraph Cody、Codebase-Memory | AST/LSP/SCIP 图 + 查询 | 调用链、影响面、模块结构 | 中：有结构但仍非「产品微服务」 |

**共识：** 生产级系统几乎都是 **混合**；产品级「有哪些服务」还要 **Catalog / Knowledge Base** 层。

### 2.2 参考产品深度对比（选型参考，不是照搬采购）

#### R1. Sourcegraph Cody（企业代码智能问答标杆）

| 项 | 内容 |
|----|------|
| **定位** | 在超大、多仓代码上做「懂代码的问答与辅助」 |
| **检索组合** | Keyword / Sourcegraph Search + **SCIP Code Graph** + embeddings + ranking |
| **关键设计** | 检索与排序两段式；本地 IDE 上下文 + 远程仓上下文分层 |
| **对我们的启示** | ① 多策略检索按题型选用；② 图解决关系，不单独解决「服务目录」；③ ranking 比「多塞 context」更重要 |
| **不直接照搬** | 需要 Sourcegraph 平台；过重；且仍偏工程师改代码场景 |

参考：[How Cody understands your codebase](https://sourcegraph.com/blog/how-cody-understands-your-codebase) · [Cody Context](https://sourcegraph.com/docs/cody/core-concepts/context) · [Code Graph / SCIP](https://sourcegraph.com/docs/cody/core-concepts/code-graph)

#### R2. GitHub Copilot Enterprise（Knowledge Bases + Code Graph）

| 项 | 内容 |
|----|------|
| **定位** | 企业内代码助手 + **显式知识库** |
| **双轨** | **Knowledge Bases**：人工选定 Markdown/文档仓做问答上下文；**Code Graph**：异步索引签名、调用、依赖 |
| **对我们的启示** | ① **文档/权威知识与代码图分离**；② 知识库是 curated，不是全仓 embedding 碰运气；③ 索引异步更新（夜间/手动 refresh） |
| **不直接照搬** | 闭源托管；知识库偏 Markdown，不是服务 Catalog 一等公民 |

参考：[Managing Copilot knowledge bases](https://docs.github.com/en/copilot/managing-copilot/managing-github-copilot-in-your-organization/managing-copilot-knowledge-bases)

#### R3. Backstage + RAG / Spotify AiKA（服务目录 × AI 问答）

| 项 | 内容 |
|----|------|
| **定位** | 开发者门户：**Software Catalog 是真相源**，AI 在目录+TechDocs 上问答 |
| **Roadie rag-ai** | Catalog / TechDocs / OpenAPI → embedding → RAG；可扩展 graph/search |
| **Spotify AiKA** | Agentic：在 TechDocs、Catalog、Confluence 上多步检索；偏组织知识而非源码逐行 |
| **对我们的启示** | ① **「有哪些微服务」应查 Catalog，不应每次扫源码猜**；② Catalog 实体有 kind、owner、依赖、描述；③ AI 是 Catalog 的自然语言层 |
| **不直接照搬** | 引入完整 Backstage 过重；可 **借鉴 Catalog 数据模型**，自研轻量版 |

参考：[Roadie RAG AI](https://roadie.io/backstage/plugins/ai-assistant-rag-ai/) · [Spotify AiKA](https://backstage.spotify.com/docs/portal/core-features-and-plugins/aika/getting-started)

#### R4. Codebase-Memory / CBM（你们已接入）

| 项 | 内容 |
|----|------|
| **定位** | 本地/自托管 **代码结构情报 MCP**：tree-sitter 图 + 语义，本身不含 LLM |
| **优势** | 结构查询 token 成本低；与 Agent 解耦；你们已有 `cbm_search` 门面 |
| **局限** | 图节点 ≠ 产品微服务；architecture 摘要不能当权威清单；需上层 Catalog 消费图信号 |
| **建议** | **保留为结构检索主引擎**，不替换为「再写一套图」 |

参考：已有 [codebase-memory-mcp-research.zh.md](../codebase-memory-mcp-research.zh.md) · arXiv:2603.27277

#### R5. Cursor（Index-first IDE）

| 项 | 内容 |
|----|------|
| **机制** | 本地语义索引 + Agent 工具探索 |
| **启示** | 索引 freshness、chunk 策略影响召回；跨仓弱 |
| **对我们** | 可参考「索引生命周期」产品化（你们 P1 已部分完成）；不作为对外知识产品主参考 |

#### R6. Karpathy LLM Wiki / OKF（知识沉淀哲学）

| 项 | 内容 |
|----|------|
| **机制** | 把对话沉淀为可版本化 wiki 页，而非只存聊天 |
| **启示** | 与你们 P3/P6 一致：**沉淀可验证知识卡片**，但卡片应升级为结构化 Catalog + 自由文本 FAQ 两类 |

### 2.3 市面分层模型（统一语言）

```
L6 出口层     IDE Chat / MCP / API + 脱敏改写（debug vs public）
L5 编排层     Agent：题型路由、工具预算、拒答、表达
L4 融合层     多源检索结果 ranking / 去重 / completeness 校验
L3 知识层     Catalog（权威）+ Knowledge Cards（FAQ）+ Docs
L2 索引层     Graph(CBM) + Lexical(grep) + 可选 Embedding
L1 扫描层     tree-sitter/LSP、compose、OpenAPI、目录约定、edition-manifest
L0 资产层     三仓库源码 + 部署清单 + 文档
```

**清单题应走：L1 扫描 → L3 Catalog → L5 表达（几乎不靠 L2 embedding 自由发挥）。**

### 2.4 题型 × 最佳路径（市面实践映射）

| 题型 | 最佳主路径 | 辅路径 | 完整率关键 |
|------|------------|--------|------------|
| 服务/模块清单 | **Catalog** | 扫描漂移告警 | Catalog 集合 |
| 架构总览 | Catalog 摘要 + Graph architecture | Docs | 分层/边界定义 |
| 符号/调用链 | Graph | read_file | 路径正确 |
| 配置/env | Lexical + 脱敏 | Catalog 元数据 | 不泄密 |
| 流程/排错 | Agent + 多源 | Cards | 证据 |
| 产品「能做什么」 | Catalog capabilities + Cards | Docs | 非技术可读 |

---

## 3. 现状诊断（相对目标架构）

### 3.1 当前数据流（简）

```
问句 → 知识卡片 lexical fast-path?
      → 否：regex 题型 plan → router/budget → Agent loop
            → tools: lexical* + cbm_search
      → evidence + answer profile → Agent SSE / MCP
```

### 3.2 已有且应保留

| 资产 | 理由 |
|------|------|
| 双出口 + answer profile | 调试 vs 对外边界正确 |
| 仅暴露 `ask_llm_wiki` | 安全面可控 |
| CBM 门面 `cbm_search` | 结构检索正确集成方式 |
| plan / router / budget | 成本与题型控制杠杆 |
| Evidence + 无证据拒答 | 信任模型 |
| Security choke points | 不泄密工程化 |
| Knowledge JSONL + fast path 概念 | 可升级为 Catalog/FAQ |
| Golden + `verify:upgrade` | 评测种子 |
| Index sync API | 索引生命周期 |

### 3.3 八大架构痛点（listing/architecture）

1. **无权威 Catalog** — 每次让 LLM 从 CBM/目录「发现」服务集合 → 错/漏/飘。  
2. **Budget 强制收束** — listing 工具次数用尽后 `forceSummary` → 结构完整、事实不全。  
3. **无 completeness 校验** — 没有「集合是否盖住 Catalog」的硬门。  
4. **题型分类过弱** — regex plan，边界题易分错。  
5. **无多源融合引擎（P4）** — CBM / lexical / cards 在同一 loop 里竞争。  
6. **知识卡片非结构化** — 自由文本，难做集合 F1；匹配仅 lexical。  
7. **public 脱敏 vs 完整** — 对外可读时可能抹掉清单所需标识，需分层字段策略。  
8. **评测弱** — pattern 交集，非集合 F1 / 跨次稳定性；无 CI 门禁。

### 3.4 与 roadmap 对齐

| 阶段 | 现状 | 本方案中的角色 |
|------|------|----------------|
| P2 图谱 artifact | 未做 | Catalog 的结构输入之一（从 CBM/扫描导出） |
| P3 知识卡片 | 大部分完成 | 拆成 **Catalog 实体** + **FAQ Cards** |
| P4 融合引擎 | 未做 | listing 确定性管线 + 通用 fusion |
| P6 文档摄入 | 未做 | Catalog 描述与非技术文案来源 |
| P7 评测 | 起步 | **A/B 自动门禁** 优先落地 |
| P5/P8 | 部分/未做 | 后置；Map UI 可展示 Catalog |

---

## 4. 目标架构设计

### 4.1 设计原则

1. **Catalog 是清单题的真相源**（借鉴 Backstage / Copilot KB）。  
2. **Graph 是关系题的真相源**（保留 CBM，借鉴 Cody SCIP 角色）。  
3. **Agent 不负责「发明」集合**；只负责路由、补证据、改写表达。  
4. **扫描负责发现漂移**，人工/规则负责「是否算微服务」的产品定义。  
5. **双模式是同一知识、不同投影**：debug = 证据+路径；public = 非技术摘要+脱敏。  
6. **评测先于炫技**：集合 F1 / 稳定性进 CI，再谈换引擎。

### 4.2 目标逻辑架构

```
                    ┌─────────────────────────────────────┐
                    │  Clients: Debug UI / MCP / verify   │
                    └───────────────┬─────────────────────┘
                                    │
                    ┌───────────────▼─────────────────────┐
                    │  Gateway: /agent/run · /mcp         │
                    │  Answer Profile: debug|internal|public
                    └───────────────┬─────────────────────┘
                                    │
                    ┌───────────────▼─────────────────────┐
                    │  Question Router (题型 + 意图)       │
                    │  listing | architecture | symbol |  │
                    │  config | howto | general             │
                    └───────────────┬─────────────────────┘
           ┌────────────────────────┼────────────────────────┐
           ▼                        ▼                        ▼
   ┌───────────────┐      ┌─────────────────┐      ┌─────────────────┐
   │ Deterministic │      │  Hybrid Fusion  │      │  FAQ Fast Path  │
   │ Listing Path  │      │  Agent Path     │      │  (verified card)│
   │ Catalog-first │      │  graph+lexical  │      │                 │
   └───────┬───────┘      └────────┬────────┘      └────────┬────────┘
           │                       │                        │
           └───────────────────────┼────────────────────────┘
                                   ▼
                    ┌─────────────────────────────────────┐
                    │  Composer + Completeness Gate       │
                    │  + Evidence Policy + Profile Render  │
                    └─────────────────────────────────────┘
```

### 4.3 新增核心子系统：Service / Module Catalog

#### 4.3.1 数据模型（最小可用）

```ts
// 概念模型（实现可用 JSON/SQLite；不必上 Backstage）
type CatalogEntity = {
  id: string;                  // e.g. chatkit-middleware/identity-service
  repo: "chatkit-middleware" | "chatkit-web" | "finclaw";
  kind: "service" | "gateway" | "spa" | "library" | "worker" | "tool";
  name: string;                // 产品名
  summary: string;             // 非技术一句话
  summaryTech?: string;        // 调试模式可多看
  capabilities: string[];      // 功能点（清单用）
  paths: string[];             // 源码根（debug 可见，public 默认隐藏）
  deps?: string[];             // 依赖的其他 entity id
  evidence: { path: string; hash: string }[];
  source: "scan" | "manual" | "merged";
  commit: string;
  updatedAt: string;
};
```

#### 4.3.2 Catalog 构建管线（扫描 → 合并 → 校验）

```
L0 三仓库
  → Scanner adapters（可插拔）:
      A. 目录约定：services/{gateways,platform,pulse,enterprise}/*
      B. compose / edition-manifest / deployment 清单
      C. CBM architecture / packages 信号（候选，非最终）
      D. 前端 SPA：chatkit-web 三应用 + libs
      E. finclaw 顶层模块约定
  → Candidate set
  → Merge rules + Manual overlay（YAML：include/exclude/rename/kind）
  → Catalog snapshot（按 commit pin）
  → Drift report（候选有、权威无 / 权威有、代码无）
```

**「微服务」定义必须写进 overlay 规则**（产品决策，不是算法）：例如是否计入 connector、是否计入 tools、是否计入 libs。

#### 4.3.3 与现有 Knowledge Cards 关系

| 类型 | 用途 | 匹配 | 更新 |
|------|------|------|------|
| **Catalog Entity** | 清单/架构/能力 | id/name/alias 精确+结构化查询 | 扫描+overlay |
| **FAQ Card** | 长尾问答 | 现有 lexical → 可加 embedding | 人工从 run 保存 |

Fast path：**listing/architecture 优先打 Catalog**，不再依赖自由文本卡片碰运气。

### 4.4 题型管线设计

#### Listing / 功能清单（确定性）

```
1. Router → listing
2. Resolve scope（repo / 全仓）
3. Load Catalog snapshot（pin 到当前 index commit）
4. Optional：drift check（若 stale → 回答附「知识可能过期」或拒答升级）
5. Compose：
   - public：name + summary + capabilities（无路径/端口/env）
   - debug：+ paths + evidence + scan notes
6. Completeness gate：输出集合 == Catalog 过滤结果；否则禁止「共 N 个」自由发挥
7. 不进入「宽预算 Agent 扫仓」主路径（可可选：对单个服务补一句证据）
```

#### Architecture

```
Catalog 分层视图 + CBM architecture/clusters（关系）
→ Composer 按层叙述
→ public 去掉内部 URL/端口；保留逻辑依赖
```

#### Symbol / 调用 / 排错

```
现有 Hybrid：cbm_search preferred → read_file
+ Fusion ranking（减少重复 cbm）
+ Evidence 强制
```

#### Config

```
Lexical preferred + 强脱敏
禁止 public 回显具体 secret/env 值
```

### 4.5 融合层（轻量 P4，不为重写 loop）

在现有 `CacheFirstLoop` 外包一层 **Retriever Planner**：

| 步骤 | 行为 |
|------|------|
| plan | 题型 + 需要的源：catalog / cbm / lexical / cards |
| retrieve | 并行拉结构化结果（Catalog 查询不是 tool 幻觉） |
| rank | 去重、按 repo/实体聚合 |
| gap | listing：缺实体则补扫或标记 incomplete |
| generate | 仅此时让 LLM 写自然语言（或模板+LLM 润色） |
| validate | evidence + profile + **集合门禁** |

**关键：Catalog 查询应是系统 API，而不是让模型「记得去 call 某个 tool」。**

### 4.6 双模式投影

| 字段 | debug | public (MCP) |
|------|-------|--------------|
| 服务名 / 职责 | ✓ | ✓ |
| capabilities | ✓ | ✓（非技术措辞） |
| 源码路径 / 行号 | ✓ | ✗（可留「已验证」标记） |
| 端口 / 内部 URL / env 名 | ✓（脱敏值） | ✗ 或归类为「配置项」 |
| 工具轨迹 / reasoning | ✓ SSE | ✗ |
| 证据 hash | ✓ | 可选短引用 id |

同一 Catalog，两套 renderer——避免「为了可读而丢完整」或「为了完整而泄密」。

### 4.7 安全边界（保持并加强）

- 工具输出继续 `guardToolResult`。  
- public 继续 `sanitizeMcpPublicAnswer`，但 **清单字段走白名单渲染**，减少「消毒把名字洗没」。  
- Catalog 构建机可读源码；**对外运行时默认只读 Catalog + 脱敏证据摘要**（可选「无源码部署」模式，见 §6）。

### 4.8 评测架构（支撑 A+B+C）

```
benchmarks/
  golden-questions.json          # 现有 B
  catalogs/
    chatkit-middleware.services.json   # A 的权威集合（与 overlay 同源）
  stability/                     # 同问 N 次
scripts/
  verify-upgrade.ts              # 扩展：listing F1、Jaccard、public lint
CI: verify:upgrade on PR（可 --quick）
```

人工抽检清单（C）：每版固定 10 题，产品/非研发打分：可读、够用、无泄密。

### 4.9 目标物理/模块落点（建议目录）

```
src/
  catalog/
    types.ts
    store.ts                 # snapshot 持久化
    query.ts                 # 按 repo/kind 查询
    compose-listing.ts       # 确定性组答
    render-profile.ts        # debug/public 投影
  scan/
    adapters/
      middleware-services.ts
      chatkit-web-apps.ts
      finclaw-modules.ts
      compose-manifest.ts
      cbm-candidates.ts
    merge.ts
    drift.ts
  retrieval/
    plan.ts                  # 增强：catalog 题型优先
    router.ts
    budget.ts
    fusion.ts                # 新增轻量融合
  ... 现有 core/security, evidence, knowledge(FAQ), routes
config/
  catalog-overlay.yaml       # 产品定义：include/exclude/rename
```

**YAGNI：** 第一期不引入 Neo4j、不引入完整 Backstage、不替换 CBM、不上独立向量库（FAQ embedding 可二期）。

---

## 5. 与市面参考的映射（我们学什么、不买什么）

| 参考 | 学习点 | llm-wiki 落地 |
|------|--------|----------------|
| Backstage / AiKA | Catalog 真相源 | 轻量 Catalog + overlay |
| Copilot Knowledge Bases | 权威知识与代码索引分离 | Catalog/FAQ vs CBM/lexical |
| Cody | 多策略 + ranking | fusion + 题型路由 |
| CBM | 结构图 | 继续作为 Graph 引擎 |
| Cursor | 索引生命周期 | 已有 P1，挂上 Catalog commit pin |
| Karpathy Wiki | 沉淀可验证知识 | FAQ cards + Catalog 版本 |

**产品采购建议：** 短期 **不采购** Sourcegraph/Copilot Enterprise 作为核心；用开源 CBM + 自研 Catalog 更贴合「三仓 + 对外脱敏 + MCP」约束。若未来仓数到百级再评估 Sourcegraph Search。

---

## 6. 部署形态选项（影响安全架构）

| 模式 | 描述 | 适用 |
|------|------|------|
| **M1 源码同机**（现状） | MCP 与 `code/` 同机；运行时可读源码 | 内网调试 / 可信环境 |
| **M2 Catalog-only 对外** | 对外实例只部署 Catalog snapshot + FAQ；无源码树 | 对外 MCP、防泄源码最强 |
| **M3 混合** | 内网 M1 产 Catalog；同步脱敏 snapshot 到对外 M2 | 推荐中期形态 |

重构第一期可仍 M1，但 **Composer/public 路径按 M2 约束设计**，避免以后拆不动。

---

## 7. 分阶段落地（架构调整怎么做）

### Phase 0 — 定规则与基线（3–5 天）

- 写下「微服务/模块」产品定义 → `catalog-overlay.yaml` 初稿。  
- 冻结一份 middleware 服务权威表（人工校对扫描结果）。  
- 扩展 golden：listing 集合题 + 跑基线 F1/Jaccard。  
- **交付：** 基线报告；不改主路径也可先做评测。

### Phase 1 — Catalog MVP + 确定性 listing（1–2 周）

- 实现 scan adapters（先 middleware，再 web/finclaw）。  
- Catalog store + query + compose-listing + profile render。  
- Router：listing/architecture → Catalog path（绕开宽 Agent 扫仓）。  
- Completeness gate。  
- **交付：** 你的反例题稳定通过 A；debug/public 双投影。

### Phase 2 — 评测门禁 + 漂移（约 1 周）

- `verify:upgrade` 增加集合 F1 / 稳定性。  
- Drift report + Index/Catalog 同步挂钩。  
- CI `--quick`。  
- **交付：** B 可回归；防止 silent 退化。

### Phase 3 — Fusion 与 FAQ 升级（1–2 周）

- 非 listing 题：轻量 fusion（并行 retrieve + rank）。  
- FAQ cards 与 Catalog 链接（`relatedEntityIds`）。  
- 可选：FAQ 小规模 embedding。  
- **交付：** 细节题质量升；fast path 更准。

### Phase 4 — 文档摄入与对外形态（按需）

- P6：README/ADR → capabilities 文案。  
- M2 Catalog-only 对外部署。  
- Map UI 展示 Catalog（P5）。

---

## 8. 风险与权衡

| 风险 | 缓解 |
|------|------|
| Overlay 维护成本 | 扫描出候选 + drift 告警；人工只审变更 diff |
| 「算不算微服务」争议 | 产品定义进 YAML；答案注明口径 |
| Catalog 过期 | commit pin + stale 拒答/警告 |
| public 太干 | capabilities 用非技术文案；Summary Agent 只润色不改集合 |
| 过度工程 | Phase 1 只做 Catalog listing；不换 CBM、不上 Backstage |

---

## 9. 建议决策（请评审）

| # | 建议 | 理由 |
|---|------|------|
| D1 | **采用「Catalog-first + CBM-graph + Agent-hybrid」目标架构** | 对齐市面标杆且贴合痛点 |
| D2 | **保留 CBM，不替换检索内核** | 已投入；结构题够用 |
| D3 | **listing/architecture 走确定性 Catalog 管线** | 解决错/漏/飘 |
| D4 | **验收 A+B+C+D 全部纳入，Phase 0 先建 A 基线** | 你要求全要；先能量化 |
| D5 | **不引入完整 Backstage/Sourcegraph 作为一期依赖** | YAGNI；学模型不搬平台 |
| D6 | **Knowledge Cards 降级为 FAQ；Catalog 升为一等公民** | 结构化完整率 |

---

## 10. 下一步（确认后写 decision / plan）

请你评审本文后确认：

1. 是否采纳 **D1–D6**？  
2. Phase 1 是否先只做 **chatkit-middleware 服务 Catalog**（web/finclaw 随后）？  
3. 「微服务」口径：是否以 `services/**` 可部署单元为准，并在 overlay 排除 tools/libs？

确认后产出：
- `02-decision-target-architecture.zh.md`
- `03-plan-phase0-1-catalog.zh.md`
- 技术方案细到接口与文件改动列表

---

## 附录 A. 参考链接

- Sourcegraph: Cody codebase understanding / Context / Code Graph  
- GitHub: Copilot Enterprise Knowledge Bases  
- Backstage/Roadie: rag-ai；Spotify AiKA  
- DeusData: codebase-memory-mcp；arXiv:2603.27277  
- Zylos Research: Codebase Intelligence 2026（Index-first / Agentic / Graph-augmented）  
- 本仓库：`docs/productization-roadmap.zh.md`、`docs/progress.zh.md`

## 附录 B. middleware 扫描示意（候选，非最终权威）

来自 `services/` 下具有 package/Cargo/Dockerfile 特征的路径（2026-07-10 本地树，供 overlay 校对）：

- gateways: a2a-gateway, ag-ui-server, api-gateway, auth-fabric-proxy, dingtalk-connector, feishu-connector, openclaw-compat-gateway, pulse-publish, wecom-connector  
- platform: auth-fabric, claw-fleet-manager, conversation-store, delivery, doc-toolkit, document-service, identity-service, inbox-service, orchestrator, persona-service, push-service, skill-service  
- pulse: agent-router, event-listener, trigger-filter, trigger-gateway, trigger-scheduler  
- enterprise: guardrails-engine, intent-classifier, policy-engine  

另需 overlay 决定：`ai-infra-rs`、tools、libs、web SPA 是否计入「微服务清单」口径。

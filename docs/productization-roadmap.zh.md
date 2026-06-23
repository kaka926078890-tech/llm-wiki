# llm-wiki 产品化演进路线建议

日期：2026-06-18

## 背景

`llm-wiki` 当前已经具备一个可工作的代码问答原型：后端通过 Fastify 暴露 `/agent/run` 和 MCP 入口，Agent loop 使用只读文件工具与 `cbm_search`（codebase-memory-mcp）来回答三个代码仓库的问题；前端以对话流为主。

但它还不是完整的产品化知识系统。主要缺口集中在四类：

- 安全与证据主干已落地（P0/P0-B）；**无证据拒答、Agent 引用校验**仍待加强。
- CBM 索引已有 CLI 与 `/health`，但 **stale 检测与索引管理 UI** 尚未产品化。
- 问答过程没有沉淀成可复用知识（**P3 知识卡片**未开始）。
- 前端除 Chat、**Runs** 外，缺少 Project Map、Index Status、Knowledge 等产品视图。

本路线建议的核心顺序是：**先安全，再控检索成本，再索引，再沉淀，再产品界面，再平台化**。

## 当前进展（2026-06-23）

> **完整进度表见 [progress.zh.md](./progress.zh.md)**（本文档侧重分阶段设计与原则）。

### 一句话状态

**可工作的三仓库代码问答原型**：Agent + MCP + CBM + P0 安全 + P0 证据 + **P0-B 检索控制（含硬路由与 Runs UI）** + golden 升级验证；**还不是**可复用知识库产品。

### 架构快照

```
用户 / MCP
    ├── /agent/run  → SSE（debug）
    ├── /mcp        → ask_llm_wiki（public）
    ├── /health     → CBM 状态
    └── /api/runs   → telemetry
              ↓
    plan → router（硬路由）→ budget（按题型下限）→ tools + cbm_search
              ↓
    evidence + security → .reasonix/runs/*.json
```

### 已完成

| 模块 | 内容 |
|------|------|
| **后端** | Fastify：`/agent/run`、`/mcp`、`/health`、`/api/runs`、静态前端 |
| **CBM** | 唯一结构/语义检索；`cbm:init/sync/status`；`/health.cbm` |
| **P0-A 安全** | `core/security`、answer profile、audit |
| **P0 证据** | `core/evidence`、MCP 引用校验、telemetry 落盘、Agent `evidence` SSE |
| **P0-B 检索** | `plan.ts`、`budget.ts`（按题型下限）、`router.ts`（硬路由）、Runs 页 |
| **P7 评测** | `benchmarks/golden-questions.json`、`npm run verify:upgrade`、skill |
| **测试** | 87 条用例；`tsc --noEmit` 通过 |

### 部分完成

| 模块 | 缺口 |
|------|------|
| **P0 证据** | 无证据拒答；Agent 引用校验 |
| **P1 索引** | ✅ stale、`/api/index/sync`、Index Re-index、`sync:code:full` |
| **P5 UI** | Project Map、Knowledge（Chat / Runs / Index 已有） |
| **P7** | CI 自动 golden 回归 |

### 未开始

P2 图谱 · P3 知识卡片 · P4 证据引擎 · P6 OKF 文档摄入 · P8 平台化

### 建议下一步

1. **P3/P2** — 知识卡片 + 图谱 artifact  
2. **P0 补强** — 无证据拒答、Agent 引用校验  

## 目标原则

1. **安全优先于智能**
   面向用户的代码问答产品，泄露代码、密钥、私有配置的风险高于回答不够聪明。安全 harness 应早于知识图谱和复杂 UI。

2. **证据优先于生成**
   回答必须绑定 evidence bundle：路径、行号、摘要、脱敏状态、来源 hash。没有证据时，应明确说不知道或要求扩大权限。

3. **沉淀可验证知识，而不是沉淀聊天历史**
   知识沉淀对象应是“问题、答案、证据、版本、过期条件”的结构化记录，而不是把所有对话原文塞进长期记忆。

4. **语义分层建设**
   语义不等于 embedding。产品化语义能力至少包括检索层、结构层、摘要层、推理层。

5. **先支持当前三个 repo，再抽象多项目**
   不要一开始就做重型多租户平台。先把 `chatkit-middleware`、`chatkit-web`、`finclaw` 的闭环做好，再抽象 workspace/project/repo。

## 推荐阶段顺序

### P0：安全 Harness 与证据约束

优先级：最高

目标：把“不暴露代码、密钥、敏感配置”从 prompt 约束升级为工程约束。

当前状态：**部分完成**。P0-A 已完成；P0 证据 bundle、引用校验、run telemetry 落盘已完成；`guardFinalAnswer` 已加连续源码行数限制与 dependency path 策略。

建议交付：

- 新增敏感内容检测与脱敏模块。（已完成）
- 在 `read_file`、`search_content`、`cbm_search` 的返回前统一经过 tool-output redactor。（已完成）
- 新增 sensitive path policy：
  - 默认拒读或强脱敏 `.env`、private key、证书、token、cookie、secret、credential 等文件。
  - 对 generated/dependency/binary 文件默认跳过或仅返回元信息。
- 新增 final-answer guard：
  - 限制连续源码输出行数。
  - 禁止输出疑似密钥。
  - 对敏感文件只允许返回“存在配置/风险/需授权查看”的摘要。
- 新增 answer profile：
  - `debug`：保留原始回答，用于本地调试。
  - `internal`：保留实现细节，但仍做 secret redaction。
  - `public`：面向 MCP/用户向输出，做语义降敏摘要。（已完成）
- 新增 evidence bundle：（**已完成** — `core/evidence`，落盘于 `.reasonix/runs/<runId>.json`）
  - 每条最终结论必须关联证据来源。
  - 输出前校验答案中的引用是否来自本轮证据。（**已完成** — MCP strict 模式剥离 orphan citations；Agent debug 发 `evidence` SSE）
- 新增审计日志：（**已完成** — security-audit.jsonl + run telemetry）

为什么先做：

- 现在文件访问已经有授权根目录限制，但“读到内容后怎么防泄露”还不够硬。
- 后续语义索引和知识沉淀会复制、缓存、传播更多内容；如果安全边界晚做，返工会很大。

验收标准：

- `.env`、private key、token 样例不会通过任何工具或最终答案明文泄露。
- 模型要求“完整贴出源码”时，系统能工程级拦截。
- 所有最终回答都能产出证据清单或明确无证据。

### P0-B：检索计划器与工具调用预算

优先级：高（**已完成**，见 [progress.zh.md](./progress.zh.md)）

目标：解决「工具调用太多、同类工具重复、空结果浪费、检索路径混乱」的问题。

当前状态：**已完成**。plan 分类、budget（按题型下限、完整率优先）、硬路由、去重、telemetry 落盘与 Runs UI 均已落地。

建议交付：

- 新增 query classification：（**已完成**）
- 新增 tool budget：（**已完成** — 按题型下限 config=28 等；env 不可压低下限）
- 相同 repo/path/pattern 去重：（**已完成**）
- 新增 retrieval plan + 硬路由：（**已完成** — `router.ts`，preferred 先行）
- 新增 run telemetry：（**已完成** — `.reasonix/runs/` + `/api/runs` + 前端 Runs 页）

为什么现在做：

- P0-A 已经解决“不该泄露”的底线问题。
- 当前最明显的体验问题是工具调用量不可控，尤其是宽泛配置类问题会触发多轮目录、glob、read。
- 做知识沉淀和语义索引前，先让一次问答成本和检索行为可控，否则后续沉淀的源头质量不稳定。

验收标准：

- 对“chatkit-web 都有哪些配置项”这类问题，工具调用次数明显减少，且不会先落到错误 repo。
- 同一轮中重复的 `glob/read_file/search_content` 调用会被去重或停止。
- 连续空结果达到阈值后，planner 会改变策略或停止扩展。
- Debug 日志能解释为什么调用某个工具、为什么停止。

### P1：索引生命周期产品化

优先级：高（**已完成**，见 [progress.zh.md](./progress.zh.md)）

目标：让 **CBM 索引**从「手动 CLI + `/health`」变成可观测、可维护的基础能力。

已交付：`detect_changes` stale、`GET/POST /api/index/*`、Index 页 Re-index、`sync:code:full`、`LLM_WIKI_CBM_AUTO_SYNC`、`.reasonix/cbm-index-state.json`。

建议交付（归档参考）：

- 统一索引状态模型：
  - repo 名称
  - 当前 git commit vs 索引 commit（**stale 检测**）
  - CBM 项目 id / 上次 sync 时间
  - 索引是否可用
- 新增 `/index/status` 或前端 **Index** 页（Runs 页已有，Index 未做）。
- 增量 re-index：代码变更后 `cbm:sync` 或自动钩子。
- 召回策略（当前已部分落地）：
  - config / listing → lexical（glob、search_content）优先，硬路由已启用。
  - symbol / architecture → `cbm_search` 优先。
  - 结果归一化为 evidence candidates（P0 已做采集，P4 待融合）。
- 索引构建日志和失败恢复。

为什么排在 P0 后：

- 向量索引会把代码内容拆块保存，属于新的数据副本。必须先有脱敏和敏感路径策略。

验收标准：

- 用户能看到三个 repo 的 CBM 索引是否可用、是否相对 git HEAD **过期（stale）**。
- 代码 push 后能在 UI 或 `/health` 看到需 re-sync 提示。
- `cbm:sync` 失败时有可读的日志与恢复路径。

### P2：知识图谱 Artifact

优先级：高

目标：把一次性问答升级为可复用的项目地图。

建议交付：

- 新增 `.llm-wiki/graph.json` 或 `.reasonix/wiki/graph.json`。
- 图谱节点类型建议：
  - repo
  - module
  - file
  - symbol
  - route
  - component
  - config
  - domain
  - flow
  - doc
  - claim
- 图谱边类型建议：
  - contains
  - imports
  - calls
  - routes
  - reads_from
  - writes_to
  - configures
  - depends_on
  - related
  - supports_answer
- 图谱来源：
  - CodeGraph 结构关系
  - tree-sitter 文件 outline
  - semantic chunk 聚类
  - LLM 生成的文件/模块摘要
  - 人工确认的知识卡片
- 图谱必须记录版本：
  - source file hash
  - repo commit
  - analyzer version
  - generatedAt

为什么排在 P1 后：

- 图谱应该建立在稳定索引和证据模型之上，否则会成为另一个不可验证缓存。

验收标准：

- 给定一个用户问题，系统能先命中相关图谱节点，再扩展邻居，再读取少量证据文件。
- 文件变更后，相关节点可标记 stale。
- 图谱不保存敏感明文。

### P3：知识沉淀与可信知识卡片

优先级：高

目标：让高质量问答可以被保存、复用、过期检测和人工校准。

建议交付：

- 新增 saved knowledge card：

```json
{
  "id": "knowledge:...",
  "question": "...",
  "answer": "...",
  "repoScope": ["chatkit-web"],
  "evidence": [
    {
      "path": "...",
      "startLine": 10,
      "endLine": 40,
      "hash": "...",
      "redacted": false
    }
  ],
  "confidence": "verified",
  "createdAt": "...",
  "staleWhen": ["evidence_hash_changed"]
}
```

- 前端允许用户对答案执行：
  - 保存为知识
  - 标记错误
  - 要求重新验证
  - 查看证据
- 问答时优先检索知识卡片，但必须检查 evidence 是否 stale。
- 支持知识卡片反哺图谱：
  - `question` 和 `answer` 作为 semantic 索引对象。
  - `evidence` 作为 graph edge。

为什么排在图谱后：

- 沉淀知识需要挂载到 repo、文件、节点、证据上。先有图谱，知识才有稳定位置。

验收标准：

- 常见问题第二次回答能复用已验证知识。
- 底层文件变更后，相关知识卡片显示 stale。
- 被用户标记错误的知识不会继续作为高置信来源。

### P4：Evidence-bound 问答引擎

优先级：中高

目标：重构当前问答流程，让 planner、retriever、reader、answerer、validator 分层。

建议交付：

- Query planner：
  - 识别问题类型：架构、代码事实、配置、影响分析、业务流程、故障排查、是否支持某功能。
- Retriever：
  - 融合 lexical、cbm_search、knowledge card、graph node。
- Evidence reader：
  - 只读取必要文件范围。
  - 输出结构化 evidence bundle。
- Answer composer：
  - 只基于 evidence 生成答案。
- Validator：
  - 检查答案是否引用证据。
  - 检查是否包含敏感内容。
  - 检查是否超出允许源码引用范围。

为什么排在 P3 后：

- 当前 loop 可以继续服务原型；等安全、索引、图谱、知识卡片稳定后，再重构问答链路收益更明确。

验收标准：

- 每次回答都有可展示的证据轨迹。
- 无证据问题不会被模型强答。
- 多轮问答仍能保持证据边界。

### P5：产品前端升级

优先级：中

目标：从“聊天页”升级成“代码知识工作台”。

建议页面：

- Chat
  - 用户问答主入口。
  - 展示 answer、evidence、tool trace、脱敏提示。
- Project Map
  - repo/module/file/symbol/domain 图谱。
  - 支持搜索、过滤、节点详情、关联证据。
- Knowledge
  - 已保存知识卡片。
  - 支持 stale、verified、wrong、needs review 状态。
- Index Status
  - CBM / graph / doc index 状态。
  - 支持触发重建或查看失败。
- Impact Analysis
  - 基于 git diff 和 CodeGraph 展示变更影响面。
- Admin / Policy
  - 配置敏感路径、repo 权限、输出策略、审计。

为什么不更早做：

- 没有安全、索引、图谱和知识沉淀时，前端只能包装聊天体验。先做底座，UI 才有内容可展示。

验收标准：

- 非技术用户可以通过 Project Map 理解系统结构。
- 技术用户可以从答案跳回证据、文件、图谱节点。
- 管理员可以看到索引和安全策略状态。

### P6：文档/wiki 摄取

优先级：中

目标：让 `llm-wiki` 不只理解代码，也理解文档、PRD、架构说明、运行手册。

建议交付：

- 支持 Markdown wiki 摄取：
  - `index.md`
  - wikilinks
  - headings
  - frontmatter
  - categories
- 支持 doc graph：
  - article
  - topic
  - claim
  - source
- 支持文档和代码互联：
  - 文档 claim 关联代码 evidence。
  - 代码节点关联设计文档。
- 支持“文档是否和代码一致”的检查。

为什么排在 P5 附近：

- 文档摄取本身价值高，但它会扩大知识面和安全面。建议等基础安全和图谱完成后做。

验收标准：

- 可以问“某个设计文档里说的能力代码是否真的支持”。
- 可以从文档 claim 跳到代码证据。
- 文档变更或代码变更会影响对应知识状态。

### P7：评估体系与回归集

优先级：中

目标：让质量可度量，避免每次改 prompt 或 retriever 后靠人工感觉判断。

建议交付：

- 固定 benchmark 问题集：
  - 代码事实
  - 跨 repo 架构
  - 不存在能力
  - 敏感信息诱导
  - 影响分析
  - 文档代码一致性
- 每个 case 记录：
  - 期望证据路径
  - 禁止输出内容
  - 最低回答要求
- 自动评分：
  - evidence hit
  - groundedness
  - no secret leak
  - answer completeness
- 保存历史结果趋势。

为什么排在中期：

- P0 应有基础安全测试；完整评估体系可以在核心链路稳定后扩展。

验收标准：

- 每次改检索、prompt、安全策略，都能跑回归。
- 可以发现“回答更像了但证据少了”这类退化。

### P8：平台化与多项目

优先级：后期

目标：从固定三个 repo 升级到可配置 workspace/project/repo 的产品。

建议交付：

- Workspace 模型：
  - workspace
  - project
  - repo
  - index job
  - policy
  - user/team
- Repo 管理：
  - 添加 repo
  - 同步 repo
  - 删除 repo
  - 设置默认分支
  - 配置敏感路径
- 多用户权限：
  - viewer
  - developer
  - admin
- 部署模式：
  - 本地私有部署
  - 企业内网部署
  - SaaS 托管模式预留

为什么最后做：

- 当前价值可以先在固定三个 repo 上证明。过早平台化会把注意力拉到账号、权限、任务队列、部署，而不是问答质量本身。

验收标准：

- 新增一个 repo 不需要改代码。
- 不同用户看到不同 repo 和不同证据范围。
- 索引、知识、审计都按 workspace 隔离。

## 推荐总顺序

| 阶段 | 名称 | 核心价值 | 依赖 |
|------|------|----------|------|
| P0 | 安全 Harness 与证据约束 | 防泄露，建立产品底线 | 当前工具层 |
| P0-B | 检索计划器与工具调用预算 | 控成本，减少重复调用 | P0-A |
| P1 | 索引生命周期产品化 | 让 CBM 索引可用可管 | P0 |
| P2 | 知识图谱 Artifact | 建立项目地图 | P1 |
| P3 | 知识沉淀与可信知识卡片 | 让问答可复用 | P2 |
| P4 | Evidence-bound 问答引擎 | 提升回答可靠性 | P0-P3 |
| P5 | 产品前端升级 | 从聊天变工作台 | P0-B, P2-P4 |
| P6 | 文档/wiki 摄取 | 代码 + 文档统一理解 | P0-P3 |
| P7 | 评估体系与回归集 | 质量可度量 | P0-P4 |
| P8 | 平台化与多项目 | 扩展成通用产品 | P0-P7 |

## 最小可行里程碑

### M1：可安全对外试用

包含：

- P0-A 的 sensitive path policy、redactor、answer profile、audit log。
- P0-B 的基础 tool budget 与 run telemetry。
- 基础 evidence bundle。
- 安全回归测试。

结果：

- 可以让真实用户试用代码问答，但仍限制在固定三个 repo。

### M2：可复用知识系统

包含：

- P1 索引状态与 **CBM stale 检测**（增量 sync 可后续）。
- P2 graph artifact。
- P3 knowledge card。

结果：

- 常见问题不再每次从零查。
- 项目结构和问答知识可以持续积累。

### M3：产品工作台

包含：

- P4 evidence-bound 问答链路。
- P5 Project Map、Knowledge、Index Status。
- P7 初版评估集。

结果：

- 从内部工具升级为可演示、可迭代、可评估的产品。

### M4：多项目平台

包含：

- P6 文档/wiki 摄取。
- P8 workspace/project/repo 抽象。
- 更完整的权限和部署模型。

结果：

- 可以扩展到更多项目和团队。

## 建议先开工的任务包

第一批任务 P0-A 已完成。下一批建议做 **P0-B：检索计划器与工具调用预算**，范围克制：

1. 定义 `ToolBudgetPolicy`：
   - max total tool calls
   - max calls per tool
   - max consecutive empty results
   - duplicate call key

2. 定义 `QueryPlan`：
   - question type
   - preferred tools
   - repo scope
   - stop conditions

3. 在 loop/tool dispatch 层记录 run telemetry：
   - tool start/end
   - duration
   - result empty / non-empty
   - redaction hit
   - budget stop reason

4. 在工具调度前做预算判断：
   - 重复调用拒绝或复用结果
   - 空结果过多时停止同类扩展
   - 超预算时返回可解释状态给模型

5. 增加测试：
   - 同一工具参数重复调用会被拦截或复用
   - 连续空结果触发停止
   - 配置类问题不再无界 read 多个大文件
   - run telemetry 记录 tool count 与 stop reason

这一包完成后，再进入 P1/P3 会舒服很多。否则语义索引和知识沉淀越做越多，仍然会被“单次问答成本不可控”拖住。

## 当前架构的主要演进点

### 后端

当前：

- `createApp()` 注册 ask、health、mcp 和静态资源。
- `buildLoop()` 每次构建工具和模型前缀。
- 工具层直接返回字符串给模型。

建议演进：

- 增加 `core/security/`：策略、脱敏、敏感路径、输出校验。
- 增加 `core/planning/`：问题分类、检索计划、工具预算。
- 增加 `core/evidence/`：统一证据对象和引用校验。
- 增加 `core/retrieval/`：融合 lexical、cbm_search、knowledge graph。
- 增加 `core/knowledge/`：graph、knowledge card、stale detection。
- 增加 `core/jobs/`：索引构建、图谱构建、摘要生成。

### 前端

当前：

- 单页 Chat UI。
- 可切 Agent Stream / MCP Final。

建议演进：

- 左侧导航：Chat、Project Map、Knowledge、Index、Admin。
- Chat 答案分区：Answer、Evidence、Trace、Warnings。
- Project Map 支持节点详情和证据跳转。
- Index 页面展示 CBM / graph 状态。

### 数据

当前：

- CBM 索引由 codebase-memory-mcp 管理（`~/.cache/codebase-memory-mcp/`）。
- 问答本身没有结构化沉淀。

建议演进：

- `.llm-wiki/graph.json`
- `.llm-wiki/knowledge-cards.jsonl`
- `.llm-wiki/audit.jsonl`
- `.llm-wiki/index-status.json`
- 后续再替换为 SQLite 或服务端数据库。

## 风险提醒

- 不要把 embedding 当作安全边界。向量库本身也可能泄露信息。
- 不要把 LLM 摘要当作事实来源。摘要必须可回溯到代码证据。
- 不要让知识卡片永久高置信。证据文件变更后必须 stale。
- 不要过早多租户化。先做出一个安全、可靠、可解释的单 workspace 产品。
- 不要只做图谱 UI。没有证据约束的漂亮图，很容易变成“看起来懂了”的幻觉工具。

## 推荐结论

如果全部都想做，建议按下面节奏推进：

1. P0-A 安全 Harness 与 answer profile。（已完成第一阶段）
2. P0-B 检索计划器与工具调用预算。
3. P1 索引生命周期产品化。
4. P3 知识沉淀与可信知识卡片。
5. P2 知识图谱 Artifact。
6. P4 Evidence-bound 问答引擎。
7. P5 产品前端升级。
8. P6 文档/wiki 摄取。
9. P7 评估体系与回归集。
10. P8 平台化与多项目。

第一阶段不要贪多。当前安全底线已经开始成型，下一步先把“单次问答如何查、查多少、何时停止”做实，后面的语义、图谱、知识沉淀才不会建立在不可控的检索成本上。

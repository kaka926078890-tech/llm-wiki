# llm-wiki 知识质量重构：讨论汇总与方案总览

日期：2026-07-10  
状态：**讨论汇总（单一事实来源）**  
说明：本文合并 `docs/refactor-mcp/00`–`09` 的讨论结论；分篇原文保留作附录索引。  
**诉求/目标/方案对外说明请优先读：[requirements-goals-solution.zh.md](./requirements-goals-solution.zh.md)**  
**可落地性 / 实施计划 / 验证计划：[13](./13-readiness.zh.md) · [14](./14-implementation-plan.zh.md) · [15](./15-verification-plan.zh.md)**  
**口径计划基线（Codex 全 A）：[16](./16-decision-scope-all-A.zh.md)**  
**Loop 运行：[loop-runbook](./loop-runbook.zh.md)** · **执行提示词：[17-execution-prompts](./17-execution-prompts.zh.md)**

---

## 1. 目标与非目标（已澄清）

### 1.1 目标

| # | 目标 | 含义 |
|---|------|------|
| 1 | 准确 / 完整 / 稳定 | 清单类问题不猜数、不漏项、同问同答 |
| 2 | 双模式 | 调试（可看证据/路径）vs 对外/MCP（非技术可读 + 不泄密） |
| 3 | 不泄源码 / 隐私 | 对外出口工程约束，不只靠 prompt |
| 4 | 验收 A+B+C+D | 清单集合指标 + golden + 人工抽检 + 架构可落地 |

### 1.2 非目标

- **不是**为「支持标准 MCP」而重构（`/mcp` + `ask_llm_wiki` 已有）。
- **不是**引入完整 Backstage / Sourcegraph 作为一期依赖。
- **不是**靠「维护者人肉记住三仓细节」保证名单准确。
- **不是**在用户每次提问时现场扫仓生成功能名单。

### 1.3 核心问题一句话

现有系统能答，但清单/功能类问题靠 Agent 临时发现 → **错、漏、飘**。  
新方案用 **离线确定性抽取 → JSON 功能/结构清单 → 问答只读表**，再配合现有 CBM/Agent 答关系与细节题。

---

## 2. 现在的架构（As-Is）

### 2.1 逻辑图

```
用户 / MCP
  ├── POST /agent/run     → SSE，默认 debug profile
  ├── POST /mcp           → ask_llm_wiki，默认 public profile
  ├── /health · /api/index/* · /api/knowledge · /api/runs
              │
              ▼
     知识卡片 fast path（lexical 匹配 verified 卡）？
              │ miss
              ▼
     Agent loop（DeepSeek）
       · retrieval plan / router / budget
       · 词法工具：glob / search_content / read_file / …
       · cbm_search → codebase-memory-mcp
              │
              ▼
     evidence 校验 + answer profile 脱敏 + telemetry
              │
              ▼
     .reasonix/runs · knowledge-cards.jsonl · security-audit.jsonl
```

### 2.2 已有能力（保留）

| 模块 | 作用 |
|------|------|
| 双出口 + answer profile | 调试 vs 对外 |
| 仅暴露 `ask_llm_wiki` | 控制对外工具面 |
| CBM + `cbm_search` | 结构/语义检索 |
| plan / router / budget | 题型与成本控制 |
| evidence + 无证据拒答 | 信任约束 |
| security harness | 工具与答案脱敏 |
| 知识卡片 JSONL + fast path | FAQ 沉淀（非清单真相源） |
| golden + `verify:upgrade` | 评测种子 |
| `sync:code` / `cbm:sync` / index API | 代码与索引生命周期 |

### 2.3 已知痛点（清单/功能题）

1. 无「事先算好的功能/服务集合」→ 模型现场猜「共 N 个」。  
2. tool budget 用尽后强制收束 → 易不完整。  
3. 无集合级 completeness 门禁。  
4. 知识卡片是自由文本，难验集合、问法一变易 miss。  
5. 三仓不对称：仅 middleware 有 `edition-manifest`；web/finclaw 无微服务表。  
6. 文档不全 → 不能承诺「完整产品说明书」，只能先保证工程可枚举清单。  
7. 评测偏 pattern 交集，缺集合 F1 / 同问稳定性。  

### 2.4 资产

| 仓 | 路径 |
|----|------|
| chatkit-web | `code/chatkit-web` |
| chatkit-middleware | `code/chatkit-middleware` |
| finclaw | `code/finclaw` |

---

## 3. 新方案要补充什么（To-Be 增量）

### 3.1 目标逻辑（在现有之上加一层，不推倒）

```
① sync:code
② cbm:sync                         （已有）
③ catalog:gen  【新增】
     按仓抽取器 → .reasonix/feature-lists/{repo}.json
              │
④ 用户提问
              │
     功能/结构清单题？──是──► ⑤ 读 JSON 渲染（debug/public 投影）
              │                      + 集合完整性门禁
              否
              ▼
     现有 Agent + CBM 路径（关系/排错/细节）
```

### 3.2 必须新增的内容（按优先级）

| 优先级 | 增量 | 说明 |
|--------|------|------|
| P0 | **功能/结构清单抽取器** | 按仓规则离线生成 JSON（见 §3.3） |
| P0 | **清单题专用回答路径** | 识别意图后读 JSON，禁止模型发明条目 |
| P0 | **集合评测** | 权威集合 vs 答案集合 → F1 / Jaccard |
| P1 | **挂进 `sync:code:full`** | 与 cbm:sync 并列刷新清单 |
| P1 | **debug/public 投影** | 同表两套渲染（路径/来源仅 debug） |
| P2 | **drift 报告** | 抽取结果相对上次 diff（可选告警） |
| P2 | **FAQ 与清单解耦** | 卡片继续做人审 FAQ；清单不靠卡片 |
| 后置 | 轻量 fusion / 文档补 summary | 仅在清单路径验证有效后再做 |

**一期不做：** 换 CBM、上 Backstage、提问时全仓 Agent 编名单、维护者人肉审全表。

### 3.3 各仓抽取方式（功能清单如何生成）

**共同定义：** 功能清单 = `{id, title, summary?, source[], confidence}` 条目数组。  
**生成时机：** 步骤 ③ 离线；**不是**提问时。

| 仓 | 抽取器（输入 → 条目） |
|----|----------------------|
| **middleware** | `edition-manifest.yaml` 的 services（主）；可选 `flows/*.yaml`、OpenAPI tags；infra 默认不进「微服务」 |
| **chatkit-web** | `package.json` workspaces（应用层）+ React 路由 + `locales/zh.json` 导航文案（页面功能）；**不做假微服务表** |
| **finclaw** | Cargo `crates/*` + CLI subcommands；（可选）HTTP/contract；**不做假微服务表** |

文档不全时：`summary` 可空；条目仍以结构源为准；答案须声明「工程可枚举清单，非完整产品说明书」（若无产品文案源）。

### 3.4 「权威名单 / Catalog」白话（讨论收敛后的定义）

- **不是**新中间件产品名。  
- **就是**步骤 ③ 产出的那份 **JSON 条目表**（带来源）。  
- 准确性来自 **仓库声明/结构源**（如 manifest、workspaces、路由），不是来自你是否熟代码。  
- 人只需定 **口径规则**（用哪个源、含不含 infra），不逐个背服务。

### 3.5 双模式（沿用并收紧）

| | debug | public / MCP |
|--|-------|----------------|
| 清单条目 title/summary | ✓ | ✓（非技术措辞） |
| source 路径 / 证据 | ✓ | 默认隐藏或仅「已验证」 |
| 端口 / env / 源码块 | 可见（脱敏值） | 禁止 |

---

## 4. 验证与测试方式

### 4.1 原则

每个改造 = **可失败假设 + 前后对比**。无数字提升则回滚，不堆框架。

### 4.2 实验设计

| 实验 | 做法 | 通过标准（草案） |
|------|------|------------------|
| **E0 基线** | 固定清单题，现网 MCP 跑 N=3；对权威集合算 F1 / Jaccard | 留下 baseline 报告 |
| **E1 清单路径** | 启用「读 JSON 回答」后再跑同样题 | listing F1≥0.95；Jaccard≥0.95；无错误「共 N 个」 |
| **B golden** | `verify:upgrade` 全量/quick | 不低于基线；清单子集上升 |
| **C 人工** | 非技术抽检 public 答案 | 可读、够用、不泄密 ≥90% |
| **回归** | CI 或发版前跑 E1 + golden quick | 红则阻断 |

### 4.3 权威集合从哪来（评测用）

| 题型 | 评测权威集合 S* |
|------|-----------------|
| middleware 微服务/服务清单 | 与抽取器同源：`edition-manifest` services（可按 edition） |
| web 应用清单 | `package.json` workspaces |
| web 管理台功能 | 路由 path 集合（或约定子集） |
| finclaw 模块 | crate 名集合 |

**产品散文题**无结构源 → 不纳入 A 类硬门槛，只走 C 抽检或标 weak。

### 4.4 每次改造工单（强制）

```
假设 → 影响题型 → 主度量 → 基线报告 → 改动 → 对比题 → 通过线 → 回滚方式
```

阶段上 **一次一个主变量**（先清单读表路径，再谈 fusion）。

### 4.5 防技术堆砌准入

1. 是否直接减少错/漏/飘/泄密？  
2. 有无更小改法（一张 JSON + 读表）？  
3. 两周内能否用 E0/E1 证伪？  

任一为否 → 不做。

---

## 5. 建议落地顺序

| 阶段 | 内容 | 验证 |
|------|------|------|
| **Phase 0** | 定口径规则；冻结对比题；跑 E0 基线 | 有 baseline 数字 |
| **Phase 1** | 实现一个仓的 `catalog:gen` + 清单读表路径 | E1 打赢 E0 |
| **Phase 2** | 挂入 `sync:code:full`；扩第二仓；golden 集合断言 | B + 防回退 |
| **Phase 3** | drift、summary 润色、非清单题不退化检查 | C + 全量 golden |

**第一期抽取器待选（未拍板）：** middleware M1（manifest）或 web W1+W2（workspaces+路由+i18n）。

---

## 6. 待确认事项（开放）

| ID | 问题 | 状态 |
|----|------|------|
| T1 | `catalog:gen` 是否挂进 `sync:code:full` | **已确认：挂进** → [10](./10-decision-sync-and-three-repos.zh.md) |
| T2 | 覆盖仓 | **已确认：三仓全做** → [10](./10-decision-sync-and-three-repos.zh.md) |
| T3 | 口径规则 | **计划基线：Codex 全 A** → [16](./16-decision-scope-all-A.zh.md) |
| 实施 | 计划与验证 | **已出** → [14](./14-implementation-plan.zh.md) · [15](./15-verification-plan.zh.md) |
| T5 | D1–D6 | 以 E0/E1 验证为准 |

---

## 7. 分篇讨论索引（归档）

| 文档 | 主题 |
|------|------|
| [00](./00-discussion-kickoff.zh.md) | Kickoff / 状态表 |
| [01](./01-discussion-market-approaches-and-goal-correction.zh.md) | 主目标修正：非 MCP 封装 |
| [02](./02-research-and-target-architecture.zh.md) | 市面调研与目标架构长文 |
| [03](./03-discussion-catalog-and-validation.zh.md) | 如何证明有效、防堆砌 |
| [04](./04-what-is-catalog-plain.zh.md) | 权威名单白话 |
| [05](./05-catalog-generate-and-maintain.zh.md) | 生成与维护（早期，含人审表述） |
| [06](./06-automated-catalog-without-expert.zh.md) | 自动化、不以人熟代码为准 |
| [07](./07-asymmetric-repos-no-universal-manifest.zh.md) | 三仓不对称 |
| [08](./08-how-feature-list-is-generated.zh.md) | 功能清单生成步骤 |
| [09](./09-where-extraction-runs.zh.md) | 抽取在流水线哪一步 |

**以后请优先读本文；分篇仅作过程痕迹。**

---

## 8. 现状 vs 新增（对照表）

| 维度 | 现在 | 新方案补充 |
|------|------|------------|
| 清单从哪来 | Agent 临时发现 | 离线抽取 JSON |
| 何时生成 | 提问时隐含 | `catalog:gen`（sync 后） |
| 准确性靠谁 | 模型 + 检索运气 | 仓库结构/声明源 + 规则 |
| 完整率怎么验 | 文本 pattern | 集合 F1 / Jaccard |
| 稳定性 | 弱 | 同表同答 |
| web/finclaw | 当代码搜 | workspaces/路由/crates 等专用抽取 |
| MCP | 已有 | 继续用；清单题走读表 + public 投影 |
| CBM | 已有 | 保留，管非清单题 |

---

## 9. 下一步

请确认 §6 的 T1–T4（可一并回复）。  
确认后产出：`10-decision-*.zh.md` + Phase 0/1 实施 plan（含文件级改动列表）。

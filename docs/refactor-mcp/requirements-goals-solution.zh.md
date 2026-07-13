# llm-wiki 诉求 · 目标 · 解决方案

日期：2026-07-10  
状态：方案说明（讨论收敛稿）  
详细过程与索引：[SUMMARY](./SUMMARY.zh.md)

---

## 一、诉求（你要解决什么）

把面向三份源码仓库（`chatkit-middleware`、`chatkit-web`、`finclaw`）的 **llm-wiki 知识问答**做可靠，而不是再包一层协议。

典型痛点（你举的例子）：

| 失败 | 表现 |
|------|------|
| 不准 | 问 middleware 功能/微服务，答成「总共 10 个」（错） |
| 不全 | 只列出部分服务/功能 |
| 不稳 | 同一问题多次答案集合不一致 |

同时要求：

1. **调试模式**：研发可见推理/工具/证据等正常调试内容。  
2. **对外模式（含 MCP）**：非技术人员能看懂；仍要准、全、稳；**不泄露源码与隐私**。  
3. 现有系统 **已支持标准 MCP**，重构重点不是「做成 MCP」，而是 **更好的知识/检索/扫描与问答质量**。  
4. 维护者 **并不熟三仓全部细节**，不能靠「人肉确认每条」保证准确。  
5. 三仓 **不对称**：只有 middleware 有类似服务声明；web/finclaw 没有微服务表，文档也不齐全。

验收要求 **A+B+C+D 都要**：清单集合指标、golden 整体、人工可读/不泄密抽检、架构可落地。

---

## 二、目标（做成什么样算成功）

| 目标 | 成功标准（操作定义） |
|------|----------------------|
| **准确** | 清单条目不张冠李戴；不出现错误的「共 N 个」 |
| **完整** | 相对约定权威集合，Recall/F1 达标（草案 ≥0.95） |
| **稳定** | 同问多次答案集合接近一致（草案 Jaccard ≥0.95） |
| **双模式** | 同一知识，debug 可看源/证据；public 可读且脱敏 |
| **可维护** | 名单来自仓库结构/声明源自动抽取，不靠个人记忆 |
| **可验证** | 每次改造有基线对比；红则回滚，不堆无度量的框架 |

**非目标：** 换 MCP 协议、一期上 Backstage/Sourcegraph、提问时让模型现场发明功能名单、承诺「完整商业功能说明书」（文档不足时只保证工程可枚举清单）。

---

## 三、解决方案（怎么做）

### 3.1 一句话

> **离线按规则从三仓抽出功能/结构清单 JSON → 清单类问题只读表回答 → 其它问题仍走现有 CBM + Agent；同步时刷新清单；用集合评测证明变好。**

### 3.2 在现有架构上增量（不推倒）

**保留：** Agent/MCP 双出口、answer profile、CBM、`cbm_search`、检索 plan/router/budget、evidence、安全脱敏、知识卡片（作 FAQ）、golden 评测。

**新增：**

```
sync:code
  → cbm:sync              （已有）
  → catalog:gen           （新增，已确认挂进 sync:code:full）
       三仓抽取器 → .reasonix/feature-lists/{repo}.json

用户提问
  → 若是功能/服务/模块清单题 → 读对应 JSON 渲染（禁止表外编造）
  → 否则 → 现有 Agent + CBM 路径
```

### 3.3 功能清单如何生成（按仓）

| 仓 | 抽取什么（工程可枚举） |
|----|------------------------|
| **middleware** | 主源：`edition-manifest.yaml` 的 `services`；infra（postgres 等）默认不进「微服务」；问功能清单默认=服务清单 |
| **chatkit-web** | `package.json` workspaces（应用/库分节）+ 管理台路由 + `zh.json` 导航文案；不做假微服务表 |
| **finclaw** | Cargo crates + CLI 子命令；vendor 不进；问「微服务」时说明非微服务并改答模块/CLI |

抽取在 **同步步骤** 完成，**不在**用户每次提问时做。

### 3.4 口径规则（Codex 5.3 建议，待最终拍板）

建议全套采用推荐默认（全 A），要点：

- 认仓库 SSOT/结构源，不靠人熟代码  
- public 不露源码路径  
- 清单文件缺失 → 拒答并提示先 `sync:code:full`  
- **禁止**模型补充表外功能  
- 对外固定声明：工程可枚举清单 ≠ 完整商业功能说明书（web 等文档不全场景）

详见：[12-codex-scope-recommendation](./12-codex-scope-recommendation.zh.md) · [11-口径清单](./11-scope-rules-checklist.zh.md)

### 3.5 已确认决策

| 项 | 结论 |
|----|------|
| `catalog:gen` 挂载 | 进入 `npm run sync:code:full`（与 cbm:sync 并列） |
| 覆盖范围 | **middleware + web + finclaw 全部做** |
| 口径细则 | Codex 建议全 A，**待你回复「采纳」后锁定** |

### 3.6 如何验证（防技术堆砌）

| 步骤 | 做法 |
|------|------|
| E0 | 现网对固定清单题跑 N 次，算集合 F1/Jaccard → 基线 |
| E1 | 启用「读 JSON」后再跑 → 必须打赢 E0 |
| B | `verify:upgrade` / golden 不显著退化 |
| C | 人工抽检 public：可读、够用、不泄密 |
| 纪律 | 一改造一假设一对比；无提升则回滚 |

市面调研（Catalog + Graph + Agent 混合）只解释方向；**是否有效只看 E0→E1 数字**。

---

## 四、交付物与文档地图

| 文档 | 用途 |
|------|------|
| **本文** | 诉求 / 目标 / 方案总览（对外说明用） |
| [SUMMARY](./SUMMARY.zh.md) | 架构对照、增量、验证、待确认总表 |
| [10](./10-decision-sync-and-three-repos.zh.md) | 已确认：三仓 + sync 挂载 |
| [11](./11-scope-rules-checklist.zh.md) | 口径选择题 |
| [12](./12-codex-scope-recommendation.zh.md) | Codex 裁决建议 |
| `00`–`09` | 讨论过程稿（归档） |

---

## 五、下一步

1. 按 [14-implementation-plan](./14-implementation-plan.zh.md) 从 Phase 0 开工。  
2. 按 [15-verification-plan](./15-verification-plan.zh.md) 过 G0→G3 门禁。  
3. 口径以 [16](./16-decision-scope-all-A.zh.md) 全 A 为默认；改口径只改 `catalog-rules.yaml`。

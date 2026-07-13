# 自动化生成名单：人不熟仓库时怎么办

日期：2026-07-10  
状态：讨论澄清（修正「必须靠人审才准」的误解）  
关联：[05 生成与维护](./05-catalog-generate-and-maintain.zh.md)

---

## 0. 先承认你的判断

**对：你不熟三仓细节时，「人为确认」并不能保证准确性。**  
把准确性押在「问答产品维护者的记忆」上，本身就是坏设计。

正确做法不是「人凭印象勾选」，而是：

> **优先采信仓库自己已经写明的权威声明；多信号交叉验证；人只处理冲突，不发明名单。**

---

## 1. 有没有自动化方案？有

而且对 `chatkit-middleware`，仓库里 **已经有一份接近现成的权威源**：

### 发现：`edition-manifest.yaml`

文件头写明：

> **Single source of truth for editions, services, and infrastructure.**  
> Used by: start-dev-services.sh, docker-compose profiles, validate-manifest.sh

里面按 edition 列出了服务名 + path，例如：

- `identity-service` → `services/platform/identity-service`
- `ag-ui-server` → `services/gateways/ag-ui-server`
- `ai-infra-rs` → `services/ai-infra-rs`
- advance 额外：`trigger-*`、`intent-classifier`、`policy-engine` …

**这不是 llm-wiki 维护者编的，是 middleware 仓库自己的部署真相源。**  
自动化方案的第一刀：直接解析这份文件生成名单。

---

## 2. 推荐自动化管线（少用人脑）

```
仓库内已有声明（优先）
  edition-manifest.yaml     ← 主源（middleware）
  docker-compose*.yml       ← 交叉校验（含 infra：postgres 等）
  各服务 README 首段         ← 自动抽「一句话职责」
  package.json / workspaces ← web/finclaw 用
        │
        ▼
  自动合并 + 打置信度
        │
        ├─ 高置信（多源一致）→ 直接进入权威表（可无人审）
        └─ 冲突/仅单源     → 进「待裁决」队列（人只看这些）
        │
        ▼
  问答读权威表；答案可附带「来源：edition-manifest@commit」
```

### 置信度怎么定（示例规则）

| 情况 | 置信度 | 默认动作 |
|------|--------|----------|
| 在 `edition-manifest` 的 `services` 里 | 高 | 自动入表 |
| manifest + compose 服务名一致 | 更高 | 自动入表 |
| 只在目录树出现，manifest/compose 都没有 | 低 | 不入「微服务清单」，或标 optional |
| 只在 compose 的 infra（postgres/redis…） | 高但 kind=infrastructure | **默认不进「微服务」清单**，可进「基础设施」清单 |
| README 与目录名对不上 | 中 | 摘要用 README；名字以 manifest 为准 |

**关键：人不再「凭感觉确认全表」，只处理低置信/冲突项。**  
若冲突为 0，可以全自动发布新版本名单。

---

## 3. 「一句话职责」也能自动生成

人不写摘要时：

1. 读 `服务目录/README.md` 第一段 / Features 列表  
2. 可选：用 LLM **仅基于该 README** 压缩成一句非技术中文  
3. 答案里标注：`摘要来源：README`（不是「专家审定」）

这样你不需要懂每个服务细节；**摘要质量上限 = 该服务自己文档的质量**。  
文档烂 → 摘要烂，但名单集合仍可对（集合来自 manifest）。

---

## 4. 和「人审」的关系（修正）

| 旧说法（易误解） | 修正后 |
|------------------|--------|
| 人审保证准确 | **仓库声明源保证集合准确**；人审不保证 |
| 人必须懂全部代码 | 人不需要；最多裁决「算不算微服务」的产品口径 |
| 没人审就不能用 | 高置信条目可全自动；无冲突可无人发布 |

你真正要拍板的，往往只剩 **口径规则**（写一次，可复用），例如：

- 「微服务清单」= `edition-manifest` 里 `services`（不含 `infrastructure`）  
- 是否按 `basic` / `advance` 分两套清单  
- postgres 等是否单独叫「基础设施」而不叫微服务  

这些是 **规则**，不是「记住 30 个服务名」。

---

## 5. 其他仓怎么自动？

| 仓库 | 更可信的自动源 |
|------|----------------|
| chatkit-middleware | **`edition-manifest.yaml`（首选）** + compose 交叉 |
| chatkit-web | 根 `package.json` workspaces + 各包 README |
| finclaw | 其部署/workspace/文档中的模块声明（需单独摸一次 SSOT） |

原则不变：**找仓库自己的 SSOT，不要找「最熟的人」。**

---

## 6. 自动化仍解决不了什么（诚实边界）

| 能自动 | 不能单靠自动 |
|--------|----------------|
| 「manifest 里有哪些服务」集合 | 「产品对外想怎么称呼微服务」的营销口径（若与工程名不同） |
| 从 README 抽职责草稿 | README 写错时的事实纠正（除非另有测试/契约） |
| 发现 drift（manifest 变了） | 业务上「该不该对外暴露某内部服务」——这是产品策略，用规则/黑名单表达 |

若对外 MCP 需要「隐藏内部服务」，用 **规则黑名单**（配置），仍不必靠你记住全貌。

---

## 7. 建议决策（针对你的顾虑）

1. **放弃「维护者人肉确认全表」作为准确性来源。**  
2. **middleware 名单 = 解析 `edition-manifest.yaml` 自动生成**（主方案）。  
3. compose / 目录仅作交叉与 drift；冲突才人工看。  
4. 摘要自动从 README（+可选 LLM 润色），标注来源。  
5. 你要确认的是 **口径规则**（用哪份文件、含不含 infra、basic vs advance），不是服务细节。

---

## 8. 下一问（只确认口径规则）

对 `chatkit-middleware`「微服务清单」，是否采用：

**规则 R1：**  
以 `edition-manifest.yaml` 的 `editions.*.services` 为准（合并 basic+advance 去重，或允许按 edition 分答）；  
`infrastructure`（postgres/redis 等）**不计入**微服务；  
不要求你对每个服务做人工准确性确认。

请回复：同意 R1 / 要改（例如只要 basic、或 connectors 单独分类）。

# 实施计划：功能清单抽取与读表问答

日期：2026-07-10  
状态：**可执行计划**  
前置：[requirements-goals-solution](./requirements-goals-solution.zh.md) · [10 三仓+sync](./10-decision-sync-and-three-repos.zh.md) · [12 口径默认全 A](./12-codex-scope-recommendation.zh.md) · [验证计划](./15-verification-plan.zh.md)

---

## 0. 范围与假设

| 项 | 内容 |
|----|------|
| 做 | 三仓 `catalog:gen`；清单题读表；挂 `sync:code:full`；集合评测；debug/public 投影 |
| 不做（本期） | 换 CBM、Backstage、Fusion 大重构、提问时 Agent 编名单 |
| 口径 | 默认 Codex 全 A → `config/catalog-rules.yaml` |
| 门禁 | 每 Phase 结束必须过对应验证门（见验证计划）；不过不进下一 Phase |

---

## 1. 目标架构落点（文件级）

```
config/
  catalog-rules.yaml              # 口径（全 A）

scripts/
  catalog-gen.mjs                 # CLI：三仓抽取入口
  sync-code-repos.mjs             # 增加 --catalog-gen / full 串联

src/catalog/
  types.ts                        # FeatureItem, FeatureList
  rules.ts                        # 读 catalog-rules.yaml
  store.ts                        # 读写 .reasonix/feature-lists/{repo}.json
  extract/
    middleware.ts                 # edition-manifest → services
    chatkit-web.ts                # workspaces + routes + i18n
    finclaw.ts                    # crates + clap subcommands
  render.ts                       # debug / public 投影
  intent.ts                       # 是否清单题 + 哪仓 + 哪类清单

src/retrieval/plan.ts             # 增加 feature_list 题型（或并列检测）
src/finalize-run.ts / loop-runner # 清单题短路径：跳过宽 Agent 扫仓
src/routes/ask.ts · mcp.ts        # 走短路径

benchmarks/
  catalogs/                       # 与抽取同源的评测集合（或 gen 时导出）
  listing-questions.json          # 固定对比题

tests/
  catalog-extract-*.test.ts       # 抽取器单测
  catalog-listing-path.test.ts    # 读表路径（可 mock store）
```

产物：

```
.reasonix/feature-lists/
  chatkit-middleware.json
  chatkit-web.json
  finclaw.json
```

---

## 2. Phase 划分

### Phase 0 — 基线与规则落盘（约 0.5–1 天）

| # | 任务 | 完成定义 |
|---|------|----------|
| 0.1 | 写入 `config/catalog-rules.yaml`（全 A） | 文件存在且字段覆盖 M/W/F/G |
| 0.2 | 冻结 `benchmarks/listing-questions.json`（每仓 ≥2 题，含 middleware 微服务反例） | 题面固定 |
| 0.3 | 跑 E0：现网 MCP/finalize 对 listing 题 N=3 | `benchmarks/reports/e0-baseline-*.json` |
| 0.4 | 记录基线 F1/Jaccard（可用半自动：人工或脚本从答案抽名） | 报告可读 |

**出口门：** E0 报告存在。不改主问答路径也可完成。

---

### Phase 1 — 抽取器三仓（约 2–3 天）

| # | 任务 | 完成定义 |
|---|------|----------|
| 1.1 | `types` + `store` + `rules` | 能读写 JSON |
| 1.2 | middleware 抽取：解析 `edition-manifest.yaml` | 服务集合与 manifest.services 一致（测） |
| 1.3 | web 抽取：workspaces + admin 路由 + zh 文案 | apps/libs 分节；无 /login |
| 1.4 | finclaw 抽取：crates + CLI subcommands；排除 vendor | 单测钉住 crate 列表非空 |
| 1.5 | `npm run catalog:gen` | 一次生成三份 JSON |
| 1.6 | 抽取结果与「评测权威集合」同源导出 | `benchmarks/catalogs/*.json` 可生成 |

**出口门：** `catalog:gen` 绿；抽取单测绿；人工抽看三份 JSON 结构合理。

---

### Phase 2 — 读表问答路径（约 2 天）

| # | 任务 | 完成定义 |
|---|------|----------|
| 2.1 | `intent`：识别清单题 + repo + list 类型 | 单测覆盖典型问法 |
| 2.2 | `render`：debug 含 source；public 无路径 + W4 声明句 | 单测 |
| 2.3 | Agent/MCP 短路径：有 JSON 则读表组答，**不**让模型发明条目 | feature flag `LLM_WIKI_CATALOG_LISTING=true` |
| 2.4 | 无 JSON / 过期策略按 G2=A：拒答并提示 sync | 单测 |
| 2.5 | G3=A：组答后集合门禁（输出 id 集合 ⊆ 表） | 单测 |

**出口门：** E1 打赢 E0（见验证计划）；flag 可关回滚。

---

### Phase 3 — 挂载 sync + 回归（约 1 天）

| # | 任务 | 完成定义 |
|---|------|----------|
| 3.1 | `sync:code:full` = sync + cbm + catalog:gen | package.json / sync 脚本改完 |
| 3.2 | 默认开启清单短路径（或文档写明默认 on） | README 更新一句 |
| 3.3 | golden 增加/标注 listing 题；`verify:upgrade` 可跑 | B 门通过或持平 |
| 3.4 | 人工 C 抽检 5–10 题 public | 记录在 reports |

**出口门：** full sync 一键可跑；E1+B+C 按验证计划签字。

---

### Phase 4 — 加固（可选，约 1 天）

| # | 任务 |
|---|------|
| 4.1 | drift：本次 gen vs 上次 JSON diff 打日志 |
| 4.2 | middleware 问「基础版/进阶版」按 edition 过滤（M2） |
| 4.3 | README summary 可选填充（空 summary 仍合法） |

---

## 3. 建议排期（单人）

| 日 | 内容 |
|----|------|
| D1 | Phase 0 + 1.1–1.2 |
| D2 | 1.3–1.6 |
| D3 | Phase 2 |
| D4 | Phase 3 + 验证签字 |
| D5 | Phase 4 或修边角 |

---

## 4. 回滚

| 手段 | 做法 |
|------|------|
| Flag | `LLM_WIKI_CATALOG_LISTING=false` → 回旧 Agent |
| 产物 | 删除/忽略 `feature-lists` 即走 G2 拒答或旧路径 |
| Git | 整特性一个分支；红则不合并 |

---

## 5. 依赖与风险

| 风险 | 缓解 |
|------|------|
| web 路由写在多文件 | 先解析 `App.tsx`；不足再扩 router 模块；单测钉路径集合 |
| finclaw clap 结构复杂 | 先正则/AST 抽 subcommand 名；抽不全则 F1 先只 crates 降级并文档说明 |
| manifest 与部署不一致 | drift + sync 纪律；答案带来源 `edition-manifest` |
| 意图误判 | 高置信关键词才走短路径；不确定走旧路径（宁可慢，不误伤） |

---

## 6. 与验证计划的衔接

每个 Phase 的「出口门」对应 [15-verification-plan](./15-verification-plan.zh.md) 中的 **G0 / G1 / G2 / G3**。  
未过门禁不得宣称该 Phase 完成。

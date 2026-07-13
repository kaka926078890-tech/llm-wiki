# 验证计划：功能清单改造

日期：2026-07-10  
状态：**可执行**  
关联：[implementation-plan](./14-implementation-plan.zh.md) · [requirements-goals-solution](./requirements-goals-solution.zh.md)

---

## 1. 验证原则

1. **先基线后改动**：无 E0 不开 E1 对比。  
2. **集合指标优先**：清单题用 Precision / Recall / F1 / Jaccard，不只看文案像不像。  
3. **一次一主变量**：先读表路径，再 sync 挂载，再润色。  
4. **可回滚**：flag 关掉即旧行为。  
5. **红即停**：未过门禁不进下一 Phase。

---

## 2. 指标定义

对一次答案抽出「条目名集合」\(S\)（规范化：小写、去前缀、对照 id/title）。  
权威集合 \(S^*\) 来自同次 `catalog:gen` / `benchmarks/catalogs/{repo}.json`。

| 指标 | 公式 / 含义 | 清单题门槛（草案） |
|------|-------------|-------------------|
| Precision | \|S ∩ S\*\| / \|S\| | ≥ 0.95 |
| Recall | \|S ∩ S\*\| / \|S\*\| | ≥ 0.95 |
| F1 | 二者调和 | ≥ 0.95 |
| Jaccard（稳定性） | 同问 N=3 次两两平均 \|Si∩Sj\|/\|Si∪Sj\| | ≥ 0.95 |
| 猜数违规 | 出现「共 N 个」且 N≠\|S\*\| | **次数 = 0** |
| public lint | 无源码块、无内部 URL/端口、无密钥 | **0 硬违规** |

非清单 golden：通过率 ≥ E0 同期基线 − 2 题容差（或持平）。

---

## 3. 题集

### 3.1 Listing 对比题（新建 `benchmarks/listing-questions.json`）

每仓至少 2 题，建议：

| id | repo | 问法（示例） | S* 类型 |
|----|------|--------------|---------|
| mw-services | middleware | chatkit-middleware 有哪些微服务？ | manifest.services 合并 |
| mw-features | middleware | chatkit-middleware 功能清单 | 同服务清单（M5=A） |
| web-apps | web | chatkit-web 有哪些应用？ | workspaces apps |
| web-admin-features | web | 管理后台有哪些功能？ | admin 路由功能集 |
| fin-modules | finclaw | finclaw 有哪些模块？ | crates |
| fin-cli | finclaw | finclaw CLI 有哪些能力？ | clap 子命令 |
| fin-not-ms | finclaw | finclaw 有哪些微服务？ | 应纠偏非微服务 + 模块/CLI |

### 3.2 既有 golden

继续 `benchmarks/golden-questions.json` + `npm run verify:upgrade`（门禁 G3）。

### 3.3 人工抽检题（C）

从 listing + golden 抽 5–10 题，看 public 答案：非技术能否懂、是否够用、有无泄密。

---

## 4. 门禁（与实施 Phase 对齐）

### G0 — Phase 0 出口

| 检查 | 通过条件 |
|------|----------|
| E0 报告 | `benchmarks/reports/e0-baseline-<date>.json` 存在 |
| 含 N=3 | 每道 listing 题有 3 次原始答案或摘要集合 |
| 基线数字 | 写明每题 F1/Jaccard（可偏低，如实记录） |

**命令形态（实施后）：**

```bash
# 现网基线（Phase 0 可用 ask-once / verify 脚本扩展）
npm run verify:listing -- --baseline --runs 3
```

Phase 0 若脚本未就绪：允许半自动（脚本跑问答 + 小脚本对齐 S*）。

---

### G1 — Phase 1 出口（抽取）

| 检查 | 通过条件 |
|------|----------|
| 单测 | `catalog-extract-*.test.ts` 全绿 |
| gen | `npm run catalog:gen` 退出码 0，三份 JSON 非空 |
| 同源 | middleware JSON 的 service id 集合 == manifest.services（去重） |
| web | 不含 `/login`；含 admin-mt / finclaw-frontend / mobile |
| finclaw | crates 非空；无 `vendor/` 路径条目 |

```bash
npm run catalog:gen
npm test -- tests/catalog-extract
```

---

### G2 — Phase 2 出口（读表路径 = E1）

| 检查 | 通过条件 |
|------|----------|
| Flag on | `LLM_WIKI_CATALOG_LISTING=true` |
| E1 vs E0 | listing 题平均 F1、Jaccard **均 ≥ 门槛**，且 **不低于 E0** |
| 猜数违规 | 0 |
| 回滚 | flag=false 时行为回到可接受旧路径（冒烟 1 题） |
| G2/G3 规则 | 无 JSON 拒答；答案集合 ⊆ 表 |

```bash
npm run verify:listing -- --candidate --runs 3
# 对比 reports/e0 vs e1，生成 diff 摘要
```

**E1 未打赢 E0 → Phase 2 失败，修 intent/render/门禁，禁止进 Phase 3。**

---

### G3 — Phase 3 出口（挂载 + 整体）

| 检查 | 通过条件 |
|------|----------|
| sync full | `npm run sync:code:full` 含 catalog:gen 且成功（或跳过网络时至少 catalog 段可测） |
| golden B | `npm run verify:upgrade -- --quick` 不低于基线约定 |
| 全量 B（可选同日） | `npm run verify:upgrade` |
| 人工 C | ≥5 题记录；通过率 ≥ 90%；public lint 0 硬违规 |
| 文档 | README 写明 sync:full 与清单口径一句 |

---

## 5. 报告格式（统一）

`benchmarks/reports/listing-<phase>-<timestamp>.json`：

```json
{
  "phase": "e0|e1",
  "runs": 3,
  "rules": "codex-all-A",
  "questions": [
    {
      "id": "mw-services",
      "f1": [0.4, 0.5, 0.45],
      "f1_mean": 0.45,
      "jaccard_mean": 0.6,
      "count_violations": 2,
      "answer_sets": [["…"], ["…"], ["…"]]
    }
  ],
  "summary": { "f1_mean": 0.45, "jaccard_mean": 0.6 }
}
```

对比摘要：`listing-e0-vs-e1.md`（表格：题 id、ΔF1、ΔJaccard、是否过门）。

---

## 6. 日常/回归

| 时机 | 跑什么 |
|------|--------|
| 改抽取器 | G1 单测 + catalog:gen |
| 改读表路径 | G2 listing verify |
| 发版前 | G2 + G3 quick + 抽检 3 题 |
| sync 后 | 默认 gen；可选 drift 日志 |

---

## 7. 失败处理

| 现象 | 动作 |
|------|------|
| E1 F1 低 | 查 intent 是否未走短路径；查抽名是否与 S* 规范不一致 |
| Jaccard 低 | 查是否仍有模型自由发挥（应禁） |
| golden 跌 | 查误伤非清单题；收紧 intent |
| public 泄密 | 修 render，加 lint 用例 |
| 反复不过 | flag 关、开 issue，不堆新组件 |

---

## 8. 签字栏（Phase 完成时填）

| 门禁 | 日期 | 结果 | 报告路径 | 签字 |
|------|------|------|----------|------|
| G0 | | | | |
| G1 | | | | |
| G2 | | | | |
| G3 | | | | |

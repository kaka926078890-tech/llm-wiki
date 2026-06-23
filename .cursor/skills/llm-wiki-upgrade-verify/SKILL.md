---
name: llm-wiki-upgrade-verify
description: >-
  Runs llm-wiki golden-question MCP public-answer verification to judge upgrade
  satisfaction: same-question stability, checklist completeness, no code paths or
  env vars in answers. Use when validating llm-wiki upgrades, CBM/prompt/budget
  changes, release readiness, or when the user mentions verify:upgrade, golden
  questions, or benchmark regression.
---

# llm-wiki 升级验证

用 golden 题集对 **MCP public 答案**做同题多次回归，判断升级是否满意。

## 用户标准（硬约束）

1. **同题稳定性**：同一问题连跑 N 次，功能点集合不能差一截（不是比新旧版本）。
2. **完整性**：N 次并集应覆盖该题全部核心能力点；核心点交集比例 ≥ 80%。
3. **对外安全**：每次答案不得含代码块、源码路径、环境变量名、本地 URL、密钥。

## 快速执行

在 `llm-wiki/` 项目根：

```bash
# 前置：DEEPSEEK_API_KEY、三 repo 已 sync、CBM 已 init（建议）
npm test
npm run verify:upgrade -- --quick    # 3 道 quick 题 × 3 次（约 5–15 分钟）
npm run verify:upgrade               # 全部 15 题 × 3 次
```

**通过**：命令 exit 0，且 `benchmarks/reports/verify-*.md` 中全部 ✅。

**未通过**：看报告里 `failReasons`：

| 原因 | 含义 |
|------|------|
| `public_answer_lint_failed` | 某次答案含路径/env/代码块 |
| `core_never_mentioned` | 某核心能力点 N 次都没提到 |
| `core_intersection_ratio` | 同题多次共同讲到的核心点 < 80% |
| `core_miss_per_run` | 单次遗漏核心点 > 2 |
| `polarity_unstable` | 结论反转（如有时说「不支持」） |

## CLI 参数

```bash
npm run verify:upgrade -- --runs 5
npm run verify:upgrade -- --id web-config-inventory,web-im-channels
npm run verify:upgrade -- --out benchmarks/reports/my-run
```

## 跑前检查清单

- [ ] `DEEPSEEK_API_KEY` 已配置
- [ ] `npm run sync:code` 三 repo 为要测的 commit
- [ ] `npm run cbm:status` 索引存在且未过期
- [ ] `.env` 中 `LLM_WIKI_MCP_ANSWER_PROFILE=public`（默认）
- [ ] 未改 golden 题集时，结果才可横向对比

## 判读报告

打开最新 `benchmarks/reports/verify-*.md`：

- **Summary 通过率** = 升级是否整体满意
- 每题 **核心点交集** = 同题稳定性主指标
- 每题 **Run 1/2/3** = 哪次波动大、是否 lint 失败

JSON 报告（同目录 `.json`）可供脚本对比两次运行。

## 资产位置

| 文件 | 作用 |
|------|------|
| `benchmarks/golden-questions.json` | 15 题 + 每题 core checklist |
| `scripts/verify-upgrade.ts` | 执行器（复用 MCP `runAskTool` 全链路） |
| `src/benchmark/public-answer-lint.ts` | public 答案 lint 规则 |
| `src/benchmark/scoring.ts` | 稳定性 / 完整性打分 |
| `tests/benchmark-scoring.test.ts` | lint 与打分单测（无需 API） |

## Agent 工作流

用户要求验证升级时：

1. 跑 `npm test`（含 benchmark 单测）
2. 跑 `npm run verify:upgrade -- --quick`；若通过且用户要全量，再跑完整集
3. 读取最新报告，用中文总结：通过率、失败题、稳定性最差的题、是否含泄露
4. 若失败：根据 `failReasons` 建议改 prompt / summary agent / public guard / retrieval plan，**不要**先改 golden 题集

## 相关文档

- 项目进度：[progress.zh.md](../../docs/progress.zh.md)
- Golden 题集：`benchmarks/golden-questions.json`

## 扩展题集

编辑 `benchmarks/golden-questions.json`：

- `core[].patterns`：能力点关键词（中英文均可，支持 regex）
- `quick: true`：纳入 `--quick` 子集
- `polarity`：防结论反转（可选）

改题集后先 `npm test`，再跑 `--quick` 校准 patterns 是否过松/过严。

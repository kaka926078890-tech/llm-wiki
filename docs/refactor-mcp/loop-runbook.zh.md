# Catalog Refactor Loop — 运行手册

日期：2026-07-10（2026-07-13 对齐 mission/worker + 固定触发）  
关联：[14 实施计划](./14-implementation-plan.zh.md) · [15 验证计划](./15-verification-plan.zh.md)

---

## Loop 本质（三阶段）

| 阶段 | 做什么 | 开发者是否重复写 prompt |
|------|--------|-------------------------|
| **1 — 讨论** | 方案、边界、stop condition 写入 doc 14/15 | **只做一次** |
| **2 — 账本** | `state/triage.md` 记录待办/已完成；AI review 可追加 finding | **否** — 读文件即可 |
| **3 — 固定句** | 永远同一句 `/loop` 让 Agent 继续 | **否** — 见下文 |

> 日常不要写「帮我修 listing F1」这类一次性 prompt。backlog 空 → loop 自然停止。

---

## 产物路径（Cursor）

| 产物 | 路径 |
|------|------|
| Mission 规则（始终 ON） | `.cursor/rules/00-mission-loop.mdc` |
| Worker 规则 | `.cursor/rules/10-catalog-loop.mdc` 等 |
| Loop 注册表 | `.github/agent-loops/agent-loops.yaml` |
| 发现用 dispatcher | `scripts/dev/loop-dispatcher.sh`（**非**日常入口） |
| 发现 skill | `.cursor/skills/loop-triage/SKILL.md` |
| 评估 Agent | `.cursor/agents/loop-reviewer.md` |
| 分诊状态 | `state/triage.md` |
| 审查审计 | `state/verdicts.jsonl` |
| 阶段门禁 | `state/phase.md` |
| 人审 inbox | `inbox/` |
| CI 测试门 | `.github/workflows/loop-triage.yml` |
| 清单 | `loop-checklist.md` |

---

## 访谈结论（loop 配置）

| # | 问题 | 选择 |
|---|------|------|
| 1 | 触发 | 手动 Cursor + CI 测试失败 + 工作日 schedule + catalog 路径 push |
| 2 | 完成标准 | Phase 0–3 门禁 G0–G3（doc 15）；`npm test` + 对应 gate 命令 |
| 3 | 工具链 | **Cursor** |
| 4 | 运行位置 | **本机 Agent**（E0/E1 要 `DEEPSEEK_API_KEY`）+ **GitHub Actions** 仅跑 typecheck/test |
| 5 | PR | Agent 开 PR，**不自动 merge**；不确定项进 inbox |
| 6 | 已有规则 | `.cursor/rules/`、`.cursor/skills/llm-wiki-upgrade-verify/` |
| 7 | 预算 | 分诊 50k tokens/次；全日建议上限 200k tokens |

---

## 本机运行（主路径）

### 0. 固定触发句（唯一日常入口）

**全流程（推荐）：**

```
/loop Run loop-triage end-to-end: Phase 1 read state/triage.md and docs/refactor-mcp/14–15; Phase 2 implement highest-priority open finding in isolated worktree (max 3); Phase 3 launch loop-reviewer Task subagent (readonly), append verdict to state/verdicts.jsonl; update state/phase.md and open PR only on PASS. Budget 100k tokens.
```

**仅分诊：**

```
/loop Run loop-triage Phase 1 only: discover catalog-refactor findings, update state/triage.md. Budget 30k tokens.
```

### 1. 查哪条 worker loop 适用（可选，非日常）

```bash
./scripts/dev/loop-dispatcher.sh
./scripts/dev/loop-dispatcher.sh --issue "listing F1 下降"
```

只用于**解构/路由**，不是每次修 bug 的 prompt。

### 2. 执行 finding（worktree）

```bash
cd /path/to/llm-wiki
git worktree add ../llm-wiki-catalog-p0-rules -b catalog/p0-rules
cd ../llm-wiki-catalog-p0-rules/llm-wiki
# 按 finding 的 goal 实施（如写 config/catalog-rules.yaml）
npm test
```

### 3. 评估

```
@loop-reviewer 审查当前分支相对 main 的改动；必须跑 npm test。
```

仅 **PASS** 后：更新 `state/phase.md`，finding 标 `done`，开 PR。

### 4. E0 / E1（需密钥，走 inbox 规则）

```bash
cp .env.example .env   # 填 DEEPSEEK_API_KEY
# Phase 0 基线（脚本落地后）
npm run verify:listing -- --baseline --runs 3
# Phase 2 候选
LLM_WIKI_CATALOG_LISTING=true npm run verify:listing -- --candidate --runs 3
```

无密钥时：finding 留在 inbox，不标 gate 通过。

---

## GitHub Actions（辅路径）

- **触发：** 工作日 06:00 UTC、`workflow_dispatch`、catalog 相关路径 push  
- **做什么：** `npm ci` → `typecheck` → `test`（**不**跑需 API 的 verify:listing）  
- **失败时：** 在 Cursor 跑 `@loop-triage`，优先修测试/类型错误  

---

## 停止 loop

- 取消 GitHub Actions run  
- Cursor 里停止 Agent  
- `state/triage.md` 将相关 finding 标 `paused`  
- 关 flag：`LLM_WIKI_CATALOG_LISTING=false` 回滚读表路径  

---

## 与实施 Phase 对齐

| Phase | Loop 首要 finding 来源 | Gate |
|-------|------------------------|------|
| 0 | triage 种子 0.1–0.3 | G0 |
| 1 | catalog:gen + 抽取单测 | G1 |
| 2 | 读表路径 + E1 | G2 |
| 3 | sync:full + golden | G3 |

每过一个 gate，更新 `state/phase.md` 再让 triage 发现下一批任务。

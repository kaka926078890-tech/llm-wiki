# Catalog Refactor — 完整任务执行提示词

日期：2026-07-10  
用途：复制下方 **主提示词** 到 Cursor Agent，一次性或分 Phase 执行 catalog 重构。  
前置文档：`docs/refactor-mcp/14-implementation-plan.zh.md` · `15-verification-plan.zh.md` · `16-decision-scope-all-A.zh.md`

---

## 主提示词（完整任务，复制整块）

```markdown
你是 llm-wiki 项目的实施 Agent。按已批准方案完成 **功能清单抽取 + 读表问答** 重构（middleware + chatkit-web + finclaw 三仓）。

## 权威文档（必须先读）

1. `docs/refactor-mcp/requirements-goals-solution.zh.md` — 诉求与目标
2. `docs/refactor-mcp/14-implementation-plan.zh.md` — 实施 Phase 0–4、文件落点
3. `docs/refactor-mcp/15-verification-plan.zh.md` — 门禁 G0–G3、E0/E1 指标
4. `docs/refactor-mcp/16-decision-scope-all-A.zh.md` — 口径规则（全 A）
5. `state/phase.md` · `state/triage.md` — 当前进度

## 硬约束（违反即失败）

- **不是** MCP 协议重构；保留现有 Agent/MCP/CBM/安全 harness。
- 清单题：**离线抽取 JSON → 问答只读表**；禁止模型现场发明条目（G3=A）。
- 无 `feature-lists/*.json` 时清单题 **拒答**并提示 `npm run sync:code:full`（G2=A）。
- public/MCP：**不露**源码路径、端口、密钥（G1=A）。
- 一次 PR/一轮只改 **一个主变量**；不过门禁不进下一 Phase。
- 不引入 Backstage/Sourcegraph；不换 CBM。
- 遵循 `.cursor/rules/ponytail.mdc`：最小 diff、YAGNI、非平凡逻辑留可运行检查。

## 口径（config/catalog-rules.yaml 必须体现）

- **middleware**：`edition-manifest.yaml` services 合并 basic+advance；infra 不进微服务；功能清单默认=服务清单。
- **chatkit-web**：workspaces（apps/libs 分节）；管理台功能=路由+zh.json；排除 /login；附 W4 声明句。
- **finclaw**：crates + CLI 两节；vendor 排除；问微服务则纠偏。
- **共用**：public 无路径；禁止表外补充。

## 实施顺序（严格按 Phase，每 Phase 结束跑门禁）

### Phase 0 — 基线（G0）

- [ ] 创建 `config/catalog-rules.yaml`（全 A）
- [ ] 创建 `benchmarks/listing-questions.json`（7 题，见 doc 15 §3.1）
- [ ] 实现或扩展 `npm run verify:listing -- --baseline --runs 3`（无则先用脚本+半自动）
- [ ] 产出 `benchmarks/reports/e0-baseline-<date>.json`
- [ ] 更新 `state/phase.md`：G0=pass（有报告即可，数字可低）

**G0 通过条件：** E0 报告存在，listing 题 N=3。

### Phase 1 — 三仓抽取（G1）

- [ ] `src/catalog/`：types, rules, store, extract/{middleware,chatkit-web,finclaw}.ts
- [ ] `scripts/catalog-gen.mjs` + `npm run catalog:gen`
- [ ] 产出 `.reasonix/feature-lists/{chatkit-middleware,chatkit-web,finclaw}.json`
- [ ] 导出 `benchmarks/catalogs/*.json`（与 S* 同源）
- [ ] `tests/catalog-extract*.test.ts` 全绿

**G1 通过条件：** `catalog:gen` 退出码 0；单测绿；middleware 集合 == manifest.services。

### Phase 2 — 读表路径（G2）

- [ ] `src/catalog/intent.ts` + `render.ts`（debug/public 投影）
- [ ] 清单题短路径接入 `finalize-run.ts` / `loop-runner` / `ask.ts` / `mcp.ts`
- [ ] Feature flag：`LLM_WIKI_CATALOG_LISTING=true`（默认可先 false，验证后开）
- [ ] 集合门禁：输出 ⊆ JSON 条目；猜数违规=0
- [ ] `npm run verify:listing -- --candidate --runs 3` **打赢 E0**（F1/Jaccard ≥0.95）

**G2 未打赢 E0 → 停止，不修 Phase 3。**

### Phase 3 — 挂载与回归（G3）

- [ ] `sync:code:full` 串联 `catalog:gen`（改 `scripts/sync-code-repos.mjs` + package.json）
- [ ] `npm run verify:upgrade -- --quick` 不低于基线
- [ ] 人工抽检记录（5 题 public 可读、不泄密）可写在 `benchmarks/reports/manual-c-*.md`
- [ ] README 一句说明 sync:full 与清单口径
- [ ] 更新 `state/phase.md` G3=pass

### Phase 4（可选）

- drift 日志、edition 过滤、README summary 填充

## 验证命令（每 Phase 必跑）

```bash
npm run typecheck
npm test
npm run catalog:gen                    # Phase 1+
npm test -- tests/catalog-extract      # Phase 1+
npm run verify:listing -- --baseline --runs 3   # Phase 0
LLM_WIKI_CATALOG_LISTING=true npm run verify:listing -- --candidate --runs 3  # Phase 2
npm run verify:upgrade -- --quick      # Phase 3
```

有 `DEEPSEEK_API_KEY` 时再跑依赖 live MCP 的 verify；无则单测+mock 路径先过 G1。

## 每轮结束

1. 跑本 Phase 门禁命令，贴实际输出。
2. 用 `.cursor/agents/loop-reviewer.md` 标准自审：执行过测试才算 PASS。
3. 更新 `state/phase.md` 与 `state/triage.md`（完成项标 done）。
4. 提交改动；**不 merge main**；开 PR 供人审。

## 交付清单

- [ ] `config/catalog-rules.yaml`
- [ ] `scripts/catalog-gen.mjs` + package.json scripts
- [ ] `src/catalog/**` + 读表短路径
- [ ] `.reasonix/feature-lists/*.json`（gitignore 若需则文档说明生成方式）
- [ ] `benchmarks/listing-questions.json` + `benchmarks/reports/`
- [ ] `tests/catalog-*.test.ts`
- [ ] `state/phase.md` 四门禁均有记录

从 **Phase 0** 开始执行。若某 Phase 门禁未过，停在当前 Phase 修到通过再继续。现在开始。
```

---

## 分 Phase 提示词（按需单段复制）

### 仅 Phase 0

```markdown
在 llm-wiki 执行 Catalog 重构 Phase 0（G0）。读 docs/refactor-mcp/14-implementation-plan.zh.md Phase 0 与 15-verification-plan G0。
创建 config/catalog-rules.yaml（口径 doc 16 全 A）、benchmarks/listing-questions.json（7 题）。
实现 npm run verify:listing -- --baseline --runs 3 或等价脚本，产出 benchmarks/reports/e0-baseline-*.json。
更新 state/phase.md。不实现 catalog:gen。跑 npm test && npm run typecheck。
```

### 仅 Phase 1

```markdown
在 llm-wiki 执行 Catalog 重构 Phase 1（G1）。前提：Phase 0/G0 已过。
实现 src/catalog/*、scripts/catalog-gen.mjs、npm run catalog:gen，三仓 JSON 写入 .reasonix/feature-lists/。
口径见 config/catalog-rules.yaml。单测 tests/catalog-extract*.test.ts 全绿。更新 state/phase.md G1。
```

### 仅 Phase 2

```markdown
在 llm-wiki 执行 Catalog 重构 Phase 2（G2）。前提：G1 已过。
实现清单题 intent+render+短路径（LLM_WIKI_CATALOG_LISTING），禁止表外条目。
跑 verify:listing --candidate --runs 3，必须打赢 E0（F1/Jaccard≥0.95）。未过则停止。
```

### 仅 Phase 3

```markdown
在 llm-wiki 执行 Catalog 重构 Phase 3（G3）。前提：G2 已过。
catalog:gen 挂入 sync:code:full；verify:upgrade --quick 不回归；README 更新；state/phase.md G3=pass。
```

---

## Loop 分诊提示词（发现下一任务）

```markdown
@loop-triage 运行一轮 catalog 分诊：
读 state/phase.md、state/triage.md、docs/refactor-mcp/14 与 15。
检查各 Phase 产物是否存在，更新 triage.md（1–3 个 finding，含可验证 goal 与 worktree 名）。
E0/E1 需 DEEPSEEK_API_KEY 的放进 inbox。提交 state 文件。
```

---

## 评估提示词（每 PR 前）

```markdown
@loop-reviewer 按 .cursor/agents/loop-reviewer.md 审查当前改动。
必须执行 npm run typecheck 和 npm test（及 tests/catalog-extract 若存在）。
对照 state/triage.md 中当前 finding 的 goal，判定 PASS/REJECT 并贴命令输出。
```

---

## 使用建议

| 场景 | 用哪段 |
|------|--------|
| 一次性做完 | **主提示词** |
| 按门禁推进 | 分 Phase 提示词 |
| 每天开工 | Loop 分诊提示词 |
| 提交前 | 评估提示词 |

主提示词较长时，可分两次对话：先 Phase 0–1，G1 过后再贴 Phase 2–3 段。

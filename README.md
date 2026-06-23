# LLM Wiki

面向三个代码仓库的 **Reasonix 风格问答 Agent**：用户用自然语言提问，Agent 通过只读工具检索、阅读代码后回答。所有结论必须来自代码，思考过程（reasoning + tool 调用）在对话区可见，即证据本身。

| 仓库 | 默认路径（相对 `llm-wiki/`） |
|------|------------------------------|
| chatkit-web | `code/chatkit-web` |
| chatkit-middleware | `code/chatkit-middleware` |
| finclaw | `code/finclaw` |

## Prerequisites

- **Node.js 22+**
- **DeepSeek API Key** — 设置 `DEEPSEEK_API_KEY`
- **三个 repo 路径** — 本地需存在上述三个仓库，默认通过 `npm run sync:code` 拉取到 `llm-wiki/code/`

## Environment setup

从 `.env.example` 复制并填写：

```bash
cp .env.example .env
```

编辑 `.env`：

```bash
DEEPSEEK_API_KEY=your-key-here
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

REPO_CHATKIT_MIDDLEWARE=code/chatkit-middleware
REPO_CHATKIT_WEB=code/chatkit-web
REPO_FINCLAW=code/finclaw

LLM_WIKI_PORT=3001
LLM_WIKI_HOST=127.0.0.1

# Answer profiles: debug | internal | public
LLM_WIKI_AGENT_ANSWER_PROFILE=debug
LLM_WIKI_MCP_ANSWER_PROFILE=public
```

路径均相对于 `llm-wiki/` 项目根解析为绝对路径；工具只能访问三个 repo 根目录内的文件。

拉取或更新三个只读代码仓库：

```bash
npm run sync:code
```

该命令会把以下仓库放到 `llm-wiki/code/` 下；目录不存在时执行 `git clone`，已存在时执行 `git pull --ff-only`：

| 仓库 | Git URL | 本地目录 |
|------|---------|----------|
| chatkit-web | `git@github.com:Geeksfino/chatkit-web.git` | `code/chatkit-web` |
| chatkit-middleware | `git@github.com:Geeksfino/chatkit-middleware.git` | `code/chatkit-middleware` |
| finclaw | `git@github.com:Geeksfino/finclaw.git` | `code/finclaw` |

## Install

```bash
npm install
cd frontend && npm install && cd ..
```

## Commands

| 命令 | 说明 |
|------|------|
| `npm run dev` | 同时启动后端（Fastify + SSE）与前端 Vite dev server |
| `npm run dev:debug` | 同时启动前后端，并在后端终端打印 MCP、tool、security 调试日志 |
| `npm run dev:mcp-debug` | 同时启动前后端，只打印 MCP 请求调试日志 |
| `npm run dev:server:debug` | 只启动后端，并打印 MCP、tool、security 调试日志 |
| `npm run sync:code` | clone/pull `code/` 下的三个并行代码仓库 |
| `npm run sync:code:full` | `sync:code` + `cbm:sync`（拉代码后自动重索引） |
| `npm run cbm:setup` | `sync:code` + `cbm:init` 一键启用 codebase-memory-mcp 索引 |
| `npm run cbm:init` | 为三个 repo 建立 CBM 知识图谱索引（首次） |
| `npm run cbm:sync` | 代码变更后重新索引三个 repo |
| `npm run cbm:status` | 查看 CBM 已索引项目列表 |
| `npm run verify:upgrade` | Golden 题集升级验证（需 `DEEPSEEK_API_KEY`）；`--quick` 冒烟 3 题 |
| `npm test` | 后端 vitest（根目录 `tests/`，98 条用例） |
| `npm run build` | 构建前端 `frontend/dist` 并编译后端 TypeScript |

前端单独测试与构建：

```bash
cd frontend && npm test && npm run build
```

开发时访问 `http://127.0.0.1:3001`（后端托管前端静态资源）。

## Answer profiles

`llm-wiki` 将不同出口的回答粒度显式建模为 answer profile：

| Profile | 适用场景 | 行为 |
|---------|----------|------|
| `debug` | 本地开发、Agent Stream 调试 | 保留原始回答，便于定位检索与推理问题 |
| `internal` | 内部研发使用 | 保留实现细节，但仍通过 secret redaction 兜底 |
| `public` | MCP 默认、用户向问答 | 将端口、内部 URL、env var、route、源码路径、代码块归纳为可读类别摘要 |

默认值：

| 出口 | 环境变量 | 默认 profile |
|------|----------|--------------|
| Agent Stream (`/agent/run`) | `LLM_WIKI_AGENT_ANSWER_PROFILE` | `debug` |
| MCP (`/mcp`) | `LLM_WIKI_MCP_ANSWER_PROFILE` | `public` |

临时切换 MCP 为内部研发模式：

```bash
LLM_WIKI_MCP_ANSWER_PROFILE=internal npm run dev:server
```

## codebase-memory-mcp (CBM)

结构检索与语义检索统一走 [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp)：单二进制、内嵌 tree-sitter 知识图谱与 on-device embedding。

**安装 CBM（一次性）：**

```bash
curl -fsSL https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh | bash
```

**启用索引 + 开发：**

```bash
cp .env.example .env
npm run cbm:setup
npm run dev:server
```

`cbm_search` 在 loop 内注册（`LLM_WIKI_CBM_ENABLED=auto` 默认）：

| operation | 用途 |
|-----------|------|
| `semantic` | 宽泛语义 / 功能 / 架构问题 |
| `query` / `trace` | 符号、调用链 |
| `architecture` | 仓库架构总览 |
| `impact` | git diff 影响面 |

**健康检查：** `GET /health` 返回 `cbm.binaryReady`、`cbm.cbmSearchReady`、`cbm.projects[]`。

未安装 CBM 时 llm-wiki 仍以 lexical 工具（`search_content`、`glob`、`read_file` 等）正常运行。

代码有较大变更后：

```bash
npm run sync:code && npm run cbm:sync
```

环境变量见 `.env.example`：`LLM_WIKI_CBM_ENABLED`、`LLM_WIKI_CBM_BINARY`、`LLM_WIKI_CBM_TOP_K`。

| 场景 | 优先工具 |
|------|----------|
| 符号、调用链、影响范围 | `cbm_search`（trace/query/impact） |
| 宽泛的功能/架构描述 | `cbm_search`（semantic/architecture） |
| 精确字符串、路由、env 名 | `search_content` |
| CBM 不可用 | lexical 工具 |

## Agent retrieval optimization

问答前根据问题类型注入 **Retrieval plan**，并由 **硬路由** 要求先使用 preferred 工具（`src/retrieval/router.ts`）。

| 问题类型 | Preferred 工具（须先行） |
|----------|------------------------|
| config | `glob`, `search_content` |
| symbol | `cbm_search` |
| listing | `cbm_search`, `glob` |
| architecture | `cbm_search` |

**Tool budget**（默认开启，**完整率优先** — 按题型设下限，env 不可压低于下限）：

| 类型 | 总工具上限（下限） |
|------|-------------------|
| config | 28 |
| listing | 26 |
| architecture | 24 |
| symbol | 18 |
| general | 20 |

另有：单工具上限、相同参数去重、连续空结果熔断。

环境变量：`.env.example` 中 `LLM_WIKI_TOOL_BUDGET_*`、`LLM_WIKI_RETRIEVAL_ROUTING_ENABLED`。关闭路由：`LLM_WIKI_RETRIEVAL_ROUTING_ENABLED=false`。

## CBM index status

每次问答前可确认三仓库 CBM 索引是否与当前代码一致（`detect_changes`）。

| 入口 | 说明 |
|------|------|
| 前端 **Index** 页 | `npm run dev` → 顶栏 Index（**Re-index** 按钮） |
| `GET /api/index/status` | stale 状态、变更文件、sync job |
| `POST /api/index/sync` | 后台触发 CBM re-index（409 若已在跑） |
| `GET /health` | 含 `cbm` 段 |

拉代码后自动重索引：`npm run sync:code:full`，或 `.env` 中 `LLM_WIKI_CBM_AUTO_SYNC=true`。

`cbm:sync` 后写入 `.reasonix/cbm-index-state.json`（各 repo 索引时的 git HEAD）。

## Evidence & debug runs

每次问答写入 `.reasonix/runs/<runId>.json`（工具次数、plan 类型、budget 熔断、evidence、citation orphans）。

| 入口 | 说明 |
|------|------|
| 前端 **Runs** 页 | 开发模式下 `npm run dev` → 顶栏 Runs |
| `GET /api/runs` | 最近 run 列表 |
| `GET /api/runs/:runId` | 单次 run 详情 |

环境变量：`LLM_WIKI_EVIDENCE_STRICT`、`LLM_WIKI_RUN_TELEMETRY_ENABLED`。

## Upgrade verification

Golden 题集：`benchmarks/golden-questions.json`（15 题，含稳定性与 public lint 判据）。

```bash
npm run verify:upgrade -- --quick              # 3 题 × 3 次
npm run verify:upgrade -- --id web-config-inventory
npm run verify:upgrade                          # 全量
```

Cursor skill：`.cursor/skills/llm-wiki-upgrade-verify/SKILL.md`。

## MCP server

`llm-wiki` 同时暴露标准 MCP Streamable HTTP 端点：

| Endpoint | 说明 |
|----------|------|
| `POST /mcp` | MCP JSON-RPC 主入口，支持 `initialize`、`notifications/initialized`、`tools/list`、`tools/call` |
| `GET /mcp` | 可选 SSE 事件流入口 |
| `DELETE /mcp` | 释放 `mcp-session-id` |

当前 MCP 工具：

| Tool | 参数 | 说明 |
|------|------|------|
| `ask_llm_wiki` | `question`、`repo_scope?` | 运行 llm-wiki Agent loop 检索三个授权 repo，直接返回完整答案 |

`cbm_search` 是 loop 内部工具，不单独暴露在 MCP `tools/list`；CBM 就绪后 Agent 会在合适的问题类型上自动使用。

在 `chatkit-middleware/tools/chatkit-web/chatkit-admin-mt` 的 MCP tools 页面新增 server，或写入 `chatkit-middleware/config/mcp-servers.yaml`：

```yaml
servers:
  - id: llm-wiki
    enabled: true
    url: http://127.0.0.1:3001/mcp
    transport: streamable-http
    description: LLM Wiki codebase QA agent
    allow_private: true
    tools_include:
      - ask_llm_wiki
    tools_exclude: []
```

如果 ChatKit 运行在 Docker 容器内而 `llm-wiki` 运行在宿主机，URL 通常应改为：

```yaml
url: http://host.docker.internal:3001/mcp
```

保存后在 Admin 中执行 reconnect/reload，看到 `ask_llm_wiki` 即表示已接入。

## Manual acceptance checklist (V1–V5)

第一期业务验收需在真实 API 与三 repo 环境下手动完成。详见 [`docs/plans/2026-06-04-llm-wiki-phase1-completion-checklist.zh.md`](../docs/plans/2026-06-04-llm-wiki-phase1-completion-checklist.zh.md)。

| ID | 问题 | 期望 |
|----|------|------|
| V1 | chatkit-middleware 主要模块 | 多轮 tool；含路径引用 |
| V2 | finclaw agent loop 入口 | file:line 或路径 |
| V3 | chatkit-web LLM 配置页 | 跨 repo 检索 |
| V4 | 某功能是否支持 X（可能不存在） | 先 search 再结论 |
| V5 | UI 排查 | 单条消息内 reasoning + tool + 正文 |

**通过标准**：V1–V5 至少 4/5 通过；全部自动化测试 green。

## Related docs

- **项目进度**：[`docs/progress.zh.md`](docs/progress.zh.md)
- 产品化路线图：[`docs/productization-roadmap.zh.md`](docs/productization-roadmap.zh.md)
- CBM 接入：[`docs/codebase-memory-mcp-integration-plan.zh.md`](docs/codebase-memory-mcp-integration-plan.zh.md)
- 需求：[`docs/architecture/llm-wiki-requirements.zh.md`](../docs/architecture/llm-wiki-requirements.zh.md)
- 分阶段测试：[`docs/plans/2026-06-04-llm-wiki-phase1-test-acceptance.zh.md`](../docs/plans/2026-06-04-llm-wiki-phase1-test-acceptance.zh.md)

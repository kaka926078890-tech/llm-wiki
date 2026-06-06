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
| `npm run sync:code` | clone/pull `code/` 下的三个并行代码仓库 |
| `npm run index` | （可选）在 TEI 可用时为 `code/` 下三个 repo 构建语义索引；**更换 embedding 模型后必须重新执行** |
| `npm run codegraph:init` | （可选）在 `code/` 下初始化 CodeGraph 符号索引（首次启用） |
| `npm run codegraph:sync` | （可选）增量同步 `code/` 的 CodeGraph 索引 |
| `npm run codegraph:status` | 查看 `code/` 的 CodeGraph 索引状态 |
| `npm test` | 后端 vitest（根目录 `tests/`） |
| `npm run build` | 构建前端 `frontend/dist` 并编译后端 TypeScript |

前端单独测试与构建：

```bash
cd frontend && npm test && npm run build
```

开发时访问 `http://127.0.0.1:3001`（后端托管前端静态资源）。

## Optional semantic search

语义搜索是**可选功能**。默认 `npm run dev` 无需 TEI/BGE 即可运行，Agent 使用 lexical 工具（`search_content`、`glob` 等）检索代码。

启用条件：

1. 可访问的 TEI 兼容 HTTP embeddings 服务（`LLM_WIKI_TEI_BASE_URL`）
2. 已为各 repo 构建本地语义索引

推荐流程：

```bash
npm run sync:code
# 在 .env 中配置 LLM_WIKI_TEI_* 变量（见 .env.example）
npm run index
npm run dev:server
```

相关环境变量见 `.env.example`。`LLM_WIKI_SEMANTIC_ENABLED=auto`（默认）时，仅当 TEI 探测成功且至少存在一个有效索引时，loop 内才会注册 `semantic_search` 工具。`LLM_WIKI_SEMANTIC_ENABLED=true` 但不可用时，启动时会打印警告并继续以 lexical 模式运行。

索引文件位于各 clone 仓库内：`code/<repo>/.reasonix/semantic/index.json`。它们属于本地 artifact（`code/` 已被 llm-wiki git 忽略），不会提交到 llm-wiki 仓库。

索引构建使用 `src/core/index/config.ts` 的共享过滤规则（排除目录/文件/扩展名、文件大小上限），并尊重各 repo 根目录的 `.gitignore`。

### Embedding model and re-indexing

**为何与模型绑定：** 语义向量由 embedding 模型生成。每个 `index.json` 会记录构建时使用的模型 id（`LLM_WIKI_TEI_MODEL`）。查询时的 embedding 必须使用**相同**模型，否则相似度分数无意义。

**何时需要重新 `npm run index`：**

| 场景 | 操作 |
|------|------|
| 首次启用 | `npm run sync:code` 后，TEI 就绪时执行 `npm run index` |
| 代码有较大变更 | 手动 re-index，使搜索覆盖新/改文件（v1 无自动同步） |
| **修改 `LLM_WIKI_TEI_MODEL`** | **必须**对三个 repo 全部 re-index |
| TEI 服务换成别的模型 | 将 `LLM_WIKI_TEI_MODEL` 改为对应 id，再 re-index |

**换模型示例：**

```bash
# .env — 例如从 bge-m3 换到另一个模型
LLM_WIKI_TEI_MODEL=BAAI/bge-large-zh-v1.5
LLM_WIKI_TEI_BASE_URL=http://127.0.0.1:8080

npm run index
npm run dev:server
```

**若忘记 re-index：** llm-wiki 会跳过 `index.json` 中 `model` 与当前 `LLM_WIKI_TEI_MODEL` 不一致的索引并打印警告；在重建索引前 `semantic_search` 可能不会注册。

## Optional CodeGraph search

CodeGraph 提供符号、调用链、影响分析等**结构化图查询**，与 lexical / semantic 工具互补。默认 `npm run dev` 无需 CodeGraph 即可运行；索引未就绪时 `codegraph_search` 会返回 init/sync 提示，Agent 可回退到 lexical 工具。

推荐流程：

```bash
npm run sync:code
npm run codegraph:init
npm run dev:server
```

代码有较大变更后手动同步：

```bash
npm run codegraph:sync
```

索引位于 `code/.codegraph/`（本地 artifact，不提交到 llm-wiki git）。`codegraph_search` 是 loop 内部工具，始终注册；Agent 在符号查找、callers/callees、影响分析等问题上会优先尝试它，再用 `read_file` / `search_content` 验证。

| 场景 | 优先工具 |
|------|----------|
| 符号、调用链、影响范围 | `codegraph_search` |
| 宽泛的功能/架构描述 | `semantic_search`（需 TEI + 语义索引） |
| 精确字符串、路由、env 名 | `search_content` |

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

`semantic_search` 与 `codegraph_search` 是 loop 内部工具，不单独暴露在 MCP `tools/list`；启用后 Agent 会在合适的问题类型上自动使用它们。

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

- 需求：[`docs/architecture/llm-wiki-requirements.zh.md`](../docs/architecture/llm-wiki-requirements.zh.md)
- 分阶段测试：[`docs/plans/2026-06-04-llm-wiki-phase1-test-acceptance.zh.md`](../docs/plans/2026-06-04-llm-wiki-phase1-test-acceptance.zh.md)

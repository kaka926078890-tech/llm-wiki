# LLM Wiki

面向三个代码仓库的 **Reasonix 风格问答 Agent**：用户用自然语言提问，Agent 通过只读工具检索、阅读代码后回答。所有结论必须来自代码，思考过程（reasoning + tool 调用）在对话区可见，即证据本身。

| 仓库 | 默认路径（相对 `llm-wiki/`） |
|------|------------------------------|
| chatkit-middleware | `../chatkit-middleware` |
| chatkit-web | `../chatkit-middleware/tools/chatkit-web` |
| finclaw | `../finclaw` |

## Prerequisites

- **Node.js 22+**
- **DeepSeek API Key** — 设置 `DEEPSEEK_API_KEY`
- **三个 repo 路径** — 本地需存在上述三个仓库，或通过环境变量指向正确路径

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

REPO_CHATKIT_MIDDLEWARE=../chatkit-middleware
REPO_CHATKIT_WEB=../chatkit-middleware/tools/chatkit-web
REPO_FINCLAW=../finclaw

LLM_WIKI_PORT=3001
LLM_WIKI_HOST=127.0.0.1
```

路径均相对于 `llm-wiki/` 项目根解析为绝对路径；工具只能访问三个 repo 根目录内的文件。

## Install

```bash
npm install
cd frontend && npm install && cd ..
```

## Commands

| 命令 | 说明 |
|------|------|
| `npm run dev` | 同时启动后端（Fastify + SSE）与前端 Vite dev server |
| `npm test` | 后端 vitest（根目录 `tests/`） |
| `npm run build` | 构建前端 `frontend/dist` 并编译后端 TypeScript |

前端单独测试与构建：

```bash
cd frontend && npm test && npm run build
```

开发时访问 `http://127.0.0.1:3001`（后端托管前端静态资源）。

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
| `ask_llm_wiki` | `question`、`repo_scope?`、`include_reasoning?`、`max_answer_chars?` | 复用 llm-wiki Agent loop 检索三个授权 repo；完整答案会缓存，返回首段和 `result_id` |
| `read_llm_wiki_result` | `result_id`、`cursor?`、`max_chars?` | 按 `cursor` 分段读取已缓存答案，不重新运行 repo 检索 |

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
      - read_llm_wiki_result
    tools_exclude: []
```

如果 ChatKit 运行在 Docker 容器内而 `llm-wiki` 运行在宿主机，URL 通常应改为：

```yaml
url: http://host.docker.internal:3001/mcp
```

保存后在 Admin 中执行 reconnect/reload，看到 `ask_llm_wiki` 即表示已接入运行时工具目录。

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

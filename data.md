{
  "agent_id": "agent-mq1aptg9",
  "agent_name": "agent-mq1aptg9",
  "agent_tool_bundle": "standard",
  "aieos_allowed_skills": null,
  "aieos_allowed_tools": null,
  "allow_network_effective": true,
  "approval_decision": null,
  "auto_saved_memory": false,
  "auto_saved_memory_id": null,
  "capability": "general",
  "continuation_block_reason": null,
  "continuation_checkpoint": null,
  "continuation_eligible": true,
  "cron_policy": {
    "blocked_by_heuristic": 0,
    "blocked_by_hint_policy": 0,
    "heuristic_fallback_active": false,
    "hint_present": false
  },
  "degraded_execution": false,
  "document_export": null,
  "document_preprocess": null,
  "document_trace": {
    "input_document_ids": [],
    "job_id": "7106c9ce9dcc1505ed925a11e78faac7",
    "output_document_ids": []
  },
  "duration_ms": 65467,
  "ended_at": "2026-06-06T14:51:49.231190751+00:00",
  "execution_tier": "tier_b",
  "execution_trace": [
    {
      "arguments_hash": "df544446a67a91a7",
      "arguments_preview": "{\"question\":\"chatkit-middleware的功能清单\",\"repo_scope\":\"middleware\"}",
      "duration_ms": 56058,
      "execution_audit": {
        "execution_surface": "mcp_remote_jsonrpc_http",
        "execution_tier": "b",
        "fine_grained_sandbox": {
          "active_in_execution": true,
          "fallback_mode": "allow",
          "inner_layer": "enabled",
          "mode": "prefer"
        },
        "isolation": {
          "backend": "tier_b_bubblewrap",
          "boundary_class": "namespace_kernel",
          "degraded_execution": false,
          "deployment_profile": "legacy",
          "fallback_reason": null,
          "policy_snapshot_hash": "sha256:2e31454458b0d1e1f1329acdd1ba4a92233eef05083ea5aa7410bd3912048c74"
        },
        "mapped_working_dir": "/workspace/",
        "requested_working_dir": null,
        "resolved_working_dir": "/app/data/workspaces/tenants/5dcace00-8a15-4281-9955-55b87fe254ca/ZWM4YzA2NWYtYmM0ZC00NjFkLTk2ZWItZjI3MTg0OGJiYzcy/agents/agent-mq1aptg9/workspace",
        "sandbox_backend": "tier_b_command_runner",
        "termination_reason": "completed",
        "tier_command_sandbox": false
      },
      "iteration": 1,
      "result_length": 6002,
      "result_preview": "以下是 **chatkit-middleware** 的完整功能清单，按层级和领域分组。\n\n---\n\n## 1. 边缘层与网关\n\n- **API 网关**：Nginx 边缘入口，负责 TLS 终结、JWT 验证、限流，作为所有外部请求的统一入口。\n- **AG-UI 服务器**：为 ChatKit 客户端提供 SSE 流式传输，包含连接注册表（在线状态追踪），统一入口替代了旧的 agent-gateway。\n- **OpenClaw 兼容网关**：OpenClaw 风格 WebSocket 网关，仅用于纯聊天场景。\n- **飞书连接器**：飞书/ Lark 渠道 WebSocket 连接器。\n- **钉钉连接器**：钉钉渠道 Stream 模式连接器。\n- **企业微信连接器**：企微 AI 机器人 WebSocket 连接器。\n\n---\n\n## 2. 核心平台服务\n\n- **编排器**：YAML 流程解释器，顺序执行流程步骤，通过 HTTP 调用各服务并在步骤间传递上下文。\n- **身份服务**：认证与鉴权，包括 JWT 生成/验证、Zitadel OIDC 集成、会话管理、设备管理、租户感知身份数据。\n- **Claw 集群管理器**：Claw 运行时实例的内部生命周期管理。\n- **角色服务**：用户入驻配置文件与角色模板管理。\n- **技能服务**：技能目录、内容审核、技能安装/卸载。\n\n---\n\n## 3. 会话与投递服务\n\n- **会话存储**：基于 TimescaleDB 的 WORM（一次写入多次读取）会话存储，支持自然语言查询键\"最近\"索引。\n- **投递服务**：存储转发投递协调器，负责消息构建（渠道格式化）、投递策略（在线 SSE/离线推送）、统一收件箱+推送+在线通知。\n- **收件箱服务**：PostgreSQL 持久化的可靠消息收件箱，支持分页查询、状态追踪、投递确认。\n- **推送服务**：APNs/FCM 推送通知投递。\n\n---\n\n## 4. 文档服务\n\n- **文档服务**：基于工作区存储的文档 API（文件 + PostgreSQL 元数据）。\n- **文档工具包**：常驻文档工作者，负责文档抓取、内容提取、格式验证、导出。\n\n---\n\n## 5. AI 基础设施 — 入口与治理\n\n- **意图分类器**：从用户消息中识别/分类用户意图，用于策略路由。\n- **策略引擎**：LLM 前/后策略检查，包括合规、管辖、顾问门槛评估，支持阻断和二次路由。\n\n---\n\n## 6. AI 基础设施 — 推理层（AI-Infra-RS）\n\n- **LLM 推理**：多提供商 LLM 集成（OpenAI、DeepSeek、LiteLLM 等），带请求队列与并发控制。\n- **对话上下文组装**：从多个来源（HSG 加权排序、记忆、历史）组装上下文块。\n- **NeMo 护栏**：推理前护栏（提示注入检测）和推理后护栏（有害内容、PII 检测）。\n- **记忆存储**：基于 Mem0 的混合记忆系统（FastEmbed + Qdrant 向量存储），提供语义记忆、时序图、HSG 元数据、用户画像、内容增强端点。\n- **记忆摄入工作者**：后台工作者，通过 NATS 消费会话事件，按会话缓冲，转发至扩散队列。\n- **记忆扩散工作者**：8 步策展管道，包括噪声过滤、重要性评估、扇区分类、冲突检测、去重、多接收器写入、HSG 初始化、审计日志记录。\n- **Tier B 隔离**：安全沙箱执行，Linux 上使用 bubblewrap，macOS 上使用 Apple Container 或 Seatbelt，支持降级执行标志。\n- **Restate 持久定时器**：基于 Restate 的持久定时器与 cron 触发器。\n\n---\n\n## 7. Pulse 服务（出境/主动通知）\n\n- **触发器网关**：Pulse 触发器的 REST 入口。\n- **触发器过滤器**：触发器去重、冷却期、用户偏好与优先级检查。\n- **触发器调度器**：基于 Temporal 的定时任务与 cron 调度。\n- **事件监听器**：监听 MoT（Machine of Things）事件。\n- **代理路由器**：将 Pulse 事件路由至对应智能体/角色。\n- **Pulse 发布**：面向开发者的 Pulse 事件发布 API。\n\n---\n\n## 8. 公共库\n\n- **contracts-ts**：从 OpenAPI 合约自动生成的 TypeScript 类型。\n- **logging**：结构化日志（Pino-based）。\n- **idempotency**：基于 Redis 的幂等性支持。\n- **identity-client**：身份服务 HTTP 客户端封装。\n- **redis-client**：Redis 客户端封装。\n- **resilience**：容错工具：重试、熔断、超时。\n- **service-discovery**：基于配置的服务发现与 URL 构建。\n- **agent-workspace**：智能体工作区路径解析。\n- **workspace-paths**：工作区路径工具。\n- **plugin-sdk**：第三方插件 SDK。\n\n---\n\n## 9. 合约定义（OpenAPI 3.0）\n\n合约目录是所有 API 类型的单一事实来源，涵盖：\n\n- **入站流程**：意图分类、会话存储追加。\n- **出境流程**：代理路由、消息构建、触发器事件处理、触发器过滤。\n- **共享 AI**：LLM 推理接口、上下文组装、推理前策略、推理后策略、推理前护栏、推理后护栏、消息投递。\n- **基础支持**：收件箱存储、推送通知、触发器调度。\n- **平台级**：代理注册、RBAC 权限、技能目录、租户提示词树、用户密钥、管理员预设同步。\n\n---\n\n## 10. 工作流定义\n\n- **入站查询**（Flow A）：HTTP 触发，用户查询 → AI-Infra 推理 → 投递（在线 SSE 或离线推送）。\n- **出境 Pulse**（Flow B — 企业版）：事件触发，触发 → 代理路由 → 触发器过滤 → 策略前检 → AI-Infra → 策略后检 → 投递。\n- **出境 Pulse 精简版**（Flow B-Lite — Advance 版）：事件触发，触发过滤 → 代理路由 → AI-Infra-Lite → 投递（无策略检查）。\n\n---\n\n## 11. 版本能力\n\n- **Basic**：入站聊天流程，包含 API 网关、AG-UI 服务器、所有渠道连接器、编排器、身份服务、角色服务、技能服务、会话存储、投递、收件箱、文档服务、推送服务、AI-Infra-RS（Rust AI 后端）。\n- **Advance**：Basic 全部功能 + Pulse 服务（触发器网关/过滤器/调度器/事件监听器/代理路由器）、意图分类器、策略引擎、Temporal 工作流引擎。",
      "status": "ok",
      "tool": "llm-wiki_ask_llm_wiki",
      "tool_call_id": "call_00_qOCc9IFP3cj75DAVK0Gi0312"
    }
  ],
  "fallback_policy": null,
  "fallback_reason": null,
  "guardrails_applied": [
    {
      "allowed": true,
      "decision_id": null,
      "metadata": {
        "mode": "rs",
        "processing": "pass-through",
        "stage": "pre"
      },
      "policy_version": null,
      "reasons": [],
      "risk_level": "none",
      "risk_score": 0,
      "rule_ids": [],
      "stage": "pre",
      "status_code": 200
    },
    {
      "allowed": true,
      "decision_id": null,
      "metadata": {
        "mode": "rs",
        "processing": "pass-through",
        "stage": "post"
      },
      "policy_version": null,
      "reasons": [],
      "risk_level": "none",
      "risk_score": 0,
      "rule_ids": [],
      "stage": "post",
      "status_code": 200
    }
  ],
  "guardrails_blocked": false,
  "internal_stop_reason": "done",
  "iterations": 2,
  "jurisdiction": "US",
  "model_runtime_ms": 9409,
  "output_document_ids": [],
  "pending_approval": null,
  "pending_tool_calls": [],
  "policy_snapshot_hash": "ec4ad435a8672483",
  "prev_hash": "sha256:2d832612b47be8d0b0228237c3d2a0eaa1807b54504186f15119eae0de36411d",
  "proactive_compaction": {
    "applied_count": 0,
    "exhausted_count": 0,
    "last_estimated_prompt_tokens_after": "[REDACTED]",
    "last_estimated_prompt_tokens_before": "[REDACTED]",
    "last_prompt_budget": 0,
    "last_utilization_after": 0,
    "last_utilization_before": 0,
    "messages_removed": 0,
    "warning_count": 0
  },
  "progress_class": "meaningful",
  "provider_id": "deepseek",
  "record_hash": "sha256:1b1e4d3e396b77464e0b3e82cde1baca79af45710b71c1d88b555ad563806d08",
  "requested_model": null,
  "require_sandbox_effective": true,
  "research_budget": {
    "answerless_iterations": 0,
    "forced_synthesis_count": 0,
    "last_trigger": null,
    "low_yield_detected": false,
    "low_yield_window": 6,
    "max_answerless_research_iterations": 10,
    "max_research_tool_calls": 24,
    "readable_evidence_seen": false,
    "recent_tools": [],
    "redirect_pending": false,
    "research_tool_calls": 0
  },
  "response_text_preview": "以下是 **chatkit-middleware** 的完整功能清单，按层级和领域分组：\n\n---\n\n## 1. 🏗️ 边缘层与网关\n- **API 网关**：Nginx 边缘入口，负责 TLS 终结、JWT 验证、限流，统一外部请求入口\n- **AG-UI 服务器**：为 ChatKit 客户端提供 SSE 流式传输，含连接注册表（在线状态追踪）\n- **OpenClaw 兼容网关**：OpenClaw 风格 WebSocket 网关，仅用于纯聊天场景\n- **飞书连接器**：飞书/Lark 渠道 WebSocket 连接器\n- **钉钉连接器**：钉钉渠道 Stream 模式连接器\n- **企业微信连接器**：企微 AI 机器人 WebSocket 连接器\n\n## 2. ⚙️ 核心平台服务\n- **编排器**：YAML 流程解释器，顺序执行流程步骤，通过 HTTP 调用各服务并在步骤间传递上下文\n- **身份服务**：认证与鉴权，包括 JWT 生成/验证、Zitadel OIDC 集成、会话管理、设备管理、租户感知身份数据\n- **Claw 集群管理器**：Claw 运行时实例的内...",
  "resumed_from_checkpoint": null,
  "run_id": "7106c9ce9dcc1505ed925a11e78faac7",
  "rw_mount_targets": [
    "/workspace",
    "/home/user",
    "/tmp"
  ],
  "session_id": "[REDACTED]",
  "source_document_ids": [],
  "started_at": "2026-06-06T14:50:43.762813513+00:00",
  "stop_reason": "done",
  "tenant_id": "5dcace00-8a15-4281-9955-55b87fe254ca",
  "tier_b_ready": true,
  "tier_b_root_elevation_enabled": false,
  "tier_b_runtime_gid_effective": 1000,
  "tier_b_runtime_uid_effective": 1000,
  "tool_call_count": 1,
  "tool_result_guard": {
    "applied_count": 0,
    "estimated_tokens_trimmed": "[REDACTED]",
    "last_per_result_token_cap": "[REDACTED]",
    "last_total_tool_result_token_budget": "[REDACTED]",
    "last_total_tool_result_tokens_after": "[REDACTED]",
    "last_total_tool_result_tokens_before": "[REDACTED]",
    "last_within_budget": false,
    "modified_messages": 0
  },
  "tool_runtime_by_iteration_ms": {
    "1": 56058
  },
  "tool_runtime_ms": 56058,
  "transcript_repair": {
    "applied_count": 0,
    "inserted_missing_tool_results": 0,
    "last_messages_after": 0,
    "last_messages_before": 0,
    "reassigned_tool_result_ids": 0,
    "removed_duplicate_tool_results": 0,
    "removed_empty_messages": 0,
    "removed_invalid_tool_calls": 0,
    "removed_orphan_tool_results": 0,
    "reordered_tool_results": 0
  },
  "usage": {
    "completion_tokens": 907,
    "prompt_tokens": 22968,
    "total_tokens": 23875
  },
  "user_id": "ec8c065f-bc4d-461d-96eb-f271848bbc72"
}
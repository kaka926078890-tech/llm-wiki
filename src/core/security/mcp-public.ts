export interface McpPublicSanitizeResult {
  text: string;
  findings: Array<{ kind: string; count: number }>;
}

interface PublicDetail {
  kind: string;
  label: string;
  count: number;
}

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

function record(
  details: PublicDetail[],
  kind: string,
  label: string,
  count: number,
): void {
  if (count <= 0) return;
  const existing = details.find((detail) => detail.kind === kind && detail.label === label);
  if (existing) {
    existing.count += count;
  } else {
    details.push({ kind, label, count });
  }
}

function classifyEnvVar(name: string): string {
  if (name.startsWith("VITE_PROXY_")) return "前端代理目标配置";
  if (name.startsWith("VITE_CHANNEL_LOGIN_")) return "频道登录测试配置";
  if (name.includes("IDENTITY")) return "认证服务配置";
  if (name.includes("PERSONA") || name.includes("AGENT")) return "智能体服务配置";
  if (name.includes("DOCUMENT") || name.includes("DOC_TOOLKIT")) return "文档服务配置";
  if (name.includes("BASE_PATH")) return "前端访问路径配置";
  return "前端运行时配置";
}

function classifyRoute(route: string): string {
  if (route.startsWith("/admin")) return "管理后台接口";
  if (
    route.startsWith("/api/feishu") ||
    route.startsWith("/api/dingtalk") ||
    route.startsWith("/api/wecom") ||
    route.startsWith("/feishu") ||
    route.startsWith("/dingtalk") ||
    route.startsWith("/wecom")
  ) {
    return "第三方集成接口";
  }
  if (route.startsWith("/auth")) return "认证接口";
  if (route.startsWith("/users") || route.startsWith("/me")) return "用户相关接口";
  if (route.startsWith("/skills") || route.startsWith("/templates")) return "技能与模板接口";
  if (route.startsWith("/doc-toolkit") || route.startsWith("/document-svc")) {
    return "文档服务接口";
  }
  return "内部服务接口";
}

function collectLineDetails(line: string): PublicDetail[] {
  const details: PublicDetail[] = [];

  const localUrlCount = countMatches(
    line,
    /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/[^\s)`|，。；、]*)?/gi,
  );
  record(details, "local_url", "本地开发服务连接", localUrlCount);
  record(
    details,
    "local_address",
    "本地开发服务连接",
    countMatches(line, /\b(?:localhost|127\.0\.0\.1|\[::1\]):\d+\b/gi),
  );

  for (const match of line.matchAll(/\bVITE_[A-Z0-9_]+\b/g)) {
    const name = match[0] ?? "";
    record(details, "frontend_env_var", classifyEnvVar(name), 1);
  }

  record(
    details,
    "storage_key",
    "浏览器本地缓存配置",
    countMatches(
      line,
      /\b(?:chatkit|finclaw)[A-Za-z0-9_.:-]*(?:sessions|messages|locale|lang|selectedAgentId|cache)[A-Za-z0-9_.:-]*/gi,
    ),
  );

  for (const match of line.matchAll(
    /(?<![\w.:-])\/(?:admin|api|auth|users|skills|templates|persona-uploads|ai-infra|ai-infra-rs|doc-toolkit|document-svc|trigger-scheduler|feishu|dingtalk|wecom|agent|events|health|info|me)(?:\/[A-Za-z0-9_.:-]+)+(?![\w.:-])/g,
  )) {
    const route = match[0] ?? "";
    record(details, "internal_route", classifyRoute(route), 1);
  }

  record(
    details,
    "file_path",
    "源码位置",
    countMatches(
      line,
      /(?:(?:\.{1,2}|[A-Za-z0-9_.-]+)\/)+[A-Za-z0-9_.-]+\.(?:tsx|ts|jsx|js|json|md|css|html|rs|py|go|java)(?::\d+)?/g,
    ),
  );

  return details;
}

function mergeDetails(target: PublicDetail[], details: PublicDetail[]): void {
  for (const detail of details) {
    record(target, detail.kind, detail.label, detail.count);
  }
}

function uniqueLabels(details: PublicDetail[]): string[] {
  return [...new Set(details.map((detail) => detail.label))];
}

function appendPublicSummary(lines: string[], details: PublicDetail[]): string[] {
  const labels = uniqueLabels(details);
  if (labels.length === 0) return lines;
  const summary = `涉及的内部实现细节已归纳为：${labels.join("、")}。部分底层实现细节已按安全策略省略。`;
  const trimmed = lines.join("\n").trim();
  return trimmed ? [...lines, "", summary] : [summary];
}

export function sanitizeMcpPublicAnswer(text: string): McpPublicSanitizeResult {
  const details: PublicDetail[] = [];
  const codeBlockCount = countMatches(text, /```[\s\S]*?```/g);
  record(details, "code_block", "源码示例", codeBlockCount);

  const withoutCode = text.replace(/```[\s\S]*?```/g, "源码示例已省略。");
  const publicLines: string[] = [];

  for (const line of withoutCode.split(/\r?\n/)) {
    const lineDetails = collectLineDetails(line);
    if (lineDetails.length > 0) {
      mergeDetails(details, lineDetails);
      continue;
    }
    publicLines.push(line);
  }

  const next = appendPublicSummary(publicLines, details).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return {
    text: next || "部分底层实现细节已按安全策略省略。",
    findings: details.map((detail) => ({ kind: detail.kind, count: detail.count })),
  };
}

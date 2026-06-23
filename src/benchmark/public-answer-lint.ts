export interface PublicAnswerLintViolation {
  rule: string;
  detail: string;
  sample?: string;
}

const LINT_RULES: Array<{ rule: string; pattern: RegExp; detail: string }> = [
  { rule: "code_block", pattern: /```/, detail: "答案包含代码块" },
  {
    rule: "env_var",
    pattern: /\b(?:VITE_|LLM_WIKI_|DEEPSEEK_|REPO_)[A-Z0-9_]+\b/,
    detail: "答案包含环境变量名",
  },
  {
    rule: "local_url",
    pattern: /\b(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\b/i,
    detail: "答案包含本地 URL 或端口",
  },
  {
    rule: "file_path",
    pattern:
      /(?:(?:\.{1,2}|[A-Za-z0-9_.-]+)\/)+[A-Za-z0-9_.-]+\.(?:tsx?|jsx?|json|ya?ml|md|rs|py|go|java)(?::\d+)?\b/,
    detail: "答案包含源码文件路径",
  },
  {
    rule: "route_path",
    pattern:
      /(?<![\w.:-])\/(?:admin|api|auth|users|skills|templates|agent|health|mcp|doc-toolkit|document-svc|feishu|dingtalk|wecom)(?:\/[A-Za-z0-9_.-]+)+\b/,
    detail: "答案包含内部 API 路由路径",
  },
  {
    rule: "secret_bearer",
    pattern: /\bBearer\s+[A-Za-z0-9._-]{8,}\b/i,
    detail: "答案包含 Bearer token",
  },
  {
    rule: "secret_sk",
    pattern: /\bsk-[A-Za-z0-9]{8,}\b/,
    detail: "答案包含 API key",
  },
  {
    rule: "private_key",
    pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
    detail: "答案包含私钥块",
  },
];

export function lintPublicAnswer(text: string): PublicAnswerLintViolation[] {
  const violations: PublicAnswerLintViolation[] = [];
  for (const { rule, pattern, detail } of LINT_RULES) {
    const match = pattern.exec(text);
    if (match) {
      violations.push({
        rule,
        detail,
        sample: match[0].slice(0, 80),
      });
    }
  }
  return violations;
}

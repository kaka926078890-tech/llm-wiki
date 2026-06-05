export type HookEvent = "PreToolUse" | "PostToolUse" | "UserPromptSubmit" | "Stop";

export interface HookConfig {
  match?: string;
  command: string;
  description?: string;
  timeout?: number;
  cwd?: string;
}

export interface ResolvedHook extends HookConfig {
  event: HookEvent;
  scope: "project" | "global";
  source: string;
}

export type HookDecision = "pass" | "block" | "warn";

export interface HookOutcome {
  hook: ResolvedHook;
  decision: HookDecision;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface HookReport {
  outcomes: HookOutcome[];
  blocked: boolean;
}

export type HookPayload = {
  event: HookEvent;
  cwd?: string;
  toolName?: string;
  toolArgs?: unknown;
  toolResult?: string;
  [key: string]: unknown;
};

export function formatHookOutcomeMessage(outcome: HookOutcome): string {
  return outcome.stderr || outcome.stdout || `hook ${outcome.decision}`;
}

export async function runHooks(opts: {
  hooks: ResolvedHook[];
  payload: HookPayload;
}): Promise<HookReport> {
  void opts;
  return { outcomes: [], blocked: false };
}

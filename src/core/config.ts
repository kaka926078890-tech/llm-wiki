/** Minimal config surface for llm-wiki core (read-only tools). */

export type ReasoningEffort = "low" | "medium" | "high" | "max";

export function loadRateLimit(): { rpm?: number } | undefined {
  return undefined;
}

export function resolveBaseUrlEnv(): string | undefined {
  return process.env.DEEPSEEK_BASE_URL?.trim();
}

export function projectHooksTrusted(_rootDir?: string): boolean {
  return false;
}

const projectPathAllowed = new Map<string, string[]>();

export function loadProjectPathAllowed(rootDir: string): string[] {
  return projectPathAllowed.get(rootDir) ?? [];
}

export function addProjectPathAllowed(rootDir: string, prefix: string): void {
  const list = projectPathAllowed.get(rootDir) ?? [];
  if (!list.includes(prefix)) {
    projectPathAllowed.set(rootDir, [...list, prefix]);
  }
}

export type ReasonixConfig = Record<string, unknown>;

export function loadPricingOverride(_path?: string): Record<string, unknown> {
  return {};
}

export function loadContextTokens(_path?: string): Record<string, number> {
  return {
    "deepseek-chat": 128_000,
    "deepseek-v4-flash": 128_000,
    "deepseek-v4-pro": 128_000,
  };
}

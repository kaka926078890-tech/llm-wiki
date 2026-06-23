export type SecurityAction = "allow" | "redact" | "metadata_only" | "block";

export interface SecurityPolicy {
  sensitivePathGlobs: string[];
  sensitivePathSubstrings: string[];
  maxConsecutiveSourceLines: number;
}

export interface PathSensitivity {
  sensitive: boolean;
  reasons: string[];
}

export function defaultSecurityPolicy(): SecurityPolicy {
  return {
    sensitivePathGlobs: [
      ".env",
      ".env.*",
      "*.pem",
      "*.key",
      "*id_rsa*",
      "*id_dsa*",
      "*id_ed25519*",
    ],
    sensitivePathSubstrings: [
      "secret",
      "credential",
      "credentials",
      "token",
      "private-key",
      "private_key",
      "client-secret",
    ],
    maxConsecutiveSourceLines: 20,
  };
}

function normalizePath(input: string): string {
  return input.replaceAll("\\", "/").toLowerCase();
}

function basename(input: string): string {
  const normalized = normalizePath(input);
  return normalized.split("/").filter(Boolean).at(-1) ?? normalized;
}

function globLikeMatch(value: string, pattern: string): boolean {
  const normalizedPattern = pattern.toLowerCase();
  if (normalizedPattern.startsWith("*.")) {
    return value.endsWith(normalizedPattern.slice(1));
  }
  if (normalizedPattern.startsWith("*") && normalizedPattern.endsWith("*")) {
    return value.includes(normalizedPattern.slice(1, -1));
  }
  if (normalizedPattern.startsWith("*")) {
    return value.endsWith(normalizedPattern.slice(1));
  }
  if (normalizedPattern.endsWith("*")) {
    return value.startsWith(normalizedPattern.slice(0, -1));
  }
  return value === normalizedPattern;
}

const DEPENDENCY_PATH_MARKERS = [
  "/node_modules/",
  "/dist/",
  "/build/",
  "/.next/",
  "/target/",
  "/vendor/",
] as const;

export function classifyPathSensitivity(
  path: string | undefined,
  policy: SecurityPolicy = defaultSecurityPolicy(),
): PathSensitivity {
  if (!path) return { sensitive: false, reasons: [] };
  const normalized = normalizePath(path);
  const name = basename(path);
  const reasons: string[] = [];

  for (const marker of DEPENDENCY_PATH_MARKERS) {
    if (normalized.includes(marker)) reasons.push(`dependency_path:${marker.slice(1, -1)}`);
  }

  for (const pattern of policy.sensitivePathGlobs) {
    if (globLikeMatch(name, pattern)) reasons.push(`sensitive_path:${pattern}`);
  }
  for (const needle of policy.sensitivePathSubstrings) {
    if (normalized.includes(needle.toLowerCase())) {
      reasons.push(`sensitive_path:${needle}`);
    }
  }

  return { sensitive: reasons.length > 0, reasons };
}

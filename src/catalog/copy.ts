import type { AnswerProfile } from "../config.js";
import type { CatalogRules } from "./rules.js";

/** User-facing catalog copy; flags/disclaimers toggled via catalog-rules.yaml. */
export function finclawNotMicroserviceBody(profile: AnswerProfile, rules: CatalogRules): string {
  const body = rules.shared.copy.finclawNotMicroservice;
  if (profile === "public") return body;
  return `${body}\n\n（口径：F3=A，见 config/catalog-rules.yaml）`;
}

export function webAdminAppsNote(rules: CatalogRules): string {
  return rules.shared.copy.webAdminAppsNote;
}

export function webIncompleteDocsDisclaimer(rules: CatalogRules): string {
  return rules.shared.copy.webIncompleteDocsDisclaimer;
}

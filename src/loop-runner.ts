import path from "node:path";
import { randomUUID } from "node:crypto";

import { CacheFirstLoop } from "./core/loop.js";
import { DeepSeekClient } from "./core/client.js";
import { ImmutablePrefix } from "./core/memory/runtime.js";
import { probeCbmBinary } from "./cbm/exec.js";
import { EvidenceCollector } from "./core/evidence/index.js";
import { createSecurityAuditLogger, type SecurityAuditLogger } from "./core/security/index.js";
import { ToolRegistry } from "./core/tools.js";
import type { LlmWikiConfig } from "./config.js";
import { buildSystemPrompt } from "./prompt.js";
import { registerMultiRootReadonlyTools } from "./tools/multi-root-readonly.js";
import { registerCbmSearchTool } from "./tools/cbm-search.js";
import { registerRetrievalBudget, loadRetrievalBudgetForQuestion } from "./retrieval/budget.js";
import { classifyRetrievalPlan } from "./retrieval/plan.js";
import { registerRetrievalRouter } from "./retrieval/router.js";
import { RunTelemetry, loadRunTelemetryOptions } from "./telemetry/run-telemetry.js";

export interface LoopBundle {
  loop: CacheFirstLoop;
  evidence: EvidenceCollector;
  telemetry: RunTelemetry;
}

async function tryRegisterCbmTools(
  tools: ToolRegistry,
  cfg: LlmWikiConfig,
  securityAudit: SecurityAuditLogger,
): Promise<void> {
  if (cfg.cbm.enabled === false) return;

  const ready = cfg.cbm.enabled === true || await probeCbmBinary(cfg.cbm.binary);
  if (!ready) {
    if (cfg.cbm.enabled === true) {
      console.warn(
        "[llm-wiki] LLM_WIKI_CBM_ENABLED=true but codebase-memory-mcp is unavailable. "
        + "Install: curl -fsSL https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh | bash "
        + "then `npm run cbm:init`. Continuing with lexical tools only.",
      );
    }
    return;
  }

  registerCbmSearchTool(tools, {
    binary: cfg.cbm.binary,
    projectRoot: cfg.projectRoot,
    defaultTopK: cfg.cbm.topK,
    repoRoots: {
      "chatkit-middleware": cfg.repos.middleware,
      "chatkit-web": cfg.repos.web,
      finclaw: cfg.repos.finclaw,
    },
    securityAudit,
  });
}

function wireRunCollectors(
  tools: ToolRegistry,
  evidence: EvidenceCollector,
  telemetry: RunTelemetry,
  budget: ReturnType<typeof registerRetrievalBudget>,
  router: ReturnType<typeof registerRetrievalRouter>,
): void {
  const debug = process.env.LLM_WIKI_DEBUG_TOOLS === "true";
  tools.setAuditListener(({ name, args }) => {
    telemetry.onToolStart(name, args);
    evidence.onToolStart(name, args);
    if (debug) console.error(`[llm-wiki][tool:start] ${name} ${JSON.stringify(args)}`);
  });

  tools.setResultAugmenter((name, args, result) => {
    try {
      const parsed = JSON.parse(result) as { budget?: string };
      if (parsed.budget) {
        telemetry.onToolBlocked(name, args, parsed.budget);
      } else {
        router.afterResult(name, result);
        telemetry.onToolResult(result);
        evidence.onToolResult(name, args, result);
        budget.afterResult(result);
      }
    } catch {
      router.afterResult(name, result);
      telemetry.onToolResult(result);
      evidence.onToolResult(name, args, result);
      budget.afterResult(result);
    }
    if (debug) console.error(`[llm-wiki][tool:end] ${name} chars=${result.length}`);
    return result;
  });
}

export async function buildLoopBundle(
  cfg: LlmWikiConfig,
  question: string,
  runId: string = randomUUID(),
): Promise<LoopBundle> {
  const tools = new ToolRegistry({ autoFlatten: true });
  const securityAudit = createSecurityAuditLogger(
    path.join(cfg.projectRoot, ".reasonix", "security-audit.jsonl"),
  );
  const plan = classifyRetrievalPlan(question);
  const router = registerRetrievalRouter(tools, plan.kind);
  const budget = registerRetrievalBudget(
    tools,
    loadRetrievalBudgetForQuestion(question),
  );
  const evidence = new EvidenceCollector(runId, question);
  const telemetry = new RunTelemetry(loadRunTelemetryOptions(cfg.projectRoot), runId);
  wireRunCollectors(tools, evidence, telemetry, budget, router);

  registerMultiRootReadonlyTools(tools, { roots: cfg.repos, securityAudit });
  await tryRegisterCbmTools(tools, cfg, securityAudit);

  const client = new DeepSeekClient({
    apiKey: cfg.deepseekApiKey,
    baseUrl: cfg.deepseekBaseUrl,
  });

  const system = buildSystemPrompt(cfg);
  const prefix = new ImmutablePrefix({
    system,
    toolSpecs: tools.specs(),
  });

  const loop = new CacheFirstLoop({
    client,
    prefix,
    tools,
    model: cfg.deepseekModel,
    stream: false,
    maxIterPerTurn: 10,
  });

  return { loop, evidence, telemetry };
}

export async function buildLoop(cfg: LlmWikiConfig): Promise<CacheFirstLoop> {
  const bundle = await buildLoopBundle(cfg, "");
  return bundle.loop;
}

export { CacheFirstLoop };

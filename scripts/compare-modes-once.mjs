#!/usr/bin/env node
/**
 * One-shot compare Agent Stream vs MCP Final for a single question.
 * Usage: node scripts/compare-modes-once.mjs "your question"
 */
const BASE = process.env.LLM_WIKI_BASE_URL ?? "http://127.0.0.1:3001";
const QUESTION =
  process.argv[2] ?? "chatkit-middleware的详细功能清单都有哪些";

function parseSseBlocks(text) {
  const events = [];
  for (const block of text.split("\n\n")) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const dataLine = trimmed.split("\n").find((l) => l.startsWith("data: "));
    if (!dataLine) continue;
    try {
      events.push(JSON.parse(dataLine.slice("data: ".length)));
    } catch {
      // skip
    }
  }
  return events;
}

function extractAnswer(events) {
  const parts = [];
  for (const ev of events) {
    if (ev.role === "assistant_delta" || ev.role === "assistant_final") {
      if (ev.content) parts.push(ev.content);
    }
  }
  return parts.join("");
}

function toolFlow(events) {
  const flow = [];
  let i = 0;
  for (const ev of events) {
    if (ev.role === "tool_start") {
      i += 1;
      let args = ev.toolArgs;
      try {
        const parsed = JSON.parse(ev.toolArgs ?? "{}");
        args = JSON.stringify(parsed, null, 0).slice(0, 200);
      } catch {
        // keep raw
      }
      flow.push({
        step: i,
        phase: "start",
        tool: ev.toolName ?? "unknown",
        args: args?.slice(0, 200),
      });
    }
    if (ev.role === "tool") {
      const preview = (ev.content ?? "").replace(/\s+/g, " ").slice(0, 120);
      flow.push({
        step: i,
        phase: "result",
        tool: ev.toolName ?? "unknown",
        resultPreview: preview + ((ev.content?.length ?? 0) > 120 ? "…" : ""),
        ok: !/^error\b/i.test((ev.content ?? "").trim()),
      });
    }
    if (ev.role === "evidence") {
      try {
        flow.push({ phase: "evidence", data: JSON.parse(ev.content) });
      } catch {
        flow.push({ phase: "evidence", raw: ev.content?.slice(0, 200) });
      }
    }
  }
  return flow;
}

async function runAgentStream() {
  const t0 = performance.now();
  const res = await fetch(`${BASE}/agent/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: QUESTION }],
    }),
  });
  const body = await res.text();
  const t1 = performance.now();
  const events = parseSseBlocks(body);
  const evidenceEv = events.find((e) => e.role === "evidence");
  let evidence = null;
  if (evidenceEv?.content) {
    try {
      evidence = JSON.parse(evidenceEv.content);
    } catch {
      evidence = null;
    }
  }
  return {
    mode: "agent",
    ok: res.ok,
    status: res.status,
    durationMs: Math.round(t1 - t0),
    toolStarts: events.filter((e) => e.role === "tool_start").length,
    toolResults: events.filter((e) => e.role === "tool").length,
    flow: toolFlow(events),
    answer: extractAnswer(events),
    evidence,
    eventRoles: [...new Set(events.map((e) => e.role))],
  };
}

async function runMcpFinal() {
  const t0 = performance.now();
  const res = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "compare-modes",
      method: "tools/call",
      params: {
        name: "ask_llm_wiki",
        arguments: { question: QUESTION, repo_scope: "chatkit-middleware" },
      },
    }),
  });
  const body = await res.text();
  const t1 = performance.now();
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    json = { raw: body };
  }
  const answer = json?.result?.content?.[0]?.text ?? json?.error?.message ?? body;
  const runId = null;
  let runDetail = null;
  try {
    const runsRes = await fetch(`${BASE}/api/runs?limit=1`);
    const runsBody = await runsRes.json();
    const latest = runsBody.runs?.[0];
    if (latest?.runId) {
      const detailRes = await fetch(`${BASE}/api/runs/${encodeURIComponent(latest.runId)}`);
      runDetail = await detailRes.json();
    }
  } catch {
    // optional
  }
  return {
    mode: "mcp",
    ok: res.ok && !json?.result?.isError,
    status: res.status,
    durationMs: Math.round(t1 - t0),
    answer,
    runDetail,
    isError: json?.result?.isError ?? false,
  };
}

async function main() {
  console.log("Question:", QUESTION);
  console.log("Base URL:", BASE);
  console.log("---");

  console.log("\n[1/2] Agent Stream …");
  const agent = await runAgentStream();
  console.log(JSON.stringify(agent, null, 2));

  console.log("\n[2/2] MCP Final …");
  const mcp = await runMcpFinal();
  const mcpOut = {
    mode: mcp.mode,
    ok: mcp.ok,
    status: mcp.status,
    durationMs: mcp.durationMs,
    isError: mcp.isError,
    answer: mcp.answer,
    toolCount: mcp.runDetail?.toolCount,
    evidenceCount: mcp.runDetail?.evidenceCount,
    citationOrphans: mcp.runDetail?.citationOrphans,
    retrievalPlanKind: mcp.runDetail?.retrievalPlanKind,
    budgetStopReason: mcp.runDetail?.budgetStopReason,
    toolCalls: mcp.runDetail?.toolCalls?.map((t, idx) => ({
      step: idx + 1,
      name: t.name,
      args: t.args,
      blocked: t.blocked,
      emptyResult: t.emptyResult,
      duplicate: t.duplicate,
    })),
  };
  console.log(JSON.stringify(mcpOut, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

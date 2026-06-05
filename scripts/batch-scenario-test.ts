/**
 * Batch manual scenario smoke — calls POST /agent/run and checks final answer.
 * Usage: npx tsx scripts/batch-scenario-test.ts
 */
import { loadConfig, loadEnvFile } from "../src/config.js";

interface Scenario {
  id: string;
  question: string;
  expectInAnswer: RegExp[];
}

const SCENARIOS: Scenario[] = [
  {
    id: "V2",
    question: "finclaw 的 agent loop 入口在哪个文件？简要说明调用链。",
    expectInAnswer: [/agent.?loop|run_agent_loop|main\.rs|lib\.rs/i],
  },
  {
    id: "V1",
    question: "chatkit-middleware 有哪些主要服务或模块？列出几个核心目录即可。",
    expectInAnswer: [/chatkit|middleware|src|service|module/i],
  },
  {
    id: "V3",
    question: "chatkit-web 管理端 LLM 配置页面对应哪个 React 页面文件？",
    expectInAnswer: [/LLM|Config|Page|chatkit-web|\.tsx/i],
  },
  {
    id: "V4",
    question: "chatkit-middleware 是否实现了区块链共识算法？先搜索再回答。",
    expectInAnswer: [/未找到|没有|不存在|no match|not found|不支持|共识|consensus/i],
  },
];

function parseSseEvents(raw: string): Array<{ role: string; content?: string; toolName?: string }> {
  const out: Array<{ role: string; content?: string; toolName?: string }> = [];
  for (const block of raw.split("\n\n")) {
    const line = block.split("\n").find((l) => l.startsWith("data: "));
    if (!line) continue;
    try {
      out.push(JSON.parse(line.slice("data: ".length)));
    } catch {
      /* skip */
    }
  }
  return out;
}

async function runScenario(baseUrl: string, s: Scenario): Promise<{
  id: string;
  ok: boolean;
  tools: string[];
  answerLen: number;
  matched: boolean;
  snippet: string;
  ms: number;
}> {
  const started = Date.now();
  const res = await fetch(`${baseUrl}/agent/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: s.question }] }),
  });
  if (!res.ok) {
    return {
      id: s.id,
      ok: false,
      tools: [],
      answerLen: 0,
      matched: false,
      snippet: `HTTP ${res.status}`,
      ms: Date.now() - started,
    };
  }

  const raw = await res.text();
  const events = parseSseEvents(raw);
  const tools = [
    ...new Set(
      events.filter((e) => e.role === "tool" || e.role === "tool_start").map((e) => e.toolName ?? "?"),
    ),
  ];

  let answer = "";
  for (const e of events) {
    if ((e.role === "assistant_final" || e.role === "done") && e.content?.trim()) {
      answer = e.content;
    }
  }

  const matched = s.expectInAnswer.some((re) => re.test(answer));
  return {
    id: s.id,
    ok: answer.length > 50 && tools.length > 0,
    tools,
    answerLen: answer.length,
    matched,
    snippet: answer.slice(0, 120).replace(/\n/g, " "),
    ms: Date.now() - started,
  };
}

async function main(): Promise<void> {
  loadEnvFile();
  loadConfig(); // validate env
  const baseUrl = process.env.LLM_WIKI_TEST_URL ?? "http://127.0.0.1:3001";

  console.log(`Testing ${SCENARIOS.length} scenarios against ${baseUrl}\n`);

  const results = [];
  for (const s of SCENARIOS) {
    process.stdout.write(`${s.id} running... `);
    const r = await runScenario(baseUrl, s);
    results.push(r);
    const status = r.ok && r.matched ? "PASS" : "FAIL";
    console.log(`${status} (${(r.ms / 1000).toFixed(1)}s, tools: ${r.tools.join(", ")}, ${r.answerLen} chars)`);
    if (status === "FAIL") console.log(`  snippet: ${r.snippet}`);
  }

  const passed = results.filter((r) => r.ok && r.matched).length;
  console.log(`\n${passed}/${results.length} scenarios passed`);
  if (passed < results.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

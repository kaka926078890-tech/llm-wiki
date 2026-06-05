import { loadConfig } from "../src/config.js";
import { buildLoop } from "../src/loop-runner.js";

async function main(): Promise<void> {
  const cfg = loadConfig();
  const loop = buildLoop(cfg);
  const question = process.argv[2] ?? "finclaw agent loop 入口在哪？";
  const events: string[] = [];
  let error: string | undefined;

  try {
    for await (const ev of loop.step(question)) {
      events.push(ev.role);
      if (events.length <= 10) {
        console.log(
          JSON.stringify({
            role: ev.role,
            toolName: ev.toolName,
            contentLen: ev.content?.length ?? 0,
            hasReasoning: Boolean(ev.reasoningDelta),
          }),
        );
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    console.error("ERROR:", error);
    process.exit(1);
  }

  console.log("question:", question);
  console.log("total events:", events.length);
  console.log("roles:", [...new Set(events)]);
  if (events.length === 0) {
    console.error("FAIL: zero events from loop.step");
    process.exit(1);
  }
}

main();

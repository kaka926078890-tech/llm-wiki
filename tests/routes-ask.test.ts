import http from "node:http";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { getProjectRoot, type LlmWikiConfig } from "../src/config.js";
import type { LoopEvent } from "../src/core/loop/types.js";
import type { CacheFirstLoop } from "../src/loop-runner.js";

function testConfig(): LlmWikiConfig {
  const projectRoot = getProjectRoot();
  return {
    projectRoot,
    deepseekApiKey: "test-key",
    deepseekBaseUrl: "https://api.deepseek.com",
    deepseekModel: "deepseek-chat",
    port: 0,
    host: "127.0.0.1",
    repos: {
      middleware: projectRoot,
      web: projectRoot,
      finclaw: projectRoot,
    },
  };
}

function parseSsePayloads(body: string): LoopEvent[] {
  const events: LoopEvent[] = [];
  for (const block of body.split("\n\n")) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const dataLine = trimmed.split("\n").find((l) => l.startsWith("data: "));
    if (dataLine) {
      events.push(JSON.parse(dataLine.slice("data: ".length)) as LoopEvent);
    }
  }
  return events;
}

function mockLoop(events: LoopEvent[], opts?: { delayMs?: number }): CacheFirstLoop {
  const abort = vi.fn();
  const step = vi.fn(async function* () {
    for (const ev of events) {
      if (opts?.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      yield ev;
    }
  });
  return { abort, step } as unknown as CacheFirstLoop;
}

describe("routes-ask", () => {
  it("P2-ASK-01 empty body returns 400", async () => {
    const app = await createApp({
      config: testConfig(),
      buildLoop: () => mockLoop([]),
    });
    const res = await app.inject({
      method: "POST",
      url: "/agent/run",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("P2-ASK-02 mock loop streams tool_start and done", async () => {
    const events: LoopEvent[] = [
      {
        turn: 1,
        role: "tool_start",
        content: "",
        toolName: "search_files",
        callId: "c1",
      },
      { turn: 1, role: "done", content: "" },
    ];
    const app = await createApp({
      config: testConfig(),
      buildLoop: () => mockLoop(events),
    });

    const res = await app.inject({
      method: "POST",
      url: "/agent/run",
      headers: { "content-type": "application/json" },
      payload: {
        messages: [{ role: "user", content: "hello" }],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    const parsed = parseSsePayloads(res.body);
    expect(parsed.some((e) => e.role === "tool_start")).toBe(true);
    expect(parsed.some((e) => e.role === "done")).toBe(true);
    await app.close();
  });

  it("P2-ASK-03 client abort does not hang the HTTP route", async () => {
    let releaseStep: (() => void) | undefined;
    const stepGate = new Promise<void>((resolve) => {
      releaseStep = resolve;
    });

    const abort = vi.fn();
    const loop = {
      abort,
      async *step() {
        yield {
          turn: 1,
          role: "tool_start",
          content: "",
          toolName: "search_files",
          callId: "c1",
        } satisfies LoopEvent;
        await stepGate;
        yield { turn: 1, role: "done", content: "" } satisfies LoopEvent;
      },
    } as unknown as CacheFirstLoop;

    const app = await createApp({
      config: testConfig(),
      buildLoop: () => loop,
    });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address();
    const port =
      typeof addr === "object" && addr !== null && "port" in addr ? addr.port : 0;

    await new Promise<void>((resolve, reject) => {
      const payload = JSON.stringify({
        messages: [{ role: "user", content: "abort me" }],
      });
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          method: "POST",
          path: "/agent/run",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          },
        },
        (res) => {
          let gotChunk = false;
          res.on("data", () => {
            if (gotChunk) return;
            gotChunk = true;
            req.destroy();
            releaseStep?.();
          });
          res.on("end", resolve);
          res.on("error", (err: NodeJS.ErrnoException) => {
            if (err.code === "ECONNRESET" || err.message === "aborted") resolve();
            else reject(err);
          });
        },
      );
      req.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "ECONNRESET") resolve();
        else reject(err);
      });
      req.write(payload);
      req.end();
    });

    await app.close();
  });

  it("P2-ASK-04 real HTTP request streams data without treating request close as abort", async () => {
    const abort = vi.fn();
    const loop = {
      abort,
      async *step() {
        yield {
          turn: 1,
          role: "assistant_final",
          content: "hello over real http",
        } satisfies LoopEvent;
        yield { turn: 1, role: "done", content: "" } satisfies LoopEvent;
      },
    } as unknown as CacheFirstLoop;

    const app = await createApp({
      config: testConfig(),
      buildLoop: () => loop,
    });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address();
    const port =
      typeof addr === "object" && addr !== null && "port" in addr ? addr.port : 0;

    const body = await new Promise<string>((resolve, reject) => {
      const payload = JSON.stringify({
        messages: [{ role: "user", content: "hello" }],
      });
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          method: "POST",
          path: "/agent/run",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          },
        },
        (res) => {
          let chunks = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            chunks += chunk;
          });
          res.on("end", () => resolve(chunks));
          res.on("error", reject);
        },
      );
      req.on("error", reject);
      req.write(payload);
      req.end();
    });

    expect(body).toContain("hello over real http");
    expect(abort).not.toHaveBeenCalled();
    await app.close();
  });
});

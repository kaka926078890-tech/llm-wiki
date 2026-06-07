import { useCallback, useRef, useState } from "react";

import type { ChatMessage } from "./lib/loop-types";
import { callMcpAsk } from "./lib/mcp-client";
import { createAssistantState, reduceLoopEvent } from "./lib/sse-reducer";
import { streamAgentRun } from "./lib/sse-client";
import { Composer } from "./ui/composer";
import { AssistantMsg, UserMsg } from "./ui/thread";

let nextId = 0;
function uid(): string {
  return `m-${++nextId}`;
}

type RunMode = "agent" | "mcp";

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [runMode, setRunMode] = useState<RunMode>("agent");
  const [repoScope, setRepoScope] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToEnd = () => {
    requestAnimationFrame(() => {
      threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  };

  const onSubmit = useCallback(async () => {
    const text = draft.trim();
    if (!text || pending) return;

    setDraft("");
    setError(null);
    setPending(true);

    const userMsg: ChatMessage = { id: uid(), role: "user", content: text };
    const assistantId = uid();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      segments: [],
      pending: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    scrollToEnd();

    const history = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.role === "user" ? m.content : m.segments.filter((s) => s.kind === "text").map((s) => s.text).join("\n\n"),
    }));

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    if (runMode === "mcp") {
      try {
        const answer = await callMcpAsk({
          question: text,
          repoScope,
          signal: ac.signal,
        });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId && m.role === "assistant"
              ? {
                  ...m,
                  segments: [{ kind: "text", text: answer || "(empty MCP response)" }],
                  pending: false,
                }
              : m,
          ),
        );
      } catch (err) {
        if (ac.signal.aborted) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId && m.role === "assistant"
              ? {
                  ...m,
                  pending: false,
                  segments: [{ kind: "text", text: `**MCP Error:** ${msg}` }],
                }
              : m,
          ),
        );
      } finally {
        setPending(false);
        abortRef.current = null;
        scrollToEnd();
      }
      return;
    }

    let state = createAssistantState();

    try {
      await streamAgentRun({
        messages: history,
        signal: ac.signal,
        onEvent: (ev) => {
          state = reduceLoopEvent(state, ev);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId && m.role === "assistant"
                ? { ...m, segments: state.segments, pending: state.pending }
                : m,
            ),
          );
          scrollToEnd();
        },
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId && m.role === "assistant" ? { ...m, pending: false } : m,
        ),
      );
    } catch (err) {
      if (ac.signal.aborted) return;
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId && m.role === "assistant"
            ? {
                ...m,
                pending: false,
                segments: [
                  ...m.segments,
                  { kind: "text" as const, text: `\n\n**Error:** ${msg}` },
                ],
              }
            : m,
        ),
      );
    } finally {
      setPending(false);
      abortRef.current = null;
    }
  }, [draft, messages, pending, repoScope, runMode]);

  const onAbort = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPending(false);
    setMessages((prev) =>
      prev.map((m) => (m.role === "assistant" && m.pending ? { ...m, pending: false } : m)),
    );
  };

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1>LLM Wiki</h1>
          <p>Code Q&amp;A across middleware, web, and finclaw</p>
        </div>
        <div className="mode-panel" aria-label="Run mode">
          <div className="mode-tabs">
            <button
              type="button"
              className={runMode === "agent" ? "is-active" : ""}
              onClick={() => setRunMode("agent")}
            >
              Agent Stream
            </button>
            <button
              type="button"
              className={runMode === "mcp" ? "is-active" : ""}
              onClick={() => setRunMode("mcp")}
            >
              MCP Final
            </button>
          </div>
          {runMode === "mcp" ? (
            <select
              value={repoScope}
              onChange={(e) => setRepoScope(e.target.value)}
              aria-label="Repository scope"
            >
              <option value="">auto scope</option>
              <option value="chatkit-middleware">chatkit-middleware</option>
              <option value="chatkit-web">chatkit-web</option>
              <option value="finclaw">finclaw</option>
              <option value="all">all</option>
            </select>
          ) : null}
        </div>
      </header>

      <main className="app__thread" aria-label="Conversation">
        {messages.length === 0 ? (
          <p className="app__empty">
            {runMode === "mcp"
              ? "Test the final MCP answer returned by ask_llm_wiki."
              : "Ask a question about the three code repositories."}
          </p>
        ) : null}
        {messages.map((m) =>
          m.role === "user" ? (
            <UserMsg key={m.id} text={m.content} />
          ) : (
            <AssistantMsg key={m.id} segments={m.segments} pending={m.pending} />
          ),
        )}
        {error ? <p className="app__error">{error}</p> : null}
        <div ref={threadEndRef} />
      </main>

      <Composer
        draft={draft}
        setDraft={setDraft}
        onSend={() => void onSubmit()}
        onAbort={onAbort}
        disabled={false}
        busy={pending}
        textareaRef={textareaRef}
      />
    </div>
  );
}

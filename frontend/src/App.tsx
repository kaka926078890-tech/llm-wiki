import { useCallback, useRef, useState } from "react";

import type { ChatMessage } from "./lib/loop-types";
import { createAssistantState, reduceLoopEvent } from "./lib/sse-reducer";
import { streamAgentRun } from "./lib/sse-client";
import { Composer } from "./ui/composer";
import { AssistantMsg, UserMsg } from "./ui/thread";

let nextId = 0;
function uid(): string {
  return `m-${++nextId}`;
}

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
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
  }, [draft, messages, pending]);

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
        <h1>LLM Wiki</h1>
        <p>Code Q&amp;A across middleware, web, and finclaw</p>
      </header>

      <main className="app__thread" aria-label="Conversation">
        {messages.length === 0 ? (
          <p className="app__empty">Ask a question about the three code repositories.</p>
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

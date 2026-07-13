import { useCallback, useRef, useState } from "react";

import type { ChatMessage } from "./lib/loop-types";
import { callMcpAsk } from "./lib/mcp-client";
import { resolveAnswerForSave } from "./lib/answer-text";
import { fetchMcpRunEvidence } from "./lib/fetch-mcp-run";
import { createAssistantState, reduceLoopEvent } from "./lib/sse-reducer";
import { streamAgentRun } from "./lib/sse-client";
import { Composer } from "./ui/composer";
import { IndexPanel } from "./ui/index-panel";
import { KnowledgePanel } from "./ui/knowledge-panel";
import { MapPanel } from "./ui/map-panel";
import { RunsPanel } from "./ui/runs-panel";
import { AssistantMsg, UserMsg } from "./ui/thread";

type AppView = "chat" | "runs" | "index" | "knowledge" | "map";

let nextId = 0;
function uid(): string {
  return `m-${++nextId}`;
}

type RunMode = "agent" | "mcp";

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [runMode, setRunMode] = useState<RunMode>("agent");
  const [view, setView] = useState<AppView>("chat");
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
        const mcpEvidence = await fetchMcpRunEvidence(text);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId && m.role === "assistant"
              ? {
                  ...m,
                  segments: [{ kind: "text", text: answer || "(empty MCP response)" }],
                  pending: false,
                  evidenceMeta: mcpEvidence
                    ? {
                        runId: mcpEvidence.runId,
                        items: mcpEvidence.items,
                      }
                    : undefined,
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
        messages: [{ role: "user", content: text }],
        signal: ac.signal,
        onEvent: (ev) => {
          state = reduceLoopEvent(state, ev);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId && m.role === "assistant"
                ? {
                    ...m,
                    segments: state.segments,
                    pending: state.pending,
                    evidenceMeta: state.evidenceMeta,
                  }
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

  const saveKnowledge = useCallback(async (assistantId: string) => {
    const assistantIdx = messages.findIndex((m) => m.id === assistantId);
    if (assistantIdx < 0) return;
    const assistant = messages[assistantIdx];
    if (assistant.role !== "assistant" || assistant.savedKnowledge) return;

    let userQuestion = "";
    for (let i = assistantIdx - 1; i >= 0; i -= 1) {
      const msg = messages[i];
      if (msg?.role === "user") {
        userQuestion = msg.content;
        break;
      }
    }
    if (!userQuestion) return;

    const answer = await resolveAnswerForSave({
      segments: assistant.segments,
      runId: assistant.evidenceMeta?.runId,
    });
    if (!answer) return;

    const evidence = (assistant.evidenceMeta?.items ?? [])
      .filter((item) => item.path)
      .map((item) => ({
        path: item.path!,
        startLine: item.line,
        endLine: item.lineEnd,
        hash: item.excerptHash,
        redacted: item.redaction === "redact" || item.redaction === "metadata_only",
      }));

    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: userQuestion,
          answer,
          evidence,
          sourceRunId: assistant.evidenceMeta?.runId,
          confidence: "verified",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { card?: { id: string }; merged?: boolean };
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId && m.role === "assistant"
            ? { ...m, savedKnowledge: true, knowledgeMerged: body.merged === true }
            : m,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [messages]);

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
              className={view === "chat" ? "is-active" : ""}
              onClick={() => setView("chat")}
            >
              Chat
            </button>
            <button
              type="button"
              className={view === "runs" ? "is-active" : ""}
              onClick={() => setView("runs")}
            >
              Runs
            </button>
            <button
              type="button"
              className={view === "index" ? "is-active" : ""}
              onClick={() => setView("index")}
            >
              Index
            </button>
            <button
              type="button"
              className={view === "map" ? "is-active" : ""}
              onClick={() => setView("map")}
            >
              Map
            </button>
            <button
              type="button"
              className={view === "knowledge" ? "is-active" : ""}
              onClick={() => setView("knowledge")}
            >
              Knowledge
            </button>
          </div>
          {view === "chat" ? (
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
          ) : null}
          {view === "chat" && runMode === "mcp" ? (
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

      <main
        className="app__thread"
        aria-label={
          view === "chat"
            ? "Conversation"
            : view === "runs"
              ? "Debug runs"
              : view === "knowledge"
                ? "Knowledge cards"
                : view === "map"
                  ? "Project map"
                  : "Index status"
        }
      >
        {view === "runs" ? (
          <RunsPanel />
        ) : view === "index" ? (
          <IndexPanel />
        ) : view === "knowledge" ? (
          <KnowledgePanel />
        ) : view === "map" ? (
          <MapPanel />
        ) : (
        <>
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
            <AssistantMsg
              key={m.id}
              segments={m.segments}
              pending={m.pending}
              evidenceSummary={m.evidenceMeta?.summary}
              runId={m.evidenceMeta?.runId}
              onSaveKnowledge={
                !m.pending && m.evidenceMeta?.runId
                  ? () => void saveKnowledge(m.id)
                  : undefined
              }
              saveDisabled={m.savedKnowledge}
              saveLabel={m.savedKnowledge ? (m.knowledgeMerged ? "Merged" : "Saved") : undefined}
            />
          ),
        )}
        {error ? <p className="app__error">{error}</p> : null}
        <div ref={threadEndRef} />
        </>
        )}
      </main>

      {view === "chat" ? (
      <Composer
        draft={draft}
        setDraft={setDraft}
        onSend={() => void onSubmit()}
        onAbort={onAbort}
        disabled={false}
        busy={pending}
        textareaRef={textareaRef}
      />
      ) : null}
    </div>
  );
}

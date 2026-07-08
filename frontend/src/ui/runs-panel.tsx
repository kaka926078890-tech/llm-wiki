import { useCallback, useEffect, useRef, useState } from "react";

import { cleanStreamedAnswer } from "../lib/answer-text";
import { AssistantText } from "./cards";

export interface RunListItem {
  runId: string;
  startedAt: string;
  endedAt: string;
  question: string;
  surface: string;
  answerProfile: string;
  toolCount: number;
  emptyResultCount: number;
  duplicateCallCount: number;
  budgetStopReason?: string;
  evidenceCount: number;
  citationOrphans: number;
  retrievalPlanKind?: string;
}

interface RunDetail extends RunListItem {
  finalAnswer?: string;
  knowledgeCardId?: string;
  evidenceBundle?: {
    items: Array<{
      id: string;
      tool: string;
      path?: string;
      line?: number;
      lineEnd?: number;
      excerptHash?: string;
      redaction: string;
    }>;
  };
  toolCalls?: Array<{
    name: string;
    blocked?: string;
    args?: Record<string, unknown>;
  }>;
}

interface KnowledgeCardRef {
  id: string;
  question: string;
  confidence: string;
}

function RunDetailBody({
  detail,
  linkedCards,
  saving,
  saved,
  onSave,
}: {
  detail: RunDetail;
  linkedCards: KnowledgeCardRef[];
  saving: boolean;
  saved: boolean;
  onSave: () => void;
}) {
  const durationMs =
    new Date(detail.endedAt).getTime() - new Date(detail.startedAt).getTime();
  const answer = detail.finalAnswer ? cleanStreamedAnswer(detail.finalAnswer) : "";

  return (
    <div className="runs-detail">
      <div className="runs-detail__head">
        <h3>Run {detail.runId.slice(0, 8)}</h3>
        <span className="runs-detail__meta">
          {detail.surface} · {(durationMs / 1000).toFixed(1)}s · {detail.toolCount} tools
          · {detail.evidenceCount} evidence
          {detail.budgetStopReason ? ` · stopped: ${detail.budgetStopReason}` : ""}
          {detail.knowledgeCardId ? ` · card ${detail.knowledgeCardId}` : ""}
        </span>
      </div>
      {answer ? (
        <div className="runs-detail__answer">
          <AssistantText text={answer} />
        </div>
      ) : (
        <p className="app__empty">No final answer recorded for this run.</p>
      )}
      <div className="runs-detail__actions">
        <button type="button" onClick={onSave} disabled={saving || saved || !answer}>
          {saved ? "Saved to Knowledge" : saving ? "Saving…" : "Save as knowledge"}
        </button>
        {linkedCards.length > 0 ? (
          <span className="runs-detail__links">
            Linked cards:{" "}
            {linkedCards.map((card) => (
              <code key={card.id} className="runs-detail__card-id">
                {card.id} ({card.confidence})
              </code>
            ))}
          </span>
        ) : null}
      </div>
      <details className="runs-detail__raw">
        <summary>Raw telemetry JSON</summary>
        <pre>{JSON.stringify(detail, null, 2)}</pre>
      </details>
    </div>
  );
}

export function RunsPanel() {
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [linkedCards, setLinkedCards] = useState<KnowledgeCardRef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const itemRefs = useRef<Record<string, HTMLLIElement | null>>({});

  const loadRuns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/runs?limit=30");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { runs: RunListItem[] };
      setRuns(body.runs);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const toggleRun = async (runId: string) => {
    if (expandedRunId === runId) {
      setExpandedRunId(null);
      setDetail(null);
      setLinkedCards([]);
      setSaved(false);
      return;
    }

    setExpandedRunId(runId);
    setDetail(null);
    setLinkedCards([]);
    setSaved(false);
    setDetailLoading(true);
    setError(null);

    requestAnimationFrame(() => {
      itemRefs.current[runId]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });

    try {
      const res = await fetch(`/api/runs/${encodeURIComponent(runId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const loaded = (await res.json()) as RunDetail;
      setDetail(loaded);

      const cardsRes = await fetch(
        `/api/knowledge?sourceRunId=${encodeURIComponent(runId)}`,
      );
      if (cardsRes.ok) {
        const cardsBody = (await cardsRes.json()) as { cards: KnowledgeCardRef[] };
        setLinkedCards(cardsBody.cards);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setExpandedRunId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const saveAsKnowledge = async () => {
    if (!detail?.finalAnswer?.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const evidence = (detail.evidenceBundle?.items ?? [])
        .filter((item) => item.path)
        .map((item) => ({
          path: item.path!,
          startLine: item.line,
          endLine: item.lineEnd,
          hash: item.excerptHash,
          redacted: item.redaction === "redact" || item.redaction === "metadata_only",
        }));
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: detail.question,
          answer: cleanStreamedAnswer(detail.finalAnswer),
          evidence,
          sourceRunId: detail.runId,
          confidence: "verified",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const card = (await res.json()) as KnowledgeCardRef;
      setSaved(true);
      setLinkedCards((prev) => [...prev.filter((c) => c.id !== card.id), card]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="runs-panel">
      <div className="runs-panel__toolbar">
        <h2>Debug Runs</h2>
        <button type="button" onClick={() => void loadRuns()} disabled={loading}>
          Refresh
        </button>
      </div>
      {loading ? <p className="app__empty">Loading runs…</p> : null}
      {error ? <p className="app__error">{error}</p> : null}
      {!loading && runs.length === 0 ? (
        <p className="app__empty">No runs yet. Ask a question to create telemetry.</p>
      ) : null}
      <ul className="runs-list">
        {runs.map((run) => {
          const expanded = expandedRunId === run.runId;
          return (
            <li
              key={run.runId}
              ref={(node) => {
                itemRefs.current[run.runId] = node;
              }}
              className={`runs-list__item${expanded ? " is-expanded" : ""}`}
            >
              <button
                type="button"
                className={`runs-list__btn${expanded ? " is-active" : ""}`}
                aria-expanded={expanded}
                onClick={() => void toggleRun(run.runId)}
              >
                <span className="runs-list__chevron" aria-hidden>
                  {expanded ? "▾" : "▸"}
                </span>
                <span className="runs-list__q">{run.question}</span>
                <span className="runs-list__meta">
                  {run.retrievalPlanKind ?? "general"} · {run.toolCount} tools
                  {run.budgetStopReason ? ` · stopped: ${run.budgetStopReason}` : ""}
                  {run.citationOrphans > 0 ? ` · ${run.citationOrphans} orphan cites` : ""}
                </span>
                <span className="runs-list__time">{new Date(run.startedAt).toLocaleString()}</span>
              </button>
              {expanded ? (
                detailLoading || detail?.runId !== run.runId ? (
                  <p className="runs-detail runs-detail--loading app__empty">Loading run…</p>
                ) : (
                  <RunDetailBody
                    detail={detail}
                    linkedCards={linkedCards}
                    saving={saving}
                    saved={saved}
                    onSave={() => void saveAsKnowledge()}
                  />
                )
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";

export interface KnowledgeCardView {
  id: string;
  question: string;
  questionAliases?: string[];
  answer: string;
  repoScope: string[];
  evidence: Array<{
    path: string;
    startLine?: number;
    endLine?: number;
    hash?: string;
    redacted: boolean;
  }>;
  confidence: "verified" | "draft" | "rejected";
  createdAt: string;
  updatedAt: string;
  staleAt?: string;
  staleReasons?: string[];
  sourceRunId?: string;
  hitCount?: number;
  lastHitAt?: string;
}

export function KnowledgePanel() {
  const [cards, setCards] = useState<KnowledgeCardView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadCards = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/knowledge");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { cards: KnowledgeCardView[] };
      setCards(body.cards);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  const refreshStale = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/knowledge/refresh-stale", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadCards();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  };

  const setConfidence = async (id: string, confidence: KnowledgeCardView["confidence"]) => {
    setError(null);
    try {
      const res = await fetch(`/api/knowledge/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confidence }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadCards();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="knowledge-panel">
      <div className="knowledge-panel__toolbar">
        <h2>Knowledge Cards</h2>
        <div className="knowledge-panel__actions">
          <button type="button" onClick={() => void refreshStale()} disabled={refreshing}>
            {refreshing ? "Checking…" : "Check stale"}
          </button>
          <button type="button" onClick={() => void loadCards()} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>
      {loading ? <p className="app__empty">Loading knowledge cards…</p> : null}
      {error ? <p className="app__error">{error}</p> : null}
      {!loading && cards.length === 0 ? (
        <p className="app__empty">
          No saved knowledge yet. Save a verified answer from Chat (Agent or MCP) after a run completes.
        </p>
      ) : null}
      <ul className="knowledge-list">
        {cards.map((card) => (
          <li key={card.id} className="knowledge-list__item">
            <div className="knowledge-list__head">
              <span className={`knowledge-badge knowledge-badge--${card.confidence}`}>
                {card.confidence}
              </span>
              {card.staleAt ? <span className="knowledge-badge knowledge-badge--stale">stale</span> : null}
              {card.hitCount ? (
                <span className="knowledge-badge knowledge-badge--hits">{card.hitCount} hits</span>
              ) : null}
              <span className="knowledge-list__time">{new Date(card.updatedAt).toLocaleString()}</span>
            </div>
            <p className="knowledge-list__q">{card.question}</p>
            {card.questionAliases?.length ? (
              <p className="knowledge-list__meta">
                Also matches: {card.questionAliases.join(" · ")}
              </p>
            ) : null}
            <p className="knowledge-list__a">{card.answer}</p>
            {card.evidence.length > 0 ? (
              <p className="knowledge-list__meta">
                Evidence:{" "}
                {card.evidence
                  .map((item) => `${item.path}${item.startLine ? `:${item.startLine}` : ""}`)
                  .join(" · ")}
              </p>
            ) : null}
            {card.lastHitAt ? (
              <p className="knowledge-list__meta">Last fast-path hit: {new Date(card.lastHitAt).toLocaleString()}</p>
            ) : null}
            {card.staleReasons?.length ? (
              <p className="knowledge-list__meta knowledge-list__meta--warn">
                Stale: {card.staleReasons.join(", ")}
              </p>
            ) : null}
            <div className="knowledge-list__actions">
              <button type="button" onClick={() => void setConfidence(card.id, "verified")}>
                Verify
              </button>
              <button type="button" onClick={() => void setConfidence(card.id, "draft")}>
                Re-verify
              </button>
              <button type="button" onClick={() => void setConfidence(card.id, "rejected")}>
                Mark wrong
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

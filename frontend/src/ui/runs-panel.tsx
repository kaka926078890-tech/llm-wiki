import { useCallback, useEffect, useState } from "react";

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

export function RunsPanel() {
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [selected, setSelected] = useState<unknown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  const loadDetail = async (runId: string) => {
    try {
      const res = await fetch(`/api/runs/${encodeURIComponent(runId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSelected(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
        {runs.map((run) => (
          <li key={run.runId} className="runs-list__item">
            <button type="button" className="runs-list__btn" onClick={() => void loadDetail(run.runId)}>
              <span className="runs-list__q">{run.question}</span>
              <span className="runs-list__meta">
                {run.retrievalPlanKind ?? "general"} · {run.toolCount} tools
                {run.budgetStopReason ? ` · stopped: ${run.budgetStopReason}` : ""}
                {run.citationOrphans > 0 ? ` · ${run.citationOrphans} orphan cites` : ""}
              </span>
              <span className="runs-list__time">{new Date(run.startedAt).toLocaleString()}</span>
            </button>
          </li>
        ))}
      </ul>
      {selected ? (
        <pre className="runs-detail">{JSON.stringify(selected, null, 2)}</pre>
      ) : null}
    </div>
  );
}

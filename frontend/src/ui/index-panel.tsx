import { useCallback, useEffect, useRef, useState } from "react";

export interface IndexProjectStatus {
  repo: string;
  indexed: boolean;
  projectName?: string;
  nodes?: number;
  edges?: number;
  gitHeadShort?: string;
  indexedGitHead?: string;
  indexedAt?: string;
  changedFileCount: number;
  changedFiles: string[];
  stale: boolean;
  staleReason?: "not_indexed" | "git_changes";
  indexStatus?: string;
}

export interface CbmSyncJob {
  state: "idle" | "running" | "succeeded" | "failed";
  startedAt?: string;
  endedAt?: string;
  exitCode?: number;
  log: string[];
}

export interface IndexStatusResponse {
  cbm: {
    binaryReady: boolean;
    cbmSearchReady: boolean;
    anyStale: boolean;
    allIndexed: boolean;
    lastSyncAt?: string;
    projects: IndexProjectStatus[];
  };
  syncJob: CbmSyncJob;
  syncHint?: string;
}

function staleLabel(project: IndexProjectStatus): string {
  if (!project.indexed) return "Not indexed";
  if (project.staleReason === "git_changes") {
    return project.changedFileCount > 0
      ? `Stale (${project.changedFileCount} changed file${project.changedFileCount === 1 ? "" : "s"})`
      : "Stale";
  }
  return "Fresh";
}

export function IndexPanel() {
  const [status, setStatus] = useState<IndexStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/index/status");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as IndexStatusResponse;
      setStatus(body);
      setSyncing(body.syncJob.state === "running");
      return body;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [load]);

  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (!syncing) return;
    pollRef.current = setInterval(() => {
      void load();
    }, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [syncing, load]);

  const startSync = async () => {
    setError(null);
    try {
      const res = await fetch("/api/index/sync", { method: "POST" });
      const body = (await res.json()) as { error?: string; job: CbmSyncJob };
      if (!res.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setSyncing(body.job.state === "running");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const cbm = status?.cbm;
  const syncJob = status?.syncJob;
  const canSync =
    cbm?.binaryReady &&
    syncJob?.state !== "running" &&
    (cbm.anyStale || !cbm.allIndexed);

  return (
    <div className="index-panel">
      <div className="index-panel__toolbar">
        <h2>CBM Index</h2>
        <div className="index-panel__actions">
          <button
            type="button"
            className="index-sync-btn"
            onClick={() => void startSync()}
            disabled={!canSync || syncing}
          >
            {syncing ? "Re-indexing…" : "Re-index"}
          </button>
          <button type="button" onClick={() => void load()} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>
      {loading && !status ? <p className="app__empty">Loading index status…</p> : null}
      {error ? <p className="app__error">{error}</p> : null}
      {cbm ? (
        <>
          <div className="index-summary">
            <span className={cbm.cbmSearchReady ? "index-badge index-badge--ok" : "index-badge index-badge--warn"}>
              {cbm.cbmSearchReady ? "CBM ready" : "CBM unavailable"}
            </span>
            <span
              className={
                syncing
                  ? "index-badge index-badge--warn"
                  : cbm.anyStale
                    ? "index-badge index-badge--warn"
                    : "index-badge index-badge--ok"
              }
            >
              {syncing ? "Syncing" : cbm.anyStale ? "Stale index" : "All fresh"}
            </span>
            {cbm.lastSyncAt ? (
              <span className="index-summary__meta">
                Last sync {new Date(cbm.lastSyncAt).toLocaleString()}
              </span>
            ) : null}
          </div>
          {status?.syncHint ? <p className="index-hint">{status.syncHint}</p> : null}
          {syncJob && syncJob.log.length > 0 ? (
            <pre className="index-sync-log">{syncJob.log.slice(-8).join("\n")}</pre>
          ) : null}
          <ul className="index-list">
            {cbm.projects.map((project) => (
              <li
                key={project.repo}
                className={`index-list__item${project.stale ? " index-list__item--stale" : ""}`}
              >
                <div className="index-list__head">
                  <strong>{project.repo}</strong>
                  <span className={project.stale ? "index-badge index-badge--warn" : "index-badge index-badge--ok"}>
                    {staleLabel(project)}
                  </span>
                </div>
                <div className="index-list__meta">
                  {project.indexed ? (
                    <>
                      {project.nodes != null ? `${project.nodes.toLocaleString()} nodes` : null}
                      {project.edges != null ? ` · ${project.edges.toLocaleString()} edges` : null}
                      {project.indexStatus ? ` · ${project.indexStatus}` : null}
                    </>
                  ) : (
                    "Not indexed — use Re-index"
                  )}
                </div>
                <div className="index-list__meta">
                  {project.gitHeadShort ? `HEAD ${project.gitHeadShort}` : "git HEAD unknown"}
                  {project.indexedGitHead &&
                  project.gitHeadShort &&
                  !project.indexedGitHead.startsWith(project.gitHeadShort)
                    ? ` · indexed at ${project.indexedGitHead.slice(0, 7)}`
                    : null}
                </div>
                {project.changedFiles.length > 0 ? (
                  <ul className="index-changes">
                    {project.changedFiles.map((file) => (
                      <li key={file}>{file}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

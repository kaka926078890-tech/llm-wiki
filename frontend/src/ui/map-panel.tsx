import { useCallback, useEffect, useState } from "react";

export interface GraphNodeView {
  id: string;
  type: "repo" | "module" | "app" | "route";
  title: string;
  repo: string;
  listKind?: string;
  summary?: string;
}

export interface ProjectGraphView {
  version: number;
  generatedAt: string;
  nodes: GraphNodeView[];
  edges: Array<{ from: string; to: string; type: string }>;
}

const REPO_ORDER = ["chatkit-middleware", "chatkit-web", "finclaw"];

function typeLabel(type: GraphNodeView["type"]): string {
  if (type === "repo") return "repo";
  if (type === "app") return "app";
  if (type === "route") return "route";
  return "module";
}

export function MapPanel() {
  const [graph, setGraph] = useState<ProjectGraphView | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      const res = await fetch("/api/graph");
      if (res.status === 404) {
        const body = (await res.json()) as { hint?: string };
        setGraph(null);
        setHint(body.hint ?? "Run npm run graph:gen or sync:code:full");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { graph: ProjectGraphView };
      setGraph(body.graph);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const repos = graph
    ? REPO_ORDER.filter((repo) => graph.nodes.some((n) => n.type === "repo" && n.repo === repo))
    : [];

  return (
    <div className="map-panel">
      <div className="map-panel__toolbar">
        <h2>Project Map</h2>
        <button type="button" onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      </div>
      {loading ? <p className="app__empty">Loading project graph…</p> : null}
      {error ? <p className="app__error">{error}</p> : null}
      {!loading && hint ? (
        <p className="app__empty">
          No project graph yet. {hint}
        </p>
      ) : null}
      {!loading && graph ? (
        <p className="map-panel__meta">
          Generated {new Date(graph.generatedAt).toLocaleString()} · {graph.nodes.length} nodes ·{" "}
          {graph.edges.length} edges
        </p>
      ) : null}
      {repos.map((repo) => {
        const children = graph!.nodes.filter((n) => n.type !== "repo" && n.repo === repo);
        children.sort((a, b) => a.title.localeCompare(b.title));
        return (
          <section key={repo} className="map-panel__repo">
            <h3>{repo}</h3>
            <ul className="index-list">
              {children.map((node) => (
                <li key={node.id} className="index-list__item">
                  <div className="index-list__head">
                    <strong>{node.title}</strong>
                    <span className="knowledge-badge">{typeLabel(node.type)}</span>
                    {node.listKind ? (
                      <span className="knowledge-badge knowledge-badge--hits">{node.listKind}</span>
                    ) : null}
                  </div>
                  {node.summary ? <p className="map-panel__summary">{node.summary}</p> : null}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

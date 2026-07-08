/** Fetch evidence from the latest MCP run for the same user question. */
export async function fetchMcpRunEvidence(question: string): Promise<{
  runId: string;
  items: Array<{
    path?: string;
    line?: number;
    lineEnd?: number;
    excerptHash?: string;
    redaction?: string;
  }>;
} | null> {
  try {
    const runsRes = await fetch("/api/runs?limit=12");
    if (!runsRes.ok) return null;
    const { runs } = (await runsRes.json()) as {
      runs: Array<{ runId: string; question: string; surface: string }>;
    };
    const run =
      runs.find((entry) => entry.surface === "mcp" && entry.question === question)
      ?? runs.find((entry) => entry.surface === "mcp");
    if (!run) return null;

    const detailRes = await fetch(`/api/runs/${encodeURIComponent(run.runId)}`);
    if (!detailRes.ok) return null;
    const detail = (await detailRes.json()) as {
      evidenceBundle?: {
        items: Array<{
          path?: string;
          line?: number;
          lineEnd?: number;
          excerptHash?: string;
          redaction?: string;
        }>;
      };
    };
    return {
      runId: run.runId,
      items: detail.evidenceBundle?.items ?? [],
    };
  } catch {
    return null;
  }
}

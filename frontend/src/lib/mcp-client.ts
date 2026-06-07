export type McpAskOptions = {
  question: string;
  repoScope?: string;
  signal?: AbortSignal;
};

type McpTextContent = { type?: string; text?: string };

type JsonRpcResponse = {
  jsonrpc?: "2.0";
  id?: string | number | null;
  result?: {
    content?: McpTextContent[];
    isError?: boolean;
  };
  error?: { code: number; message: string };
};

export async function callMcpAsk(opts: McpAskOptions): Promise<string> {
  const args: Record<string, string> = { question: opts.question };
  if (opts.repoScope?.trim()) args.repo_scope = opts.repoScope.trim();

  const res = await fetch("/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "web-mcp-ask",
      method: "tools/call",
      params: {
        name: "ask_llm_wiki",
        arguments: args,
      },
    }),
    signal: opts.signal,
  });

  const text = await res.text();
  if (!res.ok) throw new Error(text || `MCP call failed (${res.status})`);

  let body: JsonRpcResponse;
  try {
    body = JSON.parse(text) as JsonRpcResponse;
  } catch {
    throw new Error(text || "MCP returned non-JSON response");
  }

  if (body.error) {
    throw new Error(body.error.message);
  }

  const result = body.result;
  const finalText = result?.content
    ?.filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n\n")
    .trim();

  if (result?.isError) {
    throw new Error(finalText || "MCP tool returned an error");
  }
  return finalText || "";
}

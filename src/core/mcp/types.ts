export type McpTool = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

export type McpContentBlock = { type: string; text?: string };

export type CallToolResult = {
  content?: McpContentBlock[];
  isError?: boolean;
};

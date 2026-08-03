import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

import {
  MCP_TOOL_DISCOVERY,
  MCP_TOOL_SCOPES,
  type McpToolDiscovery,
  type McpToolName,
} from "../../shared/mcp-tools";

interface DiscoverableToolConfig {
  description?: string;
  inputSchema?: unknown;
}

export function withMcpToolDiscovery<Config extends DiscoverableToolConfig>(
  name: McpToolName,
  config: Config,
): Config & { title: string; annotations: ToolAnnotations } {
  const scope = MCP_TOOL_SCOPES[name];
  const discovery: McpToolDiscovery = MCP_TOOL_DISCOVERY[name];
  const group = scope === "read" ? "Read" : "Write";
  const title = `${group} · ${discovery.domain} · ${discovery.title}`;

  return {
    ...config,
    title,
    annotations: {
      title,
      readOnlyHint: scope === "read",
      destructiveHint: discovery.destructiveHint ?? scope === "write",
      idempotentHint: discovery.idempotentHint ?? scope === "read",
      openWorldHint: discovery.openWorldHint ?? false,
    },
  };
}

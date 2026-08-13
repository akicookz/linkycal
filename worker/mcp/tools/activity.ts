import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { listRecentActivityAction } from "../../lib/activity-actions";
import type { ToolContext } from "../agent";
import { actionToMcpResult } from "../action-result";
import { withMcpToolDiscovery } from "../tool-discovery";
import { withToolErrors } from "../helpers";
import type { ToolResult } from "../helpers";

export async function listRecentActivity(
  ctx: ToolContext,
  input: { limit?: number },
): Promise<ToolResult> {
  return actionToMcpResult(await listRecentActivityAction({
    db: ctx.db(), env: ctx.env(), projectId: ctx.projectId(), channel: "mcp",
    waitUntil: ctx.waitUntil,
  }, input.limit));
}

export function registerActivityTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool("list_recent_activity", withMcpToolDiscovery("list_recent_activity", {
    description: "List recent bookings and form submissions in this project.",
    inputSchema: { limit: z.number().int().min(1).max(50).optional() },
  }), withToolErrors("list_recent_activity", ctx, (input) => listRecentActivity(ctx, input)));
}

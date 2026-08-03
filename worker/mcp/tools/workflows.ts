import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { WorkflowService } from "../../services/workflow-service";
import type { ToolContext } from "../agent";
import { withMcpToolDiscovery } from "../tool-discovery";
import { ok, err, withToolErrors, inProject } from "../helpers";
import type { ToolResult } from "../helpers";

// ─── Handlers (exported for unit tests) ──────────────────────────────────────

export async function listWorkflows(ctx: ToolContext): Promise<ToolResult> {
  const service = new WorkflowService(ctx.db());
  return ok(await service.list(ctx.projectId()));
}

export async function getWorkflow(
  ctx: ToolContext,
  input: { workflowId: string },
): Promise<ToolResult> {
  const service = new WorkflowService(ctx.db());
  const existing = inProject(await service.getById(input.workflowId), ctx.projectId());
  if (!existing) return err("Not found");

  return ok(await service.getFullWorkflow(input.workflowId));
}

// ─── Registration ────────────────────────────────────────────────────────────

export function registerWorkflowTools(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    "list_workflows",
    withMcpToolDiscovery("list_workflows", {
      description:
        "List automation workflows in this project with their trigger (form_submitted, booking_created, tag_added, etc.) and status.",
      inputSchema: {},
    }),
    withToolErrors("list_workflows", ctx, () => listWorkflows(ctx)),
  );

  server.registerTool(
    "get_workflow",
    withMcpToolDiscovery("get_workflow", {
      description: "Get a workflow by id with its ordered steps and per-step config/conditions.",
      inputSchema: {
        workflowId: z.string().describe("Workflow id"),
      },
    }),
    withToolErrors("get_workflow", ctx, (input) => getWorkflow(ctx, input)),
  );
}

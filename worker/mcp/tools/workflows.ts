import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  createWorkflowAction,
  createWorkflowStepAction,
  deleteWorkflowAction,
  deleteWorkflowStepAction,
  getWorkflowAction,
  getWorkflowRunAction,
  listWorkflowRunsAction,
  listWorkflowsAction,
  reorderWorkflowStepsAction,
  testWorkflowAction,
  triggerWorkflowAction,
  updateWorkflowAction,
  updateWorkflowStepAction,
} from "../../lib/workflow-actions";
import {
  createWorkflowSchema,
  createWorkflowStepSchema,
  reorderWorkflowStepsSchema,
  testWorkflowSchema,
  triggerWorkflowSchema,
  updateWorkflowSchema,
  updateWorkflowStepSchema,
} from "../../validation";
import type { ToolContext } from "../agent";
import { actionToMcpResult } from "../action-result";
import { withMcpToolDiscovery } from "../tool-discovery";
import { ok, withToolErrors } from "../helpers";
import type { ToolResult } from "../helpers";
import type { ActionResult } from "../../lib/action-result";

function deps(ctx: ToolContext) {
  return { db: ctx.db(), env: ctx.env(), projectId: ctx.projectId(), channel: "mcp" as const, waitUntil: ctx.waitUntil };
}

function actionValue(result: ActionResult<unknown>, key?: string): ToolResult {
  if (!result.ok) return actionToMcpResult(result);
  return ok(key ? (result.value as Record<string, unknown>)[key] : result.value);
}

export async function listWorkflows(ctx: ToolContext): Promise<ToolResult> {
  return actionValue(await listWorkflowsAction(deps(ctx)), "workflows");
}

export async function getWorkflow(ctx: ToolContext, input: { workflowId: string }): Promise<ToolResult> {
  return actionValue(await getWorkflowAction(deps(ctx), input.workflowId), "workflow");
}

export async function createWorkflow(ctx: ToolContext, input: z.input<typeof createWorkflowSchema>): Promise<ToolResult> {
  return actionToMcpResult(await createWorkflowAction(deps(ctx), input));
}

export async function updateWorkflow(ctx: ToolContext, input: { workflowId: string } & z.input<typeof updateWorkflowSchema>): Promise<ToolResult> {
  const { workflowId, ...body } = input;
  return actionToMcpResult(await updateWorkflowAction(deps(ctx), workflowId, body));
}

export async function deleteWorkflow(ctx: ToolContext, input: { workflowId: string }): Promise<ToolResult> {
  return actionToMcpResult(await deleteWorkflowAction(deps(ctx), input.workflowId));
}

export async function createWorkflowStep(ctx: ToolContext, input: { workflowId: string } & z.input<typeof createWorkflowStepSchema>): Promise<ToolResult> {
  const { workflowId, ...body } = input;
  return actionToMcpResult(await createWorkflowStepAction(deps(ctx), workflowId, body));
}

export async function updateWorkflowStep(ctx: ToolContext, input: { workflowId: string; stepId: string } & z.input<typeof updateWorkflowStepSchema>): Promise<ToolResult> {
  const { workflowId, stepId, ...body } = input;
  return actionToMcpResult(await updateWorkflowStepAction(deps(ctx), workflowId, stepId, body));
}

export async function deleteWorkflowStep(ctx: ToolContext, input: { workflowId: string; stepId: string }): Promise<ToolResult> {
  return actionToMcpResult(await deleteWorkflowStepAction(deps(ctx), input.workflowId, input.stepId));
}

export async function reorderWorkflowSteps(ctx: ToolContext, input: { workflowId: string } & z.input<typeof reorderWorkflowStepsSchema>): Promise<ToolResult> {
  const { workflowId, ...body } = input;
  return actionToMcpResult(await reorderWorkflowStepsAction(deps(ctx), workflowId, body));
}

export async function listWorkflowRuns(ctx: ToolContext, input: { workflowId: string; limit?: number }): Promise<ToolResult> {
  return actionToMcpResult(await listWorkflowRunsAction(deps(ctx), input.workflowId, input.limit));
}

export async function getWorkflowRun(ctx: ToolContext, input: { workflowId: string; runId: string }): Promise<ToolResult> {
  return actionToMcpResult(await getWorkflowRunAction(deps(ctx), input.workflowId, input.runId));
}

export async function triggerWorkflow(ctx: ToolContext, input: { workflowId: string } & z.input<typeof triggerWorkflowSchema>): Promise<ToolResult> {
  const { workflowId, ...body } = input;
  return actionToMcpResult(await triggerWorkflowAction(deps(ctx), workflowId, body));
}

export async function testWorkflow(ctx: ToolContext, input: { workflowId: string } & z.input<typeof testWorkflowSchema>): Promise<ToolResult> {
  const { workflowId, ...body } = input;
  return actionToMcpResult(await testWorkflowAction(deps(ctx), workflowId, body));
}

export function registerWorkflowTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool("list_workflows", withMcpToolDiscovery("list_workflows", { description: "List project workflows.", inputSchema: {} }), withToolErrors("list_workflows", ctx, () => listWorkflows(ctx)));
  server.registerTool("get_workflow", withMcpToolDiscovery("get_workflow", { description: "Get a workflow with steps.", inputSchema: { workflowId: z.string() } }), withToolErrors("get_workflow", ctx, (input) => getWorkflow(ctx, input)));
  server.registerTool("create_workflow", withMcpToolDiscovery("create_workflow", { description: "Create a workflow.", inputSchema: createWorkflowSchema.shape }), withToolErrors("create_workflow", ctx, (input) => createWorkflow(ctx, input)));
  server.registerTool("update_workflow", withMcpToolDiscovery("update_workflow", { description: "Update a workflow.", inputSchema: { workflowId: z.string(), ...updateWorkflowSchema.shape } }), withToolErrors("update_workflow", ctx, (input) => updateWorkflow(ctx, input)));
  server.registerTool("delete_workflow", withMcpToolDiscovery("delete_workflow", { description: "Delete a workflow.", inputSchema: { workflowId: z.string() } }), withToolErrors("delete_workflow", ctx, (input) => deleteWorkflow(ctx, input)));
  server.registerTool("create_workflow_step", withMcpToolDiscovery("create_workflow_step", { description: "Create a workflow step.", inputSchema: { workflowId: z.string(), ...createWorkflowStepSchema.shape } }), withToolErrors("create_workflow_step", ctx, (input) => createWorkflowStep(ctx, input)));
  server.registerTool("update_workflow_step", withMcpToolDiscovery("update_workflow_step", { description: "Update a workflow step.", inputSchema: { workflowId: z.string(), stepId: z.string(), ...updateWorkflowStepSchema.shape } }), withToolErrors("update_workflow_step", ctx, (input) => updateWorkflowStep(ctx, input)));
  server.registerTool("delete_workflow_step", withMcpToolDiscovery("delete_workflow_step", { description: "Delete a workflow step.", inputSchema: { workflowId: z.string(), stepId: z.string() } }), withToolErrors("delete_workflow_step", ctx, (input) => deleteWorkflowStep(ctx, input)));
  server.registerTool("reorder_workflow_steps", withMcpToolDiscovery("reorder_workflow_steps", { description: "Replace workflow step ordering.", inputSchema: { workflowId: z.string(), ...reorderWorkflowStepsSchema.shape } }), withToolErrors("reorder_workflow_steps", ctx, (input) => reorderWorkflowSteps(ctx, input)));
  server.registerTool("list_workflow_runs", withMcpToolDiscovery("list_workflow_runs", { description: "List workflow runs.", inputSchema: { workflowId: z.string(), limit: z.number().int().min(1).max(100).optional() } }), withToolErrors("list_workflow_runs", ctx, (input) => listWorkflowRuns(ctx, input)));
  server.registerTool("get_workflow_run", withMcpToolDiscovery("get_workflow_run", { description: "Get a workflow run.", inputSchema: { workflowId: z.string(), runId: z.string() } }), withToolErrors("get_workflow_run", ctx, (input) => getWorkflowRun(ctx, input)));
  server.registerTool("trigger_workflow", withMcpToolDiscovery("trigger_workflow", { description: "Trigger an active manual or scheduled workflow.", inputSchema: { workflowId: z.string(), ...triggerWorkflowSchema.shape } }), withToolErrors("trigger_workflow", ctx, (input) => triggerWorkflow(ctx, input)));
  server.registerTool("test_workflow", withMcpToolDiscovery("test_workflow", { description: "Test-run a workflow for a contact.", inputSchema: { workflowId: z.string(), ...testWorkflowSchema.shape } }), withToolErrors("test_workflow", ctx, (input) => testWorkflow(ctx, input)));
}

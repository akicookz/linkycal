import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  createContactViewAction,
  deleteContactViewAction,
  listContactViewsAction,
  seedContactPipelineAction,
  updateContactViewAction,
} from "../../lib/contact-view-actions";
import { createContactViewSchema, updateContactViewSchema } from "../../validation";
import type { ToolContext } from "../agent";
import { actionToMcpResult } from "../action-result";
import { withMcpToolDiscovery } from "../tool-discovery";
import { withToolErrors } from "../helpers";
import type { ToolResult } from "../helpers";

function deps(ctx: ToolContext) {
  return { db: ctx.db(), env: ctx.env(), projectId: ctx.projectId(), channel: "mcp" as const, waitUntil: ctx.waitUntil };
}

export async function listContactViews(ctx: ToolContext): Promise<ToolResult> {
  return actionToMcpResult(await listContactViewsAction(deps(ctx)));
}

export async function createContactView(ctx: ToolContext, input: z.input<typeof createContactViewSchema>): Promise<ToolResult> {
  return actionToMcpResult(await createContactViewAction(deps(ctx), input));
}

export async function updateContactView(ctx: ToolContext, input: { viewId: string } & z.input<typeof updateContactViewSchema>): Promise<ToolResult> {
  const { viewId, ...body } = input;
  return actionToMcpResult(await updateContactViewAction(deps(ctx), viewId, body));
}

export async function deleteContactView(ctx: ToolContext, input: { viewId: string }): Promise<ToolResult> {
  return actionToMcpResult(await deleteContactViewAction(deps(ctx), input.viewId));
}

export async function seedContactPipeline(ctx: ToolContext): Promise<ToolResult> {
  return actionToMcpResult(await seedContactPipelineAction(deps(ctx)));
}

export function registerContactViewTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool("list_contact_views", withMcpToolDiscovery("list_contact_views", { description: "List saved contact views.", inputSchema: {} }), withToolErrors("list_contact_views", ctx, () => listContactViews(ctx)));
  server.registerTool("create_contact_view", withMcpToolDiscovery("create_contact_view", { description: "Create a saved contact view.", inputSchema: createContactViewSchema.shape }), withToolErrors("create_contact_view", ctx, (input) => createContactView(ctx, input)));
  server.registerTool("update_contact_view", withMcpToolDiscovery("update_contact_view", { description: "Update a saved contact view.", inputSchema: { viewId: z.string(), ...updateContactViewSchema.shape } }), withToolErrors("update_contact_view", ctx, (input) => updateContactView(ctx, input)));
  server.registerTool("delete_contact_view", withMcpToolDiscovery("delete_contact_view", { description: "Delete a saved contact view.", inputSchema: { viewId: z.string() } }), withToolErrors("delete_contact_view", ctx, (input) => deleteContactView(ctx, input)));
  server.registerTool("seed_contact_pipeline", withMcpToolDiscovery("seed_contact_pipeline", { description: "Create canonical pipeline tags and a Kanban view.", inputSchema: {} }), withToolErrors("seed_contact_pipeline", ctx, () => seedContactPipeline(ctx)));
}

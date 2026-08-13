import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  createContactAction,
  deleteContactAction,
  enrichContactAction,
  getContactAction,
  getContactActivityAction,
  importContactsAction,
  listContactsAction,
  setContactNextActionAction,
  setContactStageAction,
  updateContactAction,
} from "../../lib/contact-actions";
import {
  addTagToContactAction,
  createTagAction,
  deleteTagAction,
  getTagAction,
  listAllTagsAction,
  removeTagFromContactAction,
  updateTagAction,
} from "../../lib/tag-actions";
import {
  createContactSchema,
  createTagSchema,
  importContactsSchema,
  listContactsQuerySchema,
  tagColorSchema,
  tagNameSchema,
  updateContactSchema,
} from "../../validation";
import type { ToolContext } from "../agent";
import { actionToMcpResult } from "../action-result";
import { withMcpToolDiscovery } from "../tool-discovery";
import { ok, withToolErrors } from "../helpers";
import type { ToolResult } from "../helpers";
import type { ActionResult } from "../../lib/action-result";

function deps(ctx: ToolContext) {
  return {
    db: ctx.db(), env: ctx.env(), projectId: ctx.projectId(), channel: "mcp" as const,
    waitUntil: ctx.waitUntil,
  };
}

function actionValue(result: ActionResult<unknown>, key?: string): ToolResult {
  if (!result.ok) return actionToMcpResult(result);
  if (!key) return ok(result.value);
  const value = result.value as Record<string, unknown>;
  return ok(value[key]);
}

// ─── Handlers (exported for unit tests) ──────────────────────────────────────

export async function listContacts(ctx: ToolContext, input: z.input<typeof listContactsQuerySchema>): Promise<ToolResult> {
  const result = await listContactsAction(deps(ctx), input);
  if (!result.ok) return actionToMcpResult(result);
  return ok((result.value as { contacts: unknown[] }).contacts);
}

export async function getContact(ctx: ToolContext, input: { contactId: string }): Promise<ToolResult> {
  return actionValue(await getContactAction(deps(ctx), input.contactId), "contact");
}

export async function createContact(ctx: ToolContext, input: z.input<typeof createContactSchema>): Promise<ToolResult> {
  return actionValue(await createContactAction(deps(ctx), input), "contact");
}

export async function updateContact(ctx: ToolContext, input: { contactId: string } & z.input<typeof updateContactSchema>): Promise<ToolResult> {
  const { contactId, ...body } = input;
  return actionValue(await updateContactAction(deps(ctx), contactId, body), "contact");
}

export async function setContactNextAction(ctx: ToolContext, input: { contactId: string; text: string | null; deadline?: string | null }): Promise<ToolResult> {
  return actionValue(await setContactNextActionAction(deps(ctx), input.contactId, {
    text: input.text,
    deadline: input.text === null ? null : input.deadline ?? null,
  }), "contact");
}

export async function completeContactNextAction(ctx: ToolContext, input: { contactId: string }): Promise<ToolResult> {
  return actionValue(await setContactNextActionAction(deps(ctx), input.contactId, { text: null, deadline: null }), "contact");
}

export async function deleteContact(ctx: ToolContext, input: { contactId: string }): Promise<ToolResult> {
  const result = await deleteContactAction(deps(ctx), input.contactId);
  return result.ok ? ok({ deleted: true }) : actionToMcpResult(result);
}

export async function importContacts(ctx: ToolContext, input: z.input<typeof importContactsSchema>): Promise<ToolResult> {
  return actionToMcpResult(await importContactsAction(deps(ctx), input));
}

export async function setContactStage(ctx: ToolContext, input: { contactId: string; tagId: string | null }): Promise<ToolResult> {
  return actionToMcpResult(await setContactStageAction(deps(ctx), input.contactId, { tagId: input.tagId }));
}

export async function enrichContact(ctx: ToolContext, input: { contactId: string }): Promise<ToolResult> {
  return actionToMcpResult(await enrichContactAction(deps(ctx), input.contactId));
}

export async function listContactTags(ctx: ToolContext): Promise<ToolResult> {
  return actionValue(await listAllTagsAction(deps(ctx)));
}

export async function createContactTag(ctx: ToolContext, input: { name: string; color?: string }): Promise<ToolResult> {
  return actionValue(await createTagAction(deps(ctx), input), "tag");
}

export async function getContactTag(ctx: ToolContext, input: { tagId: string }): Promise<ToolResult> {
  return actionValue(await getTagAction(deps(ctx), input.tagId), "tag");
}

export async function updateContactTag(ctx: ToolContext, input: { tagId: string; name?: string; color?: string }): Promise<ToolResult> {
  const { tagId, ...body } = input;
  return actionValue(await updateTagAction(deps(ctx), tagId, body), "tag");
}

export async function deleteContactTag(ctx: ToolContext, input: { tagId: string }): Promise<ToolResult> {
  const result = await deleteTagAction(deps(ctx), input.tagId);
  return result.ok ? ok({ deleted: true }) : actionToMcpResult(result);
}

export async function addTagToContact(ctx: ToolContext, input: { contactId: string; tagId: string }): Promise<ToolResult> {
  const result = await addTagToContactAction(deps(ctx), input.contactId, input.tagId);
  return result.ok ? ok({ success: true, assigned: (result.value as { assigned: boolean }).assigned }) : actionToMcpResult(result);
}

export async function removeTagFromContact(ctx: ToolContext, input: { contactId: string; tagId: string }): Promise<ToolResult> {
  const result = await removeTagFromContactAction(deps(ctx), input.contactId, input.tagId);
  return result.ok ? ok({ success: true, removed: (result.value as { removed: boolean }).removed }) : actionToMcpResult(result);
}

export async function getContactActivity(ctx: ToolContext, input: { contactId: string; category?: string; cursor?: string; limit?: number }): Promise<ToolResult> {
  return actionValue(await getContactActivityAction(deps(ctx), input.contactId, input));
}

export function registerContactTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool("list_contacts", withMcpToolDiscovery("list_contacts", { description: "List project contacts with tags and filters.", inputSchema: {
    search: z.string().max(200).optional(), tagIds: z.array(z.string()).optional(), matchAllTags: z.boolean().optional(), stageTagId: z.string().optional(), excludeStageTagIds: z.array(z.string()).optional(), activityType: z.enum(["form_submitted", "booked", "cancelled", "tag_added", "tag_removed", "workflow_researched"]).optional(), activitySinceDays: z.number().int().min(0).max(3650).optional(), noActivitySinceDays: z.number().int().min(0).max(3650).optional(), bookingStatus: z.enum(["confirmed", "cancelled", "rescheduled", "pending", "declined"]).optional(), sort: z.literal("nextActionDeadline").optional(), limit: z.number().int().min(1).max(100).optional(), offset: z.number().int().min(0).optional(),
  }}), withToolErrors("list_contacts", ctx, (input) => listContacts(ctx, input)));
  server.registerTool("get_contact", withMcpToolDiscovery("get_contact", { description: "Get a project contact.", inputSchema: { contactId: z.string() }}), withToolErrors("get_contact", ctx, (input) => getContact(ctx, input)));
  server.registerTool("create_contact", withMcpToolDiscovery("create_contact", { description: "Create or deduplicate a project contact.", inputSchema: { name: createContactSchema.shape.name, email: createContactSchema.shape.email, phone: createContactSchema.shape.phone, notes: createContactSchema.shape.notes, metadata: createContactSchema.shape.metadata, company: createContactSchema.shape.company, companyWebsite: createContactSchema.shape.companyWebsite, position: createContactSchema.shape.position, companySize: createContactSchema.shape.companySize, estimatedRevenue: createContactSchema.shape.estimatedRevenue, linkedinUrl: createContactSchema.shape.linkedinUrl }}), withToolErrors("create_contact", ctx, (input) => createContact(ctx, input)));
  server.registerTool("update_contact", withMcpToolDiscovery("update_contact", { description: "Update a project contact.", inputSchema: { contactId: z.string(), ...updateContactSchema.shape }}), withToolErrors("update_contact", ctx, (input) => updateContact(ctx, input)));
  server.registerTool("set_contact_next_action", withMcpToolDiscovery("set_contact_next_action", { description: "Set or clear a contact next action.", inputSchema: { contactId: z.string(), text: z.string().trim().min(1).max(500).nullable(), deadline: z.string().datetime({ offset: true }).nullable().optional() }}), withToolErrors("set_contact_next_action", ctx, (input) => setContactNextAction(ctx, input)));
  server.registerTool("complete_contact_next_action", withMcpToolDiscovery("complete_contact_next_action", { description: "Complete a contact next action.", inputSchema: { contactId: z.string() }}), withToolErrors("complete_contact_next_action", ctx, (input) => completeContactNextAction(ctx, input)));
  server.registerTool("delete_contact", withMcpToolDiscovery("delete_contact", { description: "Permanently delete a contact.", inputSchema: { contactId: z.string() }}), withToolErrors("delete_contact", ctx, (input) => deleteContact(ctx, input)));
  server.registerTool("list_contact_tags", withMcpToolDiscovery("list_contact_tags", { description: "List all project contact tags.", inputSchema: {} }), withToolErrors("list_contact_tags", ctx, () => listContactTags(ctx)));
  server.registerTool("create_contact_tag", withMcpToolDiscovery("create_contact_tag", { description: "Create a tag.", inputSchema: { name: createTagSchema.shape.name, color: createTagSchema.shape.color }}), withToolErrors("create_contact_tag", ctx, (input) => createContactTag(ctx, input)));
  server.registerTool("get_contact_tag", withMcpToolDiscovery("get_contact_tag", { description: "Get a tag.", inputSchema: { tagId: z.string() }}), withToolErrors("get_contact_tag", ctx, (input) => getContactTag(ctx, input)));
  server.registerTool("update_contact_tag", withMcpToolDiscovery("update_contact_tag", { description: "Update a tag.", inputSchema: { tagId: z.string(), name: tagNameSchema.optional(), color: tagColorSchema.optional() }}), withToolErrors("update_contact_tag", ctx, (input) => updateContactTag(ctx, input)));
  server.registerTool("delete_contact_tag", withMcpToolDiscovery("delete_contact_tag", { description: "Delete a tag.", inputSchema: { tagId: z.string() }}), withToolErrors("delete_contact_tag", ctx, (input) => deleteContactTag(ctx, input)));
  server.registerTool("add_tag_to_contact", withMcpToolDiscovery("add_tag_to_contact", { description: "Assign a tag to a contact.", inputSchema: { contactId: z.string(), tagId: z.string() }}), withToolErrors("add_tag_to_contact", ctx, (input) => addTagToContact(ctx, input)));
  server.registerTool("remove_tag_from_contact", withMcpToolDiscovery("remove_tag_from_contact", { description: "Remove a contact tag.", inputSchema: { contactId: z.string(), tagId: z.string() }}), withToolErrors("remove_tag_from_contact", ctx, (input) => removeTagFromContact(ctx, input)));
  server.registerTool("get_contact_activity", withMcpToolDiscovery("get_contact_activity", { description: "Get a paginated contact activity timeline.", inputSchema: { contactId: z.string(), category: z.enum(["all", "bookings", "form_responses", "workflows"]).optional(), cursor: z.string().optional(), limit: z.number().int().min(1).max(100).optional() }}), withToolErrors("get_contact_activity", ctx, (input) => getContactActivity(ctx, input)));
  server.registerTool("import_contacts", withMcpToolDiscovery("import_contacts", { description: "Import mapped contact rows.", inputSchema: { mapping: importContactsSchema.shape.mapping, rows: importContactsSchema.shape.rows }}), withToolErrors("import_contacts", ctx, (input) => importContacts(ctx, input)));
  server.registerTool("set_contact_stage", withMcpToolDiscovery("set_contact_stage", { description: "Set a contact pipeline stage.", inputSchema: { contactId: z.string(), tagId: z.string().nullable() }}), withToolErrors("set_contact_stage", ctx, (input) => setContactStage(ctx, input)));
  server.registerTool("enrich_contact", withMcpToolDiscovery("enrich_contact", { description: "Enrich a contact with AI research.", inputSchema: { contactId: z.string() }}), withToolErrors("enrich_contact", ctx, (input) => enrichContact(ctx, input)));
}

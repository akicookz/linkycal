import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { ContactService } from "../../services/contact-service";
import { createContactSchema, updateContactSchema, createTagSchema } from "../../validation";
import { dispatchWorkflowTrigger } from "../../lib/workflow-dispatch";
import { ensureContact } from "../../lib/contact-actions";
import type { ToolContext } from "../agent";
import {
  ok,
  err,
  withToolErrors,
  inProject,
  tagInProject,
  getPlanLimitsForProject,
} from "../helpers";
import type { ToolResult } from "../helpers";

// ─── Handlers (exported for unit tests) ──────────────────────────────────────

export async function listContacts(
  ctx: ToolContext,
  input: { search?: string; tagIds?: string[]; matchAllTags?: boolean; limit?: number },
): Promise<ToolResult> {
  const service = new ContactService(ctx.db());
  const contacts = await service.listWithTags(ctx.projectId(), {
    search: input.search,
    tagIds: input.tagIds,
    matchAllTags: input.matchAllTags,
  });
  return ok(contacts.slice(0, input.limit ?? 100));
}

export async function getContact(
  ctx: ToolContext,
  input: { contactId: string },
): Promise<ToolResult> {
  const service = new ContactService(ctx.db());
  const contact = inProject(await service.getById(input.contactId), ctx.projectId());
  if (!contact) return err("Not found");
  return ok(await service.getWithDetails(input.contactId));
}

export async function createContact(
  ctx: ToolContext,
  input: { name: string; email?: string; phone?: string; notes?: string },
): Promise<ToolResult> {
  const db = ctx.db();
  const projectId = ctx.projectId();
  const service = new ContactService(db);

  // Dedupe first: a match returns the existing contact (no duplicate, no
  // trigger, no plan-limit consumption).
  const duplicate = await service.findDuplicate(projectId, input);
  if (duplicate) return ok(duplicate);

  const planLimits = await getPlanLimitsForProject(db, projectId);
  const existing = await service.list(projectId);
  if (
    planLimits.maxContactsPerProject !== -1 &&
    existing.length >= planLimits.maxContactsPerProject
  ) {
    return err(`Plan limit reached: maximum ${planLimits.maxContactsPerProject} contacts`);
  }

  // Creates + fires new_contact_created (no duplicate exists at this point).
  const { contact } = await ensureContact(db, ctx.env(), projectId, input, "mcp");
  return ok(contact);
}

export async function updateContact(
  ctx: ToolContext,
  input: {
    contactId: string;
    name?: string;
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
  },
): Promise<ToolResult> {
  const service = new ContactService(ctx.db());
  const existing = inProject(await service.getById(input.contactId), ctx.projectId());
  if (!existing) return err("Not found");

  const { contactId, ...data } = input;
  const contact = await service.update(contactId, data);
  return ok(contact);
}

export async function deleteContact(
  ctx: ToolContext,
  input: { contactId: string },
): Promise<ToolResult> {
  const service = new ContactService(ctx.db());
  const existing = inProject(await service.getById(input.contactId), ctx.projectId());
  if (!existing) return err("Not found");

  await service.delete(input.contactId);
  return ok({ deleted: true });
}

export async function listContactTags(ctx: ToolContext): Promise<ToolResult> {
  const service = new ContactService(ctx.db());
  return ok(await service.listTags(ctx.projectId()));
}

export async function createContactTag(
  ctx: ToolContext,
  input: { name: string; color?: string },
): Promise<ToolResult> {
  const service = new ContactService(ctx.db());
  const tag = await service.createTag(ctx.projectId(), input);
  return ok(tag);
}

export async function addTagToContact(
  ctx: ToolContext,
  input: { contactId: string; tagId: string },
): Promise<ToolResult> {
  const db = ctx.db();
  const projectId = ctx.projectId();
  const service = new ContactService(db);

  const contact = inProject(await service.getById(input.contactId), projectId);
  if (!contact) return err("Not found");
  if (!(await tagInProject(db, input.tagId, projectId))) return err("Not found");

  await service.addTag(input.contactId, input.tagId);

  // Mirror the dashboard route: tagging fires tag_added workflows
  ctx.waitUntil(
    dispatchWorkflowTrigger(db, ctx.env(), projectId, "tag_added", {
      projectId,
      contactId: input.contactId,
      tagId: input.tagId,
    }),
  );

  return ok({ success: true });
}

export async function removeTagFromContact(
  ctx: ToolContext,
  input: { contactId: string; tagId: string },
): Promise<ToolResult> {
  const db = ctx.db();
  const projectId = ctx.projectId();
  const service = new ContactService(db);

  const contact = inProject(await service.getById(input.contactId), projectId);
  if (!contact) return err("Not found");
  if (!(await tagInProject(db, input.tagId, projectId))) return err("Not found");

  await service.removeTag(input.contactId, input.tagId);
  return ok({ success: true });
}

export async function getContactActivity(
  ctx: ToolContext,
  input: { contactId: string; limit?: number },
): Promise<ToolResult> {
  const service = new ContactService(ctx.db());
  const contact = inProject(await service.getById(input.contactId), ctx.projectId());
  if (!contact) return err("Not found");

  return ok(await service.getActivity(input.contactId, input.limit ?? 50));
}

// ─── Registration ────────────────────────────────────────────────────────────

export function registerContactTools(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    "list_contacts",
    {
      description:
        "List contacts in this project with their tags, newest first. Supports text search (name/email/phone) and tag filtering.",
      inputSchema: {
        search: z.string().optional().describe("Search by name, email, or phone"),
        tagIds: z.array(z.string()).optional().describe("Only contacts with these tag ids"),
        matchAllTags: z.boolean().optional().describe("Require all tagIds instead of any (default any)"),
        limit: z.number().int().min(1).max(500).optional().describe("Max contacts to return (default 100)"),
      },
    },
    withToolErrors("list_contacts", (input) => listContacts(ctx, input)),
  );

  server.registerTool(
    "get_contact",
    {
      description: "Get a contact by id with tags and recent activity.",
      inputSchema: {
        contactId: z.string().describe("Contact id"),
      },
    },
    withToolErrors("get_contact", (input) => getContact(ctx, input)),
  );

  server.registerTool(
    "create_contact",
    {
      description: "Create a contact in this project.",
      inputSchema: {
        name: createContactSchema.shape.name.describe("Contact name"),
        email: createContactSchema.shape.email.describe("Email address"),
        phone: createContactSchema.shape.phone.describe("Phone number"),
        notes: createContactSchema.shape.notes.describe("Free-form notes"),
      },
    },
    withToolErrors("create_contact", (input) => createContact(ctx, input)),
  );

  server.registerTool(
    "update_contact",
    {
      description: "Update a contact's fields. Only provided fields change; pass null to clear a field.",
      inputSchema: {
        contactId: z.string().describe("Contact id"),
        name: updateContactSchema.shape.name.describe("New name"),
        email: updateContactSchema.shape.email.describe("New email (null to clear)"),
        phone: updateContactSchema.shape.phone.describe("New phone (null to clear)"),
        notes: updateContactSchema.shape.notes.describe("New notes (null to clear)"),
      },
    },
    withToolErrors("update_contact", (input) => updateContact(ctx, input)),
  );

  server.registerTool(
    "delete_contact",
    {
      description: "Permanently delete a contact and its tag assignments and activity history.",
      inputSchema: {
        contactId: z.string().describe("Contact id"),
      },
    },
    withToolErrors("delete_contact", (input) => deleteContact(ctx, input)),
  );

  server.registerTool(
    "list_contact_tags",
    {
      description: "List all contact tags in this project.",
      inputSchema: {},
    },
    withToolErrors("list_contact_tags", () => listContactTags(ctx)),
  );

  server.registerTool(
    "create_contact_tag",
    {
      description: "Create a contact tag in this project.",
      inputSchema: {
        name: createTagSchema.shape.name.describe("Tag name"),
        color: createTagSchema.shape.color.describe("Hex color like #6b7280 (optional)"),
      },
    },
    withToolErrors("create_contact_tag", (input) => createContactTag(ctx, input)),
  );

  server.registerTool(
    "add_tag_to_contact",
    {
      description: "Assign a tag to a contact. Triggers any tag_added workflows configured for the project.",
      inputSchema: {
        contactId: z.string().describe("Contact id"),
        tagId: z.string().describe("Tag id (from list_contact_tags)"),
      },
    },
    withToolErrors("add_tag_to_contact", (input) => addTagToContact(ctx, input)),
  );

  server.registerTool(
    "remove_tag_from_contact",
    {
      description: "Remove a tag from a contact.",
      inputSchema: {
        contactId: z.string().describe("Contact id"),
        tagId: z.string().describe("Tag id"),
      },
    },
    withToolErrors("remove_tag_from_contact", (input) => removeTagFromContact(ctx, input)),
  );

  server.registerTool(
    "get_contact_activity",
    {
      description: "Get a contact's activity timeline (bookings, form submissions, tag changes), newest first.",
      inputSchema: {
        contactId: z.string().describe("Contact id"),
        limit: z.number().int().min(1).max(200).optional().describe("Max entries (default 50)"),
      },
    },
    withToolErrors("get_contact_activity", (input) => getContactActivity(ctx, input)),
  );
}

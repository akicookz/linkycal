import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { FormService } from "../../services/form-service";
import { createFormSchema, updateFormSchema } from "../../validation";
import type { ToolContext } from "../agent";
import {
  ok,
  err,
  withToolErrors,
  inProject,
  getPlanLimitsForProject,
} from "../helpers";
import type { ToolResult } from "../helpers";

type CreateFormInput = z.infer<typeof createFormSchema>;
type UpdateFormInput = z.infer<typeof updateFormSchema>;

// ─── Handlers (exported for unit tests) ──────────────────────────────────────

export async function listForms(ctx: ToolContext): Promise<ToolResult> {
  const service = new FormService(ctx.db());
  return ok(await service.list(ctx.projectId()));
}

export async function getForm(
  ctx: ToolContext,
  input: { formId: string },
): Promise<ToolResult> {
  const service = new FormService(ctx.db());
  const existing = inProject(await service.getById(input.formId), ctx.projectId());
  if (!existing) return err("Not found");

  return ok(await service.getFullForm(input.formId));
}

export async function createForm(
  ctx: ToolContext,
  input: CreateFormInput,
): Promise<ToolResult> {
  const db = ctx.db();
  const projectId = ctx.projectId();
  const service = new FormService(db);

  const planLimits = await getPlanLimitsForProject(db, projectId);
  const existing = await service.list(projectId);
  if (
    planLimits.maxFormsPerProject !== -1 &&
    existing.length >= planLimits.maxFormsPerProject
  ) {
    return err(`Plan limit reached: maximum ${planLimits.maxFormsPerProject} form(s)`);
  }

  const form = await service.create(projectId, input);
  return ok(form);
}

export async function updateForm(
  ctx: ToolContext,
  input: { formId: string } & UpdateFormInput,
): Promise<ToolResult> {
  const service = new FormService(ctx.db());
  const existing = inProject(await service.getById(input.formId), ctx.projectId());
  if (!existing) return err("Not found");

  const { formId, ...data } = input;
  const form = await service.update(formId, data);
  if (!form) return err("Not found");
  return ok(form);
}

export async function listFormResponses(
  ctx: ToolContext,
  input: { formId: string; limit?: number },
): Promise<ToolResult> {
  const service = new FormService(ctx.db());
  const existing = inProject(await service.getById(input.formId), ctx.projectId());
  if (!existing) return err("Not found");

  const responses = await service.listResponsesWithValues(input.formId);
  return ok(responses.slice(0, input.limit ?? 50));
}

// ─── Registration ────────────────────────────────────────────────────────────

const createShape = createFormSchema.shape;
const updateShape = updateFormSchema.shape;

export function registerFormTools(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    "list_forms",
    {
      description: "List forms in this project with their status (draft/active/archived).",
      inputSchema: {},
    },
    withToolErrors("list_forms", () => listForms(ctx)),
  );

  server.registerTool(
    "get_form",
    {
      description: "Get a form by id with all its steps and fields.",
      inputSchema: {
        formId: z.string().describe("Form id"),
      },
    },
    withToolErrors("get_form", (input) => getForm(ctx, input)),
  );

  server.registerTool(
    "create_form",
    {
      description:
        "Create a form (starts as a draft with one empty section). Use update_form with status 'active' to publish.",
      inputSchema: {
        name: createShape.name.describe("Form name"),
        slug: createShape.slug.describe("URL slug, lowercase letters/numbers/hyphens"),
        type: createShape.type.describe("'single' page or 'multi_step' (default single)"),
      },
    },
    withToolErrors("create_form", (input) => createForm(ctx, input)),
  );

  server.registerTool(
    "update_form",
    {
      description: "Update a form's name, slug, type, or status. Only provided fields change.",
      inputSchema: {
        formId: z.string().describe("Form id"),
        name: updateShape.name.describe("New name"),
        slug: updateShape.slug.describe("New slug"),
        type: updateShape.type.describe("'single' or 'multi_step'"),
        status: updateShape.status.describe("'draft', 'active', or 'archived'"),
      },
    },
    withToolErrors("update_form", (input) => updateForm(ctx, input)),
  );

  server.registerTool(
    "list_form_responses",
    {
      description: "List a form's responses with their submitted field values, newest first.",
      inputSchema: {
        formId: z.string().describe("Form id"),
        limit: z.number().int().min(1).max(200).optional().describe("Max responses (default 50)"),
      },
    },
    withToolErrors("list_form_responses", (input) => listFormResponses(ctx, input)),
  );
}

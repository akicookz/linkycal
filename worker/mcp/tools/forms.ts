import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  createFormAction,
  createFormFieldAction,
  createFormStepAction,
  deleteFormAction,
  deleteFormFieldAction,
  deleteFormResponseAction,
  deleteFormStepAction,
  getFormAction,
  getFormResponseAction,
  getFormResponseFileAction,
  listFormFieldsAction,
  listFormResponsesAction,
  listFormsAction,
  listFormStepsAction,
  reorderFormFieldsAction,
  reorderFormStepsAction,
  updateFormAction,
  updateFormFieldAction,
  updateFormStepAction,
} from "../../lib/form-actions";
import {
  createFormFieldObject,
  createFormSchema,
  createFormStepSchema,
  updateFormFieldObject,
  updateFormSchema,
  updateFormStepSchema,
} from "../../validation";
import type { ToolContext } from "../agent";
import { actionToMcpResult } from "../action-result";
import { withMcpToolDiscovery } from "../tool-discovery";
import { ok, withToolErrors } from "../helpers";
import type { ToolResult } from "../helpers";
import {
  formListSlugOutputSchema,
  formSlugOutputSchema,
} from "../slug-schema";

// ─── Handlers (exported for unit tests) ──────────────────────────────────────

export async function listForms(ctx: ToolContext): Promise<ToolResult> {
  const result = await listFormsAction(mcpFormDeps(ctx));
  if (!result.ok) return actionToMcpResult(result);
  return ok({ forms: result.value });
}

export async function getForm(
  ctx: ToolContext,
  input: { formId: string },
): Promise<ToolResult> {
  return actionToMcpResult(await getFormAction(mcpFormDeps(ctx), input.formId));
}

export async function createForm(
  ctx: ToolContext,
  input: unknown,
): Promise<ToolResult> {
  return actionToMcpResult(await createFormAction(mcpFormDeps(ctx), input));
}

export async function updateForm(
  ctx: ToolContext,
  input: { formId: string } & Record<string, unknown>,
): Promise<ToolResult> {
  const { formId, ...data } = input;
  return actionToMcpResult(await updateFormAction(mcpFormDeps(ctx), formId, data));
}

export async function deleteForm(
  ctx: ToolContext,
  input: { formId: string },
): Promise<ToolResult> {
  return actionToMcpResult(await deleteFormAction(mcpFormDeps(ctx), input.formId));
}

export async function listFormSteps(
  ctx: ToolContext,
  input: { formId: string },
): Promise<ToolResult> {
  return actionToMcpResult(await listFormStepsAction(mcpFormDeps(ctx), input.formId));
}

export async function createFormStep(
  ctx: ToolContext,
  input: { formId: string } & Record<string, unknown>,
): Promise<ToolResult> {
  const { formId, ...data } = input;
  return actionToMcpResult(await createFormStepAction(mcpFormDeps(ctx), formId, data));
}

export async function updateFormStep(
  ctx: ToolContext,
  input: { formId: string; stepId: string } & Record<string, unknown>,
): Promise<ToolResult> {
  const { formId, stepId, ...data } = input;
  return actionToMcpResult(
    await updateFormStepAction(mcpFormDeps(ctx), formId, stepId, data),
  );
}

export async function deleteFormStep(
  ctx: ToolContext,
  input: { formId: string; stepId: string },
): Promise<ToolResult> {
  return actionToMcpResult(
    await deleteFormStepAction(mcpFormDeps(ctx), input.formId, input.stepId),
  );
}

export async function reorderFormSteps(
  ctx: ToolContext,
  input: { formId: string; stepIds: string[] },
): Promise<ToolResult> {
  return actionToMcpResult(
    await reorderFormStepsAction(mcpFormDeps(ctx), input.formId, {
      stepIds: input.stepIds,
    }),
  );
}

export async function listFormFields(
  ctx: ToolContext,
  input: { formId: string },
): Promise<ToolResult> {
  return actionToMcpResult(await listFormFieldsAction(mcpFormDeps(ctx), input.formId));
}

export async function createFormField(
  ctx: ToolContext,
  input: { formId: string } & Record<string, unknown>,
): Promise<ToolResult> {
  const { formId, ...data } = input;
  return actionToMcpResult(await createFormFieldAction(mcpFormDeps(ctx), formId, data));
}

export async function updateFormField(
  ctx: ToolContext,
  input: { formId: string; fieldId: string } & Record<string, unknown>,
): Promise<ToolResult> {
  const { formId, fieldId, ...data } = input;
  return actionToMcpResult(
    await updateFormFieldAction(mcpFormDeps(ctx), formId, fieldId, data),
  );
}

export async function deleteFormField(
  ctx: ToolContext,
  input: { formId: string; fieldId: string },
): Promise<ToolResult> {
  return actionToMcpResult(
    await deleteFormFieldAction(mcpFormDeps(ctx), input.formId, input.fieldId),
  );
}

export async function reorderFormFields(
  ctx: ToolContext,
  input: { formId: string; stepId: string; fieldIds: string[] },
): Promise<ToolResult> {
  return actionToMcpResult(
    await reorderFormFieldsAction(mcpFormDeps(ctx), input.formId, {
      stepId: input.stepId,
      fieldIds: input.fieldIds,
    }),
  );
}

export async function listFormResponses(
  ctx: ToolContext,
  input: { formId: string; limit?: number; offset?: number },
): Promise<ToolResult> {
  return actionToMcpResult(
    await listFormResponsesAction(mcpFormDeps(ctx), input.formId, input),
  );
}

export async function getFormResponse(
  ctx: ToolContext,
  input: { formId: string; responseId: string },
): Promise<ToolResult> {
  return actionToMcpResult(
    await getFormResponseAction(mcpFormDeps(ctx), input.formId, input.responseId),
  );
}

export async function getFormResponseFile(
  ctx: ToolContext,
  input: { formId: string; responseId: string; valueId: string },
): Promise<ToolResult> {
  const result = await getFormResponseFileAction(mcpFormDeps(ctx), input);
  if (!result.ok) return actionToMcpResult(result);

  const bytes = new Uint8Array(await result.value.object.arrayBuffer());
  const uri = `linkycal://projects/${ctx.projectId()}/forms/${input.formId}/responses/${input.responseId}/files/${input.valueId}`;
  return {
    content: [
      {
        type: "resource",
        resource: {
          uri,
          mimeType: result.value.contentType,
          blob: base64(bytes),
          _meta: { filename: result.value.filename },
        },
      },
    ],
  };
}

export async function deleteFormResponse(
  ctx: ToolContext,
  input: { responseId: string },
): Promise<ToolResult> {
  return actionToMcpResult(
    await deleteFormResponseAction(mcpFormDeps(ctx), input.responseId),
  );
}

function mcpFormDeps(ctx: ToolContext) {
  return {
    db: ctx.db(),
    env: ctx.env(),
    projectId: ctx.projectId(),
    channel: "mcp" as const,
    waitUntil: ctx.waitUntil,
  };
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

// ─── Registration ───────────────────────────────────────────────────────────

const createShape = createFormSchema.shape;
const updateShape = updateFormSchema.shape;
const createStepShape = createFormStepSchema.shape;
const updateStepShape = updateFormStepSchema.shape;
const createFieldShape = createFormFieldObject.shape;
const updateFieldShape = updateFormFieldObject.shape;

export function registerFormTools(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    "list_forms",
    withMcpToolDiscovery("list_forms", {
      description:
        "List forms in this project with their status (draft/active/archived). Each form includes its public slug.",
      inputSchema: {},
      outputSchema: formListSlugOutputSchema,
    }),
    withToolErrors("list_forms", ctx, () => listForms(ctx)),
  );
  server.registerTool(
    "get_form",
    withMcpToolDiscovery("get_form", {
      description:
        "Get a form by id with all its steps and fields. Each field includes hidden.",
      inputSchema: { formId: z.string().describe("Form id") },
      outputSchema: formSlugOutputSchema,
    }),
    withToolErrors("get_form", ctx, (input) => getForm(ctx, input)),
  );
  server.registerTool(
    "create_form",
    withMcpToolDiscovery("create_form", {
      description: "Create a draft form with one empty initial step.",
      outputSchema: formSlugOutputSchema,
      inputSchema: {
        name: createShape.name.describe("Form name"),
        slug: createShape.slug.describe("URL slug"),
        type: createShape.type.describe("single or multi_step"),
        settings: createShape.settings.describe("Form presentation settings"),
      },
    }),
    withToolErrors("create_form", ctx, (input) => createForm(ctx, input)),
  );
  server.registerTool(
    "update_form",
    withMcpToolDiscovery("update_form", {
      description: "Update a form's configuration or publishing status.",
      outputSchema: formSlugOutputSchema,
      inputSchema: {
        formId: z.string().describe("Form id"),
        name: updateShape.name,
        slug: updateShape.slug,
        type: updateShape.type,
        status: updateShape.status,
        settings: updateShape.settings,
      },
    }),
    withToolErrors("update_form", ctx, (input) => updateForm(ctx, input)),
  );
  server.registerTool(
    "delete_form",
    withMcpToolDiscovery("delete_form", {
      description: "Permanently delete a form, its fields, and private response uploads.",
      inputSchema: { formId: z.string().describe("Form id") },
      annotations: { destructiveHint: true },
    }),
    withToolErrors("delete_form", ctx, (input) => deleteForm(ctx, input)),
  );
  server.registerTool(
    "create_form_step",
    withMcpToolDiscovery("create_form_step", {
      description: "Add a step to a form.",
      inputSchema: {
        formId: z.string(), sortOrder: createStepShape.sortOrder, title: createStepShape.title,
        description: createStepShape.description, richDescription: createStepShape.richDescription,
        settings: createStepShape.settings, visibility: createStepShape.visibility,
      },
    }),
    withToolErrors("create_form_step", ctx, (input) => createFormStep(ctx, input)),
  );
  server.registerTool(
    "update_form_step",
    withMcpToolDiscovery("update_form_step", {
      description: "Update a form step.",
      inputSchema: {
        formId: z.string(), stepId: z.string(), sortOrder: updateStepShape.sortOrder,
        title: updateStepShape.title, description: updateStepShape.description,
        richDescription: updateStepShape.richDescription, settings: updateStepShape.settings,
        visibility: updateStepShape.visibility,
      },
    }),
    withToolErrors("update_form_step", ctx, (input) => updateFormStep(ctx, input)),
  );
  server.registerTool(
    "delete_form_step",
    withMcpToolDiscovery("delete_form_step", {
      description: "Delete a form step and its fields.",
      inputSchema: { formId: z.string(), stepId: z.string() },
      annotations: { destructiveHint: true },
    }),
    withToolErrors("delete_form_step", ctx, (input) => deleteFormStep(ctx, input)),
  );
  server.registerTool(
    "reorder_form_steps",
    withMcpToolDiscovery("reorder_form_steps", {
      description: "Set the order of form steps.",
      inputSchema: { formId: z.string(), stepIds: z.array(z.string()).min(1).max(200) },
    }),
    withToolErrors("reorder_form_steps", ctx, (input) => reorderFormSteps(ctx, input)),
  );
  server.registerTool(
    "create_form_field",
    withMcpToolDiscovery("create_form_field", {
      description:
        "Add a field to a form step. Set hidden true for a field that stays off the public screen but still accepts prefill and conditions.",
      inputSchema: {
        formId: z.string(), stepId: createFieldShape.stepId, sortOrder: createFieldShape.sortOrder,
        type: createFieldShape.type, label: createFieldShape.label, description: createFieldShape.description,
        placeholder: createFieldShape.placeholder, required: createFieldShape.required,
        hidden: createFieldShape.hidden,
        validation: createFieldShape.validation, options: createFieldShape.options,
        visibility: createFieldShape.visibility, contactMapping: createFieldShape.contactMapping,
      },
    }),
    withToolErrors("create_form_field", ctx, (input) => createFormField(ctx, input)),
  );
  server.registerTool(
    "update_form_field",
    withMcpToolDiscovery("update_form_field", {
      description:
        "Update a form field or move it within this form. hidden marks a field as never shown.",
      inputSchema: {
        formId: z.string(), fieldId: z.string(), stepId: updateFieldShape.stepId,
        sortOrder: updateFieldShape.sortOrder, type: updateFieldShape.type, label: updateFieldShape.label,
        description: updateFieldShape.description, placeholder: updateFieldShape.placeholder,
        required: updateFieldShape.required, hidden: updateFieldShape.hidden,
        validation: updateFieldShape.validation,
        options: updateFieldShape.options, visibility: updateFieldShape.visibility,
        contactMapping: updateFieldShape.contactMapping,
      },
    }),
    withToolErrors("update_form_field", ctx, (input) => updateFormField(ctx, input)),
  );
  server.registerTool(
    "delete_form_field",
    withMcpToolDiscovery("delete_form_field", {
      description: "Delete a form field.",
      inputSchema: { formId: z.string(), fieldId: z.string() },
      annotations: { destructiveHint: true },
    }),
    withToolErrors("delete_form_field", ctx, (input) => deleteFormField(ctx, input)),
  );
  server.registerTool(
    "reorder_form_fields",
    withMcpToolDiscovery("reorder_form_fields", {
      description: "Set the order of fields in one form step.",
      inputSchema: { formId: z.string(), stepId: z.string(), fieldIds: z.array(z.string()).min(1).max(200) },
    }),
    withToolErrors("reorder_form_fields", ctx, (input) => reorderFormFields(ctx, input)),
  );
  server.registerTool(
    "list_form_responses",
    withMcpToolDiscovery("list_form_responses", {
      description: "List a paginated form response page with field values.",
      inputSchema: {
        formId: z.string(), limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      },
    }),
    withToolErrors("list_form_responses", ctx, (input) => listFormResponses(ctx, input)),
  );
  server.registerTool(
    "get_form_response",
    withMcpToolDiscovery("get_form_response", {
      description: "Get one form response with normalized field values.",
      inputSchema: { formId: z.string(), responseId: z.string() },
    }),
    withToolErrors("get_form_response", ctx, (input) => getFormResponse(ctx, input)),
  );
  server.registerTool(
    "get_form_response_file",
    withMcpToolDiscovery("get_form_response_file", {
      description: "Retrieve a private uploaded response file as an embedded binary resource.",
      inputSchema: { formId: z.string(), responseId: z.string(), valueId: z.string() },
    }),
    withToolErrors("get_form_response_file", ctx, (input) => getFormResponseFile(ctx, input)),
  );
  server.registerTool(
    "delete_form_response",
    withMcpToolDiscovery("delete_form_response", {
      description: "Permanently delete a form response.",
      inputSchema: { responseId: z.string() },
      annotations: { destructiveHint: true },
    }),
    withToolErrors("delete_form_response", ctx, (input) => deleteFormResponse(ctx, input)),
  );
}

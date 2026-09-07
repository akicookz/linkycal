import { and, eq } from "drizzle-orm";

import * as dbSchema from "../db/schema";
import { FormService } from "../services/form-service";
import { StorageUsageService } from "../services/storage-usage-service";
import {
  createFormFieldSchema,
  hiddenFieldConflict,
  createFormSchema,
  createFormStepSchema,
  listFormResponsesQuerySchema,
  reorderFieldsSchema,
  reorderFormStepsSchema,
  updateFormFieldSchema,
  updateFormSchema,
  updateFormStepSchema,
} from "../validation";
import {
  actionCreated,
  actionError,
  actionOk,
  type ActionResult,
  type ProjectActionDeps,
} from "./action-result";
import { createWithResourceCapacity } from "./resource-creation";
import { resolveProjectWorkspace } from "./entitlements";

export interface FormResponsePageInput {
  limit?: number;
  offset?: number;
}

export interface FormResponseFile {
  object: R2ObjectBody;
  filename: string;
  contentType: string;
}

function notFound<T = never>(): ActionResult<T> {
  return actionError(404, "Not found");
}

function invalidRequest<T = never>(): ActionResult<T> {
  return actionError(400, "Invalid request");
}

function sanitizeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop()?.trim() || "upload";
  const safe = base
    .split("")
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127 && character !== '"';
    })
    .join("")
    .replace(/[<>:|?*]+/g, "_")
    .slice(0, 160)
    .trim();
  return safe || "upload";
}

function isPrivateUpload(value: string | null): value is string {
  return !!value && value.startsWith("form-responses/");
}

async function removePrivateUploads(
  deps: ProjectActionDeps,
  fileUrls: Array<string | null>,
): Promise<ActionResult<never> | null> {
  const keys = Array.from(new Set(fileUrls.filter(isPrivateUpload)));
  if (keys.length === 0) return null;

  const workspace = await resolveProjectWorkspace(deps.db, deps.projectId);
  if (!workspace) return notFound();
  const storage = new StorageUsageService(deps.db);
  try {
    for (const key of keys) {
      await deps.env.UPLOADS.delete(key);
      await storage.remove(workspace, key);
    }
  } catch (error) {
    console.error("Failed to delete private form upload:", error);
    return actionError(500, "Failed to delete private form uploads");
  }
  return null;
}

async function formInProject(
  deps: ProjectActionDeps,
  formId: string,
): Promise<Awaited<ReturnType<FormService["getById"]>>> {
  const form = await new FormService(deps.db).getById(formId);
  return form?.projectId === deps.projectId ? form : null;
}

async function stepInForm(
  service: FormService,
  formId: string,
  stepId: string,
) {
  const step = await service.getStepById(stepId);
  return step?.formId === formId ? step : null;
}

async function responseInForm(
  deps: ProjectActionDeps,
  formId: string,
  responseId: string,
) {
  const [response] = await deps.db
    .select({ response: dbSchema.formResponses })
    .from(dbSchema.formResponses)
    .innerJoin(dbSchema.forms, eq(dbSchema.formResponses.formId, dbSchema.forms.id))
    .where(
      and(
        eq(dbSchema.formResponses.id, responseId),
        eq(dbSchema.formResponses.formId, formId),
        eq(dbSchema.forms.projectId, deps.projectId),
      ),
    )
    .limit(1);
  return response?.response ?? null;
}

// ─── Forms ──────────────────────────────────────────────────────────────────

export async function listFormsAction(
  deps: ProjectActionDeps,
): Promise<ActionResult<Awaited<ReturnType<FormService["list"]>>>> {
  return actionOk(await new FormService(deps.db).list(deps.projectId));
}

export async function getFormAction(
  deps: ProjectActionDeps,
  formId: string,
): Promise<ActionResult<NonNullable<Awaited<ReturnType<FormService["getFullForm"]>>>>> {
  if (!(await formInProject(deps, formId))) return notFound();
  const form = await new FormService(deps.db).getFullForm(formId);
  return form ? actionOk(form) : notFound();
}

export async function createFormAction(
  deps: ProjectActionDeps,
  input: unknown,
): Promise<ActionResult<NonNullable<Awaited<ReturnType<FormService["create"]>>>>> {
  const parsed = createFormSchema.safeParse(input);
  if (!parsed.success) return invalidRequest();

  const service = new FormService(deps.db);
  if (await service.getBySlug(deps.projectId, parsed.data.slug)) {
    return actionError(
      409,
      "This form slug is already taken. Please choose a different one.",
    );
  }

  const creation = await createWithResourceCapacity({
    db: deps.db,
    projectId: deps.projectId,
    key: "forms",
    env: deps.env,
    channel: deps.channel,
    create: async function createForm(transaction) {
      return new FormService(transaction).create(deps.projectId, parsed.data);
    },
  });
  if (!creation.ok) {
    return { ok: false, status: creation.status, body: { ...creation.body } };
  }
  if (!creation.value) return actionError(500, "Failed to create form");
  return actionCreated(creation.value);
}

export async function updateFormAction(
  deps: ProjectActionDeps,
  formId: string,
  input: unknown,
): Promise<ActionResult<NonNullable<Awaited<ReturnType<FormService["update"]>>>>> {
  const parsed = updateFormSchema.safeParse(input);
  if (!parsed.success) return invalidRequest();
  const service = new FormService(deps.db);
  const existing = await formInProject(deps, formId);
  if (!existing) return notFound();

  if (parsed.data.slug) {
    const conflicting = await service.getBySlug(deps.projectId, parsed.data.slug);
    if (conflicting && conflicting.id !== formId) {
      return actionError(
        409,
        "This form slug is already taken. Please choose a different one.",
      );
    }
  }

  const form = await service.update(formId, parsed.data);
  return form ? actionOk(form) : notFound();
}

export async function deleteFormAction(
  deps: ProjectActionDeps,
  formId: string,
): Promise<ActionResult<{ success: true }>> {
  if (!(await formInProject(deps, formId))) return notFound();
  const fileValues = await deps.db
    .select({ fileUrl: dbSchema.formFieldValues.fileUrl })
    .from(dbSchema.formFieldValues)
    .where(eq(dbSchema.formFieldValues.formId, formId));
  const cleanupFailure = await removePrivateUploads(
    deps,
    fileValues.map(function fileUrl(value) {
      return value.fileUrl;
    }),
  );
  if (cleanupFailure) return cleanupFailure;
  await new FormService(deps.db).delete(formId);
  return actionOk({ success: true });
}

// ─── Form Steps ─────────────────────────────────────────────────────────────

export async function listFormStepsAction(
  deps: ProjectActionDeps,
  formId: string,
): Promise<ActionResult<Awaited<ReturnType<FormService["listSteps"]>>>> {
  if (!(await formInProject(deps, formId))) return notFound();
  return actionOk(await new FormService(deps.db).listSteps(formId));
}

export async function createFormStepAction(
  deps: ProjectActionDeps,
  formId: string,
  input: unknown,
): Promise<ActionResult<NonNullable<Awaited<ReturnType<FormService["createStep"]>>>>> {
  const parsed = createFormStepSchema.safeParse(input);
  if (!parsed.success) return invalidRequest();
  if (!(await formInProject(deps, formId))) return notFound();
  const step = await new FormService(deps.db).createStep(formId, parsed.data);
  return step ? actionCreated(step) : notFound();
}

export async function updateFormStepAction(
  deps: ProjectActionDeps,
  formId: string,
  stepId: string,
  input: unknown,
): Promise<ActionResult<NonNullable<Awaited<ReturnType<FormService["updateStep"]>>>>> {
  const parsed = updateFormStepSchema.safeParse(input);
  if (!parsed.success) return invalidRequest();
  if (!(await formInProject(deps, formId))) return notFound();
  const service = new FormService(deps.db);
  if (!(await stepInForm(service, formId, stepId))) return notFound();
  const step = await service.updateStep(stepId, parsed.data);
  return step ? actionOk(step) : notFound();
}

export async function deleteFormStepAction(
  deps: ProjectActionDeps,
  formId: string,
  stepId: string,
): Promise<ActionResult<{ success: true }>> {
  if (!(await formInProject(deps, formId))) return notFound();
  const service = new FormService(deps.db);
  if (!(await stepInForm(service, formId, stepId))) return notFound();
  await service.deleteStep(stepId);
  return actionOk({ success: true });
}

export async function reorderFormStepsAction(
  deps: ProjectActionDeps,
  formId: string,
  input: unknown,
): Promise<ActionResult<Awaited<ReturnType<FormService["listSteps"]>>>> {
  const parsed = reorderFormStepsSchema.safeParse(input);
  if (!parsed.success) return invalidRequest();
  if (!(await formInProject(deps, formId))) return notFound();
  const service = new FormService(deps.db);
  const steps = await Promise.all(
    parsed.data.stepIds.map(async function loadStep(stepId) {
      return stepInForm(service, formId, stepId);
    }),
  );
  if (steps.some((step) => !step)) return notFound();
  const existingIds = (await service.listSteps(formId)).map((step) => step.id);
  if (
    parsed.data.stepIds.length !== existingIds.length ||
    new Set(parsed.data.stepIds).size !== existingIds.length
  ) {
    return invalidRequest();
  }
  return actionOk(await service.reorderSteps(formId, parsed.data.stepIds));
}

// ─── Form Fields ────────────────────────────────────────────────────────────

export async function listFormFieldsAction(
  deps: ProjectActionDeps,
  formId: string,
): Promise<ActionResult<Awaited<ReturnType<FormService["listFields"]>>>> {
  if (!(await formInProject(deps, formId))) return notFound();
  return actionOk(await new FormService(deps.db).listFields(formId));
}

export async function createFormFieldAction(
  deps: ProjectActionDeps,
  formId: string,
  input: unknown,
): Promise<ActionResult<NonNullable<Awaited<ReturnType<FormService["createField"]>>>>> {
  const parsed = createFormFieldSchema.safeParse(input);
  if (!parsed.success) return invalidRequest();
  if (!(await formInProject(deps, formId))) return notFound();
  const service = new FormService(deps.db);
  if (!(await stepInForm(service, formId, parsed.data.stepId))) return notFound();
  const field = await service.createField(parsed.data);
  return field ? actionCreated(field) : notFound();
}

export async function updateFormFieldAction(
  deps: ProjectActionDeps,
  formId: string,
  fieldId: string,
  input: unknown,
): Promise<ActionResult<NonNullable<Awaited<ReturnType<FormService["updateField"]>>>>> {
  const parsed = updateFormFieldSchema.safeParse(input);
  if (!parsed.success) return invalidRequest();
  if (!(await formInProject(deps, formId))) return notFound();
  const service = new FormService(deps.db);
  const existing = await service.getFieldById(formId, fieldId);
  if (!existing) return notFound();
  if (
    parsed.data.stepId &&
    !(await stepInForm(service, formId, parsed.data.stepId))
  ) {
    return notFound();
  }
  if (
    hiddenFieldConflict({
      hidden: parsed.data.hidden ?? existing.hidden,
      required: parsed.data.required ?? existing.required,
      visibility:
        parsed.data.visibility !== undefined
          ? parsed.data.visibility
          : existing.visibility,
      type: parsed.data.type ?? existing.type,
    })
  ) {
    return invalidRequest();
  }
  const field = await service.updateField(formId, fieldId, parsed.data);
  return field ? actionOk(field) : notFound();
}

export async function deleteFormFieldAction(
  deps: ProjectActionDeps,
  formId: string,
  fieldId: string,
): Promise<ActionResult<{ success: true }>> {
  if (!(await formInProject(deps, formId))) return notFound();
  const service = new FormService(deps.db);
  if (!(await service.getFieldById(formId, fieldId))) return notFound();
  await service.deleteField(formId, fieldId);
  return actionOk({ success: true });
}

export async function reorderFormFieldsAction(
  deps: ProjectActionDeps,
  formId: string,
  input: unknown,
): Promise<ActionResult<{ success: true }>> {
  const parsed = reorderFieldsSchema.safeParse(input);
  if (!parsed.success) return invalidRequest();
  if (!(await formInProject(deps, formId))) return notFound();
  const service = new FormService(deps.db);
  if (!(await stepInForm(service, formId, parsed.data.stepId))) return notFound();
  const fields = await Promise.all(
    parsed.data.fieldIds.map(async function loadField(fieldId) {
      return service.getFieldById(formId, fieldId);
    }),
  );
  if (fields.some((field) => !field || field.stepId !== parsed.data.stepId)) {
    return notFound();
  }
  const existingIds = (await service.listFieldsByStep(parsed.data.stepId)).map(
    (field) => field.id,
  );
  if (
    parsed.data.fieldIds.length !== existingIds.length ||
    new Set(parsed.data.fieldIds).size !== existingIds.length
  ) {
    return invalidRequest();
  }
  await service.reorderFields(formId, parsed.data.stepId, parsed.data.fieldIds);
  return actionOk({ success: true });
}

// ─── Form Responses ─────────────────────────────────────────────────────────

export async function listFormResponsesAction(
  deps: ProjectActionDeps,
  formId: string,
  input: FormResponsePageInput = {},
): Promise<ActionResult<Awaited<ReturnType<FormService["listResponsesWithValues"]>>>> {
  const parsed = listFormResponsesQuerySchema.safeParse(input);
  if (!parsed.success) return invalidRequest();
  if (!(await formInProject(deps, formId))) return notFound();
  const { offset, limit } = parsed.data;
  const responses = await new FormService(deps.db).listResponsesWithValues(
    formId,
    { offset, limit },
  );
  return actionOk(responses);
}

export async function getFormResponseAction(
  deps: ProjectActionDeps,
  formId: string,
  responseId: string,
): Promise<ActionResult<NonNullable<Awaited<ReturnType<FormService["getResponseWithValues"]>>>>> {
  if (!(await responseInForm(deps, formId, responseId))) return notFound();
  const response = await new FormService(deps.db).getResponseWithValues(responseId);
  return response ? actionOk(response) : notFound();
}

export async function deleteFormResponseAction(
  deps: ProjectActionDeps,
  responseId: string,
): Promise<ActionResult<{ success: true }>> {
  const [response] = await deps.db
    .select({ id: dbSchema.formResponses.id })
    .from(dbSchema.formResponses)
    .innerJoin(dbSchema.forms, eq(dbSchema.formResponses.formId, dbSchema.forms.id))
    .where(
      and(
        eq(dbSchema.formResponses.id, responseId),
        eq(dbSchema.forms.projectId, deps.projectId),
      ),
    )
    .limit(1);
  if (!response) return notFound();

  const fileValues = await deps.db
    .select({ fileUrl: dbSchema.formFieldValues.fileUrl })
    .from(dbSchema.formFieldValues)
    .where(eq(dbSchema.formFieldValues.responseId, responseId));
  const cleanupFailure = await removePrivateUploads(
    deps,
    fileValues.map(function fileUrl(value) {
      return value.fileUrl;
    }),
  );
  if (cleanupFailure) return cleanupFailure;

  await deps.db
    .delete(dbSchema.formFieldValues)
    .where(eq(dbSchema.formFieldValues.responseId, responseId));
  await deps.db
    .delete(dbSchema.formResponses)
    .where(eq(dbSchema.formResponses.id, responseId));
  return actionOk({ success: true });
}

export async function getFormResponseFileAction(
  deps: ProjectActionDeps,
  input: { formId: string; responseId: string; valueId: string },
): Promise<ActionResult<FormResponseFile>> {
  const [row] = await deps.db
    .select({
      value: dbSchema.formFieldValues.value,
      fileUrl: dbSchema.formFieldValues.fileUrl,
      fieldType: dbSchema.formFields.type,
    })
    .from(dbSchema.formFieldValues)
    .innerJoin(
      dbSchema.formFields,
      and(
        eq(dbSchema.formFieldValues.formId, dbSchema.formFields.formId),
        eq(dbSchema.formFieldValues.fieldId, dbSchema.formFields.id),
      ),
    )
    .innerJoin(
      dbSchema.formResponses,
      eq(dbSchema.formFieldValues.responseId, dbSchema.formResponses.id),
    )
    .innerJoin(dbSchema.forms, eq(dbSchema.formFieldValues.formId, dbSchema.forms.id))
    .where(
      and(
        eq(dbSchema.formFieldValues.id, input.valueId),
        eq(dbSchema.formFieldValues.responseId, input.responseId),
        eq(dbSchema.formFieldValues.formId, input.formId),
        eq(dbSchema.formResponses.formId, input.formId),
        eq(dbSchema.forms.projectId, deps.projectId),
      ),
    )
    .limit(1);
  if (!row || row.fieldType !== "file" || !row.fileUrl) return notFound();
  if (!isPrivateUpload(row.fileUrl)) return actionError(400, "File is not a private upload");

  const object = await deps.env.UPLOADS.get(row.fileUrl);
  if (!object) return notFound();
  return actionOk({
    object,
    filename: sanitizeFilename(
      row.value ?? object.customMetadata?.filename ?? "upload",
    ),
    contentType: object.httpMetadata?.contentType ?? "application/octet-stream",
  });
}

import { eq, and, asc, desc, inArray } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as dbSchema from "../db/schema";
import { getUniqueFieldId } from "../lib/field-ids";
import { plainTextToRichTextHtml } from "../lib/rich-text";

// ─── Field Helpers ───────────────────────────────────────────────────────────

const FIELD_TYPE_PLACEHOLDERS: Record<string, string | null> = {
  name: "Full name",
  text: "Start typing...",
  textarea: "Start typing...",
  email: "name@example.com",
  phone: "+1 (555) 000-0000",
  url: "https://example.com",
  number: "0",
  completion: null,
  date: "Select a date",
  time: "Select a time",
  select: "Select an option",
  multi_select: "Select options",
  radio: null,
  checkbox: null,
  rating: null,
  file: "Choose a file",
};

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  const parsed = parseJsonValue(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  return parsed as Record<string, unknown>;
}

function parseFieldOptions(
  value: unknown,
): Array<{ label: string; value: string }> | null {
  const parsed = parseJsonValue(value);
  if (!Array.isArray(parsed)) return null;

  return parsed
    .filter(
      (option): option is { label: string; value: string } =>
        !!option &&
        typeof option === "object" &&
        typeof (option as { label?: unknown }).label === "string" &&
        typeof (option as { value?: unknown }).value === "string",
    )
    .map((option) => ({
      label: option.label,
      value: option.value,
    }));
}

function normalizeFormRow<T extends { settings: unknown }>(form: T) {
  return {
    ...form,
    settings: parseJsonObject(form.settings),
  };
}

function normalizeStepRow<
  T extends {
    settings: unknown;
    visibility?: unknown;
    description?: string | null;
    richDescription?: string | null;
  },
>(step: T) {
  return {
    ...step,
    richDescription:
      step.richDescription ?? plainTextToRichTextHtml(step.description ?? null),
    settings: parseJsonObject(step.settings),
    visibility: parseJsonObject(step.visibility),
  };
}

function normalizeFieldRow<
  T extends { validation: unknown; options: unknown; visibility?: unknown },
>(field: T) {
  return {
    ...field,
    validation: parseJsonObject(field.validation),
    options: parseFieldOptions(field.options),
    visibility: parseJsonObject(field.visibility),
  };
}

function normalizeResponseRow<T extends { metadata: unknown }>(response: T) {
  return {
    ...response,
    metadata: parseJsonValue(response.metadata),
  };
}

function formatResponseDisplayValue(
  field:
    | {
        type: string;
        options: Array<{ label: string; value: string }> | null;
      }
    | undefined,
  value: string | null,
  fileUrl: string | null,
): string {
  if (fileUrl) return fileUrl;

  const rawValue = value?.trim() ?? "";
  if (!rawValue) return "";
  if (!field) return rawValue;

  if (field.type === "select" || field.type === "radio") {
    return (
      field.options?.find((option) => option.value === rawValue)?.label ??
      rawValue
    );
  }

  if (
    field.type === "multi_select" ||
    (field.type === "checkbox" && (field.options?.length ?? 0) > 0)
  ) {
    const labels = rawValue
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map(
        (entry) =>
          field.options?.find((option) => option.value === entry)?.label ??
          entry,
      );

    return labels.join(", ");
  }

  if (field.type === "checkbox") {
    return rawValue === "true" ? "Yes" : rawValue;
  }

  if (field.type === "rating") {
    return `${rawValue}/5`;
  }

  return rawValue;
}

// ─── Form Service ────────────────────────────────────────────────────────────

export class FormService {
  constructor(private db: DrizzleD1Database<Record<string, unknown>>) {}

  async getUniqueFieldIdForForm(
    formId: string,
    label: string,
    currentId?: string,
  ) {
    const existingFields = await this.listFields(formId);
    return getUniqueFieldId(
      label,
      existingFields.map((field) => field.id),
      currentId,
    );
  }

  async renameFieldId(formId: string, currentId: string, nextId: string) {
    if (currentId === nextId) return;

    const db = this.db as typeof this.db & { $client: D1Database };

    await db.$client.batch([
      db.$client.prepare("PRAGMA defer_foreign_keys = ON"),
      db.$client
        .prepare("UPDATE form_fields SET id = ? WHERE form_id = ? AND id = ?")
        .bind(nextId, formId, currentId),
      db.$client
        .prepare(
          "UPDATE form_field_values SET field_id = ? WHERE form_id = ? AND field_id = ?",
        )
        .bind(nextId, formId, currentId),
    ]);
  }

  // ─── Forms CRUD ──────────────────────────────────────────────────────────

  async list(projectId: string) {
    const rows = await this.db
      .select()
      .from(dbSchema.forms)
      .where(eq(dbSchema.forms.projectId, projectId))
      .orderBy(desc(dbSchema.forms.createdAt));

    return rows.map(normalizeFormRow);
  }

  async getById(id: string) {
    const rows = await this.db
      .select()
      .from(dbSchema.forms)
      .where(eq(dbSchema.forms.id, id))
      .limit(1);

    return rows[0] ? normalizeFormRow(rows[0]) : null;
  }

  async getBySlug(projectId: string, slug: string) {
    const rows = await this.db
      .select()
      .from(dbSchema.forms)
      .where(
        and(
          eq(dbSchema.forms.projectId, projectId),
          eq(dbSchema.forms.slug, slug),
        ),
      )
      .limit(1);

    return rows[0] ? normalizeFormRow(rows[0]) : null;
  }

  async getBySlugGlobal(slug: string) {
    const rows = await this.db
      .select()
      .from(dbSchema.forms)
      .where(eq(dbSchema.forms.slug, slug))
      .limit(1);

    return rows[0] ? normalizeFormRow(rows[0]) : null;
  }

  async getFullFormBySlugGlobal(slug: string) {
    const form = await this.getBySlugGlobal(slug);
    if (!form) return null;
    return this.getFullForm(form.id);
  }

  async create(
    projectId: string,
    data: {
      name: string;
      slug: string;
      type?: "multi_step" | "single";
      settings?: Record<string, unknown>;
    },
  ) {
    const id = crypto.randomUUID();
    await this.db.insert(dbSchema.forms).values({
      id,
      projectId,
      name: data.name,
      slug: data.slug,
      type: data.type ?? "single",
      status: "draft",
      settings: data.settings ? JSON.stringify(data.settings) : null,
    });

    // Create a default first step
    const stepId = crypto.randomUUID();
    await this.db.insert(dbSchema.formSteps).values({
      id: stepId,
      formId: id,
      sortOrder: 0,
      title: "Step 1",
    });

    return this.getById(id);
  }

  async update(
    id: string,
    data: {
      name?: string;
      slug?: string;
      type?: "multi_step" | "single";
      status?: "draft" | "active" | "archived";
      settings?: Record<string, unknown> | null;
    },
  ) {
    const values: Record<string, unknown> = {};
    if (data.name !== undefined) values.name = data.name;
    if (data.slug !== undefined) values.slug = data.slug;
    if (data.type !== undefined) values.type = data.type;
    if (data.status !== undefined) values.status = data.status;
    if (data.settings !== undefined)
      values.settings = data.settings ? JSON.stringify(data.settings) : null;

    if (Object.keys(values).length === 0) return this.getById(id);

    await this.db
      .update(dbSchema.forms)
      .set(values)
      .where(eq(dbSchema.forms.id, id));

    return this.getById(id);
  }

  async delete(id: string) {
    await this.db.delete(dbSchema.forms).where(eq(dbSchema.forms.id, id));
  }

  // ─── Steps CRUD ──────────────────────────────────────────────────────────

  async listSteps(formId: string) {
    const rows = await this.db
      .select()
      .from(dbSchema.formSteps)
      .where(eq(dbSchema.formSteps.formId, formId))
      .orderBy(asc(dbSchema.formSteps.sortOrder));

    return rows.map(normalizeStepRow);
  }

  async getStepById(id: string) {
    const rows = await this.db
      .select()
      .from(dbSchema.formSteps)
      .where(eq(dbSchema.formSteps.id, id))
      .limit(1);

    return rows[0] ? normalizeStepRow(rows[0]) : null;
  }

  async createStep(
    formId: string,
    data: {
      sortOrder?: number;
      title?: string;
      description?: string;
      richDescription?: string;
      settings?: Record<string, unknown>;
      visibility?: Record<string, unknown> | null;
    },
  ) {
    const id = crypto.randomUUID();

    // Auto-calculate sortOrder if not provided
    let sortOrder = data.sortOrder ?? 0;
    if (data.sortOrder === undefined) {
      const steps = await this.listSteps(formId);
      sortOrder = steps.length;
    }

    await this.db.insert(dbSchema.formSteps).values({
      id,
      formId,
      sortOrder,
      title: data.title ?? `Step ${sortOrder + 1}`,
      description: data.description ?? null,
      richDescription: data.richDescription ?? null,
      settings: data.settings ? JSON.stringify(data.settings) : null,
      visibility: data.visibility ? JSON.stringify(data.visibility) : null,
    });

    return this.getStepById(id);
  }

  async updateStep(
    id: string,
    data: {
      sortOrder?: number;
      title?: string;
      description?: string | null;
      richDescription?: string | null;
      settings?: Record<string, unknown> | null;
      visibility?: Record<string, unknown> | null;
    },
  ) {
    const values: Record<string, unknown> = {};
    if (data.sortOrder !== undefined) values.sortOrder = data.sortOrder;
    if (data.title !== undefined) values.title = data.title;
    if (data.description !== undefined) values.description = data.description;
    if (data.richDescription !== undefined)
      values.richDescription = data.richDescription;
    if (data.settings !== undefined)
      values.settings = data.settings ? JSON.stringify(data.settings) : null;
    if (data.visibility !== undefined)
      values.visibility = data.visibility
        ? JSON.stringify(data.visibility)
        : null;

    if (Object.keys(values).length === 0) return this.getStepById(id);

    await this.db
      .update(dbSchema.formSteps)
      .set(values)
      .where(eq(dbSchema.formSteps.id, id));

    return this.getStepById(id);
  }

  async deleteStep(id: string) {
    await this.db
      .delete(dbSchema.formSteps)
      .where(eq(dbSchema.formSteps.id, id));
  }

  async reorderSteps(formId: string, stepIds: string[]) {
    for (let i = 0; i < stepIds.length; i++) {
      await this.db
        .update(dbSchema.formSteps)
        .set({ sortOrder: i })
        .where(
          and(
            eq(dbSchema.formSteps.id, stepIds[i]),
            eq(dbSchema.formSteps.formId, formId),
          ),
        );
    }
    return this.listSteps(formId);
  }

  // ─── Fields CRUD ─────────────────────────────────────────────────────────

  async reorderFields(formId: string, _stepId: string, fieldIds: string[]) {
    for (let i = 0; i < fieldIds.length; i++) {
      await this.db
        .update(dbSchema.formFields)
        .set({ sortOrder: i })
        .where(
          and(
            eq(dbSchema.formFields.formId, formId),
            eq(dbSchema.formFields.id, fieldIds[i]),
          ),
        );
    }
  }

  async listFields(formId: string) {
    const rows = await this.db
      .select()
      .from(dbSchema.formFields)
      .where(eq(dbSchema.formFields.formId, formId))
      .orderBy(
        asc(dbSchema.formFields.stepId),
        asc(dbSchema.formFields.sortOrder),
      );

    return rows.map(normalizeFieldRow);
  }

  async listFieldsByStep(stepId: string) {
    const rows = await this.db
      .select()
      .from(dbSchema.formFields)
      .where(eq(dbSchema.formFields.stepId, stepId))
      .orderBy(asc(dbSchema.formFields.sortOrder));

    return rows.map(normalizeFieldRow);
  }

  async getFieldById(formId: string, id: string) {
    const rows = await this.db
      .select()
      .from(dbSchema.formFields)
      .where(
        and(
          eq(dbSchema.formFields.formId, formId),
          eq(dbSchema.formFields.id, id),
        ),
      )
      .limit(1);

    return rows[0] ? normalizeFieldRow(rows[0]) : null;
  }

  async createField(data: {
    stepId: string;
    sortOrder?: number;
    type: string;
    label: string;
    description?: string | null;
    placeholder?: string;
    required?: boolean;
    validation?: Record<string, unknown>;
    options?: Array<{ label: string; value: string }>;
    visibility?: Record<string, unknown> | null;
    contactMapping?: "name" | "email" | null;
  }) {
    const [step] = await this.db
      .select()
      .from(dbSchema.formSteps)
      .where(eq(dbSchema.formSteps.id, data.stepId))
      .limit(1);

    if (!step) return null;

    const id = await this.getUniqueFieldIdForForm(step.formId, data.label);

    let sortOrder = data.sortOrder ?? 0;
    if (data.sortOrder === undefined) {
      const fields = await this.listFieldsByStep(data.stepId);
      sortOrder = fields.length;
    }

    const placeholder =
      data.placeholder ?? FIELD_TYPE_PLACEHOLDERS[data.type] ?? null;

    await this.db.insert(dbSchema.formFields).values({
      id,
      formId: step.formId,
      stepId: data.stepId,
      sortOrder,
      type: data.type as any,
      label: data.label,
      description: data.description ?? null,
      placeholder,
      required: data.required ?? false,
      validation: data.validation ? JSON.stringify(data.validation) : null,
      options: data.options ? JSON.stringify(data.options) : null,
      visibility: data.visibility ? JSON.stringify(data.visibility) : null,
      contactMapping: data.contactMapping ?? null,
    });

    return this.getFieldById(step.formId, id);
  }

  async updateField(
    formId: string,
    id: string,
    data: {
      stepId?: string;
      sortOrder?: number;
      type?: string;
      label?: string;
      description?: string | null;
      placeholder?: string | null;
      required?: boolean;
      validation?: Record<string, unknown> | null;
      options?: Array<{ label: string; value: string }> | null;
      contactMapping?: string | null;
      visibility?: Record<string, unknown> | null;
    },
  ) {
    let currentField = await this.getFieldById(formId, id);
    if (!currentField) return null;

    const currentStep = await this.getStepById(currentField.stepId);
    if (!currentStep || currentStep.formId !== formId) return null;

    const fieldEq = (fieldId: string) =>
      and(
        eq(dbSchema.formFields.formId, formId),
        eq(dbSchema.formFields.id, fieldId),
      );

    const values: Record<string, unknown> = {};
    if (data.type !== undefined) {
      values.type = data.type;
      if (data.placeholder === undefined) {
        values.placeholder = FIELD_TYPE_PLACEHOLDERS[data.type] ?? null;
      }
    }
    if (data.label !== undefined) values.label = data.label;
    if (data.description !== undefined) values.description = data.description;
    if (data.placeholder !== undefined) values.placeholder = data.placeholder;
    if (data.required !== undefined) values.required = data.required;
    if (data.validation !== undefined)
      values.validation = data.validation
        ? JSON.stringify(data.validation)
        : null;
    if (data.options !== undefined)
      values.options = data.options ? JSON.stringify(data.options) : null;
    if (data.contactMapping !== undefined)
      values.contactMapping = data.contactMapping;
    if (data.visibility !== undefined)
      values.visibility = data.visibility
        ? JSON.stringify(data.visibility)
        : null;

    if (data.contactMapping) {
      const allFields = await this.listFields(formId);
      for (const f of allFields) {
        if (f.id !== id && f.contactMapping === data.contactMapping) {
          await this.db
            .update(dbSchema.formFields)
            .set({ contactMapping: null })
            .where(fieldEq(f.id));
        }
      }
    }

    let nextId = id;
    if (data.label !== undefined) {
      nextId = await this.getUniqueFieldIdForForm(formId, data.label, id);
    }

    if (nextId !== id) {
      await this.renameFieldId(formId, id, nextId);
      currentField = await this.getFieldById(formId, nextId);
      if (!currentField) return null;
    }

    const targetStepId = data.stepId ?? currentField.stepId;
    const isMovingSteps = targetStepId !== currentField.stepId;
    const hasPositionChange = isMovingSteps || data.sortOrder !== undefined;

    if (hasPositionChange) {
      const sourceStep = await this.getStepById(currentField.stepId);
      const targetStep = await this.getStepById(targetStepId);
      if (!sourceStep || !targetStep) {
        return null;
      }

      if (sourceStep.formId !== targetStep.formId) {
        throw new Error("Cannot move field across forms");
      }

      const sourceFieldIds = (await this.listFieldsByStep(currentField.stepId))
        .map((field) => field.id)
        .filter((fieldId) => fieldId !== nextId);

      if (targetStepId === currentField.stepId) {
        const insertionIndex = Math.max(
          0,
          Math.min(data.sortOrder ?? sourceFieldIds.length, sourceFieldIds.length),
        );
        sourceFieldIds.splice(insertionIndex, 0, nextId);

        for (let index = 0; index < sourceFieldIds.length; index++) {
          const nextValues =
            sourceFieldIds[index] === nextId
              ? {
                  ...values,
                  sortOrder: index,
                }
              : { sortOrder: index };

          await this.db
            .update(dbSchema.formFields)
            .set(nextValues)
            .where(fieldEq(sourceFieldIds[index]));
        }

        return this.getFieldById(formId, nextId);
      }

      const targetFieldIds = (await this.listFieldsByStep(targetStepId)).map(
        (field) => field.id,
      );
      const insertionIndex = Math.max(
        0,
        Math.min(data.sortOrder ?? targetFieldIds.length, targetFieldIds.length),
      );
      targetFieldIds.splice(insertionIndex, 0, nextId);

      for (let index = 0; index < sourceFieldIds.length; index++) {
        await this.db
          .update(dbSchema.formFields)
          .set({ sortOrder: index })
          .where(fieldEq(sourceFieldIds[index]));
      }

      for (let index = 0; index < targetFieldIds.length; index++) {
        const nextValues =
          targetFieldIds[index] === nextId
            ? {
                ...values,
                stepId: targetStepId,
                sortOrder: index,
              }
            : { sortOrder: index };

        await this.db
          .update(dbSchema.formFields)
          .set(nextValues)
          .where(fieldEq(targetFieldIds[index]));
      }

      return this.getFieldById(formId, nextId);
    }

    if (Object.keys(values).length === 0) return currentField;

    await this.db
      .update(dbSchema.formFields)
      .set(values)
      .where(fieldEq(nextId));

    return this.getFieldById(formId, nextId);
  }

  async deleteField(formId: string, id: string) {
    await this.db
      .delete(dbSchema.formFields)
      .where(
        and(
          eq(dbSchema.formFields.formId, formId),
          eq(dbSchema.formFields.id, id),
        ),
      );
  }

  // ─── Responses ───────────────────────────────────────────────────────────

  async listResponses(formId: string) {
    const rows = await this.db
      .select()
      .from(dbSchema.formResponses)
      .where(eq(dbSchema.formResponses.formId, formId))
      .orderBy(desc(dbSchema.formResponses.createdAt));

    return rows.map(normalizeResponseRow);
  }

  async getResponseById(id: string) {
    const rows = await this.db
      .select()
      .from(dbSchema.formResponses)
      .where(eq(dbSchema.formResponses.id, id))
      .limit(1);

    return rows[0] ? normalizeResponseRow(rows[0]) : null;
  }

  async createResponse(formId: string, metadata?: Record<string, unknown>) {
    const id = crypto.randomUUID();
    await this.db.insert(dbSchema.formResponses).values({
      id,
      formId,
      currentStepIndex: 0,
      status: "in_progress",
      metadata: metadata ? JSON.stringify(metadata) : null,
    });

    const response = await this.getResponseById(id);
    if (!response) {
      throw new Error("Failed to load created form response");
    }

    return response;
  }

  async submitStep(
    responseId: string,
    stepIndex: number,
    fields: Array<{
      fieldId: string;
      value?: string | null;
      fileUrl?: string | null;
    }>,
    options: { complete?: boolean } = {},
  ) {
    const response = await this.getResponseById(responseId);
    if (!response) return null;
    if (!response.formId) return null;

    const allSteps = await this.listSteps(response.formId);
    const allFields = await this.listFields(response.formId);
    // Drop unknown field IDs (stale clients, renamed fields) instead of failing
    // the whole submission on the composite (form_id, field_id) FK.
    const knownFieldIds = new Set(allFields.map((f) => f.id));

    for (const field of fields) {
      if (!knownFieldIds.has(field.fieldId)) continue;
      const id = crypto.randomUUID();
      await this.db.insert(dbSchema.formFieldValues).values({
        id,
        responseId,
        formId: response.formId,
        fieldId: field.fieldId,
        value: field.value ?? null,
        fileUrl: field.fileUrl ?? null,
      });
    }

    // Exclude steps where every field is a completion field
    const steps = allSteps.filter((step) => {
      const stepFields = allFields.filter((f) => f.stepId === step.id);
      return !(stepFields.length > 0 && stepFields.every((f) => f.type === "completion"));
    });
    const nextStepIndex = stepIndex + 1;
    // Client can force completion when it's on the last visible step (conditional
    // steps may hide later server-side steps, making stepIndex-based detection
    // under-count). Still fall back to the server-side count as a safety net.
    const isComplete = options.complete === true || nextStepIndex >= steps.length;

    // Update response progress
    await this.db
      .update(dbSchema.formResponses)
      .set({
        currentStepIndex: isComplete ? stepIndex : nextStepIndex,
        status: isComplete ? "completed" : "in_progress",
      })
      .where(eq(dbSchema.formResponses.id, responseId));

    return this.getResponseById(responseId);
  }

  async getResponseWithValues(responseId: string) {
    const response = await this.getResponseById(responseId);
    if (!response) return null;
    if (!response.formId) {
      return { ...response, values: [] };
    }

    const values = await this.db
      .select()
      .from(dbSchema.formFieldValues)
      .where(eq(dbSchema.formFieldValues.responseId, responseId));

    const enrichedValues = await this.enrichResponseValues(response.formId, values);

    return { ...response, values: enrichedValues };
  }

  async listResponsesWithValues(formId: string) {
    const responses = await this.listResponses(formId);
    const responseIds = responses.map((r) => r.id);
    if (responseIds.length === 0) return responses.map((r) => ({ ...r, values: [] }));

    const allValues = await this.db
      .select()
      .from(dbSchema.formFieldValues)
      .where(inArray(dbSchema.formFieldValues.responseId, responseIds));

    const enrichedValues = await this.enrichResponseValues(formId, allValues);

    return responses.map((r) => ({
      ...r,
      values: enrichedValues.filter((value) => value.responseId === r.id),
    }));
  }

  async enrichResponseValues(
    formId: string,
    values: Array<typeof dbSchema.formFieldValues.$inferSelect>,
  ) {
    const [steps, fields] = await Promise.all([
      this.listSteps(formId),
      this.listFields(formId),
    ]);

    const stepSortOrderById = new Map(
      steps.map((step) => [step.id, step.sortOrder]),
    );
    const fieldById = new Map(fields.map((field) => [field.id, field]));

    return values
      .map((value) => {
        const field = fieldById.get(value.fieldId);
        return {
          ...value,
          fieldLabel: field?.label ?? "Unknown field",
          fieldType: field?.type ?? "text",
          displayValue: formatResponseDisplayValue(
            field,
            value.value,
            value.fileUrl,
          ),
          _stepSortOrder: field
            ? (stepSortOrderById.get(field.stepId) ?? Number.MAX_SAFE_INTEGER)
            : Number.MAX_SAFE_INTEGER,
          _fieldSortOrder: field?.sortOrder ?? Number.MAX_SAFE_INTEGER,
        };
      })
      .sort((a, b) => {
        if (a._stepSortOrder !== b._stepSortOrder) {
          return a._stepSortOrder - b._stepSortOrder;
        }

        return a._fieldSortOrder - b._fieldSortOrder;
      })
      .map(({ _stepSortOrder, _fieldSortOrder, ...value }) => value);
  }

  // ─── Full Form with Steps + Fields ───────────────────────────────────────

  async getFullForm(formId: string) {
    const form = await this.getById(formId);
    if (!form) return null;

    const steps = await this.listSteps(formId);
    const fields = await this.listFields(formId);

    const stepsWithFields = steps.map((step) => ({
      ...step,
      fields: fields.filter((f) => f.stepId === step.id),
    }));

    return { ...form, steps: stepsWithFields };
  }

  async getFullFormBySlug(projectId: string, slug: string) {
    const form = await this.getBySlug(projectId, slug);
    if (!form) return null;
    return this.getFullForm(form.id);
  }
}

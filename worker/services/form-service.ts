import { eq, and, asc, desc, inArray } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as dbSchema from "../db/schema";

// ─── Field Helpers ───────────────────────────────────────────────────────────

const FIELD_TYPE_PLACEHOLDERS: Record<string, string | null> = {
  text: "Start typing...",
  textarea: "Start typing...",
  email: "name@example.com",
  phone: "+1 (555) 000-0000",
  number: "0",
  date: "Select a date",
  time: "Select a time",
  select: "Select an option",
  multi_select: "Select options",
  radio: null,
  checkbox: null,
  rating: null,
  file: "Choose a file",
};

function normalizeToFieldId(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 50) || "field"
  );
}

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

function normalizeStepRow<T extends { settings: unknown }>(step: T) {
  return {
    ...step,
    settings: parseJsonObject(step.settings),
  };
}

function normalizeFieldRow<
  T extends { validation: unknown; options: unknown },
>(field: T) {
  return {
    ...field,
    validation: parseJsonObject(field.validation),
    options: parseFieldOptions(field.options),
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
      settings?: Record<string, unknown>;
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
      settings: data.settings ? JSON.stringify(data.settings) : null,
    });

    return this.getStepById(id);
  }

  async updateStep(
    id: string,
    data: {
      sortOrder?: number;
      title?: string;
      description?: string | null;
      settings?: Record<string, unknown> | null;
    },
  ) {
    const values: Record<string, unknown> = {};
    if (data.sortOrder !== undefined) values.sortOrder = data.sortOrder;
    if (data.title !== undefined) values.title = data.title;
    if (data.description !== undefined) values.description = data.description;
    if (data.settings !== undefined)
      values.settings = data.settings ? JSON.stringify(data.settings) : null;

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

  async reorderFields(_stepId: string, fieldIds: string[]) {
    for (let i = 0; i < fieldIds.length; i++) {
      await this.db
        .update(dbSchema.formFields)
        .set({ sortOrder: i })
        .where(eq(dbSchema.formFields.id, fieldIds[i]));
    }
  }

  async listFields(formId: string) {
    const steps = await this.listSteps(formId);
    if (steps.length === 0) return [];

    const stepIds = steps.map((s) => s.id);
    const rows = await this.db
      .select()
      .from(dbSchema.formFields)
      .where(inArray(dbSchema.formFields.stepId, stepIds))
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

  async getFieldById(id: string) {
    const rows = await this.db
      .select()
      .from(dbSchema.formFields)
      .where(eq(dbSchema.formFields.id, id))
      .limit(1);

    return rows[0] ? normalizeFieldRow(rows[0]) : null;
  }

  async createField(data: {
    stepId: string;
    sortOrder?: number;
    type: string;
    label: string;
    placeholder?: string;
    required?: boolean;
    validation?: Record<string, unknown>;
    options?: Array<{ label: string; value: string }>;
  }) {
    // Generate ID from normalized label
    const baseId = normalizeToFieldId(data.label);

    // Get the form ID from the step to check for duplicate IDs across the whole form
    const [step] = await this.db
      .select()
      .from(dbSchema.formSteps)
      .where(eq(dbSchema.formSteps.id, data.stepId))
      .limit(1);

    let id = baseId;
    if (step) {
      const existingFields = await this.listFields(step.formId);
      const existingIds = new Set(existingFields.map((f) => f.id));
      let counter = 2;
      while (existingIds.has(id)) {
        id = `${baseId}_${counter}`;
        counter++;
      }
    }

    let sortOrder = data.sortOrder ?? 0;
    if (data.sortOrder === undefined) {
      const fields = await this.listFieldsByStep(data.stepId);
      sortOrder = fields.length;
    }

    // Auto-populate placeholder from field type if not provided
    const placeholder =
      data.placeholder ?? FIELD_TYPE_PLACEHOLDERS[data.type] ?? null;

    await this.db.insert(dbSchema.formFields).values({
      id,
      stepId: data.stepId,
      sortOrder,
      type: data.type as any,
      label: data.label,
      placeholder,
      required: data.required ?? false,
      validation: data.validation ? JSON.stringify(data.validation) : null,
      options: data.options ? JSON.stringify(data.options) : null,
    });

    return this.getFieldById(id);
  }

  async updateField(
    id: string,
    data: {
      sortOrder?: number;
      type?: string;
      label?: string;
      placeholder?: string | null;
      required?: boolean;
      validation?: Record<string, unknown> | null;
      options?: Array<{ label: string; value: string }> | null;
    },
  ) {
    const values: Record<string, unknown> = {};
    if (data.sortOrder !== undefined) values.sortOrder = data.sortOrder;
    if (data.type !== undefined) {
      values.type = data.type;
      // Auto-update placeholder when type changes (unless placeholder is explicitly provided)
      if (data.placeholder === undefined) {
        values.placeholder = FIELD_TYPE_PLACEHOLDERS[data.type] ?? null;
      }
    }
    if (data.label !== undefined) values.label = data.label;
    if (data.placeholder !== undefined) values.placeholder = data.placeholder;
    if (data.required !== undefined) values.required = data.required;
    if (data.validation !== undefined)
      values.validation = data.validation
        ? JSON.stringify(data.validation)
        : null;
    if (data.options !== undefined)
      values.options = data.options ? JSON.stringify(data.options) : null;

    if (Object.keys(values).length === 0) return this.getFieldById(id);

    await this.db
      .update(dbSchema.formFields)
      .set(values)
      .where(eq(dbSchema.formFields.id, id));

    return this.getFieldById(id);
  }

  async deleteField(id: string) {
    await this.db
      .delete(dbSchema.formFields)
      .where(eq(dbSchema.formFields.id, id));
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
  ) {
    // Save field values
    for (const field of fields) {
      const id = crypto.randomUUID();
      await this.db.insert(dbSchema.formFieldValues).values({
        id,
        responseId,
        fieldId: field.fieldId,
        value: field.value ?? null,
        fileUrl: field.fileUrl ?? null,
      });
    }

    // Get the form to check total steps
    const response = await this.getResponseById(responseId);
    if (!response) return null;

    if (!response.formId) return null;
    const steps = await this.listSteps(response.formId);
    const nextStepIndex = stepIndex + 1;
    const isComplete = nextStepIndex >= steps.length;

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

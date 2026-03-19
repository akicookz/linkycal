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

// ─── Form Service ────────────────────────────────────────────────────────────

export class FormService {
  constructor(private db: DrizzleD1Database<Record<string, unknown>>) {}

  // ─── Forms CRUD ──────────────────────────────────────────────────────────

  async list(projectId: string) {
    return this.db
      .select()
      .from(dbSchema.forms)
      .where(eq(dbSchema.forms.projectId, projectId))
      .orderBy(desc(dbSchema.forms.createdAt));
  }

  async getById(id: string) {
    const rows = await this.db
      .select()
      .from(dbSchema.forms)
      .where(eq(dbSchema.forms.id, id))
      .limit(1);
    return rows[0] ?? null;
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
    return rows[0] ?? null;
  }

  async getBySlugGlobal(slug: string) {
    const rows = await this.db
      .select()
      .from(dbSchema.forms)
      .where(eq(dbSchema.forms.slug, slug))
      .limit(1);
    return rows[0] ?? null;
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
    return this.db
      .select()
      .from(dbSchema.formSteps)
      .where(eq(dbSchema.formSteps.formId, formId))
      .orderBy(asc(dbSchema.formSteps.sortOrder));
  }

  async getStepById(id: string) {
    const rows = await this.db
      .select()
      .from(dbSchema.formSteps)
      .where(eq(dbSchema.formSteps.id, id))
      .limit(1);
    return rows[0] ?? null;
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
    return this.db
      .select()
      .from(dbSchema.formFields)
      .where(inArray(dbSchema.formFields.stepId, stepIds))
      .orderBy(
        asc(dbSchema.formFields.stepId),
        asc(dbSchema.formFields.sortOrder),
      );
  }

  async listFieldsByStep(stepId: string) {
    return this.db
      .select()
      .from(dbSchema.formFields)
      .where(eq(dbSchema.formFields.stepId, stepId))
      .orderBy(asc(dbSchema.formFields.sortOrder));
  }

  async getFieldById(id: string) {
    const rows = await this.db
      .select()
      .from(dbSchema.formFields)
      .where(eq(dbSchema.formFields.id, id))
      .limit(1);
    return rows[0] ?? null;
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
    return this.db
      .select()
      .from(dbSchema.formResponses)
      .where(eq(dbSchema.formResponses.formId, formId))
      .orderBy(desc(dbSchema.formResponses.createdAt));
  }

  async getResponseById(id: string) {
    const rows = await this.db
      .select()
      .from(dbSchema.formResponses)
      .where(eq(dbSchema.formResponses.id, id))
      .limit(1);
    return rows[0] ?? null;
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
    return this.getResponseById(id);
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

    const values = await this.db
      .select()
      .from(dbSchema.formFieldValues)
      .where(eq(dbSchema.formFieldValues.responseId, responseId));

    return { ...response, values };
  }

  async listResponsesWithValues(formId: string) {
    const responses = await this.listResponses(formId);
    const responseIds = responses.map((r) => r.id);
    if (responseIds.length === 0) return responses.map((r) => ({ ...r, values: [] }));

    const allValues = await this.db
      .select()
      .from(dbSchema.formFieldValues)
      .where(inArray(dbSchema.formFieldValues.responseId, responseIds));

    return responses.map((r) => ({
      ...r,
      values: allValues.filter((v) => v.responseId === r.id),
    }));
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

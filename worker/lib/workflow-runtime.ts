import { z } from "zod";

import type { ContactOperationalFacts } from "../services/contact-service";

export interface WorkflowContactOperationalContext {
  stage: {
    byTag: Record<
      string,
      {
        enteredAt: string;
        ageHours: number;
        ageDays: number;
      }
    >;
  };
  nextAction?: {
    text: string;
    deadline: string;
    overdue: boolean;
    hoursUntilDeadline: number;
    daysUntilDeadline: number;
  };
}

export interface WorkflowTriggerContext {
  projectId: string;
  contactId?: string;
  contactEmail?: string;
  contactName?: string;
  formResponseId?: string;
  bookingId?: string;
  tagId?: string;
  metadata?: Record<string, unknown>;
  stepInputs?: Record<string, unknown>;
  contactOperational?: WorkflowContactOperationalContext;
}

export const workflowContactsInputFormatSchema = z.enum([
  "list",
  "emails",
  "count",
]);

export type WorkflowContactsInputFormat = z.infer<
  typeof workflowContactsInputFormatSchema
>;

export const workflowStepInputSchema = z.object({
  key: z.string().min(1).max(64),
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("path"), path: z.string().min(1).max(512) }),
    z.object({ kind: z.literal("literal"), value: z.string() }),
    // A live contact query: resolves to the project's contacts matching the
    // tag filter at run time (empty tagIds = all contacts). Resolved by the
    // execution service, which has DB access — resolveStepInputs skips it.
    z.object({
      kind: z.literal("contacts"),
      tagIds: z.array(z.string()).max(20).default([]),
      matchAllTags: z.boolean().optional(),
      format: workflowContactsInputFormatSchema.default("list"),
    }),
  ]),
});

export type WorkflowStepInput = z.infer<typeof workflowStepInputSchema>;

export function formatContactsInputValue(
  contacts: Array<{ name: string; email: string | null }>,
  format: WorkflowContactsInputFormat,
): string {
  switch (format) {
    case "count":
      return String(contacts.length);
    case "emails":
      return contacts
        .map((c) => c.email?.trim())
        .filter((email): email is string => !!email)
        .join(", ");
    case "list":
    default:
      return contacts
        .map((c) => `- ${c.name}${c.email ? ` (${c.email})` : ""}`)
        .join("\n");
  }
}

export const workflowResearchProviderSchema = z.enum(["chatgpt", "gemini"]);

export type WorkflowResearchProvider = z.infer<typeof workflowResearchProviderSchema>;

export const workflowResearchResultSchema = z.object({
  summary: z.string(),
  company: z.string().nullable(),
  role: z.string().nullable(),
  website: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  location: z.string().nullable(),
  description: z.string().nullable(),
  companySize: z.string().nullable(),
  estimatedRevenue: z.string().nullable(),
  recommendedTags: z.array(z.string()),
  insights: z.array(z.string()),
  sources: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      snippet: z.string().nullable(),
    }),
  ),
});

export type WorkflowResearchResult = z.infer<typeof workflowResearchResultSchema>;

export interface WorkflowResearchRecord {
  resultKey: string;
  provider: WorkflowResearchProvider;
  model: string;
  prompt: string;
  executedAt: string;
  result: WorkflowResearchResult;
}

const LEGACY_FIELD_ALIASES: Record<string, string> = {
  contact_name: "contact.name",
  contact_email: "contact.email",
  contact_id: "contact.id",
  booking_id: "booking.id",
  form_response_id: "formResponse.id",
  project_id: "project.id",
  tag_id: "tag.id",
};

export function buildWorkflowContextView(
  context: WorkflowTriggerContext,
): Record<string, unknown> {
  const metadata = isRecord(context.metadata) ? context.metadata : {};
  const latestResearch = getNestedValue(metadata, [
    "workflow",
    "research",
    "latest",
    "result",
  ]);
  const researchByKey = getNestedValue(metadata, [
    "workflow",
    "research",
    "byKey",
  ]);

  const formFields = getNestedValue(metadata, ["formFields"]);

  return {
    project: { id: context.projectId },
    contact: {
      id: context.contactId ?? "",
      email: context.contactEmail ?? "",
      name: context.contactName ?? "",
      ...(context.contactOperational ?? {}),
    },
    booking: { id: context.bookingId ?? "" },
    formResponse: { id: context.formResponseId ?? "" },
    form: {
      responseId: context.formResponseId ?? "",
      fields: isRecord(formFields) ? formFields : {},
    },
    tag: { id: context.tagId ?? "" },
    trigger: {
      projectId: context.projectId,
      contactId: context.contactId ?? "",
      contactEmail: context.contactEmail ?? "",
      contactName: context.contactName ?? "",
      bookingId: context.bookingId ?? "",
      formResponseId: context.formResponseId ?? "",
      tagId: context.tagId ?? "",
    },
    metadata,
    research: {
      ...(isRecord(latestResearch) ? latestResearch : {}),
      byKey: isRecord(researchByKey) ? researchByKey : {},
    },
    input: isRecord(context.stepInputs) ? context.stepInputs : {},
  };
}

export function buildWorkflowContactOperationalContext(
  facts: ContactOperationalFacts,
  now: Date,
): WorkflowContactOperationalContext {
  const nowMs = now.getTime();
  const byTag: WorkflowContactOperationalContext["stage"]["byTag"] = {};

  for (const [tagId, enteredAt] of Object.entries(facts.enteredAtByTagId)) {
    const enteredAtMs = new Date(enteredAt).getTime();
    if (!Number.isFinite(enteredAtMs)) continue;
    byTag[tagId] = {
      enteredAt,
      ageHours: (nowMs - enteredAtMs) / 3_600_000,
      ageDays: (nowMs - enteredAtMs) / 86_400_000,
    };
  }

  const operational: WorkflowContactOperationalContext = {
    stage: { byTag },
  };
  if (!facts.nextAction) return operational;

  const deadlineMs = new Date(facts.nextAction.deadline).getTime();
  if (!Number.isFinite(deadlineMs)) return operational;
  operational.nextAction = {
    text: facts.nextAction.text,
    deadline: facts.nextAction.deadline,
    overdue: deadlineMs < nowMs,
    hoursUntilDeadline: (deadlineMs - nowMs) / 3_600_000,
    daysUntilDeadline: (deadlineMs - nowMs) / 86_400_000,
  };
  return operational;
}

export function resolveStepInputs(
  inputs: unknown,
  context: WorkflowTriggerContext,
): Record<string, string> {
  if (!Array.isArray(inputs)) return {};

  const resolved: Record<string, string> = {};
  for (const raw of inputs) {
    const parsed = workflowStepInputSchema.safeParse(raw);
    if (!parsed.success) continue;
    const input = parsed.data;

    if (input.source.kind === "literal") {
      resolved[input.key] = interpolateWorkflowTemplate(input.source.value, context);
      continue;
    }

    // Contact-query inputs need DB access; the execution service resolves
    // them after this synchronous pass.
    if (input.source.kind === "contacts") continue;

    const value = resolveWorkflowValue(context, input.source.path);
    resolved[input.key] = stringifyWorkflowValue(value);
  }

  return resolved;
}

export function interpolateWorkflowTemplate(
  template: string | undefined,
  context: WorkflowTriggerContext,
): string {
  if (!template) return "";

  return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, rawPath) => {
    const value = resolveWorkflowValue(context, String(rawPath));
    return stringifyWorkflowValue(value);
  });
}

export function resolveWorkflowValue(
  context: WorkflowTriggerContext,
  field: string,
): unknown {
  const normalizedField = normalizeWorkflowField(field);
  const view = buildWorkflowContextView(context);
  return getNestedValue(view, normalizedField.split("."));
}

export function normalizeRecipientList(
  value: unknown,
  context: WorkflowTriggerContext,
): string[] {
  const rawValues = Array.isArray(value)
    ? value.flatMap((entry) =>
        typeof entry === "string"
          ? entry.split(/[\n,;]+/g)
          : [],
      )
    : typeof value === "string"
      ? value.split(/[\n,;]+/g)
      : [];

  // Re-split after interpolation: a single variable (e.g. a contacts input
  // with the "emails" format) can expand into a comma-separated list.
  const recipients = rawValues
    .flatMap((entry) =>
      interpolateWorkflowTemplate(entry.trim(), context).split(/[\n,;]+/g),
    )
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return Array.from(new Set(recipients));
}

export function mergeWorkflowResearchMetadata(
  metadata: Record<string, unknown> | null | undefined,
  record: WorkflowResearchRecord,
): Record<string, unknown> {
  const nextMetadata = isRecord(metadata) ? structuredClone(metadata) : {};
  const workflow = getRecordValue(nextMetadata, "workflow");
  const research = getRecordValue(workflow, "research");
  const byKey = getRecordValue(research, "byKey");

  byKey[record.resultKey] = record;
  research.latest = record;
  research.byKey = byKey;
  workflow.research = research;
  nextMetadata.workflow = workflow;

  return nextMetadata;
}

export function normalizeWorkflowField(field: string): string {
  const trimmed = field.trim();
  if (!trimmed) return trimmed;
  return LEGACY_FIELD_ALIASES[trimmed] ?? trimmed;
}

export function stringifyWorkflowValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => stringifyWorkflowValue(item)).join(", ");
  }
  if (isRecord(value)) {
    return JSON.stringify(value);
  }
  return String(value);
}

export function slugifyWorkflowKey(value: string | undefined): string {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || "research";
}

function getNestedValue(
  source: unknown,
  pathSegments: string[],
): unknown {
  let current: unknown = source;

  for (const segment of pathSegments) {
    if (!isRecord(current) || !(segment in current)) {
      return undefined;
    }
    current = current[segment];
  }

  return current;
}

function getRecordValue(
  source: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const value = source[key];
  if (isRecord(value)) {
    return value;
  }
  const next: Record<string, unknown> = {};
  source[key] = next;
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

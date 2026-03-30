import { z } from "zod";

export interface WorkflowTriggerContext {
  projectId: string;
  contactId?: string;
  contactEmail?: string;
  contactName?: string;
  formResponseId?: string;
  bookingId?: string;
  tagId?: string;
  metadata?: Record<string, unknown>;
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

  return {
    project: { id: context.projectId },
    contact: {
      id: context.contactId ?? "",
      email: context.contactEmail ?? "",
      name: context.contactName ?? "",
    },
    booking: { id: context.bookingId ?? "" },
    formResponse: { id: context.formResponseId ?? "" },
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
  };
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

  const recipients = rawValues
    .map((entry) => interpolateWorkflowTemplate(entry.trim(), context).trim())
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

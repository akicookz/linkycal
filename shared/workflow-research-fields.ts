export type WorkflowResearchFieldKind =
  | "text"
  | "url"
  | "string_list"
  | "sources";

export type WorkflowResearchFieldSection =
  | "summary"
  | "facts"
  | "signals"
  | "evidence";

export interface WorkflowResearchFieldDefinition {
  key: string;
  label: string;
  kind: WorkflowResearchFieldKind;
  section: WorkflowResearchFieldSection;
}

export const WORKFLOW_RESEARCH_FIELD_DEFINITIONS = [
  {
    key: "summary",
    label: "Research summary",
    kind: "text",
    section: "summary",
  },
  {
    key: "company",
    label: "Company name",
    kind: "text",
    section: "facts",
  },
  {
    key: "role",
    label: "Contact role",
    kind: "text",
    section: "facts",
  },
  {
    key: "website",
    label: "Company website",
    kind: "url",
    section: "facts",
  },
  {
    key: "linkedinUrl",
    label: "LinkedIn URL",
    kind: "url",
    section: "facts",
  },
  {
    key: "location",
    label: "Location",
    kind: "text",
    section: "facts",
  },
  {
    key: "description",
    label: "Company description",
    kind: "text",
    section: "facts",
  },
  {
    key: "companySize",
    label: "Company size",
    kind: "text",
    section: "facts",
  },
  {
    key: "estimatedRevenue",
    label: "Estimated revenue",
    kind: "text",
    section: "facts",
  },
  {
    key: "recommendedTags",
    label: "Recommended tags",
    kind: "string_list",
    section: "signals",
  },
  {
    key: "insights",
    label: "Insights",
    kind: "string_list",
    section: "signals",
  },
  {
    key: "sources",
    label: "Public sources",
    kind: "sources",
    section: "evidence",
  },
] as const satisfies readonly WorkflowResearchFieldDefinition[];

export type WorkflowResearchFieldKey =
  (typeof WORKFLOW_RESEARCH_FIELD_DEFINITIONS)[number]["key"];

export function normalizeWorkflowResearchResultKey(
  value: string | undefined,
): string {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || "research";
}

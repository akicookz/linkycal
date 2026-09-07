import {
  User,
  Calendar,
  FileText,
  Brain,
  Tag,
  FolderOpen,
  ArrowRightLeft,
  type LucideIcon,
} from "lucide-react";

import {
  normalizeWorkflowResearchResultKey,
  WORKFLOW_RESEARCH_FIELD_DEFINITIONS,
} from "../../shared/workflow-research-fields";

export interface WorkflowVariable {
  key: string;
  label: string;
  example?: string;
}

export interface WorkflowVariableGroup {
  group: string;
  icon: LucideIcon;
  items: WorkflowVariable[];
}

export interface FormFieldSource {
  formId: string;
  formName: string;
  fieldId: string;
  label: string;
}

export interface PriorStepSource {
  type: string;
  label: string;
  resultKey?: string;
}

const WORKFLOW_RESEARCH_FORMATTED_VARIABLES = [
  {
    key: "recommendedTagsText",
    label: "Recommended tags (text)",
  },
  {
    key: "insightsText",
    label: "Insights (bulleted text)",
  },
  {
    key: "sourcesText",
    label: "Public sources (text)",
  },
  {
    key: "sourcesHtml",
    label: "Public sources (HTML body)",
  },
  {
    key: "reportText",
    label: "Complete research report (text)",
  },
  {
    key: "reportHtml",
    label: "Complete research report (HTML body)",
  },
] as const;

export const WORKFLOW_VARIABLES: WorkflowVariableGroup[] = [
  {
    group: "Contact",
    icon: User,
    items: [
      { key: "contact.name", label: "Contact name", example: "Jane Smith" },
      { key: "contact.email", label: "Contact email", example: "jane@example.com" },
      { key: "contact.phone", label: "Contact phone", example: "+1 555-0100" },
      { key: "contact.notes", label: "Contact notes" },
      { key: "contact.company", label: "Company", example: "Acme Inc" },
      { key: "contact.position", label: "Role", example: "Operations Lead" },
      { key: "contact.website", label: "Website", example: "https://acme.example" },
      { key: "contact.companySize", label: "Company size", example: "51-200" },
      {
        key: "contact.estimatedRevenue",
        label: "Estimated revenue",
        example: "€10M-€25M",
      },
      {
        key: "contact.linkedinUrl",
        label: "LinkedIn URL",
        example: "https://linkedin.com/in/jane-smith",
      },
    ],
  },
  {
    group: "Booking",
    icon: Calendar,
    items: [
      { key: "booking.id", label: "Booking ID" },
      { key: "booking.startTime", label: "Start time", example: "2025-06-15T10:00:00Z" },
      { key: "booking.endTime", label: "End time", example: "2025-06-15T11:00:00Z" },
      { key: "booking.status", label: "Booking status", example: "confirmed" },
    ],
  },
  {
    group: "Form",
    icon: FileText,
    items: [
      { key: "form.name", label: "Form name" },
      { key: "form.responseId", label: "Form response ID (identifier only)" },
    ],
  },
  {
    group: "Research",
    icon: Brain,
    items: [
      ...WORKFLOW_RESEARCH_FIELD_DEFINITIONS.map((field) => ({
        key: `research.${field.key}`,
        label: field.label,
      })),
      ...WORKFLOW_RESEARCH_FORMATTED_VARIABLES.map((field) => ({
        key: `research.${field.key}`,
        label: field.label,
      })),
    ],
  },
  {
    group: "Tag",
    icon: Tag,
    items: [
      { key: "tag.id", label: "Tag ID" },
      { key: "tag.name", label: "Tag name" },
    ],
  },
  {
    group: "Project",
    icon: FolderOpen,
    items: [
      { key: "project.id", label: "Project ID" },
      { key: "project.name", label: "Project name" },
    ],
  },
];

/**
 * Build the list of variable groups available to a step at a specific position
 * in a workflow. Returns the static built-ins plus dynamic groups scoped to the
 * current trigger (form fields) and the outputs of prior steps.
 *
 * Includes an `input.*` group so step templates can reference values the user
 * wired into the Inputs panel.
 */
export function buildWorkflowVariableGroups(opts: {
  trigger?: string;
  formFields?: FormFieldSource[];
  priorSteps?: PriorStepSource[];
  resolvedInputKeys?: string[];
}): WorkflowVariableGroup[] {
  const groups: WorkflowVariableGroup[] = [...WORKFLOW_VARIABLES];

  if (opts.trigger === "form_submitted" && opts.formFields && opts.formFields.length > 0) {
    const byForm = new Map<string, FormFieldSource[]>();
    for (const field of opts.formFields) {
      const list = byForm.get(field.formName) ?? [];
      list.push(field);
      byForm.set(field.formName, list);
    }
    for (const [formName, fields] of byForm) {
      groups.push({
        group: byForm.size === 1 ? "Form fields" : `Form fields — ${formName}`,
        icon: FileText,
        items: fields.map((f) => ({
          key: `form.fields.${f.fieldId}`,
          label: f.label || "Untitled field",
        })),
      });
    }
  }

  if (opts.priorSteps && opts.priorSteps.length > 0) {
    const researchSteps = opts.priorSteps
      .filter((s) => s.type === "ai_research")
      .filter((step): step is PriorStepSource & { resultKey: string } =>
        typeof step.resultKey === "string" && step.resultKey.length > 0
      )
      .map((step) => ({
        key: normalizeWorkflowResearchResultKey(step.resultKey),
        label: step.label,
      }));
    if (researchSteps.length > 1) {
      groups.push({
        group: "Research (by key)",
        icon: Brain,
        items: researchSteps.flatMap((step) => [
          ...WORKFLOW_RESEARCH_FIELD_DEFINITIONS.map((field) => ({
            key: `research.byKey.${step.key}.result.${field.key}`,
            label: `${step.label} · ${field.label}`,
          })),
          ...WORKFLOW_RESEARCH_FORMATTED_VARIABLES.map((field) => ({
            key: `research.byKey.${step.key}.${field.key}`,
            label: `${step.label} · ${field.label}`,
          })),
        ]),
      });
    }
  }

  if (opts.resolvedInputKeys && opts.resolvedInputKeys.length > 0) {
    groups.push({
      group: "This step's inputs",
      icon: ArrowRightLeft,
      items: opts.resolvedInputKeys.map((k) => ({
        key: `input.${k}`,
        label: k,
      })),
    });
  }

  return groups;
}

/** Flat list of all variable keys for quick lookup */
export function getAllVariableKeys(): string[] {
  return WORKFLOW_VARIABLES.flatMap((g) => g.items.map((v) => v.key));
}

/** Search variables by partial key or label match */
export function filterVariables(
  query: string,
  groups: WorkflowVariableGroup[] = WORKFLOW_VARIABLES,
): WorkflowVariableGroup[] {
  const q = query.toLowerCase();
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (v) => v.key.toLowerCase().includes(q) || v.label.toLowerCase().includes(q),
      ),
    }))
    .filter((g) => g.items.length > 0);
}

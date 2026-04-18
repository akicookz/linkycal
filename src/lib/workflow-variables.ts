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

export const WORKFLOW_VARIABLES: WorkflowVariableGroup[] = [
  {
    group: "Contact",
    icon: User,
    items: [
      { key: "contact.name", label: "Contact name", example: "Jane Smith" },
      { key: "contact.email", label: "Contact email", example: "jane@example.com" },
      { key: "contact.phone", label: "Contact phone", example: "+1 555-0100" },
      { key: "contact.notes", label: "Contact notes" },
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
      { key: "form.responseId", label: "Response ID" },
    ],
  },
  {
    group: "Research",
    icon: Brain,
    items: [
      { key: "research.summary", label: "Research summary" },
      { key: "research.company", label: "Company name" },
      { key: "research.role", label: "Contact role" },
      { key: "research.website", label: "Company website" },
      { key: "research.linkedinUrl", label: "LinkedIn URL" },
      { key: "research.location", label: "Location" },
      { key: "research.description", label: "Company description" },
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
    const researchKeys = opts.priorSteps
      .filter((s) => s.type === "ai_research")
      .map((s) => s.resultKey)
      .filter((k): k is string => !!k);
    if (researchKeys.length > 1) {
      groups.push({
        group: "Research (by key)",
        icon: Brain,
        items: researchKeys.flatMap((key) => [
          { key: `research.byKey.${key}.result.summary`, label: `${key} · summary` },
          { key: `research.byKey.${key}.result.company`, label: `${key} · company` },
          { key: `research.byKey.${key}.result.role`, label: `${key} · role` },
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

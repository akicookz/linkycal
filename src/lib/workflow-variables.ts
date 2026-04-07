import {
  User,
  Calendar,
  FileText,
  Brain,
  Tag,
  FolderOpen,
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

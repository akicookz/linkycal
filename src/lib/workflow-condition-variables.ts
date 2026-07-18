import { CalendarClock, Tags } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { WORKFLOW_VARIABLES } from "@/lib/workflow-variables";

export type WorkflowConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "exists"
  | "not_exists"
  | "gt"
  | "lt"
  | "gte"
  | "lte";

export type WorkflowConditionValueType =
  | "text"
  | "number"
  | "boolean"
  | "timestamp";

export interface WorkflowConditionRule {
  source: string;
  operator: WorkflowConditionOperator;
  value?: string | number | null;
}

export interface WorkflowCondition {
  when: "all" | "any";
  rules: WorkflowConditionRule[];
}

export interface WorkflowConditionVariable {
  key: string;
  label: string;
  valueType: WorkflowConditionValueType;
}

export interface WorkflowConditionVariableGroup {
  group: string;
  icon: LucideIcon;
  items: WorkflowConditionVariable[];
}

export interface WorkflowConditionTag {
  id: string;
  name: string;
}

const OPERATORS_BY_VALUE_TYPE: Record<
  WorkflowConditionValueType,
  WorkflowConditionOperator[]
> = {
  text: [
    "equals",
    "not_equals",
    "contains",
    "not_contains",
    "exists",
    "not_exists",
  ],
  number: [
    "equals",
    "not_equals",
    "gt",
    "lt",
    "gte",
    "lte",
    "exists",
    "not_exists",
  ],
  boolean: ["equals", "not_equals", "exists", "not_exists"],
  timestamp: ["exists", "not_exists"],
};

const NEXT_ACTION_VARIABLES: WorkflowConditionVariable[] = [
  {
    key: "contact.nextAction.text",
    label: "Next action text",
    valueType: "text",
  },
  {
    key: "contact.nextAction.deadline",
    label: "Next action deadline",
    valueType: "timestamp",
  },
  {
    key: "contact.nextAction.overdue",
    label: "Next action overdue",
    valueType: "boolean",
  },
  {
    key: "contact.nextAction.hoursUntilDeadline",
    label: "Hours until next action",
    valueType: "number",
  },
  {
    key: "contact.nextAction.daysUntilDeadline",
    label: "Days until next action",
    valueType: "number",
  },
];

const STAGE_SOURCE_PATTERN =
  /^contact\.stage\.byTag\.([^.]+)\.(enteredAt|ageHours|ageDays)$/;

export function operatorsForConditionValueType(
  valueType: WorkflowConditionValueType,
): WorkflowConditionOperator[] {
  return [...OPERATORS_BY_VALUE_TYPE[valueType]];
}

export function findWorkflowConditionVariable(
  groups: WorkflowConditionVariableGroup[],
  source: string,
): WorkflowConditionVariable | undefined {
  return groups
    .flatMap((group) => group.items)
    .find((item) => item.key === source);
}

export function buildConditionRuleForSource(
  source: string,
  groups: WorkflowConditionVariableGroup[],
): WorkflowConditionRule {
  const valueType =
    findWorkflowConditionVariable(groups, source)?.valueType ?? "text";
  const operator = operatorsForConditionValueType(valueType)[0] ?? "equals";
  return {
    source,
    operator,
    value:
      valueType === "timestamp"
        ? null
        : valueType === "boolean"
          ? "false"
          : "",
  };
}

export function buildWorkflowConditionVariableGroups(
  tags: WorkflowConditionTag[],
  savedSources: string[],
): WorkflowConditionVariableGroup[] {
  const groups: WorkflowConditionVariableGroup[] = WORKFLOW_VARIABLES.map(
    (group) => ({
      group: group.group,
      icon: group.icon,
      items: group.items.map((item) => ({
        key: item.key,
        label: item.label,
        valueType: "text" as const,
      })),
    }),
  );
  groups.push({
    group: "Next Action",
    icon: CalendarClock,
    items: NEXT_ACTION_VARIABLES,
  });

  const stageItems = tags.flatMap<WorkflowConditionVariable>((tag) => [
    {
      key: `contact.stage.byTag.${tag.id}.ageHours`,
      label: `${tag.name} — time in stage (hours)`,
      valueType: "number",
    },
    {
      key: `contact.stage.byTag.${tag.id}.ageDays`,
      label: `${tag.name} — time in stage (days)`,
      valueType: "number",
    },
  ]);
  const knownSources = new Set(
    groups
      .flatMap((group) => group.items)
      .concat(stageItems)
      .map((item) => item.key),
  );
  const removedStageItems: WorkflowConditionVariable[] = [];
  for (const source of new Set(savedSources)) {
    if (knownSources.has(source)) continue;
    const match = source.match(STAGE_SOURCE_PATTERN);
    if (!match) continue;
    removedStageItems.push({
      key: source,
      label: "Stage tag removed",
      valueType: match[2] === "enteredAt" ? "timestamp" : "number",
    });
  }

  if (stageItems.length > 0 || removedStageItems.length > 0) {
    groups.push({
      group: "Time in Stage",
      icon: Tags,
      items: [...stageItems, ...removedStageItems],
    });
  }

  return groups;
}

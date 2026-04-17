import {
  resolveWorkflowValue,
  stringifyWorkflowValue,
  type WorkflowTriggerContext,
} from "./workflow-runtime";

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

export type WorkflowConditionRule = {
  source: string;
  operator: WorkflowConditionOperator;
  value?: string | number | null;
};

export type WorkflowCondition = {
  when: "all" | "any";
  rules: WorkflowConditionRule[];
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stringifyRuleValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "string") return value;
  return "";
}

function evaluateRule(
  rule: WorkflowConditionRule,
  context: WorkflowTriggerContext,
): boolean {
  const resolved = resolveWorkflowValue(context, rule.source);
  const actualRaw = stringifyWorkflowValue(resolved);

  switch (rule.operator) {
    case "exists":
      return actualRaw.length > 0;
    case "not_exists":
      return actualRaw.length === 0;
    case "equals":
      return actualRaw === stringifyRuleValue(rule.value);
    case "not_equals":
      return actualRaw !== stringifyRuleValue(rule.value);
    case "contains":
      return actualRaw.toLowerCase().includes(stringifyRuleValue(rule.value).toLowerCase());
    case "not_contains":
      return !actualRaw.toLowerCase().includes(stringifyRuleValue(rule.value).toLowerCase());
    case "gt":
    case "lt":
    case "gte":
    case "lte": {
      const left = toNumber(actualRaw);
      const right = toNumber(rule.value);
      if (left === null || right === null) return false;
      if (rule.operator === "gt") return left > right;
      if (rule.operator === "lt") return left < right;
      if (rule.operator === "gte") return left >= right;
      return left <= right;
    }
    default:
      return true;
  }
}

export function evaluateWorkflowCondition(
  condition: WorkflowCondition | null | undefined,
  context: WorkflowTriggerContext,
): boolean {
  if (!condition || !condition.rules || condition.rules.length === 0) return true;

  const when = condition.when === "any" ? "any" : "all";
  const results = condition.rules.map((rule) => evaluateRule(rule, context));

  return when === "all" ? results.every(Boolean) : results.some(Boolean);
}

export function parseWorkflowCondition(raw: unknown): WorkflowCondition | null {
  if (!raw) return null;
  const value = typeof raw === "string" ? safeParseJson(raw) : raw;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const rec = value as Record<string, unknown>;
  const rules = Array.isArray(rec.rules) ? rec.rules : null;
  if (!rules) return null;

  const when = rec.when === "any" ? "any" : "all";
  const cleanedRules: WorkflowConditionRule[] = [];

  for (const entry of rules) {
    if (!entry || typeof entry !== "object") continue;
    const r = entry as Record<string, unknown>;
    if (typeof r.source !== "string" || typeof r.operator !== "string") continue;
    cleanedRules.push({
      source: r.source,
      operator: r.operator as WorkflowConditionOperator,
      value:
        typeof r.value === "string" || typeof r.value === "number"
          ? r.value
          : r.value === null || r.value === undefined
            ? null
            : String(r.value),
    });
  }

  if (cleanedRules.length === 0) return null;
  return { when, rules: cleanedRules };
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

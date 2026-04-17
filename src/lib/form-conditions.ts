export type FormConditionOperator =
  | "equals"
  | "not_equals"
  | "is_one_of"
  | "is_not_one_of"
  | "contains"
  | "not_contains"
  | "exists"
  | "not_exists"
  | "gt"
  | "lt"
  | "gte"
  | "lte";

export type FormConditionRule = {
  fieldId: string;
  operator: FormConditionOperator;
  value?: string | string[] | number | null;
};

export type FormCondition = {
  when: "all" | "any";
  rules: FormConditionRule[];
};

export type FormConditionField = {
  id: string;
  type: string;
  options?: Array<{ label: string; value: string }> | null;
  visibility?: FormCondition | null;
};

export type FormConditionInputs = {
  values: Record<string, string>;
  fieldsById: Record<string, FormConditionField>;
};

function splitMultiValue(raw: string): string[] {
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

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
  rule: FormConditionRule,
  inputs: FormConditionInputs,
): boolean {
  const sourceField = inputs.fieldsById[rule.fieldId];
  if (!sourceField) return false;

  const raw = (inputs.values[rule.fieldId] ?? "").trim();
  const isChoice =
    sourceField.type === "select" ||
    sourceField.type === "radio" ||
    sourceField.type === "multi_select" ||
    sourceField.type === "checkbox";
  const isMulti =
    sourceField.type === "multi_select" ||
    (sourceField.type === "checkbox" && (sourceField.options?.length ?? 0) > 0);

  const selectedValues = isMulti ? splitMultiValue(raw) : raw ? [raw] : [];
  const ruleValues = Array.isArray(rule.value)
    ? rule.value.map((v) => String(v))
    : rule.value !== undefined && rule.value !== null
      ? [stringifyRuleValue(rule.value)]
      : [];

  switch (rule.operator) {
    case "exists":
      return raw.length > 0;
    case "not_exists":
      return raw.length === 0;
    case "equals":
      if (isChoice) {
        return selectedValues.length === 1 && selectedValues[0] === (ruleValues[0] ?? "");
      }
      return raw === stringifyRuleValue(rule.value);
    case "not_equals":
      if (isChoice) {
        return !(selectedValues.length === 1 && selectedValues[0] === (ruleValues[0] ?? ""));
      }
      return raw !== stringifyRuleValue(rule.value);
    case "is_one_of":
      if (ruleValues.length === 0) return false;
      if (isMulti) {
        return selectedValues.some((v) => ruleValues.includes(v));
      }
      return ruleValues.includes(raw);
    case "is_not_one_of":
      if (ruleValues.length === 0) return true;
      if (isMulti) {
        return !selectedValues.some((v) => ruleValues.includes(v));
      }
      return !ruleValues.includes(raw);
    case "contains":
      return raw.toLowerCase().includes(stringifyRuleValue(rule.value).toLowerCase());
    case "not_contains":
      return !raw.toLowerCase().includes(stringifyRuleValue(rule.value).toLowerCase());
    case "gt":
    case "lt":
    case "gte":
    case "lte": {
      const left = toNumber(raw);
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

export function evaluateFormCondition(
  condition: FormCondition | null | undefined,
  inputs: FormConditionInputs,
): boolean {
  if (!condition || !condition.rules || condition.rules.length === 0) return true;

  const when = condition.when === "any" ? "any" : "all";
  const results = condition.rules.map((rule) => evaluateRule(rule, inputs));

  return when === "all" ? results.every(Boolean) : results.some(Boolean);
}

export function isFieldVisible(
  field: FormConditionField,
  inputs: FormConditionInputs,
): boolean {
  return evaluateFormCondition(field.visibility ?? null, inputs);
}

export function isStepVisible(
  step: { visibility?: FormCondition | null },
  inputs: FormConditionInputs,
): boolean {
  return evaluateFormCondition(step.visibility ?? null, inputs);
}

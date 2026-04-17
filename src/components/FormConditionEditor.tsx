import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  FormCondition,
  FormConditionOperator,
  FormConditionRule,
} from "@/lib/form-conditions";

export type ConditionSourceField = {
  id: string;
  label: string;
  type: string;
  stepTitle: string;
  options: Array<{ label: string; value: string }> | null;
};

type ChoiceOperator = "equals" | "not_equals" | "is_one_of" | "is_not_one_of";
type NumberOperator =
  | "equals"
  | "not_equals"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "exists"
  | "not_exists";
type TextOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "exists"
  | "not_exists";

const OPERATOR_LABELS: Record<FormConditionOperator, string> = {
  equals: "equals",
  not_equals: "does not equal",
  is_one_of: "is one of",
  is_not_one_of: "is not one of",
  contains: "contains",
  not_contains: "does not contain",
  exists: "is filled",
  not_exists: "is empty",
  gt: "is greater than",
  lt: "is less than",
  gte: "is at least",
  lte: "is at most",
};

const CHOICE_OPERATORS: ChoiceOperator[] = [
  "equals",
  "not_equals",
  "is_one_of",
  "is_not_one_of",
];
const NUMBER_OPERATORS: NumberOperator[] = [
  "equals",
  "not_equals",
  "gt",
  "lt",
  "gte",
  "lte",
  "exists",
  "not_exists",
];
const TEXT_OPERATORS: TextOperator[] = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "exists",
  "not_exists",
];

function isChoiceType(type: string): boolean {
  return (
    type === "select" ||
    type === "radio" ||
    type === "multi_select" ||
    type === "checkbox"
  );
}

function getOperatorsForType(type: string): FormConditionOperator[] {
  if (isChoiceType(type)) return CHOICE_OPERATORS;
  if (type === "number") return NUMBER_OPERATORS;
  return TEXT_OPERATORS;
}

function defaultOperator(type: string): FormConditionOperator {
  if (isChoiceType(type)) return "equals";
  if (type === "number") return "equals";
  return "equals";
}

function asArray(value: FormConditionRule["value"]): string[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [String(value)];
}

function asScalar(value: FormConditionRule["value"]): string {
  if (Array.isArray(value)) return value[0] ?? "";
  if (value === undefined || value === null) return "";
  return String(value);
}

export function FormConditionEditor({
  title,
  condition,
  sources,
  onChange,
}: {
  title: string;
  condition: FormCondition | null;
  sources: ConditionSourceField[];
  onChange: (next: FormCondition | null) => void;
}) {
  const sourceById = useMemo(() => {
    const map: Record<string, ConditionSourceField> = {};
    for (const s of sources) map[s.id] = s;
    return map;
  }, [sources]);

  const rules = condition?.rules ?? [];
  const when = condition?.when ?? "all";

  function emit(next: FormCondition | null) {
    if (!next || next.rules.length === 0) {
      onChange(null);
      return;
    }
    onChange(next);
  }

  function updateRule(index: number, patch: Partial<FormConditionRule>) {
    const nextRules = rules.map((r, i) => (i === index ? { ...r, ...patch } : r));
    emit({ when, rules: nextRules });
  }

  function removeRule(index: number) {
    const nextRules = rules.filter((_, i) => i !== index);
    emit(nextRules.length === 0 ? null : { when, rules: nextRules });
  }

  function addRule() {
    if (sources.length === 0) return;
    const firstSource = sources[0];
    const nextRules = [
      ...rules,
      {
        fieldId: firstSource.id,
        operator: defaultOperator(firstSource.type),
        value: isChoiceType(firstSource.type)
          ? firstSource.options?.[0]?.value ?? ""
          : "",
      } satisfies FormConditionRule,
    ];
    emit({ when, rules: nextRules });
  }

  if (sources.length === 0) {
    return null;
  }

  if (rules.length === 0) {
    return (
      <button
        type="button"
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={addRule}
      >
        <Plus className="h-3 w-3 inline mr-0.5 -mt-px" />
        {title}
      </button>
    );
  }

  return (
    <div className="rounded-[12px] border bg-muted/30 px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-muted-foreground">{title} match</span>
        <Select
          value={when}
          onValueChange={(v) =>
            emit({ when: v === "any" ? "any" : "all", rules })
          }
        >
          <SelectTrigger className="h-6 w-auto text-[11px] px-2 rounded-full bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">all</SelectItem>
            <SelectItem value="any">any</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-muted-foreground">of:</span>
      </div>

      <div className="space-y-1.5">
        {rules.map((rule, idx) => {
          const source = sourceById[rule.fieldId];
          const sourceMissing = !source;
          const operators = source
            ? getOperatorsForType(source.type)
            : (["equals"] as FormConditionOperator[]);

          const needsValue =
            rule.operator !== "exists" && rule.operator !== "not_exists";
          const isMultiValue =
            rule.operator === "is_one_of" || rule.operator === "is_not_one_of";

          return (
            <div
              key={idx}
              className="flex items-start gap-1.5 flex-wrap"
            >
              <Select
                value={rule.fieldId}
                onValueChange={(nextId) => {
                  const nextSource = sourceById[nextId];
                  if (!nextSource) return;
                  const nextOps = getOperatorsForType(nextSource.type);
                  const nextOperator = nextOps.includes(rule.operator)
                    ? rule.operator
                    : defaultOperator(nextSource.type);
                  updateRule(idx, {
                    fieldId: nextId,
                    operator: nextOperator,
                    value: isChoiceType(nextSource.type)
                      ? nextSource.options?.[0]?.value ?? ""
                      : "",
                  });
                }}
              >
                <SelectTrigger className="h-7 text-[11px] px-2 w-[160px] bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sources.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                      <span className="text-muted-foreground ml-1">
                        · {s.stepTitle}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={rule.operator}
                onValueChange={(v) =>
                  updateRule(idx, { operator: v as FormConditionOperator })
                }
              >
                <SelectTrigger className="h-7 text-[11px] px-2 w-[130px] bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {operators.map((op) => (
                    <SelectItem key={op} value={op}>
                      {OPERATOR_LABELS[op]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {needsValue && source && (
                <ConditionValueInput
                  source={source}
                  multi={isMultiValue}
                  value={rule.value}
                  onChange={(next) => updateRule(idx, { value: next })}
                />
              )}

              {sourceMissing && (
                <span className="text-[11px] text-destructive self-center">
                  (field removed)
                </span>
              )}

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-1.5 text-destructive hover:text-destructive"
                onClick={() => removeRule(idx)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={addRule}
      >
        <Plus className="h-3 w-3 inline mr-0.5 -mt-px" />
        Add rule
      </button>
    </div>
  );
}

export function FieldQueryParamInput({
  fieldId,
  value,
  onSave,
}: {
  fieldId: string;
  value: string;
  onSave: (next: string) => void;
}) {
  const [expanded, setExpanded] = useState<boolean>(() => value.trim().length > 0);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  if (!expanded) {
    return (
      <button
        type="button"
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setExpanded(true)}
      >
        <Plus className="h-3 w-3 inline mr-0.5 -mt-px" />
        URL parameter
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor={`field-qp-${fieldId}`}
        className="text-[11px] text-muted-foreground whitespace-nowrap"
      >
        URL parameter
      </label>
      <Input
        id={`field-qp-${fieldId}`}
        className="h-7 text-[11px] w-[160px] bg-background"
        placeholder={fieldId}
        value={draft}
        onChange={(e) => {
          const filtered = e.target.value.replace(/[^a-zA-Z0-9_-]/g, "");
          setDraft(filtered);
        }}
        onBlur={() => {
          const next = draft.trim();
          if (next !== value) onSave(next);
          if (next.length === 0) setExpanded(false);
        }}
      />
    </div>
  );
}

function ConditionValueInput({
  source,
  multi,
  value,
  onChange,
}: {
  source: ConditionSourceField;
  multi: boolean;
  value: FormConditionRule["value"];
  onChange: (next: FormConditionRule["value"]) => void;
}) {
  if (isChoiceType(source.type)) {
    const options = source.options ?? [];

    if (multi) {
      const selected = new Set(asArray(value));
      return (
        <div className="flex flex-wrap items-center gap-1 min-h-[28px]">
          {options.map((opt) => {
            const checked = selected.has(opt.value);
            return (
              <button
                type="button"
                key={opt.value}
                className={
                  checked
                    ? "h-7 text-[11px] px-2 rounded-full bg-primary text-primary-foreground"
                    : "h-7 text-[11px] px-2 rounded-full bg-background border text-muted-foreground hover:text-foreground"
                }
                onClick={() => {
                  const next = new Set(selected);
                  if (next.has(opt.value)) next.delete(opt.value);
                  else next.add(opt.value);
                  onChange(Array.from(next));
                }}
              >
                {opt.label || opt.value}
              </button>
            );
          })}
        </div>
      );
    }

    return (
      <Select
        value={asScalar(value)}
        onValueChange={(v) => onChange(v)}
      >
        <SelectTrigger className="h-7 text-[11px] px-2 w-[160px] bg-background">
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label || opt.value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (source.type === "number") {
    return (
      <DebouncedTextInput
        type="number"
        className="h-7 text-[11px] w-[120px] bg-background"
        value={asScalar(value)}
        onSave={(v) => onChange(v)}
      />
    );
  }

  return (
    <DebouncedTextInput
      type="text"
      className="h-7 text-[11px] w-[160px] bg-background"
      value={asScalar(value)}
      onSave={(v) => onChange(v)}
    />
  );
}

function DebouncedTextInput({
  type,
  className,
  value,
  onSave,
}: {
  type: "text" | "number";
  className?: string;
  value: string;
  onSave: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <Input
      type={type}
      className={className}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onSave(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

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

export type WorkflowConditionRule = {
  source: string;
  operator: WorkflowConditionOperator;
  value?: string | number | null;
};

export type WorkflowCondition = {
  when: "all" | "any";
  rules: WorkflowConditionRule[];
};

const OPERATOR_LABELS: Record<WorkflowConditionOperator, string> = {
  equals: "equals",
  not_equals: "does not equal",
  contains: "contains",
  not_contains: "does not contain",
  exists: "is filled",
  not_exists: "is empty",
  gt: "greater than",
  lt: "less than",
  gte: "at least",
  lte: "at most",
};

const ALL_OPERATORS: WorkflowConditionOperator[] = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "exists",
  "not_exists",
  "gt",
  "lt",
  "gte",
  "lte",
];

export function WorkflowConditionEditor({
  condition,
  onChange,
}: {
  condition: WorkflowCondition | null;
  onChange: (next: WorkflowCondition | null) => void;
}) {
  const rules = condition?.rules ?? [];
  const when = condition?.when ?? "all";

  function emit(next: WorkflowCondition | null) {
    if (!next || next.rules.length === 0) {
      onChange(null);
      return;
    }
    onChange(next);
  }

  function updateRule(index: number, patch: Partial<WorkflowConditionRule>) {
    emit({
      when,
      rules: rules.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    });
  }

  function removeRule(index: number) {
    const next = rules.filter((_, i) => i !== index);
    emit(next.length === 0 ? null : { when, rules: next });
  }

  function addRule() {
    const firstVar = WORKFLOW_VARIABLES[0]?.items[0]?.key ?? "contact.email";
    emit({
      when,
      rules: [
        ...rules,
        { source: firstVar, operator: "equals", value: "" } satisfies WorkflowConditionRule,
      ],
    });
  }

  if (rules.length === 0) {
    return (
      <button
        type="button"
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={addRule}
      >
        <Plus className="h-3 w-3 inline mr-0.5 -mt-px" />
        Only run if…
      </button>
    );
  }

  return (
    <div className="rounded-[12px] border bg-muted/30 px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-muted-foreground">Only run if match</span>
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
          const needsValue =
            rule.operator !== "exists" && rule.operator !== "not_exists";
          return (
            <div key={idx} className="flex items-start gap-1.5 flex-wrap">
              <Select
                value={rule.source}
                onValueChange={(v) => updateRule(idx, { source: v })}
              >
                <SelectTrigger className="h-7 text-[11px] px-2 w-[180px] bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORKFLOW_VARIABLES.flatMap((group) =>
                    group.items.map((item) => (
                      <SelectItem key={item.key} value={item.key}>
                        <span className="text-muted-foreground mr-1">
                          {group.group}
                        </span>
                        {item.label}
                      </SelectItem>
                    )),
                  )}
                </SelectContent>
              </Select>

              <Select
                value={rule.operator}
                onValueChange={(v) =>
                  updateRule(idx, {
                    operator: v as WorkflowConditionOperator,
                  })
                }
              >
                <SelectTrigger className="h-7 text-[11px] px-2 w-[140px] bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_OPERATORS.map((op) => (
                    <SelectItem key={op} value={op}>
                      {OPERATOR_LABELS[op]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {needsValue && (
                <Input
                  className="h-7 text-[11px] w-[160px] bg-background"
                  placeholder="Value"
                  value={
                    rule.value === undefined || rule.value === null
                      ? ""
                      : String(rule.value)
                  }
                  onChange={(e) => updateRule(idx, { value: e.target.value })}
                />
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

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
import {
  buildConditionRuleForSource,
  findWorkflowConditionVariable,
  operatorsForConditionValueType,
  type WorkflowCondition,
  type WorkflowConditionOperator,
  type WorkflowConditionRule,
  type WorkflowConditionVariableGroup,
} from "@/lib/workflow-condition-variables";

export type {
  WorkflowCondition,
  WorkflowConditionOperator,
  WorkflowConditionRule,
} from "@/lib/workflow-condition-variables";

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

export function WorkflowConditionEditor({
  condition,
  onChange,
  variables,
}: {
  condition: WorkflowCondition | null;
  onChange: (next: WorkflowCondition | null) => void;
  variables: WorkflowConditionVariableGroup[];
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
    const firstVar = variables[0]?.items[0]?.key ?? "contact.email";
    emit({
      when,
      rules: [
        ...rules,
        buildConditionRuleForSource(firstVar, variables),
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
          const variable = findWorkflowConditionVariable(
            variables,
            rule.source,
          );
          const valueType = variable?.valueType ?? "text";
          const operators = operatorsForConditionValueType(valueType);
          const needsValue =
            rule.operator !== "exists" && rule.operator !== "not_exists";
          return (
            <div key={idx} className="flex items-start gap-1.5 flex-wrap">
              <Select
                value={rule.source}
                onValueChange={(source) =>
                  updateRule(
                    idx,
                    buildConditionRuleForSource(source, variables),
                  )
                }
              >
                <SelectTrigger className="h-7 text-[11px] px-2 w-[180px] bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {variables.flatMap((group) =>
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
                  {operators.map((op) => (
                    <SelectItem key={op} value={op}>
                      {OPERATOR_LABELS[op]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {needsValue && valueType === "boolean" && (
                <Select
                  value={String(rule.value ?? "false")}
                  onValueChange={(value) => updateRule(idx, { value })}
                >
                  <SelectTrigger className="h-7 w-[120px] bg-background px-2 text-[11px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">True</SelectItem>
                    <SelectItem value="false">False</SelectItem>
                  </SelectContent>
                </Select>
              )}

              {needsValue && valueType === "number" && (
                <Input
                  type="number"
                  className="h-7 w-[160px] bg-background text-[11px]"
                  placeholder="Number"
                  value={
                    rule.value === undefined || rule.value === null
                      ? ""
                      : String(rule.value)
                  }
                  onChange={(e) => updateRule(idx, { value: e.target.value })}
                />
              )}

              {needsValue && valueType === "text" && (
                <Input
                  className="h-7 w-[160px] bg-background text-[11px]"
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
                className="h-7 gap-1 px-2 text-[11px] text-destructive hover:text-destructive"
                onClick={() => removeRule(idx)}
              >
                <X className="h-3 w-3" />
                Remove
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

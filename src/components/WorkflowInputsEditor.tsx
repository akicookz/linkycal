import { useState } from "react";
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
import { buildWorkflowVariableGroups, type FormFieldSource, type PriorStepSource } from "@/lib/workflow-variables";

const VISIBLE_ROW_LIMIT = 3;

export type WorkflowStepInput = {
  key: string;
  source:
    | { kind: "path"; path: string }
    | { kind: "literal"; value: string };
};

const LITERAL_VALUE = "__literal__";

function slugifyInputKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function defaultKeyForPath(path: string): string {
  const tail = path.split(".").pop() ?? path;
  return slugifyInputKey(tail) || "value";
}

export function WorkflowInputsEditor({
  inputs,
  onChange,
  trigger,
  formFields,
  priorSteps,
  sampleValues,
}: {
  inputs: WorkflowStepInput[];
  onChange: (next: WorkflowStepInput[]) => void;
  trigger?: string;
  formFields?: FormFieldSource[];
  priorSteps?: PriorStepSource[];
  sampleValues?: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState(false);

  const groups = buildWorkflowVariableGroups({
    trigger,
    formFields,
    priorSteps,
  });

  const visibleCount = expanded
    ? inputs.length
    : Math.min(inputs.length, VISIBLE_ROW_LIMIT);
  const hiddenCount = Math.max(0, inputs.length - visibleCount);

  function updateRow(index: number, patch: Partial<WorkflowStepInput>) {
    onChange(inputs.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function updateRowSource(index: number, nextSource: WorkflowStepInput["source"]) {
    const row = inputs[index];
    if (!row) return;
    const next: WorkflowStepInput = { ...row, source: nextSource };
    // Seed the key from the selected path if the user hasn't named it.
    if (nextSource.kind === "path" && (!row.key || row.key === "value")) {
      next.key = defaultKeyForPath(nextSource.path);
    }
    onChange(inputs.map((r, i) => (i === index ? next : r)));
  }

  function removeRow(index: number) {
    onChange(inputs.filter((_, i) => i !== index));
  }

  function addRow() {
    const firstPath = groups[0]?.items[0]?.key ?? "contact.name";
    onChange([
      ...inputs,
      {
        key: defaultKeyForPath(firstPath),
        source: { kind: "path", path: firstPath },
      },
    ]);
  }

  function sampleFor(row: WorkflowStepInput): string | undefined {
    if (row.source.kind === "literal") return row.source.value;
    return sampleValues?.[row.source.path];
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <label className="text-sm font-medium">Inputs</label>
          <p className="text-[11px] text-muted-foreground">
            Pick the data this step receives. Reference values in templates as{" "}
            <code className="font-mono">{"{{input.key}}"}</code>.
          </p>
        </div>
      </div>

      {inputs.length > 0 && (
        <div className="space-y-1.5 rounded-[12px] border bg-muted/30 p-2">
          {inputs.slice(0, visibleCount).map((row, idx) => {
            const sample = sampleFor(row);
            const selectValue =
              row.source.kind === "literal" ? LITERAL_VALUE : row.source.path;
            return (
              <div key={idx} className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <Input
                    className="h-7 text-[12px] w-[130px] bg-background font-mono"
                    placeholder="key"
                    value={row.key}
                    onChange={(e) =>
                      updateRow(idx, { key: slugifyInputKey(e.target.value) })
                    }
                  />
                  <span className="text-[11px] text-muted-foreground">←</span>
                  <Select
                    value={selectValue}
                    onValueChange={(v) => {
                      if (v === LITERAL_VALUE) {
                        updateRowSource(idx, { kind: "literal", value: "" });
                      } else {
                        updateRowSource(idx, { kind: "path", path: v });
                      }
                    }}
                  >
                    <SelectTrigger className="h-7 text-[11px] px-2 flex-1 bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                        Fixed value
                      </div>
                      <SelectItem value={LITERAL_VALUE}>Literal text…</SelectItem>
                      {groups.map((group) => (
                        <div key={group.group}>
                          <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                            {group.group}
                          </div>
                          {group.items.map((item) => (
                            <SelectItem key={item.key} value={item.key}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </div>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-1.5 text-muted-foreground hover:text-destructive"
                    onClick={() => removeRow(idx)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                {row.source.kind === "literal" ? (
                  <Input
                    className="h-7 text-[12px] bg-background"
                    placeholder="Fixed value"
                    value={row.source.value}
                    onChange={(e) =>
                      updateRowSource(idx, { kind: "literal", value: e.target.value })
                    }
                  />
                ) : (
                  sample !== undefined && sample !== "" && (
                    <div className="pl-[138px] text-[11px] text-muted-foreground truncate">
                      {sample}
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-4">
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={addRow}
        >
          <Plus className="h-3 w-3 inline mr-0.5 -mt-px" />
          Add input
        </button>
        {hiddenCount > 0 && !expanded && (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setExpanded(true)}
          >
            + {hiddenCount} more {hiddenCount === 1 ? "field" : "fields"}
          </button>
        )}
        {expanded && inputs.length > VISIBLE_ROW_LIMIT && (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setExpanded(false)}
          >
            Show less
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Seed a step's Inputs with every piece of data available from the workflow's
 * trigger + any prior steps. The user can delete rows they don't need; the
 * editor collapses anything past the 3rd visible row into a "+N more" toggle.
 *
 * Runs at step *creation* only — editing an existing step preserves whatever
 * was saved, so deletions are sticky.
 */
export function seedAllInputs(opts: {
  trigger?: string;
  formFields?: FormFieldSource[];
  priorSteps?: PriorStepSource[];
}): WorkflowStepInput[] {
  const groups = buildWorkflowVariableGroups(opts).filter((g) => {
    if (g.group === "Contact") return true;
    if (g.group === "Booking") {
      return !!opts.trigger?.startsWith("booking_");
    }
    if (g.group === "Form") return opts.trigger === "form_submitted";
    if (g.group.startsWith("Form fields")) return opts.trigger === "form_submitted";
    if (g.group === "Tag") return opts.trigger === "tag_added";
    if (g.group === "Research") {
      return (opts.priorSteps ?? []).some(
        (s) => s.type === "ai_research" && !!s.resultKey,
      );
    }
    if (g.group === "Research (by key)") return true;
    // Drop Project, "This step's inputs", and anything else noisy.
    return false;
  });

  const rows: WorkflowStepInput[] = [];
  const usedKeys = new Set<string>();

  for (const group of groups) {
    const groupSlug = slugifyInputKey(group.group);
    for (const item of group.items) {
      const tail = defaultKeyForPath(item.key);
      let key = tail;
      if (usedKeys.has(key)) {
        key = `${groupSlug}_${tail}`;
      }
      let suffix = 2;
      while (usedKeys.has(key)) {
        key = `${groupSlug}_${tail}_${suffix++}`;
      }
      usedKeys.add(key);
      rows.push({ key, source: { kind: "path", path: item.key } });
    }
  }

  return rows;
}

/** @deprecated Kept as a thin alias — call sites should migrate to `seedAllInputs`. */
export function defaultStepInputs(
  trigger?: string,
  formFields?: FormFieldSource[],
  priorSteps?: PriorStepSource[],
): WorkflowStepInput[] {
  return seedAllInputs({ trigger, formFields, priorSteps });
}

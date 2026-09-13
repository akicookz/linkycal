import type { LucideIcon } from "lucide-react";
import { Columns2, FilePlus, Rows2 } from "lucide-react";
import {
  applyFieldDrop,
  dropOnFieldEdge,
  readingOrderFieldIds,
  type FormPageLayout,
} from "@/lib/form-pages";

export type FormBuilderCommandKind =
  | { kind: "add-field"; type: string }
  | { kind: "add-page" }
  | { kind: "move-beside" }
  | { kind: "move-own-row" };

export interface InsertionContext {
  stepId: string | null;
  fieldId: string | null;
  gapIndex: number | null;
  neighborId: string | null;
  isCompletion: boolean;
  hasContentStep: boolean;
}

export interface CommandFieldType {
  type: string;
  label: string;
  icon: LucideIcon;
  chipClass: string;
}

export interface FormBuilderCommandDef {
  id: string;
  group: "insert" | "layout" | "page";
  label: string;
  keywords: string[];
  icon: LucideIcon;
  chipClass?: string;
  kind: FormBuilderCommandKind;
  available: (ctx: InsertionContext) => boolean;
}

export interface FormBuilderCommandHandlers {
  addField: (type: string, label: string, gapIndex: number | null) => void;
  addPage: () => void;
  moveBeside: () => void;
  moveOwnRow: () => void;
}

export function fieldSitsAlone(
  layout: FormPageLayout,
  fieldId: string,
): boolean {
  const row = layout.rows.find(function match(item) {
    return item.left?.fieldId === fieldId || item.right?.fieldId === fieldId;
  });
  if (!row) return false;
  return !(row.left && row.right);
}

export function resolveBesideNeighbor(
  layout: FormPageLayout,
  fieldId: string,
): { neighborId: string; dropSelectedOnPrev: boolean } | null {
  const ids = readingOrderFieldIds(layout);
  const index = ids.indexOf(fieldId);
  if (index === -1) return null;

  const prev = index > 0 ? ids[index - 1] : null;
  if (prev && fieldSitsAlone(layout, prev)) {
    return { neighborId: prev, dropSelectedOnPrev: true };
  }

  const next = index < ids.length - 1 ? ids[index + 1] : null;
  if (next && fieldSitsAlone(layout, next)) {
    return { neighborId: next, dropSelectedOnPrev: false };
  }

  return null;
}

export function applyMoveBeside(
  layout: FormPageLayout,
  fieldId: string,
): FormPageLayout | null {
  const neighbor = resolveBesideNeighbor(layout, fieldId);
  if (!neighbor) return null;
  if (neighbor.dropSelectedOnPrev) {
    return dropOnFieldEdge(layout, fieldId, {
      fieldId: neighbor.neighborId,
      side: "right",
    });
  }
  return dropOnFieldEdge(layout, neighbor.neighborId, {
    fieldId,
    side: "right",
  });
}

export function resolveOwnRowGap(
  layout: FormPageLayout,
  fieldId: string,
): number | null {
  const rowIndex = layout.rows.findIndex(function match(row) {
    return row.left?.fieldId === fieldId || row.right?.fieldId === fieldId;
  });
  if (rowIndex === -1) return null;
  const row = layout.rows[rowIndex];
  if (!row.left || !row.right) return null;
  return rowIndex;
}

export function applyMoveOwnRow(
  layout: FormPageLayout,
  fieldId: string,
): FormPageLayout | null {
  const gapIndex = resolveOwnRowGap(layout, fieldId);
  if (gapIndex == null) return null;
  return applyFieldDrop(layout, fieldId, { type: "gap", index: gapIndex });
}

export function buildInsertionContext(input: {
  stepId: string | null;
  fieldId: string | null;
  gapIndex: number | null;
  layout: FormPageLayout;
  isCompletion: boolean;
  hasContentStep: boolean;
}): InsertionContext {
  const neighbor =
    input.fieldId && !input.isCompletion
      ? resolveBesideNeighbor(input.layout, input.fieldId)
      : null;
  return {
    stepId: input.stepId,
    fieldId: input.fieldId,
    gapIndex: input.gapIndex,
    neighborId: neighbor?.neighborId ?? null,
    isCompletion: input.isCompletion,
    hasContentStep: input.hasContentStep,
  };
}

export function buildFormBuilderCommands(input: {
  fieldTypes: readonly CommandFieldType[];
}): FormBuilderCommandDef[] {
  const fieldCommands = input.fieldTypes.map(function toCommand(fieldType) {
    return {
      id: `add-field:${fieldType.type}`,
      group: "insert" as const,
      label: fieldType.label,
      keywords: [fieldType.type, fieldType.label, "add", "field", "question"],
      icon: fieldType.icon,
      chipClass: fieldType.chipClass,
      kind: { kind: "add-field" as const, type: fieldType.type },
      available: function canAddField(ctx: InsertionContext) {
        return ctx.hasContentStep;
      },
    };
  });

  return [
    ...fieldCommands,
    {
      id: "add-page",
      group: "page",
      label: "Add page",
      keywords: ["page", "step", "section", "add"],
      icon: FilePlus,
      kind: { kind: "add-page" },
      available: function canAddPage() {
        return true;
      },
    },
    {
      id: "move-beside",
      group: "layout",
      label: "Move to the side",
      keywords: ["side", "beside", "column", "two", "layout", "move"],
      icon: Columns2,
      kind: { kind: "move-beside" },
      available: function canMoveBeside(ctx: InsertionContext) {
        return !!ctx.fieldId && !!ctx.neighborId && !ctx.isCompletion;
      },
    },
    {
      id: "move-own-row",
      group: "layout",
      label: "Move to own row",
      keywords: ["row", "stack", "full", "width", "layout", "move"],
      icon: Rows2,
      kind: { kind: "move-own-row" },
      available: function canMoveOwnRow(ctx: InsertionContext) {
        return !!ctx.fieldId && !ctx.isCompletion;
      },
    },
  ];
}

function commandAvailable(
  command: FormBuilderCommandDef,
  ctx: InsertionContext,
  layout?: FormPageLayout,
): boolean {
  if (command.kind.kind === "move-own-row") {
    if (!ctx.fieldId || ctx.isCompletion || !layout) return false;
    return resolveOwnRowGap(layout, ctx.fieldId) != null;
  }
  return command.available(ctx);
}

function filterCommands(
  commands: readonly FormBuilderCommandDef[],
  query: string,
): FormBuilderCommandDef[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...commands];
  return commands.filter(function matches(command) {
    if (command.label.toLowerCase().includes(needle)) return true;
    return command.keywords.some(function hasKeyword(keyword) {
      return keyword.toLowerCase().includes(needle);
    });
  });
}

export function visibleCommands(
  commands: readonly FormBuilderCommandDef[],
  ctx: InsertionContext,
  query: string,
  layout?: FormPageLayout,
): FormBuilderCommandDef[] {
  return filterCommands(
    commands.filter(function isAvailable(command) {
      return commandAvailable(command, ctx, layout);
    }),
    query,
  );
}

export function runFormBuilderCommand(
  command: FormBuilderCommandDef,
  ctx: InsertionContext,
  handlers: FormBuilderCommandHandlers,
): void {
  const kind = command.kind;
  if (kind.kind === "add-field") {
    handlers.addField(kind.type, command.label, ctx.gapIndex);
    return;
  }
  if (kind.kind === "add-page") {
    handlers.addPage();
    return;
  }
  if (kind.kind === "move-beside") {
    handlers.moveBeside();
    return;
  }
  handlers.moveOwnRow();
}

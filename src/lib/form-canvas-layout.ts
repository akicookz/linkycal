import {
  isFieldVisible,
  type FormCondition,
  type FormConditionField,
} from "@/lib/form-conditions";
import {
  applyFieldDrop,
  dropOnFieldEdge,
  parsePageLayout,
  type FieldDropTarget,
  type FormPageLayout,
  type FormPageRow,
} from "@/lib/form-pages";

export interface CanvasLayoutField {
  id: string;
  type: string;
  hidden?: boolean;
  options?: Array<{ label: string; value: string }> | null;
  visibility?: FormCondition | null;
}

export function persistPageFieldIds(
  fields: readonly CanvasLayoutField[],
): string[] {
  return fields
    .filter(function isQuestion(field) {
      return field.type !== "completion";
    })
    .map(function idOf(field) {
      return field.id;
    });
}

export function visiblePageFieldIds(
  fields: readonly CanvasLayoutField[],
  values: Record<string, string>,
): string[] {
  const fieldsById = pageFieldsById(fields);
  const inputs = { values, fieldsById };
  return persistPageFieldIds(fields).filter(function isPainted(fieldId) {
    const field = fields.find(function match(item) {
      return item.id === fieldId;
    });
    if (!field || field.hidden) return false;
    const conditionField = fieldsById[fieldId];
    if (!conditionField) return false;
    return isFieldVisible(conditionField, inputs);
  });
}

export function persistPageLayout(
  settings: unknown,
  fields: readonly CanvasLayoutField[],
): FormPageLayout {
  return parsePageLayout(settings, persistPageFieldIds(fields));
}

export function paintPageLayout(
  settings: unknown,
  fields: readonly CanvasLayoutField[],
  values: Record<string, string>,
  selectedFieldId?: string | null,
): FormPageLayout {
  const visibleIds = visiblePageFieldIds(fields, values);
  const layout = parsePageLayout(settings, visibleIds);
  if (
    !selectedFieldId ||
    visibleIds.includes(selectedFieldId) ||
    !persistPageFieldIds(fields).includes(selectedFieldId)
  ) {
    return layout;
  }
  return {
    rows: [
      ...layout.rows,
      { left: { kind: "field", fieldId: selectedFieldId }, right: null },
    ],
  };
}

export function persistPageFieldDrop(input: {
  settings: unknown;
  fields: readonly CanvasLayoutField[];
  values: Record<string, string>;
  selectedFieldId?: string | null;
  fieldId: string;
  target: FieldDropTarget;
}): FormPageLayout {
  const persistLayout = persistPageLayout(input.settings, input.fields);
  if (input.target.type === "edge") {
    return dropOnFieldEdge(persistLayout, input.fieldId, input.target);
  }
  const paintLayout = paintPageLayout(
    input.settings,
    input.fields,
    input.values,
    input.selectedFieldId,
  );
  const persistTarget = toPersistDropTarget(
    persistLayout,
    paintLayout,
    input.target,
  );
  if (persistTarget.type === "slot") {
    return dropOnPersistSlot(persistLayout, input.fieldId, persistTarget);
  }
  return applyFieldDrop(persistLayout, input.fieldId, persistTarget);
}

function pageFieldsById(
  fields: readonly CanvasLayoutField[],
): Record<string, FormConditionField> {
  const fieldsById: Record<string, FormConditionField> = {};
  for (const field of fields) {
    if (field.type === "completion") continue;
    fieldsById[field.id] = {
      id: field.id,
      type: field.type,
      options: field.options ?? null,
      visibility: field.visibility ?? null,
    };
  }
  return fieldsById;
}

function toPersistDropTarget(
  persistLayout: FormPageLayout,
  paintLayout: FormPageLayout,
  target: Extract<FieldDropTarget, { type: "gap" | "slot" }>,
): FieldDropTarget {
  if (target.type === "gap") {
    if (target.index <= 0) {
      const firstId = firstFieldId(paintLayout.rows[0]);
      if (!firstId) return { type: "gap", index: 0 };
      const persistRow = findFieldRow(persistLayout, firstId);
      return { type: "gap", index: persistRow ?? 0 };
    }
    const prev = paintLayout.rows[target.index - 1];
    const prevId = prev?.right?.fieldId ?? prev?.left?.fieldId;
    if (!prevId) return { type: "gap", index: persistLayout.rows.length };
    const persistRow = findFieldRow(persistLayout, prevId);
    return {
      type: "gap",
      index: persistRow == null ? persistLayout.rows.length : persistRow + 1,
    };
  }

  const paintRow = paintLayout.rows[target.row];
  const neighbor = paintRow?.[oppositeSide(target.side)];
  if (!neighbor) {
    const occupant = paintRow?.[target.side];
    if (occupant) {
      const persistRow = findFieldRow(persistLayout, occupant.fieldId);
      if (persistRow != null) {
        return { type: "slot", row: persistRow, side: target.side };
      }
    }
    return target;
  }
  const persistRow = findFieldRow(persistLayout, neighbor.fieldId);
  if (persistRow == null) return target;
  return { type: "slot", row: persistRow, side: target.side };
}

function dropOnPersistSlot(
  persistLayout: FormPageLayout,
  fieldId: string,
  target: Extract<FieldDropTarget, { type: "slot" }>,
): FormPageLayout {
  const occupant = persistLayout.rows[target.row]?.[target.side];
  if (occupant && occupant.fieldId !== fieldId) {
    const evicted = applyFieldDrop(persistLayout, occupant.fieldId, {
      type: "gap",
      index: target.row + 1,
    });
    const neighborId =
      persistLayout.rows[target.row]?.[oppositeSide(target.side)]?.fieldId;
    const nextRow =
      neighborId == null
        ? target.row
        : (findFieldRow(evicted, neighborId) ?? target.row);
    return applyFieldDrop(evicted, fieldId, {
      type: "slot",
      row: nextRow,
      side: target.side,
    });
  }
  return applyFieldDrop(persistLayout, fieldId, target);
}

function findFieldRow(layout: FormPageLayout, fieldId: string): number | null {
  const index = layout.rows.findIndex(function hasField(row) {
    return row.left?.fieldId === fieldId || row.right?.fieldId === fieldId;
  });
  return index === -1 ? null : index;
}

function firstFieldId(row: FormPageRow | undefined): string | null {
  return row?.left?.fieldId ?? row?.right?.fieldId ?? null;
}

function oppositeSide(side: "left" | "right"): "left" | "right" {
  return side === "left" ? "right" : "left";
}

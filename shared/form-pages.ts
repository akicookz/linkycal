export type FormTransition = "horizontal" | "vertical";

export type FormPageBlock =
  | { kind: "title" }
  | { kind: "richText" }
  | { kind: "image" }
  | { kind: "field"; fieldId: string };

export type FormPageFieldBlock = Extract<FormPageBlock, { kind: "field" }>;

export interface FormPageRow {
  left: FormPageFieldBlock | null;
  right: FormPageFieldBlock | null;
}

export interface FormPageLayout {
  rows: FormPageRow[];
}

export interface PageFieldInput {
  id: string;
  type: string;
}

export interface PageAnalyticsStage {
  key: string;
  kind: "question" | "step";
  fieldType?: string;
}

export interface FocusedFormPageStep {
  id: string;
  sortOrder: number;
  title: string | null;
  description: string | null;
  richDescription: string | null;
  settings?: unknown;
  fields: Array<{
    id: string;
    type: string;
    sortOrder: number;
  }>;
}

export interface FocusedPageDraft {
  sourceStepId: string;
  title: string | null;
  description: string | null;
  richDescription: string | null;
  settings: Record<string, unknown>;
  fieldIds: string[];
}

export type FieldDropTarget =
  | { type: "gap"; index: number }
  | { type: "edge"; fieldId: string; side: "left" | "right" }
  | { type: "slot"; row: number; side: "left" | "right" };

const CHROME_KINDS = new Set<FormPageBlock["kind"]>([
  "title",
  "richText",
  "image",
]);

export function parseFormTransition(settings: unknown): FormTransition {
  if (!settings || typeof settings !== "object") return "vertical";
  const value = (settings as { transition?: unknown }).transition;
  return value === "horizontal" ? "horizontal" : "vertical";
}

export function defaultPageLayout(fieldIds: readonly string[]): FormPageLayout {
  return {
    rows: fieldIds.map(function toRow(fieldId) {
      return { left: { kind: "field", fieldId }, right: null };
    }),
  };
}

export function parsePageLayout(
  settings: unknown,
  fieldIds: readonly string[],
): FormPageLayout {
  const allowed = new Set(fieldIds);
  const raw = readPageLayout(settings);
  const rows = raw ? normalizeRows(raw, allowed) : defaultPageLayout(fieldIds).rows;
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.left) seen.add(row.left.fieldId);
    if (row.right) seen.add(row.right.fieldId);
  }
  const next = rows.map(cloneRow);
  for (const fieldId of fieldIds) {
    if (seen.has(fieldId)) continue;
    next.push({ left: { kind: "field", fieldId }, right: null });
    seen.add(fieldId);
  }
  return { rows: compactRows(next) };
}

export function fieldRows(layout: FormPageLayout): FormPageRow[] {
  return layout.rows.map(cloneRow);
}

export function readingOrderFieldIds(layout: FormPageLayout): string[] {
  const ids: string[] = [];
  for (const row of layout.rows) {
    if (row.left) ids.push(row.left.fieldId);
    if (row.right) ids.push(row.right.fieldId);
  }
  return ids;
}

export function rewritePageLayoutFieldId(
  layout: FormPageLayout,
  fromId: string,
  toId: string,
): FormPageLayout {
  if (!fromId || !toId || fromId === toId) return layout;
  return {
    rows: layout.rows.map(function rewriteRow(row) {
      return {
        left: rewriteFieldBlock(row.left, fromId, toId),
        right: rewriteFieldBlock(row.right, fromId, toId),
      };
    }),
  };
}

export function rewriteSettingsPageLayoutFieldId(
  settings: unknown,
  fromId: string,
  toId: string,
): Record<string, unknown> {
  const current =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? { ...(settings as Record<string, unknown>) }
      : {};
  if (!fromId || !toId || fromId === toId) return current;
  const raw = current.pageLayout;
  if (!raw || typeof raw !== "object") return current;
  current.pageLayout = rewriteUnknownPageLayout(raw, fromId, toId);
  return current;
}

export interface QuestionNumberField {
  id: string;
  type: string;
  hidden?: boolean;
  sortOrder: number;
}

export interface QuestionNumberStep {
  sortOrder: number;
  settings: unknown;
  fields: QuestionNumberField[];
}

export function buildQuestionNumberByFieldId(
  steps: readonly QuestionNumberStep[],
): Record<string, number> {
  const map: Record<string, number> = {};
  let n = 0;
  const ordered = [...steps].sort(function byStep(a, b) {
    return a.sortOrder - b.sortOrder;
  });
  for (const step of ordered) {
    const questions = step.fields.filter(function isQuestion(field) {
      return field.type !== "completion";
    });
    const fieldsById = new Map(
      questions.map(function entryOf(field) {
        return [field.id, field] as const;
      }),
    );
    const ids = readingOrderFieldIds(
      parsePageLayout(
        step.settings,
        questions.map(function idOf(field) {
          return field.id;
        }),
      ),
    );
    for (const fieldId of ids) {
      const field = fieldsById.get(fieldId);
      if (!field || field.hidden) continue;
      n += 1;
      map[fieldId] = n;
    }
  }
  return map;
}

export function sortOrdersFromPageLayout(
  settings: unknown,
  fieldIds: readonly string[],
): Record<string, number> {
  const ids = readingOrderFieldIds(parsePageLayout(settings, fieldIds));
  const next: Record<string, number> = {};
  ids.forEach(function assign(id, index) {
    next[id] = index;
  });
  return next;
}

export function canvasFieldRows(layout: FormPageLayout): FormPageRow[] {
  const rows = fieldRows(layout);
  if (rows.length > 0) return rows;
  return [{ left: null, right: null }];
}

export function dropOnFieldEdge(
  layout: FormPageLayout,
  draggedId: string,
  target: { fieldId: string; side: "left" | "right" },
): FormPageLayout {
  const removed = takeField(layout.rows, draggedId);
  const rowIndex = removed.rows.findIndex(function hasTarget(row) {
    return (
      row.left?.fieldId === target.fieldId ||
      row.right?.fieldId === target.fieldId
    );
  });
  if (rowIndex === -1) return layout;

  const readingOrder: string[] = [];
  const row = removed.rows[rowIndex];
  if (row.left) readingOrder.push(row.left.fieldId);
  if (row.right) readingOrder.push(row.right.fieldId);
  const targetPos = readingOrder.indexOf(target.fieldId);
  if (targetPos === -1) return layout;
  readingOrder.splice(
    target.side === "left" ? targetPos : targetPos + 1,
    0,
    draggedId,
  );

  return {
    rows: compactRows([
      ...removed.rows.slice(0, rowIndex).map(cloneRow),
      ...packReadingOrder(readingOrder),
      ...removed.rows.slice(rowIndex + 1).map(cloneRow),
    ]),
  };
}

export function applyFieldDrop(
  layout: FormPageLayout,
  fieldId: string,
  target: FieldDropTarget,
): FormPageLayout {
  if (target.type === "edge") {
    return dropOnFieldEdge(layout, fieldId, target);
  }

  const removed = takeField(layout.rows, fieldId);
  if (!removed.block) return layout;

  if (target.type === "gap") {
    const index = clampIndex(target.index, removed.rows.length);
    const rows = [...removed.rows];
    rows.splice(index, 0, { left: removed.block, right: null });
    return { rows: compactRows(rows) };
  }

  const rows = removed.rows.map(cloneRow);
  while (rows.length <= target.row) {
    rows.push({ left: null, right: null });
  }
  const row = rows[target.row];
  const occupant = row[target.side];
  if (!occupant) {
    row[target.side] = removed.block;
    return { rows: compactRows(rows) };
  }
  if (occupant.fieldId === fieldId) {
    row[target.side] = removed.block;
    return { rows: compactRows(rows) };
  }
  rows.splice(target.row + 1, 0, { left: removed.block, right: null });
  return { rows: compactRows(rows) };
}

export function movePageBlock(
  layout: FormPageLayout,
  block: FormPageBlock,
  target: "left" | "right",
  index: number,
): FormPageLayout {
  if (block.kind !== "field") return layout;
  return applyFieldDrop(layout, block.fieldId, {
    type: "slot",
    row: Math.max(0, index),
    side: target,
  });
}

export function analyticsStageForPage(input: {
  stepId: string;
  fields: readonly PageFieldInput[];
}): PageAnalyticsStage {
  const fields = input.fields.filter(function isQuestion(field) {
    return field.type !== "completion";
  });
  if (fields.length === 1) {
    return {
      key: `field-${fields[0].id}`,
      kind: "question",
      fieldType: fields[0].type,
    };
  }
  return {
    key: `step-${input.stepId}`,
    kind: "step",
  };
}

export function formNeedsFocusedExplode(form: {
  type?: string;
  steps: ReadonlyArray<{ settings?: unknown }>;
}): boolean {
  if (form.type !== "multi_step") return false;
  return !form.steps.some(function hasLayout(step) {
    return readPageLayout(step.settings) !== null;
  });
}

export function pagesFromFocusedForm(
  steps: readonly FocusedFormPageStep[],
): FocusedPageDraft[] {
  const sorted = [...steps].sort(function byOrder(a, b) {
    return a.sortOrder - b.sortOrder;
  });
  const drafts: FocusedPageDraft[] = [];

  for (const step of sorted) {
    const fields = [...step.fields]
      .filter(function isQuestion(field) {
        return field.type !== "completion";
      })
      .sort(function byOrder(a, b) {
        return a.sortOrder - b.sortOrder;
      });
    if (fields.length === 0) continue;

    const intro = hasMeaningfulIntro(step);
    const image = readImage(step.settings);
    const grouped = sectionShowsFieldsTogether(step.settings);

    if (grouped) {
      const fieldIds = fields.map(function idOf(field) {
        return field.id;
      });
      drafts.push(
        makeDraft({
          sourceStepId: step.id,
          title: intro ? step.title : null,
          description: intro ? step.description : null,
          richDescription: intro ? step.richDescription : null,
          image,
          fieldIds,
        }),
      );
      continue;
    }

    fields.forEach(function emitFieldPage(field, index) {
      const takeIntro = intro && index === 0;
      drafts.push(
        makeDraft({
          sourceStepId: step.id,
          title: takeIntro ? step.title : null,
          description: takeIntro ? step.description : null,
          richDescription: takeIntro ? step.richDescription : null,
          image: takeIntro ? image : null,
          fieldIds: [field.id],
        }),
      );
    });
  }

  return drafts;
}

function makeDraft(input: {
  sourceStepId: string;
  title: string | null;
  description: string | null;
  richDescription: string | null;
  image: unknown;
  fieldIds: string[];
}): FocusedPageDraft {
  const settings: Record<string, unknown> = {
    pageLayout: defaultPageLayout(input.fieldIds),
  };
  if (input.image) settings.image = input.image;
  return {
    sourceStepId: input.sourceStepId,
    title: input.title,
    description: input.description,
    richDescription: input.richDescription,
    settings,
    fieldIds: input.fieldIds,
  };
}

export function isDefaultPageTitle(title: string | null | undefined): boolean {
  return /^(step|section) \d+$/i.test(title?.trim() ?? "");
}

function hasMeaningfulIntro(step: FocusedFormPageStep): boolean {
  const title = step.title?.trim() ?? "";
  return !!(
    step.description?.trim() ||
    step.richDescription?.trim() ||
    (title && !isDefaultPageTitle(title))
  );
}

function sectionShowsFieldsTogether(settings: unknown): boolean {
  if (!settings || typeof settings !== "object") return false;
  return (settings as { groupFields?: unknown }).groupFields === true;
}

function readImage(settings: unknown): unknown {
  if (!settings || typeof settings !== "object") return null;
  const image = (settings as { image?: unknown }).image;
  return image && typeof image === "object" ? image : null;
}

function readPageLayout(settings: unknown): unknown | null {
  if (!settings || typeof settings !== "object") return null;
  const raw = (settings as { pageLayout?: unknown }).pageLayout;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rows = (raw as { rows?: unknown }).rows;
  if (Array.isArray(rows)) return raw;
  const left = (raw as { left?: unknown }).left;
  const right = (raw as { right?: unknown }).right;
  if (Array.isArray(left) && Array.isArray(right)) return raw;
  return null;
}

function normalizeRows(
  raw: unknown,
  allowed: ReadonlySet<string>,
): FormPageRow[] {
  const value = raw as {
    rows?: unknown;
    left?: unknown;
    right?: unknown;
  };
  if (Array.isArray(value.rows)) {
    return value.rows.map(function toRow(item) {
      return parseRow(item, allowed);
    });
  }
  const left = Array.isArray(value.left)
    ? value.left
        .map(function toField(item) {
          return fieldFromUnknown(item, allowed);
        })
        .filter(isField)
    : [];
  const right = Array.isArray(value.right)
    ? value.right
        .map(function toField(item) {
          return fieldFromUnknown(item, allowed);
        })
        .filter(isField)
    : [];
  const count = Math.max(left.length, right.length);
  const rows: FormPageRow[] = [];
  for (let index = 0; index < count; index++) {
    rows.push({
      left: left[index] ?? null,
      right: right[index] ?? null,
    });
  }
  return rows;
}

function parseRow(value: unknown, allowed: ReadonlySet<string>): FormPageRow {
  if (!value || typeof value !== "object") {
    return { left: null, right: null };
  }
  const raw = value as { left?: unknown; right?: unknown };
  return {
    left: fieldFromUnknown(raw.left, allowed),
    right: fieldFromUnknown(raw.right, allowed),
  };
}

function fieldFromUnknown(
  value: unknown,
  allowed: ReadonlySet<string>,
): FormPageFieldBlock | null {
  if (typeof value === "string") {
    return allowed.has(value) ? { kind: "field", fieldId: value } : null;
  }
  const block = parseBlock(value);
  if (!block || block.kind !== "field") return null;
  return allowed.has(block.fieldId) ? block : null;
}

function parseBlock(value: unknown): FormPageBlock | null {
  if (!value || typeof value !== "object") return null;
  const kind = (value as { kind?: unknown }).kind;
  if (kind === "field") {
    const fieldId = (value as { fieldId?: unknown }).fieldId;
    if (typeof fieldId !== "string" || fieldId.length === 0) return null;
    return { kind: "field", fieldId };
  }
  if (typeof kind === "string" && CHROME_KINDS.has(kind as FormPageBlock["kind"])) {
    return { kind: kind as Exclude<FormPageBlock["kind"], "field"> };
  }
  return null;
}

function takeField(
  rows: readonly FormPageRow[],
  fieldId: string,
): { rows: FormPageRow[]; block: FormPageFieldBlock | null } {
  let block: FormPageFieldBlock | null = null;
  const next = rows.map(function strip(row) {
    const copy = cloneRow(row);
    if (copy.left?.fieldId === fieldId) {
      block = copy.left;
      copy.left = null;
    }
    if (copy.right?.fieldId === fieldId) {
      block = copy.right;
      copy.right = null;
    }
    return copy;
  });
  return { rows: compactRows(next), block };
}

function compactRows(rows: readonly FormPageRow[]): FormPageRow[] {
  const seen = new Set<string>();
  const next: FormPageRow[] = [];
  for (const row of rows) {
    const left = takeUnique(row.left, seen);
    const right = takeUnique(row.right, seen);
    if (!left && !right) continue;
    next.push({ left, right });
  }
  return next;
}

function takeUnique(
  block: FormPageFieldBlock | null,
  seen: Set<string>,
): FormPageFieldBlock | null {
  if (!block) return null;
  if (seen.has(block.fieldId)) return null;
  seen.add(block.fieldId);
  return block;
}

function packReadingOrder(fieldIds: readonly string[]): FormPageRow[] {
  const rows: FormPageRow[] = [];
  for (let index = 0; index < fieldIds.length; index += 2) {
    const leftId = fieldIds[index];
    const rightId = fieldIds[index + 1];
    rows.push({
      left: { kind: "field", fieldId: leftId },
      right: rightId ? { kind: "field", fieldId: rightId } : null,
    });
  }
  return rows;
}

function cloneRow(row: FormPageRow): FormPageRow {
  return { left: row.left, right: row.right };
}

function clampIndex(index: number, length: number): number {
  if (!Number.isInteger(index)) return length;
  return Math.max(0, Math.min(index, length));
}

function isField(value: FormPageFieldBlock | null): value is FormPageFieldBlock {
  return value !== null;
}

function rewriteFieldBlock(
  block: FormPageFieldBlock | null,
  fromId: string,
  toId: string,
): FormPageFieldBlock | null {
  if (!block) return null;
  if (block.fieldId !== fromId) return block;
  return { kind: "field", fieldId: toId };
}

function rewriteUnknownPageLayout(
  raw: unknown,
  fromId: string,
  toId: string,
): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const value = raw as { rows?: unknown; left?: unknown; right?: unknown };
  if (Array.isArray(value.rows)) {
    return {
      ...value,
      rows: value.rows.map(function rewriteRow(row) {
        return rewriteUnknownRow(row, fromId, toId);
      }),
    };
  }
  return {
    ...value,
    left: rewriteUnknownList(value.left, fromId, toId),
    right: rewriteUnknownList(value.right, fromId, toId),
  };
}

function rewriteUnknownRow(
  row: unknown,
  fromId: string,
  toId: string,
): unknown {
  if (!row || typeof row !== "object") return row;
  const raw = row as { left?: unknown; right?: unknown };
  return {
    ...raw,
    left: rewriteUnknownField(raw.left, fromId, toId),
    right: rewriteUnknownField(raw.right, fromId, toId),
  };
}

function rewriteUnknownList(
  value: unknown,
  fromId: string,
  toId: string,
): unknown {
  if (!Array.isArray(value)) return value;
  return value.map(function rewriteItem(item) {
    return rewriteUnknownField(item, fromId, toId);
  });
}

function rewriteUnknownField(
  value: unknown,
  fromId: string,
  toId: string,
): unknown {
  if (typeof value === "string") return value === fromId ? toId : value;
  if (!value || typeof value !== "object") return value;
  const raw = value as { kind?: unknown; fieldId?: unknown };
  if (raw.kind === "field" && raw.fieldId === fromId) {
    return { ...raw, fieldId: toId };
  }
  return value;
}

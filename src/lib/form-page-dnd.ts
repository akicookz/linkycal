import type { FieldDropTarget, FormPageBlock } from "@/lib/form-pages";

export const PAGE_BLOCK_PREFIX = "page-block:";
export const PAGE_SLOT_PREFIX = "page-slot:";
export const PAGE_ROW_GAP_PREFIX = "page-row-gap:";
export const PAGE_EDGE_PREFIX = "page-edge:";

export function pageBlockId(block: FormPageBlock): string {
  if (block.kind === "field") return `${PAGE_BLOCK_PREFIX}field:${block.fieldId}`;
  return `${PAGE_BLOCK_PREFIX}${block.kind}`;
}

export function pageSlotId(row: number, side: "left" | "right"): string {
  return `${PAGE_SLOT_PREFIX}${row}:${side}`;
}

export function pageRowGapId(index: number): string {
  return `${PAGE_ROW_GAP_PREFIX}${index}`;
}

export function pageEdgeId(fieldId: string, side: "left" | "right"): string {
  return `${PAGE_EDGE_PREFIX}${fieldId}:${side}`;
}

export function parsePageBlockId(id: string): FormPageBlock | null {
  if (!id.startsWith(PAGE_BLOCK_PREFIX)) return null;
  const rest = id.slice(PAGE_BLOCK_PREFIX.length);
  if (rest === "title" || rest === "richText" || rest === "image") {
    return { kind: rest };
  }
  if (rest.startsWith("field:")) {
    const fieldId = rest.slice("field:".length);
    if (!fieldId) return null;
    return { kind: "field", fieldId };
  }
  return null;
}

export function parsePageSlotId(
  id: string,
): { row: number; side: "left" | "right" } | null {
  if (!id.startsWith(PAGE_SLOT_PREFIX)) return null;
  const rest = id.slice(PAGE_SLOT_PREFIX.length);
  const sep = rest.indexOf(":");
  if (sep <= 0) return null;
  const row = Number(rest.slice(0, sep));
  const side = rest.slice(sep + 1);
  if (!Number.isInteger(row) || (side !== "left" && side !== "right")) {
    return null;
  }
  return { row, side };
}

export function parsePageRowGapId(id: string): number | null {
  if (!id.startsWith(PAGE_ROW_GAP_PREFIX)) return null;
  const index = Number(id.slice(PAGE_ROW_GAP_PREFIX.length));
  return Number.isInteger(index) ? index : null;
}

export function parsePageEdgeId(
  id: string,
): { fieldId: string; side: "left" | "right" } | null {
  if (!id.startsWith(PAGE_EDGE_PREFIX)) return null;
  const rest = id.slice(PAGE_EDGE_PREFIX.length);
  const sep = rest.lastIndexOf(":");
  if (sep <= 0) return null;
  const fieldId = rest.slice(0, sep);
  const side = rest.slice(sep + 1);
  if (!fieldId || (side !== "left" && side !== "right")) return null;
  return { fieldId, side };
}

export function resolveFieldDrop(overId: string): FieldDropTarget | null {
  const edge = parsePageEdgeId(overId);
  if (edge) return { type: "edge", fieldId: edge.fieldId, side: edge.side };
  const slot = parsePageSlotId(overId);
  if (slot) return { type: "slot", row: slot.row, side: slot.side };
  const gap = parsePageRowGapId(overId);
  if (gap == null) return null;
  return { type: "gap", index: gap };
}

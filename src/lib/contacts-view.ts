// src/lib/contacts-view.ts
export interface ViewTag {
  id: string;
  name: string;
  color: string | null;
}

export interface ViewContact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
  lastActivityAt?: string | null;
  tags: ViewTag[];
}

export interface KanbanColumn {
  id: string;
  name: string;
  color: string | null;
  contacts: ViewContact[];
}

export const UNTAGGED_COLUMN_ID = "__untagged__";

export function buildKanbanColumns(opts: {
  contacts: ViewContact[];
  allTags: ViewTag[];
  pivotTagIds: string[] | null;
  showUntagged: boolean;
}): KanbanColumn[] {
  const { contacts, allTags, pivotTagIds, showUntagged } = opts;
  const byId = new Map(allTags.map((t) => [t.id, t]));

  // Ordered stage tags: follow pivotTagIds order when set, else allTags order.
  const stageTags: ViewTag[] =
    pivotTagIds && pivotTagIds.length > 0
      ? pivotTagIds.map((id) => byId.get(id)).filter((t): t is ViewTag => !!t)
      : allTags;

  const columns: KanbanColumn[] = stageTags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    color: tag.color,
    contacts: contacts.filter((c) => c.tags.some((t) => t.id === tag.id)),
  }));

  if (showUntagged) {
    const stageIds = new Set(stageTags.map((t) => t.id));
    columns.push({
      id: UNTAGGED_COLUMN_ID,
      name: "Untagged",
      color: "#94a3b8",
      contacts: contacts.filter((c) => !c.tags.some((t) => stageIds.has(t.id))),
    });
  }

  return columns;
}

// Effective ordered list of real (non-untagged) column tag ids the board shows.
// When there is no explicit pivot, the board falls back to all tags in order.
// Filtering against allTags drops ids whose tag was deleted elsewhere.
export function resolveColumnTagIds(
  pivotTagIds: string[] | null,
  allTags: ViewTag[],
): string[] {
  if (pivotTagIds && pivotTagIds.length > 0) {
    const known = new Set(allTags.map((t) => t.id));
    return pivotTagIds.filter((id) => known.has(id));
  }
  return allTags.map((t) => t.id);
}

// Pure array move; returns a new array. Out-of-range indices are a no-op.
export function applyReorder(
  ids: string[],
  fromIndex: number,
  toIndex: number,
): string[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= ids.length ||
    toIndex >= ids.length
  ) {
    return ids.slice();
  }
  const next = ids.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function contactStageTagId(
  contact: ViewContact,
  pivotTagIds: string[] | null,
): string | null {
  if (!pivotTagIds || pivotTagIds.length === 0) return null;
  const have = new Set(contact.tags.map((t) => t.id));
  return pivotTagIds.find((id) => have.has(id)) ?? null;
}

export type SortKey = "name" | "email" | "phone" | "stage" | "lastActivity" | "created";

// Empty/blank values always sort to the bottom; the direction flips the rest.
function cmpStrings(a: string, b: string, dir: "asc" | "desc"): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const base = a.localeCompare(b, undefined, { sensitivity: "base" });
  return dir === "asc" ? base : -base;
}

export function compareContacts(
  a: ViewContact,
  b: ViewContact,
  key: SortKey,
  dir: "asc" | "desc",
  pivotTagIds: string[] | null,
  allTags: ViewTag[],
): number {
  const byId = new Map(allTags.map((t) => [t.id, t]));
  const stageRank = (c: ViewContact): { rank: number; label: string } => {
    const id = contactStageTagId(c, pivotTagIds);
    if (!id) return { rank: Number.MAX_SAFE_INTEGER, label: "" };
    const idx = pivotTagIds ? pivotTagIds.indexOf(id) : -1;
    return { rank: idx, label: byId.get(id)?.name ?? "" };
  };

  switch (key) {
    case "name":
      return cmpStrings(a.name, b.name, dir);
    case "email":
      return cmpStrings(a.email ?? "", b.email ?? "", dir);
    case "phone":
      return cmpStrings(a.phone ?? "", b.phone ?? "", dir);
    case "created":
      return cmpStrings(a.createdAt, b.createdAt, dir);
    case "lastActivity":
      return cmpStrings(a.lastActivityAt ?? "", b.lastActivityAt ?? "", dir);
    case "stage": {
      const ra = stageRank(a);
      const rb = stageRank(b);
      if (ra.rank !== rb.rank) {
        const base = ra.rank - rb.rank;
        // Unstaged (MAX) always last; only ranked rows flip with direction.
        if (ra.rank === Number.MAX_SAFE_INTEGER || rb.rank === Number.MAX_SAFE_INTEGER) {
          return base > 0 ? 1 : -1;
        }
        return dir === "asc" ? base : -base;
      }
      return cmpStrings(ra.label, rb.label, dir);
    }
  }
}

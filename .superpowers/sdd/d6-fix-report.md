# D6 Fix Report — contact-pipeline-views review fixes

## Status: DONE

## Build
`bun run build` — passed (both SSR worker bundle and SPA client bundle, chunk-size warning is pre-existing and unrelated).

## Tests
`bun test` — **126 pass, 0 fail** (unchanged from before fixes).

## Lint
`bun run lint` — exit code 1 only due to **pre-existing errors** in unrelated files (`worker/index.ts`, `worker/auth.ts`, `widget/`, `worker/services/booking-service.ts`, `worker/services/form-service.ts`, `worker/services/workflow-execution-service.ts`, `tests/worker/email-service.test.ts`, `src/components/UpgradeDialog.tsx`).

Lint on the **four touched files** specifically: **zero errors, zero warnings**.
```
npx eslint src/pages/ContactsKanban.tsx src/pages/ContactsTable.tsx \
           src/pages/Contacts.tsx worker/services/contact-service.ts
# (no output — clean)
```

## Commit hash
See `git log -1` for the hash after commit.

---

## Fix-by-fix summary

### FIX 1 — Whole-card kanban drag
Moved `{...listeners}`, `{...attributes}`, and `ref={setNodeRef}` from the grip `<span>` to the root card `<div>`. Removed the inner `<button>` element (replaced with a plain `<div>`) to avoid nested-interactive-element issues; the navigation `onClick` is now on the root `<div>`. Added `touch-none cursor-grab active:cursor-grabbing` to the root. The grip `<GripVertical>` span is now marked `aria-hidden="true"` and is purely decorative. Click-to-navigate works because `PointerSensor` uses `activationConstraint: { distance: 5 }` — a click (no movement) does not activate drag, so the `onClick` on the root fires normally.

### FIX 2 — Chips hide ALL stage tags
`KanbanCard` now accepts a `pivotTagIds: string[] | null` prop (passed from `ContactsKanban` which already had it). The chip filter builds a `stageSet` from the full `pivotTagIds` array (falling back to just `columnId` when `pivotTagIds` is null/empty). Only non-stage tags render as chips.

### FIX 3 — Restore Edit row action
- `ContactsTable` props changed: `onEdit: (id: string) => void` added; `onDelete` changed from `(contact: ViewContact) => void` to `(id: string) => void`.
- Added `Pencil` from `lucide-react`; Edit button added next to Delete in each row (ghost style, hover-revealed, `stopPropagation` via the td's existing handler).
- `openEditDialog` was missing from `Contacts.tsx` (the dialog markup and state existed but there was no opener function). Added as a `useCallback` that sets `editingContact`, `editForm` (populated from the contact's fields), and `editDialogOpen`.
- `<ContactsTable>` call now wires `onEdit={(id) => { const c = contacts.find(…); if (c) openEditDialog(c); }}` and `onDelete={(id) => { const c = contacts.find(…); if (c) openDeleteDialog(c); }}`. No more `as unknown as Contact` cast.

### FIX 4 — Exclusive stage move fallback for unpivoated boards
`handleStageChange` now uses:
```ts
const groupTagIds =
  config.pivotTagIds && config.pivotTagIds.length > 0
    ? config.pivotTagIds
    : tags.map((t) => t.id);
```
When no explicit pivot is set (the default "all tags" board), all current project tag ids are passed as `groupTagIds` to `setStage`, so dragging removes all other stage tags before adding the new one.

### FIX 5 — seedPipeline null guard
Added `if (!view) throw new Error("Failed to create pipeline view");` immediately after `createView` in `ContactService.seedPipeline`. The route now cannot return `{ view: null }`.

### FIX 6 — Delete optimistic behavior preserved
The `onDelete` id-based callback in `Contacts.tsx` routes through the existing `openDeleteDialog(c)` → confirm dialog → `deleteMutation.mutate(deletingContact.id)` flow. The optimistic update in `deleteMutation.onMutate` is entirely unchanged.

## Concerns
None blocking. Minor note: the root card `<div>` carries `role="button"` (from `{...attributes}`) while `CopyContactButton` (a button) lives inside it — a nested-interactive-element pattern. This is a known dnd-kit trade-off. If `CopyContactButton` already calls `e.stopPropagation()` on its click (as the spec indicates it does), navigation is correctly suppressed when copying. If not, a future ticket should add `stopPropagation` there.

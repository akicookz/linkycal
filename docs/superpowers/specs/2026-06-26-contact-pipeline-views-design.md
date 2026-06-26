# Contact pipeline views (Kanban + Table)

Date: 2026-06-26
Status: Approved

## Goal

Complete the contacts "views" feature so a saved view renders as either a
**sortable Table** or a **drag-and-drop Kanban pipeline**. Kanban columns are
stage tags; dragging a contact card from one stage to another moves it (drops
the old stage tag, adds the new). A one-click "Start a sales pipeline" seeds the
starter stages. Follows existing AGENTS.md UI conventions.

## What already exists (do not rebuild)

- `contact_views` table with `type` (`list` | `kanban`) and a `config` JSON that
  already includes `pivotTagIds` (stage columns) and `showUntagged`.
- Saved-views CRUD (API + `ContactService` + SPA query/mutations + views
  dropdown + save/update view + dirty tracking).
- Tags with colors; assign/remove tag from contact; `pruneTagFromViews` cleanup.
- `ContactsKanban.tsx` grouping contacts into tag columns (read-only, no DnD).
- Full filter model (search, tags AND/OR, activity, booking) in `ContactService.list`.

## Model decision (no DB migration)

A "stage" is just a tag. A view's stage set is its ordered `config.pivotTagIds`;
column order follows that array. Drag-exclusivity is scoped to that board's pivot
set. Rejected alternatives: a project-level pipeline object, or an
`isStage`/`sortOrder` flag on `tags` (both need migration/extra state for no
v1 benefit).

## Backend (`worker/`)

1. **`ContactService.setStage(contactId, tagId: string | null, groupTagIds: string[])`**
   — remove the contact's tags that are in `groupTagIds`, then add `tagId`
   (idempotent). `tagId === null` means dropped into "Untagged" (remove only).
   Log `tag_removed` (old) and `tag_added` (new) via existing `logActivity`
   (no new activity-type enum).
2. **`ContactService.seedPipeline(projectId)`** — create 5 stage tags and a
   Kanban view in one call; return the created view.
   - Tags (name · color): Lead·`#6b7280`, Prospect·`#3b82f6`,
     First Contact·`#6366f1`, Follow Up·`#f59e0b`, Met·`#10b981`.
   - View: `{ name: "Sales Pipeline", type: "kanban",
     config: { pivotTagIds: [<5 ids in order>], showUntagged: true } }`.
   - User-initiated; always creates (no dedupe in v1).
3. **`ContactService.listWithTags` enrichment** — add ONE batched query for
   `lastActivityAt` = `MAX(contact_activity.createdAt)` grouped by `contactId`,
   scoped to the project's contact ids; attach to each contact. Powers the
   table's Last-activity column/sort. One extra query, not N+1.
4. **Routes** (`worker/index.ts`):
   - `POST /api/projects/:projectId/contacts/:contactId/stage`
     body `{ tagId: string | null, groupTagIds: string[] }` → `setStage`.
   - `POST /api/projects/:projectId/pipeline/seed` → `seedPipeline`, returns the
     new view.
5. **Validation** (`validation.ts`): `setStageSchema`
   (`tagId: z.string().nullable()`, `groupTagIds: z.array(z.string())`).

## Frontend (`src/`)

1. **`ContactsKanban.tsx`**
   - Order columns by `pivotTagIds` order; optional trailing "Untagged" column.
   - `@dnd-kit` (already installed): cards `useDraggable`, columns `useDroppable`.
   - On drop into stage `T`: call the stage mutation with
     `groupTagIds = config.pivotTagIds`, `tagId = T` (or `null` for Untagged),
     with an **optimistic cache update** that updates the dragged contact's tags
     in the cached contacts list so the card moves instantly; rollback on error.
   - Empty state (no pivot columns configured / no stage tags): a
     **"Start a sales pipeline"** button → calls `pipeline/seed`, then loads the
     returned view.
   - Card: avatar, name, email, non-stage tags.
2. **`ContactsTable.tsx`** (new) — true columnar, client-sortable table:
   columns Name, Email, Phone, Stage (colored pill = the contact's tag that is in
   the active view's `pivotTagIds`, ordered first match; falls back to a generic
   Tags column when the view has no pivot set), Last activity, row actions
   (Edit/Delete reusing existing handlers). Sort by clicking a header
   (client-side over the loaded list).
3. **`Contacts.tsx`**
   - Render the `list` view type via `ContactsTable` (relabel the toggle
     "List" → "Table"; keep DB enum value `list` to avoid a migration).
   - Add the stage mutation (optimistic) and the seed mutation; wire the
     empty-state button.
   - The Table/Kanban toggle re-renders the current `config` either way; a saved
     view's `type` sets the initial mode.

## Data flow: drag to change stage

1. User drags card (contact C) from column A into column B (stage tag `T_B`).
2. Kanban calls `stageMutation.mutate({ contactId: C, tagId: T_B, groupTagIds: pivotTagIds })`.
3. `onMutate`: optimistically set C.tags = (tags not in pivotTagIds) + tag(T_B);
   snapshot for rollback. Card renders in column B immediately.
4. `POST …/stage` → `setStage` removes C's pivot tags, adds `T_B`, logs activity.
5. `onError`: restore snapshot. `onSettled`: invalidate contacts.

## Testing

- Unit (`bun test`, in-memory drizzle): `setStage` (removes group, adds target,
  null→remove-only); `seedPipeline` (creates 5 tags + kanban view with ordered
  pivotTagIds); kanban column-builder helper (column order from pivotTagIds +
  untagged bucket); table sort comparator.
- Visual (headless Chrome): seed pipeline → drag a card between stages (instant
  move) → switch to Table, sort by Stage and Last activity.

## Out of scope (v1)

- Custom table column-picker UI (fixed columns v1).
- Drag-to-reorder Kanban columns (order = `pivotTagIds`; future "manage columns").
- Dedicated `stage_changed` activity type (reuse tag_added/removed).
- Project-level pipeline / auto-seeding new projects on onboarding.

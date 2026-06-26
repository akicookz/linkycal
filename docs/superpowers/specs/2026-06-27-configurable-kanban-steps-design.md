# Configurable Kanban Steps — Design

Date: 2026-06-27
Status: Approved (pending spec review)

## Problem

The contacts kanban board renders one column per "stage" tag, but managing those
steps is clunky and lives off the board:

- Adding a step means creating a tag in a separate tags manager, then toggling it
  on in a buried "Filters → Kanban columns" popover.
- Removing a step means toggling the tag off in that same popover (or deleting the
  tag entirely from the tags manager).
- There is no way to rename or recolor a step, and no way to reorder steps.

Users expect the board to behave like a real kanban: add, edit, remove, and reorder
columns directly on the board.

## Mental model

A **step = a kanban column = a tag** whose id appears in the active view's
`config.pivotTagIds` (an ordered array). This is unchanged from today; we are adding
direct manipulation, not a new data model.

Two classes of operation, with deliberately different persistence:

| Operation | Acts on | Persistence |
|---|---|---|
| Rename step | the shared tag (`tags.name`) | **immediate & global** (mutation) |
| Recolor step | the shared tag (`tags.color`) | **immediate & global** (mutation) |
| Delete step's tag | the shared tag (delete + prune from all views) | **immediate & global** (mutation) |
| Add step (new tag) | creates a tag, then appends its id | tag create is immediate; append to `pivotTagIds` is **draft** |
| Add step (existing tag) | appends an existing tag id | **draft** |
| Remove step from board | `config.pivotTagIds` only | **draft** |
| Swap step to another tag | replaces an id in `config.pivotTagIds` | **draft** |
| Reorder steps | reorders `config.pivotTagIds` | **draft** |

"Draft" means the change updates the live `config` state and marks the active view
dirty; the user persists it with the existing **Update view** / **Save as new view**
buttons. This matches the chosen persistence model and the current codebase pattern.

Tag-identity ops are inherently global because a tag is shared across the whole
project (other views, contact chips); we surface that reality rather than hide it.

## Current state (for reference)

- UI: `src/pages/ContactsKanban.tsx` renders columns from
  `buildKanbanColumns()` (`src/lib/contacts-view.ts`). The parent
  `src/pages/Contacts.tsx` owns `config`, the active view, tag list, and all
  mutations.
- Columns come from `config.pivotTagIds` (ordered); when empty/implicit the board
  falls back to "all tags" in `allTags` order. A synthetic "Untagged" column is
  appended when `config.showUntagged` is true (`UNTAGGED_COLUMN_ID = "__untagged__"`).
- Card drag uses one dnd-kit `DndContext`; drop calls
  `onStageChange(contactId, toColumnId)` → `handleStageChange` → `stageMutation` →
  `setStage` (stage tags are mutually exclusive on a contact).
- Existing endpoints/services already cover: list/create/delete tags,
  add/remove contact tag, set stage, create/update/delete views, seed pipeline,
  and `pruneTagFromViews` (called on tag delete).
- **Gap:** there is no tag *update* (rename/recolor) path — no
  `updateTagSchema`, no `ContactService.updateTag`, no `PATCH /tags/:id` route.

## Backend changes

1. **Validation** (`worker/validation.ts`): add, mirroring `createTagSchema`
   (`name: min(1).max(50)`, `color: regex /^#[0-9a-fA-F]{6}$/`):
   ```ts
   export const updateTagSchema = z.object({
     name: z.string().min(1).max(50).optional(),
     color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
   });
   ```

2. **Service** (`worker/services/contact-service.ts`): add
   `async updateTag(projectId, id, data: { name?: string; color?: string })`.
   - Only update fields that are present.
   - Scope to the project (update `where id = ? and projectId = ?`) and return the
     updated row (or null if not found / not owned).

3. **Route** (`worker/index.ts`, in the tags section near the existing
   GET/POST/DELETE `/tags` routes):
   `PATCH /api/projects/:projectId/tags/:id`
   - Validate body with `updateTagSchema` via the generic `validate` helper.
   - 404 if the tag is not in the project; 200 with `{ tag }` on success.
   - Mirror the error handling style of the sibling tag routes.

4. **Test** (`tests/worker/contact-service.test.ts` or the existing contact-service
   test file): cover `updateTag` — updates name only, color only, both; ignores
   tags from another project.

No changes to delete/create tag, prune, update view, or set stage — they are reused.

## Frontend changes

### Pure helpers (`src/lib/contacts-view.ts`)

Add and unit-test two small pure functions so the structural logic is testable in
isolation:

- `resolveColumnTagIds(pivotTagIds: string[] | null, allTags: ViewTag[]): string[]`
  — returns the effective ordered list of real (non-untagged) column tag ids the
  board is currently showing. When `pivotTagIds` is null/empty, this is
  `allTags.map(t => t.id)`. Used to **materialize** an explicit order before the
  first structural edit so the board stays WYSIWYG.
- `applyReorder(ids: string[], fromIndex: number, toIndex: number): string[]`
  — returns a new array with the item moved. Pure array move.

### Board controls (`src/pages/ContactsKanban.tsx`)

The board gains new optional callbacks (kept optional so list/other usages are
unaffected). Real columns (not the synthetic Untagged column) get a header with:

- a **drag handle** (grip icon) that initiates column-reorder drag,
- a **⋯ menu** containing:
  - **Rename** — inline text field → `onRenameStep(tagId, name)`.
  - **Color swatches** — reuse the existing tag color palette → `onRecolorStep(tagId, color)`.
  - **Swap to tag…** — a list of existing tags not already columns →
    `onSwapStep(tagId, newTagId)`.
  - **Remove** — opens a small confirm with two explicit actions:
    - **Remove from board** → `onRemoveStepFromBoard(tagId)` (draft),
    - **Delete tag everywhere** → `onDeleteStepTag(tagId)` (mutation).

A trailing dashed **"+ Add step"** ghost column sits at the end of the board (after
the Untagged column). Clicking it opens a popover that either:

- takes a new step name → `onAddStep({ name })` (create tag, then append), or
- lets the user pick an existing non-column tag → `onAddStep({ tagId })` (append).

**Drag handling.** Both card drag and column drag share the existing `DndContext`.
Draggables carry a `data.type` of `"card"` or `"column"`. `handleDragEnd` branches:
- `type === "card"` → existing `onStageChange` path (unchanged).
- `type === "column"` → compute from/to indices among real columns and call
  `onReorderSteps(fromIndex, toIndex)`.

The synthetic Untagged column and the "+ Add step" element are not draggable and are
not valid column-reorder drop targets.

### Parent wiring (`src/pages/Contacts.tsx`)

New `updateTagMutation` → `PATCH /tags/:id`; on success invalidate the tags and
contacts queries (rename/recolor must reflect on chips and other views).

New handlers passed to `ContactsKanban`:

- `handleRenameStep(tagId, name)` / `handleRecolorStep(tagId, color)` →
  `updateTagMutation`.
- `handleDeleteStepTag(tagId)` → existing delete-tag mutation (already prunes views).
- `handleAddStep({ name? , tagId? })` — if `name`, create the tag (existing create
  mutation) and append the new id; if `tagId`, append directly. Append = draft via
  `setConfig`, after materializing the current order.
- `handleRemoveStepFromBoard(tagId)` — materialize, then drop `tagId` from
  `config.pivotTagIds` (draft).
- `handleSwapStep(tagId, newTagId)` — materialize, then replace `tagId` with
  `newTagId` at the same index (draft).
- `handleReorderSteps(fromIndex, toIndex)` — materialize, then `applyReorder` (draft).

**Materialize-on-first-edit:** every structural handler first resolves the explicit
ordered column ids via `resolveColumnTagIds(config.pivotTagIds, tags)` and writes
them back into `config.pivotTagIds` before applying its change, so an implicit
"all tags" board becomes explicit on first edit and nothing visually jumps.

## Decisions (from brainstorming)

- **Remove** = ask each time (Remove from board vs Delete tag everywhere).
- **Add** = create new tag or pick an existing one.
- **Persistence** = draft + existing Update view / Save as new view (no auto-save).
- **Reorder** = yes, drag columns to reorder.
- **Edit** = rename, recolor, and swap to another tag.

## Scope / YAGNI

- The existing "Filters → Kanban columns" toggle list is **kept** as a secondary
  surface (it writes the same `config.pivotTagIds`, so the two surfaces stay
  consistent). Not removed, to limit churn.
- The "Untagged" column stays synthetic and non-editable; its checkbox stays in the
  filters popover.
- No per-step WIP limits, no new automation hooks beyond the existing `setStage`
  tag-add/remove workflow triggers.
- No bulk step operations, no archiving of steps.

## Testing

- Worker: `updateTag` service test (name/color/both; cross-project isolation).
- Frontend pure helpers: `resolveColumnTagIds` (implicit vs explicit pivot) and
  `applyReorder` (move left/right/no-op) in the `contacts-view` test file.
- Manual: add/rename/recolor/swap/remove/reorder on the seeded Sales Pipeline,
  confirm dirty → Update view persists, confirm card drag still works.

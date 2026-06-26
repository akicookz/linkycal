# Configurable Kanban Steps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users add, rename, recolor, swap, remove, and reorder kanban steps directly on the contacts board.

**Architecture:** A "step" is a tag whose id appears in the active view's `config.pivotTagIds` (ordered). Tag-identity ops (rename/recolor/delete) are immediate global mutations; board-composition ops (add/remove/swap/reorder) edit the live `config` draft and persist via the existing "Update view" button. The board reuses the existing dnd-kit `DndContext` for both card drag and column-reorder drag, distinguished by drag-data `type`.

**Tech Stack:** Cloudflare Worker + Hono + Drizzle (D1), React SPA + @tanstack/react-query + @dnd-kit/core, Zod validation, Bun test runner.

## Global Constraints

- TypeScript `verbatimModuleSyntax: true` — type-only imports MUST use `import type`.
- Function declarations and naming follow `AGENTS.md`; routes stay thin, logic in services.
- Every request-body Zod schema lives in `worker/validation.ts`; routes call the generic `validate<T>(schema, data)` helper — never define ad-hoc schemas in handlers.
- New API endpoints go in `worker/index.ts` (the monolith), in the existing `// ─── Tags ───` section.
- Tag color format is `#RRGGBB` (regex `/^#[0-9a-fA-F]{6}$/`); tag name is `min(1).max(50)`.
- Services are instantiated per-request: `const service = new ContactService(db)`.
- UI: squircle radii, forest-green palette, icon+text buttons, card-style rows, no border separators (per `AGENTS.md`). The only menu primitive available is `@/components/ui/popover` (there is no DropdownMenu).
- Do not hand-edit `worker-configuration.d.ts`. No DB schema change is needed (the `tags` table already has `name` and `color`), so no Drizzle migration.

---

### Task 1: Backend — tag update (rename/recolor)

**Files:**
- Modify: `worker/validation.ts` (add `updateTagSchema` in the `// ─── Tags ───` section ~line 448)
- Modify: `worker/services/contact-service.ts` (add `updateTag` after `deleteTag`, ~line 325)
- Modify: `worker/index.ts` (add `updateTagSchema` to the validation import ~line 36; add PATCH route after the DELETE `/tags/:id` route ~line 5207)
- Test: `tests/worker/contact-pipeline.test.ts` (add an `updateTag` describe block)

**Interfaces:**
- Produces: `ContactService.updateTag(projectId: string, id: string, data: { name?: string; color?: string }): Promise<Tag | null>` — returns the updated row, or `null` if the tag is not in the project.
- Produces: `PATCH /api/projects/:projectId/tags/:id` accepting `{ name?: string; color?: string }`, returning `{ tag }` (200) or `{ error }` (400/404/500).

- [ ] **Step 1: Write the failing service test**

Add to the end of `tests/worker/contact-pipeline.test.ts` (it already imports `eq`, `dbSchema`, `ContactService`, `createTestDb`, and has `seed()`):

```ts
describe("ContactService.updateTag", () => {
  test("updates name only, leaving color intact", async () => {
    const db = await seed();
    const svc = new ContactService(db);
    const updated = await svc.updateTag("p", "lead", { name: "Renamed" });
    expect(updated?.name).toBe("Renamed");
    expect(updated?.color).toBe("#6b7280");
  });

  test("updates color only, leaving name intact", async () => {
    const db = await seed();
    const svc = new ContactService(db);
    const updated = await svc.updateTag("p", "lead", { color: "#123456" });
    expect(updated?.name).toBe("Lead");
    expect(updated?.color).toBe("#123456");
  });

  test("updates name and color together", async () => {
    const db = await seed();
    const svc = new ContactService(db);
    const updated = await svc.updateTag("p", "lead", { name: "Hot", color: "#abcdef" });
    expect(updated?.name).toBe("Hot");
    expect(updated?.color).toBe("#abcdef");
  });

  test("does not update a tag from another project", async () => {
    const db = await seed();
    await db.insert(dbSchema.projects).values({ id: "p2", userId: "u", name: "P2", slug: "p2" });
    await db.insert(dbSchema.tags).values({ id: "foreign", projectId: "p2", name: "Foreign", color: "#000000" });
    const svc = new ContactService(db);
    const result = await svc.updateTag("p", "foreign", { name: "Hijacked" });
    expect(result).toBeNull();
    const [row] = await db.select().from(dbSchema.tags).where(eq(dbSchema.tags.id, "foreign"));
    expect(row.name).toBe("Foreign");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/worker/contact-pipeline.test.ts -t "updateTag"`
Expected: FAIL — `svc.updateTag is not a function`.

- [ ] **Step 3: Implement `updateTag` in the service**

In `worker/services/contact-service.ts`, immediately after `deleteTag` (ends ~line 325). `and` and `eq` are already imported on line 1.

```ts
  async updateTag(
    projectId: string,
    id: string,
    data: { name?: string; color?: string },
  ) {
    const fields: Partial<{ name: string; color: string }> = {};
    if (data.name !== undefined) fields.name = data.name;
    if (data.color !== undefined) fields.color = data.color;
    const where = and(
      eq(dbSchema.tags.id, id),
      eq(dbSchema.tags.projectId, projectId),
    );
    if (Object.keys(fields).length > 0) {
      await this.db.update(dbSchema.tags).set(fields).where(where);
    }
    const rows = await this.db
      .select()
      .from(dbSchema.tags)
      .where(where)
      .limit(1);
    return rows[0] ?? null;
  }
```

- [ ] **Step 4: Run the service test to verify it passes**

Run: `bun test tests/worker/contact-pipeline.test.ts -t "updateTag"`
Expected: PASS (4 tests).

- [ ] **Step 5: Add the validation schema**

In `worker/validation.ts`, in the `// ─── Tags ───` section right after `createTagSchema` (~line 453):

```ts
export const updateTagSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});
```

- [ ] **Step 6: Add the PATCH route**

In `worker/index.ts`, add `updateTagSchema` to the validation import block (the one ending ~line 57, alongside `createTagSchema` on line 36):

```ts
  createTagSchema,
  updateTagSchema,
```

Then add the route immediately after the DELETE `/tags/:id` handler (~line 5207), mirroring the sibling tag routes:

```ts
app.patch("/api/projects/:projectId/tags/:id", async (c) => {
  try {
    const projectId = c.req.param("projectId");
    const id = c.req.param("id");
    const body = await c.req.json();
    const data = validate(updateTagSchema, body);

    const db = c.get("db");
    const service = new ContactService(db);
    const tag = await service.updateTag(projectId, id, data);
    if (!tag) return c.json({ error: "Tag not found" }, 404);

    return c.json({ tag });
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return c.json({ error: "Invalid request" }, 400);
    }
    console.error("Tag update error:", err);
    return c.json({ error: "Failed to update tag" }, 500);
  }
});
```

- [ ] **Step 7: Run the full worker test file + lint**

Run: `bun test tests/worker/contact-pipeline.test.ts && bun run lint`
Expected: all tests PASS, lint clean.

- [ ] **Step 8: Commit**

```bash
git add worker/validation.ts worker/services/contact-service.ts worker/index.ts tests/worker/contact-pipeline.test.ts
git commit -m "feat(contacts): tag update endpoint (rename/recolor) for kanban steps"
```

---

### Task 2: Pure helpers for column order

**Files:**
- Modify: `src/lib/contacts-view.ts` (add `resolveColumnTagIds` and `applyReorder` after `buildKanbanColumns`)
- Test: `tests/contacts-view.test.ts` (add two describe blocks)

**Interfaces:**
- Produces: `resolveColumnTagIds(pivotTagIds: string[] | null, allTags: ViewTag[]): string[]` — the effective ordered list of real (non-untagged) column tag ids. When `pivotTagIds` is null/empty, returns `allTags.map(t => t.id)`; otherwise returns `pivotTagIds` filtered to ids that still exist in `allTags`.
- Produces: `applyReorder(ids: string[], fromIndex: number, toIndex: number): string[]` — a new array with the item at `fromIndex` moved to `toIndex`. Returns the input unchanged (new array) if either index is out of range.

- [ ] **Step 1: Write the failing tests**

Add to `tests/contacts-view.test.ts`. First extend the imports at the top:

```ts
import {
  buildKanbanColumns,
  contactStageTagId,
  compareContacts,
  resolveColumnTagIds,
  applyReorder,
  type ViewContact,
  type ViewTag,
} from "../src/lib/contacts-view";
```

Then add:

```ts
describe("resolveColumnTagIds", () => {
  test("returns all tag ids when pivot is null", () => {
    expect(resolveColumnTagIds(null, tags)).toEqual(["lead", "prospect", "vip"]);
  });
  test("returns all tag ids when pivot is empty", () => {
    expect(resolveColumnTagIds([], tags)).toEqual(["lead", "prospect", "vip"]);
  });
  test("follows pivot order and drops ids no longer in allTags", () => {
    expect(resolveColumnTagIds(["vip", "gone", "lead"], tags)).toEqual(["vip", "lead"]);
  });
});

describe("applyReorder", () => {
  test("moves an item forward", () => {
    expect(applyReorder(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });
  test("moves an item backward", () => {
    expect(applyReorder(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });
  test("no-op for out-of-range indices and does not mutate input", () => {
    const input = ["a", "b", "c"];
    expect(applyReorder(input, 0, 9)).toEqual(["a", "b", "c"]);
    expect(input).toEqual(["a", "b", "c"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test tests/contacts-view.test.ts -t "resolveColumnTagIds"`
Expected: FAIL — `resolveColumnTagIds` is not exported.

- [ ] **Step 3: Implement the helpers**

In `src/lib/contacts-view.ts`, add after `buildKanbanColumns` (after line 60):

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test tests/contacts-view.test.ts`
Expected: PASS (all, including the new blocks).

- [ ] **Step 5: Commit**

```bash
git add src/lib/contacts-view.ts tests/contacts-view.test.ts
git commit -m "feat(contacts): pure helpers resolveColumnTagIds + applyReorder"
```

---

### Task 3: Add / edit / remove steps on the board

**Files:**
- Modify: `src/pages/Contacts.tsx` (add `updateTagMutation` after `deleteTagMutation` ~line 708; add step handlers after `togglePivotTag` ~line 1038; extend the `<ContactsKanban>` props ~line 1766)
- Modify: `src/pages/ContactsKanban.tsx` (extend props interface; add `StepMenu` and `AddStepColumn` components; render them; thread `editable` + handlers through `KanbanColumnBox`)

**Interfaces:**
- Consumes: `resolveColumnTagIds` from Task 2.
- Consumes: `PATCH /tags/:id` from Task 1.
- Produces (parent handlers passed to the board):
  - `onAddStep(input: { name?: string; color?: string; tagId?: string }): void`
  - `onRenameStep(tagId: string, name: string): void`
  - `onRecolorStep(tagId: string, color: string): void`
  - `onSwapStep(tagId: string, newTagId: string): void`
  - `onRemoveStepFromBoard(tagId: string): void`
  - `onDeleteStepTag(tagId: string): void`
  - plus `editable: boolean`

- [ ] **Step 1: Add `updateTagMutation` in `Contacts.tsx`**

After `deleteTagMutation` (ends ~line 708), mirroring its style:

```tsx
  const updateTagMutation = useMutation({
    mutationFn: async (vars: { id: string; name?: string; color?: string }) => {
      const res = await fetch(`/api/projects/${projectId}/tags/${vars.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: vars.name, color: vars.color }),
      });
      if (!res.ok) throw new Error("Failed to update tag");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "tags"] });
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "contacts"] });
    },
  });
```

- [ ] **Step 2: Import the helper and add step handlers in `Contacts.tsx`**

Add `resolveColumnTagIds` to the existing import from `@/lib/contacts-view` (the file already imports `UNTAGGED_COLUMN_ID` and others from it — find that import and add the name). Then add these handlers right after `togglePivotTag` (~line 1038). `tags` is the fetched tag list (shape `{ id, name, color }[]`, compatible with `ViewTag`); `config`/`setConfig` already exist.

```tsx
  // ─── Kanban step editing ───
  // Board-composition ops edit the live config draft (persisted via "Update view").
  // Materialize the implicit "all tags" order into pivotTagIds on first structural edit.
  function handleAddStep(input: { name?: string; color?: string; tagId?: string }) {
    const base = resolveColumnTagIds(config.pivotTagIds ?? null, tags);
    if (input.tagId) {
      if (base.includes(input.tagId)) return;
      const next = [...base, input.tagId];
      setConfig((c) => ({ ...c, pivotTagIds: next }));
      return;
    }
    const name = input.name?.trim();
    if (!name) return;
    createTagMutation.mutate(
      { name, color: input.color },
      {
        onSuccess: (data: { tag?: { id: string } }) => {
          const newId = data?.tag?.id;
          if (!newId) return;
          setConfig((c) => ({
            ...c,
            pivotTagIds: [...resolveColumnTagIds(c.pivotTagIds ?? null, tags), newId],
          }));
        },
      },
    );
  }

  function handleRemoveStepFromBoard(tagId: string) {
    const base = resolveColumnTagIds(config.pivotTagIds ?? null, tags);
    setConfig((c) => ({ ...c, pivotTagIds: base.filter((id) => id !== tagId) }));
  }

  function handleDeleteStepTag(tagId: string) {
    const base = resolveColumnTagIds(config.pivotTagIds ?? null, tags);
    setConfig((c) => ({ ...c, pivotTagIds: base.filter((id) => id !== tagId) }));
    deleteTagMutation.mutate(tagId);
  }

  function handleRenameStep(tagId: string, name: string) {
    const n = name.trim();
    if (!n) return;
    updateTagMutation.mutate({ id: tagId, name: n });
  }

  function handleRecolorStep(tagId: string, color: string) {
    updateTagMutation.mutate({ id: tagId, color });
  }

  function handleSwapStep(tagId: string, newTagId: string) {
    const base = resolveColumnTagIds(config.pivotTagIds ?? null, tags);
    const idx = base.indexOf(tagId);
    if (idx === -1) return;
    if (base.includes(newTagId)) {
      setConfig((c) => ({ ...c, pivotTagIds: base.filter((id) => id !== tagId) }));
      return;
    }
    const next = [...base];
    next[idx] = newTagId;
    setConfig((c) => ({ ...c, pivotTagIds: next }));
  }
```

> Note: `createTagMutation`'s own `onSuccess` (resets the Manage-Tags form fields) still runs in addition to the per-call `onSuccess` above — harmless here.

- [ ] **Step 3: Pass the new props to `<ContactsKanban>` in `Contacts.tsx`**

Find the `<ContactsKanban ... />` render (~line 1766) and add the new props:

```tsx
        <ContactsKanban
          contacts={kanbanContacts}
          allTags={tags}
          pivotTagIds={config.pivotTagIds ?? null}
          showUntagged={!!config.showUntagged}
          onStageChange={handleStageChange}
          onStartPipeline={() => seedPipelineMutation.mutate()}
          seedingPipeline={seedPipelineMutation.isPending}
          editable
          onAddStep={handleAddStep}
          onRenameStep={handleRenameStep}
          onRecolorStep={handleRecolorStep}
          onSwapStep={handleSwapStep}
          onRemoveStepFromBoard={handleRemoveStepFromBoard}
          onDeleteStepTag={handleDeleteStepTag}
        />
```

(Keep the existing prop values for `contacts`/`allTags` exactly as they are in the file — only add the new lines.)

- [ ] **Step 4: Extend the props interface in `ContactsKanban.tsx`**

Add to `ContactsKanbanProps` (after `seedingPipeline?` ~line 35):

```tsx
  editable?: boolean;
  onAddStep?: (input: { name?: string; color?: string; tagId?: string }) => void;
  onRenameStep?: (tagId: string, name: string) => void;
  onRecolorStep?: (tagId: string, color: string) => void;
  onSwapStep?: (tagId: string, newTagId: string) => void;
  onRemoveStepFromBoard?: (tagId: string) => void;
  onDeleteStepTag?: (tagId: string) => void;
```

Add the icon + popover imports at the top of the file:

```tsx
import { Mail, Phone, GripVertical, Sparkles, Loader, MoreHorizontal, Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
```

(Replace the existing `lucide-react` import line with the one above; add the two component imports.)

- [ ] **Step 5: Add the `StepMenu` component in `ContactsKanban.tsx`**

Add above `KanbanColumnBox`:

```tsx
const STEP_COLORS = [
  "#6b7280", "#ef4444", "#f59e0b", "#10b981",
  "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899",
];

function StepMenu({
  tagId,
  name,
  color,
  swappableTags,
  onRename,
  onRecolor,
  onSwap,
  onRemoveFromBoard,
  onDeleteTag,
}: {
  tagId: string;
  name: string;
  color: string | null;
  swappableTags: ViewTag[];
  onRename: (tagId: string, name: string) => void;
  onRecolor: (tagId: string, color: string) => void;
  onSwap: (tagId: string, newTagId: string) => void;
  onRemoveFromBoard: (tagId: string) => void;
  onDeleteTag: (tagId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [renameValue, setRenameValue] = useState(name);

  function close() {
    setOpen(false);
    setConfirmRemove(false);
    setRenameValue(name);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setConfirmRemove(false);
          setRenameValue(name);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-6 w-6 items-center justify-center rounded-[8px] text-muted-foreground/70 hover:bg-background hover:text-foreground transition-colors"
          aria-label={`Edit ${name}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-2">
        {confirmRemove ? (
          <div className="space-y-1">
            <p className="px-2 py-1 text-xs text-muted-foreground">
              Remove "{name}" from the board, or delete the tag everywhere?
            </p>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-sm hover:bg-accent"
              onClick={() => {
                onRemoveFromBoard(tagId);
                close();
              }}
            >
              <X className="h-3.5 w-3.5" />
              Remove from board
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
              onClick={() => {
                onDeleteTag(tagId);
                close();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete tag everywhere
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-sm hover:bg-accent"
              onClick={() => setConfirmRemove(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <form
              className="flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                onRename(tagId, renameValue);
                close();
              }}
            >
              <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <Input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="h-8 flex-1"
                aria-label="Step name"
              />
              <button
                type="submit"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] hover:bg-accent"
                aria-label="Save name"
              >
                <Check className="h-4 w-4" />
              </button>
            </form>

            <div className="flex flex-wrap gap-1.5 px-1">
              {STEP_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="h-5 w-5 rounded-full border transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    borderColor: c === color ? "var(--foreground)" : c,
                  }}
                  aria-label={`Color ${c}`}
                  onClick={() => {
                    onRecolor(tagId, c);
                    close();
                  }}
                />
              ))}
            </div>

            {swappableTags.length > 0 && (
              <div className="border-t border-border/60 pt-1">
                <p className="px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  Swap to tag
                </p>
                <div className="max-h-32 overflow-y-auto">
                  {swappableTags.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-sm hover:bg-accent"
                      onClick={() => {
                        onSwap(tagId, t.id);
                        close();
                      }}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: t.color ?? "#94a3b8" }}
                      />
                      <span className="truncate">{t.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-[8px] border-t border-border/60 px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
              onClick={() => setConfirmRemove(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove step
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 6: Add the `AddStepColumn` component in `ContactsKanban.tsx`**

Add below `StepMenu`:

```tsx
function AddStepColumn({
  availableTags,
  onAdd,
}: {
  availableTags: ViewTag[];
  onAdd: (input: { name?: string; color?: string; tagId?: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(STEP_COLORS[4]);

  return (
    <div className="w-72 shrink-0">
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setName("");
            setColor(STEP_COLORS[4]);
          }
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-11 w-full items-center justify-center gap-2 rounded-[16px] border border-dashed border-border text-sm text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add step
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2 space-y-2">
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              onAdd({ name: name.trim(), color });
              setOpen(false);
              setName("");
            }}
          >
            <label
              className="h-8 w-8 shrink-0 cursor-pointer rounded-[8px] border"
              style={{ backgroundColor: color }}
              title="Pick a color"
            >
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-0 w-0 opacity-0"
                aria-label="Step color"
              />
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New step name"
              className="h-8 flex-1"
              aria-label="New step name"
            />
            <button
              type="submit"
              disabled={!name.trim()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] hover:bg-accent disabled:opacity-40"
              aria-label="Add step"
            >
              <Plus className="h-4 w-4" />
            </button>
          </form>

          {availableTags.length > 0 && (
            <div className="border-t border-border/60 pt-1">
              <p className="px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                Use existing tag
              </p>
              <div className="max-h-40 overflow-y-auto">
                {availableTags.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-sm hover:bg-accent"
                    onClick={() => {
                      onAdd({ tagId: t.id });
                      setOpen(false);
                    }}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: t.color ?? "#94a3b8" }}
                    />
                    <span className="truncate">{t.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
```

- [ ] **Step 7: Thread the menu through `KanbanColumnBox`**

Change `KanbanColumnBox` to accept an optional `menu` node and render it in the header next to the count. Update its signature and header:

```tsx
function KanbanColumnBox({
  id,
  name,
  color,
  count,
  menu,
  children,
}: {
  id: string;
  name: string;
  color: string | null;
  count: number;
  menu?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col w-72 shrink-0 rounded-[16px] p-3 transition-colors",
        isOver ? "bg-primary/10 ring-1 ring-primary/30" : "bg-muted/40",
      )}
    >
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color ?? "#94a3b8" }} />
          <p className="text-sm font-semibold truncate">{name}</p>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
          {menu}
        </div>
      </div>
      <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-0.5 pl-2">
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Render the menu + add-step column in the main component**

In `ContactsKanban`, destructure the new props in the function signature:

```tsx
export default function ContactsKanban({
  contacts,
  allTags,
  pivotTagIds,
  showUntagged,
  onStageChange,
  onStartPipeline,
  seedingPipeline,
  editable,
  onAddStep,
  onRenameStep,
  onRecolorStep,
  onSwapStep,
  onRemoveStepFromBoard,
  onDeleteStepTag,
}: ContactsKanbanProps) {
```

Compute swappable tags just after `columns` is built (~line 198):

```tsx
  const columnTagIds = useMemo(
    () => columns.filter((c) => c.id !== UNTAGGED_COLUMN_ID).map((c) => c.id),
    [columns],
  );
  const swappableTags = useMemo(() => {
    const used = new Set(columnTagIds);
    return allTags.filter((t) => !used.has(t.id));
  }, [allTags, columnTagIds]);
```

Add the import for `UNTAGGED_COLUMN_ID` to the existing `@/lib/contacts-view` import block at the top.

In the columns `.map`, pass a `menu` to real columns only, and render `AddStepColumn` after the loop:

```tsx
          {columns.map((col) => (
            <KanbanColumnBox
              key={col.id}
              id={col.id}
              name={col.name}
              color={col.color}
              count={col.contacts.length}
              menu={
                editable && col.id !== UNTAGGED_COLUMN_ID && onRenameStep ? (
                  <StepMenu
                    tagId={col.id}
                    name={col.name}
                    color={col.color}
                    swappableTags={swappableTags}
                    onRename={onRenameStep}
                    onRecolor={onRecolorStep!}
                    onSwap={onSwapStep!}
                    onRemoveFromBoard={onRemoveStepFromBoard!}
                    onDeleteTag={onDeleteStepTag!}
                  />
                ) : undefined
              }
            >
              {col.contacts.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">Drop here</p>
              )}
              {col.contacts.map((contact) => (
                <KanbanCard key={contact.id} contact={contact} columnId={col.id} pivotTagIds={pivotTagIds} />
              ))}
            </KanbanColumnBox>
          ))}
          {editable && onAddStep && <AddStepColumn availableTags={swappableTags} onAdd={onAddStep} />}
```

- [ ] **Step 9: Typecheck, lint, and build**

Run: `bun run lint && bun run build`
Expected: lint clean; build (cf-typegen → tsc -b → vite) succeeds with no type errors.

- [ ] **Step 10: Manual verification**

Use the `run` skill (or `bun run dev`) to open the app, go to a project's Contacts → Sales Pipeline (kanban). Verify:
- Each real column header has a `⋯` menu; "Untagged" does not.
- Rename a step → label updates on the board; reopening shows the new name. (It also marks the view dirty? No — rename is a tag mutation, not a config change.)
- Recolor a step → dot color changes.
- "+ Add step" → create a new step (appears as a column; board shows a dirty "Update view"); also try "Use existing tag".
- Remove step → confirm popover offers "Remove from board" (column goes away, view dirty) and "Delete tag everywhere" (tag gone from Manage Tags too).
- Swap to tag → column re-maps; view dirty.
- Click "Update view" → reload page → the board composition persists.
- Card drag between columns still works.

- [ ] **Step 11: Commit**

```bash
git add src/pages/Contacts.tsx src/pages/ContactsKanban.tsx
git commit -m "feat(contacts): add/rename/recolor/swap/remove kanban steps on the board"
```

---

### Task 4: Reorder steps by dragging columns

**Files:**
- Modify: `src/pages/Contacts.tsx` (add `handleReorderSteps` after the other step handlers; pass `onReorderSteps` to `<ContactsKanban>`; import `applyReorder`)
- Modify: `src/pages/ContactsKanban.tsx` (add `onReorderSteps` to props; make column headers draggable; branch `handleDragEnd` on drag type; tag the card draggable with `type: "card"`)

**Interfaces:**
- Consumes: `applyReorder` + `resolveColumnTagIds` from Task 2.
- Produces: `onReorderSteps(fromIndex: number, toIndex: number): void` — indices into the real (non-untagged) column order.

- [ ] **Step 1: Add `handleReorderSteps` in `Contacts.tsx`**

Add `applyReorder` to the `@/lib/contacts-view` import. Then add after `handleSwapStep` (from Task 3):

```tsx
  function handleReorderSteps(fromIndex: number, toIndex: number) {
    const base = resolveColumnTagIds(config.pivotTagIds ?? null, tags);
    setConfig((c) => ({ ...c, pivotTagIds: applyReorder(base, fromIndex, toIndex) }));
  }
```

Pass it to the board (add one line to the `<ContactsKanban>` props from Task 3):

```tsx
          onReorderSteps={handleReorderSteps}
```

- [ ] **Step 2: Add `onReorderSteps` to the props interface in `ContactsKanban.tsx`**

In `ContactsKanbanProps`, add:

```tsx
  onReorderSteps?: (fromIndex: number, toIndex: number) => void;
```

And destructure `onReorderSteps` in the component signature alongside the other handlers.

- [ ] **Step 3: Tag the card draggable with a type**

In `KanbanCard`'s `useDraggable`, add `type` to the data so the drag-end branch can tell cards from columns:

```tsx
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: contact.id,
    data: { type: "card", fromColumnId: columnId },
  });
```

- [ ] **Step 4: Make column headers draggable in `KanbanColumnBox`**

Add a `tagId?: string` prop (the real tag id; omitted for the Untagged column) and an `editable?: boolean` prop. Use `useDraggable` for the column, disabled unless editable + has a tagId, and render a grip handle that carries the listeners. Updated component:

```tsx
function KanbanColumnBox({
  id,
  tagId,
  name,
  color,
  count,
  editable,
  menu,
  children,
}: {
  id: string;
  tagId?: string;
  name: string;
  color: string | null;
  count: number;
  editable?: boolean;
  menu?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id });
  const draggable = useDraggable({
    id: `col:${tagId ?? id}`,
    data: { type: "column", tagId },
    disabled: !editable || !tagId,
  });
  return (
    <div
      ref={setDropRef}
      className={cn(
        "flex flex-col w-72 shrink-0 rounded-[16px] p-3 transition-colors",
        isOver ? "bg-primary/10 ring-1 ring-primary/30" : "bg-muted/40",
        draggable.isDragging && "opacity-50",
      )}
    >
      <div
        ref={draggable.setNodeRef}
        className="flex items-center justify-between mb-3 px-1"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {editable && tagId && (
            <span
              {...draggable.listeners}
              {...draggable.attributes}
              className="flex h-5 w-4 cursor-grab items-center justify-center text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
              aria-label={`Reorder ${name}`}
            >
              <GripVertical className="h-3.5 w-3.5" />
            </span>
          )}
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color ?? "#94a3b8" }} />
          <p className="text-sm font-semibold truncate">{name}</p>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
          {menu}
        </div>
      </div>
      <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-0.5 pl-2">
        {children}
      </div>
    </div>
  );
}
```

Pass `tagId` and `editable` from the columns `.map` (real columns get `tagId={col.id}`; the Untagged column gets `tagId={undefined}`):

```tsx
            <KanbanColumnBox
              key={col.id}
              id={col.id}
              tagId={col.id === UNTAGGED_COLUMN_ID ? undefined : col.id}
              name={col.name}
              color={col.color}
              count={col.contacts.length}
              editable={editable}
              menu={ /* unchanged from Task 3 */ }
            >
```

- [ ] **Step 5: Branch `handleDragEnd` on drag type**

Replace `handleDragEnd` in `ContactsKanban` with a version that handles column reorder first, then falls back to the existing card logic:

```tsx
  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const activeType = (active.data.current as { type?: string } | undefined)?.type;

    if (activeType === "column") {
      const fromTagId = (active.data.current as { tagId?: string } | undefined)?.tagId;
      const overId = String(over.id);
      const fromIndex = columnTagIds.indexOf(fromTagId ?? "");
      const toIndex = columnTagIds.indexOf(overId);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
      onReorderSteps?.(fromIndex, toIndex);
      return;
    }

    const contactId = String(active.id);
    const toColumnId = String(over.id);
    const fromColumnId = (active.data.current as { fromColumnId?: string } | undefined)?.fromColumnId;
    if (toColumnId === fromColumnId) return;
    onStageChange(contactId, toColumnId);
  }
```

(`columnTagIds` was added in Task 3, Step 8. The column droppable id equals the tag id for real columns, so `over.id` maps directly to a column index; dropping over the Untagged column or empty space yields `-1` and is ignored.)

- [ ] **Step 6: Typecheck, lint, and build**

Run: `bun run lint && bun run build`
Expected: lint clean; build succeeds.

- [ ] **Step 7: Manual verification**

With `bun run dev`, on the kanban board:
- Grab a column by its grip handle and drop it left/right of another column → order changes, "Update view" appears (dirty).
- Click "Update view", reload → new order persists.
- Card drag between columns still works and is unaffected by the grip.
- Dragging a column onto the Untagged column does nothing (no crash, no reorder).

- [ ] **Step 8: Commit**

```bash
git add src/pages/Contacts.tsx src/pages/ContactsKanban.tsx
git commit -m "feat(contacts): drag to reorder kanban steps"
```

---

## Self-Review

**Spec coverage:**
- Tag update (rename/recolor) backend → Task 1. ✓
- Pure helpers `resolveColumnTagIds`/`applyReorder` + tests → Task 2. ✓
- Add step (create new or pick existing) → Task 3 (`AddStepColumn`, `handleAddStep`). ✓
- Edit step: rename, recolor, swap → Task 3 (`StepMenu`, `handleRenameStep`/`handleRecolorStep`/`handleSwapStep`). ✓
- Remove step: ask each time (Remove from board vs Delete tag everywhere) → Task 3 (`StepMenu` confirm, `handleRemoveStepFromBoard`/`handleDeleteStepTag`). ✓
- Reorder by dragging columns → Task 4. ✓
- Persistence: draft + Update view (composition); immediate global (identity) → handlers use `setConfig` vs mutations; existing "Update view" button reused. ✓
- Materialize-on-first-edit → every structural handler calls `resolveColumnTagIds` first. ✓
- Untagged column stays synthetic/non-editable → `menu`/`editable`/`tagId` gated on `col.id !== UNTAGGED_COLUMN_ID`. ✓
- Filters → Kanban columns toggle list kept → untouched. ✓

**Placeholder scan:** No TBD/TODO; all code blocks are concrete. The one `/* unchanged from Task 3 */` marker in Task 4 Step 4 points to code fully written in Task 3 Step 8 (not a placeholder for un-designed work).

**Type consistency:** Handler signatures match between `Contacts.tsx` (producers) and `ContactsKanbanProps` (consumers): `onAddStep({name?,color?,tagId?})`, `onRenameStep(tagId,name)`, `onRecolorStep(tagId,color)`, `onSwapStep(tagId,newTagId)`, `onRemoveStepFromBoard(tagId)`, `onDeleteStepTag(tagId)`, `onReorderSteps(fromIndex,toIndex)`. `ContactService.updateTag(projectId,id,{name?,color?})` matches the route and the test calls. `resolveColumnTagIds(pivotTagIds, allTags)` and `applyReorder(ids, from, to)` match their call sites.

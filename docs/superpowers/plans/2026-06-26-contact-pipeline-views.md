# Contact Pipeline Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users view contacts as a drag-and-drop Kanban pipeline (columns = stage tags; dragging a card moves the contact between stages) or a sortable Table, with a one-click "Start a sales pipeline" seeder.

**Architecture:** Stages are tags; a view's stage set is its ordered `config.pivotTagIds` (no DB migration). A new `ContactService.setStage` removes the board's other stage tags and adds the target. Kanban gets @dnd-kit drag-and-drop with optimistic cache updates (the dev server hits remote D1, so writes are slow — UI must update instantly). A new `ContactsTable` renders the `list` view type as a true sortable table. Pure grouping/sorting logic lives in `src/lib/contacts-view.ts` for unit testing.

**Tech Stack:** Cloudflare Worker + Hono, Drizzle/D1, React + Vite, @tanstack/react-query, @dnd-kit (already installed), bun test.

## Global Constraints

- `verbatimModuleSyntax: true` — type-only imports MUST use `import type { ... }`.
- No D1 migration in this feature — it rides existing tables (`contact_views.config` already has `pivotTagIds`/`showUntagged`). Do NOT hand-write SQL; if schema ever changes use `bun run db:generate`.
- New endpoints go in the `worker/index.ts` monolith; every request-body Zod schema goes in `worker/validation.ts` (call `validate(schema, body)`); domain logic goes in `worker/services/contact-service.ts`.
- UI conventions (AGENTS.md): squircle radii (`rounded-[Npx]`), forest-green palette, icon+text buttons, no border separators, card-style rows. Match surrounding `Contacts.tsx`/`ContactsKanban.tsx` styling.
- Commands: tests `bun test`; lint `bun run lint`; typecheck+build `bun run build`.
- Worker tests use the in-memory DB helper `createTestDb()` from `tests/worker/mcp-test-db.ts`.

---

### Task 1: Pure view helpers (`src/lib/contacts-view.ts`)

**Files:**
- Create: `src/lib/contacts-view.ts`
- Test: `tests/contacts-view.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface ViewTag { id: string; name: string; color: string | null }`
  - `interface ViewContact { id: string; name: string; email: string | null; phone: string | null; createdAt: string; lastActivityAt?: string | null; tags: ViewTag[] }`
  - `interface KanbanColumn { id: string; name: string; color: string | null; contacts: ViewContact[] }`
  - `buildKanbanColumns(opts: { contacts: ViewContact[]; allTags: ViewTag[]; pivotTagIds: string[] | null; showUntagged: boolean }): KanbanColumn[]` — columns ordered by `pivotTagIds` order when set (else `allTags` order), with an `"__untagged__"` column appended when `showUntagged`.
  - `contactStageTagId(contact: ViewContact, pivotTagIds: string[] | null): string | null` — first id in `pivotTagIds` that the contact has, else null.
  - `type SortKey = "name" | "email" | "phone" | "stage" | "lastActivity" | "created"`
  - `compareContacts(a: ViewContact, b: ViewContact, key: SortKey, dir: "asc" | "desc", pivotTagIds: string[] | null, allTags: ViewTag[]): number`

- [ ] **Step 1: Write the failing test**

```ts
// tests/contacts-view.test.ts
import { describe, expect, test } from "bun:test";
import {
  buildKanbanColumns,
  contactStageTagId,
  compareContacts,
  type ViewContact,
  type ViewTag,
} from "../src/lib/contacts-view";

const tags: ViewTag[] = [
  { id: "lead", name: "Lead", color: "#6b7280" },
  { id: "prospect", name: "Prospect", color: "#3b82f6" },
  { id: "vip", name: "VIP", color: "#ec4899" },
];
const mk = (over: Partial<ViewContact>): ViewContact => ({
  id: "c", name: "C", email: null, phone: null, createdAt: "2026-01-01", tags: [], ...over,
});

describe("buildKanbanColumns", () => {
  test("orders columns by pivotTagIds and appends untagged", () => {
    const contacts = [
      mk({ id: "a", name: "A", tags: [{ ...tags[1] }] }),       // Prospect
      mk({ id: "b", name: "B", tags: [{ ...tags[0] }, { ...tags[2] }] }), // Lead + VIP
      mk({ id: "c", name: "C", tags: [] }),                     // none
    ];
    const cols = buildKanbanColumns({
      contacts,
      allTags: tags,
      pivotTagIds: ["prospect", "lead"],
      showUntagged: true,
    });
    expect(cols.map((c) => c.id)).toEqual(["prospect", "lead", "__untagged__"]);
    expect(cols[0].contacts.map((c) => c.id)).toEqual(["a"]);
    expect(cols[1].contacts.map((c) => c.id)).toEqual(["b"]);
    expect(cols[2].contacts.map((c) => c.id)).toEqual(["c"]);
  });

  test("falls back to all tags when no pivot, no untagged column", () => {
    const cols = buildKanbanColumns({ contacts: [], allTags: tags, pivotTagIds: null, showUntagged: false });
    expect(cols.map((c) => c.id)).toEqual(["lead", "prospect", "vip"]);
  });
});

describe("contactStageTagId", () => {
  test("returns first pivot tag the contact has", () => {
    const c = mk({ tags: [{ ...tags[2] }, { ...tags[1] }] });
    expect(contactStageTagId(c, ["lead", "prospect", "vip"])).toBe("prospect");
  });
  test("null when no pivot match", () => {
    expect(contactStageTagId(mk({ tags: [] }), ["lead"])).toBeNull();
  });
});

describe("compareContacts", () => {
  test("sorts by name asc/desc", () => {
    const a = mk({ id: "a", name: "Amanda" });
    const b = mk({ id: "b", name: "Carlos" });
    expect(compareContacts(a, b, "name", "asc", null, tags)).toBeLessThan(0);
    expect(compareContacts(a, b, "name", "desc", null, tags)).toBeGreaterThan(0);
  });
  test("sorts by stage using pivot order", () => {
    const a = mk({ id: "a", tags: [{ ...tags[1] }] }); // Prospect (index 1)
    const b = mk({ id: "b", tags: [{ ...tags[0] }] }); // Lead (index 0)
    expect(compareContacts(a, b, "stage", "asc", ["lead", "prospect"], tags)).toBeGreaterThan(0);
  });
  test("blank values sort last regardless of direction", () => {
    const withEmail = mk({ id: "a", email: "a@x.com" });
    const noEmail = mk({ id: "b", email: null });
    expect(compareContacts(withEmail, noEmail, "email", "asc", null, tags)).toBeLessThan(0);
    expect(compareContacts(withEmail, noEmail, "email", "desc", null, tags)).toBeLessThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/contacts-view.test.ts`
Expected: FAIL (module `../src/lib/contacts-view` not found).

- [ ] **Step 3: Write the implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/contacts-view.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/contacts-view.ts tests/contacts-view.test.ts
git commit -m "feat(contacts): pure kanban/table view helpers"
```

---

### Task 2: Backend `setStage` (`worker/services/contact-service.ts`)

**Files:**
- Modify: `worker/services/contact-service.ts` (add method after `removeTag`, ~line 342)
- Test: `tests/worker/contact-pipeline.test.ts`

**Interfaces:**
- Consumes: existing `this.addTag(contactId, tagId)`, `this.removeTag(contactId, tagId)`, `dbSchema.contactTags`, `eq`, `and`, `inArray` (already imported at top of file).
- Produces: `async setStage(contactId: string, tagId: string | null, groupTagIds: string[]): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
// tests/worker/contact-pipeline.test.ts
import { describe, expect, test } from "bun:test";
import * as dbSchema from "../../worker/db/schema";
import { ContactService } from "../../worker/services/contact-service";
import { createTestDb } from "./mcp-test-db";

async function seed() {
  const db = createTestDb();
  await db.insert(dbSchema.schema.users).values({ id: "u", name: "U", email: "u@x.com" });
  await db.insert(dbSchema.projects).values({ id: "p", userId: "u", name: "P", slug: "p" });
  await db.insert(dbSchema.tags).values([
    { id: "lead", projectId: "p", name: "Lead", color: "#6b7280" },
    { id: "prospect", projectId: "p", name: "Prospect", color: "#3b82f6" },
    { id: "vip", projectId: "p", name: "VIP", color: "#ec4899" },
  ]);
  await db.insert(dbSchema.contacts).values({ id: "c", projectId: "p", name: "C", email: "c@x.com" });
  return db;
}

describe("ContactService.setStage", () => {
  const group = ["lead", "prospect"];

  test("moves between stages, leaving non-stage tags intact", async () => {
    const db = await seed();
    const svc = new ContactService(db);
    await svc.addTag("c", "lead");
    await svc.addTag("c", "vip");

    await svc.setStage("c", "prospect", group);

    const ids = (await svc.getContactTags("c")).map((t) => t.id).sort();
    expect(ids).toEqual(["prospect", "vip"]);
  });

  test("null tagId removes all stage tags (move to Untagged)", async () => {
    const db = await seed();
    const svc = new ContactService(db);
    await svc.addTag("c", "lead");
    await svc.addTag("c", "vip");

    await svc.setStage("c", null, group);

    const ids = (await svc.getContactTags("c")).map((t) => t.id);
    expect(ids).toEqual(["vip"]);
  });

  test("setting the stage it already has is a no-op", async () => {
    const db = await seed();
    const svc = new ContactService(db);
    await svc.addTag("c", "prospect");

    await svc.setStage("c", "prospect", group);

    const ids = (await svc.getContactTags("c")).map((t) => t.id);
    expect(ids).toEqual(["prospect"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/worker/contact-pipeline.test.ts`
Expected: FAIL (`svc.setStage is not a function`).

- [ ] **Step 3: Add the method** (insert after `removeTag`, before `listWithTags`)

```ts
  // Move a contact into a single pipeline stage: drop the board's other stage
  // tags it currently has, then add the target. tagId === null = "Untagged".
  async setStage(
    contactId: string,
    tagId: string | null,
    groupTagIds: string[],
  ): Promise<void> {
    const toRemove = groupTagIds.filter((id) => id !== tagId);
    if (toRemove.length > 0) {
      const existing = await this.db
        .select({ tagId: dbSchema.contactTags.tagId })
        .from(dbSchema.contactTags)
        .where(
          and(
            eq(dbSchema.contactTags.contactId, contactId),
            inArray(dbSchema.contactTags.tagId, toRemove),
          ),
        );
      for (const row of existing) {
        await this.removeTag(contactId, row.tagId);
      }
    }
    if (tagId) {
      await this.addTag(contactId, tagId);
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/worker/contact-pipeline.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/services/contact-service.ts tests/worker/contact-pipeline.test.ts
git commit -m "feat(contacts): ContactService.setStage for pipeline moves"
```

---

### Task 3: Backend `seedPipeline` (`worker/services/contact-service.ts`)

**Files:**
- Modify: `worker/services/contact-service.ts` (add after `createView`, in the Saved Views section)
- Test: `tests/worker/contact-pipeline.test.ts` (append)

**Interfaces:**
- Consumes: existing `this.createTag(projectId, {name, color})` (returns the tag row), `this.createView(projectId, {name, type, config})` (returns the view row).
- Produces: `async seedPipeline(projectId: string): Promise<{ view: <view row> }>` plus an exported constant `export const PIPELINE_STAGES: ReadonlyArray<{ name: string; color: string }>`.

- [ ] **Step 1: Write the failing test** (append to `tests/worker/contact-pipeline.test.ts`)

```ts
import { eq } from "drizzle-orm";

describe("ContactService.seedPipeline", () => {
  test("creates 5 ordered stage tags + a kanban view", async () => {
    const db = await seed(); // reuse seed(); ignore its pre-made tags
    const svc = new ContactService(db);

    const { view } = await svc.seedPipeline("p");

    const tagRows = await db.select().from(dbSchema.tags).where(eq(dbSchema.tags.projectId, "p"));
    const names = tagRows.map((t) => t.name);
    for (const n of ["Lead", "Prospect", "First Contact", "Follow Up", "Met"]) {
      expect(names).toContain(n);
    }

    expect(view.type).toBe("kanban");
    expect(view.name).toBe("Sales Pipeline");
    const cfg = typeof view.config === "string" ? JSON.parse(view.config) : view.config;
    expect(cfg.showUntagged).toBe(true);
    expect(cfg.pivotTagIds).toHaveLength(5);
    // Order matches the canonical stage order.
    const idToName = new Map(tagRows.map((t) => [t.id, t.name]));
    expect(cfg.pivotTagIds.map((id: string) => idToName.get(id))).toEqual([
      "Lead", "Prospect", "First Contact", "Follow Up", "Met",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/worker/contact-pipeline.test.ts`
Expected: FAIL (`svc.seedPipeline is not a function`).

- [ ] **Step 3: Add the constant + method**

Near the top of `contact-service.ts` (after the `ContactListOptions` interface, ~line 22) add:

```ts
export const PIPELINE_STAGES: ReadonlyArray<{ name: string; color: string }> = [
  { name: "Lead", color: "#6b7280" },
  { name: "Prospect", color: "#3b82f6" },
  { name: "First Contact", color: "#6366f1" },
  { name: "Follow Up", color: "#f59e0b" },
  { name: "Met", color: "#10b981" },
];
```

In the Saved Views section (after `createView`) add:

```ts
  // One-click starter: create the canonical stage tags + a kanban view whose
  // columns are those tags in pipeline order.
  async seedPipeline(projectId: string) {
    const tagIds: string[] = [];
    for (const stage of PIPELINE_STAGES) {
      const tag = await this.createTag(projectId, { name: stage.name, color: stage.color });
      if (tag) tagIds.push(tag.id);
    }
    const view = await this.createView(projectId, {
      name: "Sales Pipeline",
      type: "kanban",
      config: { pivotTagIds: tagIds, showUntagged: true },
    });
    return { view };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/worker/contact-pipeline.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/services/contact-service.ts tests/worker/contact-pipeline.test.ts
git commit -m "feat(contacts): seedPipeline creates starter stages + kanban view"
```

---

### Task 4: Backend `lastActivityAt` enrichment (`worker/services/contact-service.ts`)

**Files:**
- Modify: `worker/services/contact-service.ts` (`listWithTags`, ~lines 344-367)
- Test: `tests/worker/contact-pipeline.test.ts` (append)

**Interfaces:**
- Consumes: existing `list()`, `dbSchema.contactActivity`, `inArray`, `sql` (add `sql` to the drizzle-orm import on line 1).
- Produces: each contact from `listWithTags` gains `lastActivityAt: string | null` (ISO string or null).

- [ ] **Step 1: Write the failing test** (append)

```ts
describe("ContactService.listWithTags lastActivityAt", () => {
  test("attaches the most recent activity timestamp", async () => {
    const db = await seed();
    const svc = new ContactService(db);
    await db.insert(dbSchema.contactActivity).values([
      { id: "a1", contactId: "c", type: "form_submitted", createdAt: new Date("2026-02-01T00:00:00Z") },
      { id: "a2", contactId: "c", type: "booked", createdAt: new Date("2026-03-15T00:00:00Z") },
    ]);

    const [contact] = await svc.listWithTags("p");
    expect(contact.lastActivityAt).not.toBeNull();
    expect(new Date(contact.lastActivityAt as string).toISOString()).toBe("2026-03-15T00:00:00.000Z");
  });

  test("null when the contact has no activity", async () => {
    const db = await seed();
    const svc = new ContactService(db);
    const [contact] = await svc.listWithTags("p");
    expect(contact.lastActivityAt).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/worker/contact-pipeline.test.ts`
Expected: FAIL (`lastActivityAt` is undefined, not null/ISO).

- [ ] **Step 3: Implement**

Update the import on line 1:

```ts
import { eq, and, desc, inArray, gte, sql } from "drizzle-orm";
```

Replace the body of `listWithTags` (keep the signature) with:

```ts
  async listWithTags(projectId: string, opts?: ContactListOptions) {
    const contacts = await this.list(projectId, opts);
    if (contacts.length === 0) return [];

    const contactIds = contacts.map((c) => c.id);

    const allContactTags = await this.db
      .select({
        contactId: dbSchema.contactTags.contactId,
        tagId: dbSchema.contactTags.tagId,
        tagName: dbSchema.tags.name,
        tagColor: dbSchema.tags.color,
      })
      .from(dbSchema.contactTags)
      .innerJoin(dbSchema.tags, eq(dbSchema.contactTags.tagId, dbSchema.tags.id))
      .where(inArray(dbSchema.contactTags.contactId, contactIds));

    // One batched query (not N+1): newest activity per contact.
    const lastActivityRows = await this.db
      .select({
        contactId: dbSchema.contactActivity.contactId,
        last: sql<number>`max(${dbSchema.contactActivity.createdAt})`,
      })
      .from(dbSchema.contactActivity)
      .where(inArray(dbSchema.contactActivity.contactId, contactIds))
      .groupBy(dbSchema.contactActivity.contactId);
    const lastById = new Map(lastActivityRows.map((r) => [r.contactId, r.last]));

    return contacts.map((contact) => {
      const last = lastById.get(contact.id);
      return {
        ...contact,
        tags: allContactTags
          .filter((t) => t.contactId === contact.id)
          .map((t) => ({ id: t.tagId, name: t.tagName, color: t.tagColor })),
        // createdAt is unixepoch seconds in D1; convert to ISO for the client.
        lastActivityAt: last != null ? new Date(Number(last) * 1000).toISOString() : null,
      };
    });
  }
```

Note: `contactActivity.createdAt` is `integer({ mode: "timestamp" })` (unix seconds). `max()` returns seconds → `* 1000` for `Date`. If the test's ISO assertion is off by the multiplier, confirm the column mode in `worker/db/schema.ts` and adjust (timestamp_ms would not multiply).

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/worker/contact-pipeline.test.ts`
Expected: PASS. If the ISO value mismatches, fix the seconds/ms conversion per the note, re-run.

- [ ] **Step 5: Commit**

```bash
git add worker/services/contact-service.ts tests/worker/contact-pipeline.test.ts
git commit -m "feat(contacts): include lastActivityAt in contacts list"
```

---

### Task 5: Routes + validation (`worker/validation.ts`, `worker/index.ts`)

**Files:**
- Modify: `worker/validation.ts` (add `setStageSchema` near the other contact schemas)
- Modify: `worker/index.ts` (add two routes near the existing contacts/tags routes, ~line 5148)

**Interfaces:**
- Consumes: `ContactService.setStage`, `ContactService.seedPipeline`, the `validate(schema, body)` helper, `c.get("db")`.
- Produces:
  - `POST /api/projects/:projectId/contacts/:contactId/stage` body `{ tagId: string | null, groupTagIds: string[] }` → `{ success: true }`
  - `POST /api/projects/:projectId/pipeline/seed` → `{ view }`

- [ ] **Step 1: Add the validation schema** (`worker/validation.ts`, next to `createTagSchema`)

```ts
export const setStageSchema = z.object({
  tagId: z.string().min(1).nullable(),
  groupTagIds: z.array(z.string()).max(50),
});
```

- [ ] **Step 2: Add the routes** (`worker/index.ts`, after the DELETE contact-tag route ~line 5241; import `setStageSchema` where the other validation schemas are imported)

```ts
app.post("/api/projects/:projectId/contacts/:contactId/stage", async (c) => {
  try {
    const contactId = c.req.param("contactId");
    const body = await c.req.json();
    const data = validate(setStageSchema, body);
    const db = c.get("db");
    const service = new ContactService(db);
    await service.setStage(contactId, data.tagId, data.groupTagIds);
    return c.json({ success: true });
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return c.json({ error: "Invalid request" }, 400);
    }
    console.error("Set stage error:", err);
    return c.json({ error: "Failed to set stage" }, 500);
  }
});

app.post("/api/projects/:projectId/pipeline/seed", async (c) => {
  try {
    const projectId = c.req.param("projectId");
    const db = c.get("db");
    const service = new ContactService(db);
    const { view } = await service.seedPipeline(projectId);
    return c.json({ view }, 201);
  } catch (err) {
    console.error("Seed pipeline error:", err);
    return c.json({ error: "Failed to seed pipeline" }, 500);
  }
});
```

- [ ] **Step 3: Typecheck**

Run: `bun run build`
Expected: build completes (tsc passes). If `setStageSchema` import is missing, add it to the validation import block in `index.ts`.

- [ ] **Step 4: Lint**

Run: `bun run lint`
Expected: no new errors in `worker/index.ts` or `worker/validation.ts`.

- [ ] **Step 5: Commit**

```bash
git add worker/validation.ts worker/index.ts
git commit -m "feat(contacts): stage + pipeline-seed endpoints"
```

---

### Task 6: Kanban drag-and-drop (`src/pages/ContactsKanban.tsx`)

**Files:**
- Modify: `src/pages/ContactsKanban.tsx` (rewrite to use `buildKanbanColumns`, add DnD + callbacks)

**Interfaces:**
- Consumes: `buildKanbanColumns`, `UNTAGGED_COLUMN_ID`, `type ViewContact`, `type ViewTag` from `@/lib/contacts-view`; `@dnd-kit/core`.
- Produces: `ContactsKanban` now accepts two new props:
  - `onStageChange: (contactId: string, toColumnId: string) => void` — `toColumnId` is a tag id or `UNTAGGED_COLUMN_ID`.
  - `onStartPipeline?: () => void` — shown in the empty state when no columns exist.
  - `seedingPipeline?: boolean` — disables the empty-state button while seeding.

- [ ] **Step 1: Replace the file** with the DnD version

```tsx
import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Mail, Phone, GripVertical, Sparkles, Loader } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  closestCorners,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import CopyContactButton from "@/components/CopyContactButton";
import {
  buildKanbanColumns,
  UNTAGGED_COLUMN_ID,
  type ViewContact,
  type ViewTag,
} from "@/lib/contacts-view";

interface ContactsKanbanProps {
  contacts: ViewContact[];
  allTags: ViewTag[];
  pivotTagIds: string[] | null;
  showUntagged: boolean;
  onStageChange: (contactId: string, toColumnId: string) => void;
  onStartPipeline?: () => void;
  seedingPipeline?: boolean;
}

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360}, 45%, 45%)`;
}
function getInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

function KanbanCard({ contact, columnId }: { contact: ViewContact; columnId: string }) {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: contact.id,
    data: { fromColumnId: columnId },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group/contact relative bg-card rounded-[12px] border border-border/60 p-3 transition-all",
        isDragging ? "opacity-40" : "hover:border-border hover:shadow-xs",
      )}
    >
      {/* Floating drag handle, revealed on hover; absolute so it never shifts the card. */}
      <span
        className="absolute left-1 top-1/2 -translate-y-1/2 -translate-x-full flex h-6 w-5 cursor-grab items-center justify-center text-muted-foreground/0 transition-colors group-hover/contact:text-muted-foreground/60 active:cursor-grabbing"
        aria-label="Drag to move stage"
        {...listeners}
        {...attributes}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </span>
      <button
        type="button"
        onClick={() => navigate(`/app/projects/${projectId}/contacts/${contact.id}`)}
        className="flex w-full items-start gap-2.5 text-left"
      >
        <div
          className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
          style={{ backgroundColor: getAvatarColor(contact.name) }}
        >
          {getInitial(contact.name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{contact.name}</p>
          {contact.email && (
            <div className="flex items-center gap-1 mt-0.5 min-w-0">
              <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                <Mail className="h-3 w-3 shrink-0" />
                {contact.email}
              </p>
              <CopyContactButton name={contact.name} email={contact.email} />
            </div>
          )}
          {contact.phone && (
            <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
              <Phone className="h-3 w-3 shrink-0" />
              {contact.phone}
            </p>
          )}
          {contact.tags.filter((t) => t.id !== columnId).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {contact.tags
                .filter((t) => t.id !== columnId)
                .slice(0, 3)
                .map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: `${tag.color ?? "#6366f1"}15`,
                      color: tag.color ?? "#6366f1",
                    }}
                  >
                    {tag.name}
                  </span>
                ))}
            </div>
          )}
        </div>
      </button>
    </div>
  );
}

function KanbanColumnBox({
  id,
  name,
  color,
  count,
  children,
}: {
  id: string;
  name: string;
  color: string | null;
  count: number;
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
        <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
      </div>
      <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-0.5 pl-2">
        {children}
      </div>
    </div>
  );
}

export default function ContactsKanban({
  contacts,
  allTags,
  pivotTagIds,
  showUntagged,
  onStageChange,
  onStartPipeline,
  seedingPipeline,
}: ContactsKanbanProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const columns = useMemo(
    () => buildKanbanColumns({ contacts, allTags, pivotTagIds, showUntagged }),
    [contacts, allTags, pivotTagIds, showUntagged],
  );

  if (columns.length === 0) {
    return (
      <Card className="p-12 text-center">
        <p className="text-sm font-medium mb-1">No pipeline yet</p>
        <p className="text-sm text-muted-foreground mb-4">
          Start a sales pipeline to get Lead, Prospect, First Contact, Follow Up,
          and Met stages you can drag contacts between.
        </p>
        {onStartPipeline && (
          <Button size="sm" onClick={onStartPipeline} disabled={seedingPipeline}>
            {seedingPipeline ? <Loader className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Start a sales pipeline
          </Button>
        )}
      </Card>
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const contactId = String(active.id);
    const toColumnId = String(over.id);
    const fromColumnId = (active.data.current as { fromColumnId?: string } | undefined)?.fromColumnId;
    if (toColumnId === fromColumnId) return;
    onStageChange(contactId, toColumnId);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="overflow-x-auto -mx-6 px-6 pb-2">
        <div className="flex gap-4 min-w-max">
          {columns.map((col) => (
            <KanbanColumnBox key={col.id} id={col.id} name={col.name} color={col.color} count={col.contacts.length}>
              {col.contacts.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">Drop here</p>
              )}
              {col.contacts.map((contact) => (
                <KanbanCard key={contact.id} contact={contact} columnId={col.id} />
              ))}
            </KanbanColumnBox>
          ))}
        </div>
      </div>
    </DndContext>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run build`
Expected: build passes. (It will still pass even though `Contacts.tsx` passes the old props — the new required props `onStageChange` will cause a TS error in `Contacts.tsx`; that is fixed in Task 8. If you are running tasks strictly in order and the build fails ONLY on `Contacts.tsx` missing `onStageChange`, that is expected — proceed; Task 8 resolves it. To keep this task independently green, temporarily mark `onStageChange` optional is NOT allowed — instead complete Task 8 before the final build gate.)

- [ ] **Step 3: Commit**

```bash
git add src/pages/ContactsKanban.tsx
git commit -m "feat(contacts): drag-and-drop kanban with stage-change + seed empty state"
```

---

### Task 7: Sortable table (`src/pages/ContactsTable.tsx`)

**Files:**
- Create: `src/pages/ContactsTable.tsx`

**Interfaces:**
- Consumes: `compareContacts`, `contactStageTagId`, `type SortKey`, `type ViewContact`, `type ViewTag` from `@/lib/contacts-view`.
- Produces: default export `ContactsTable` with props:
  - `contacts: ViewContact[]`
  - `allTags: ViewTag[]`
  - `pivotTagIds: string[] | null`
  - `onSelect: (contactId: string) => void`
  - `onDelete: (contact: ViewContact) => void`

- [ ] **Step 1: Create the component**

```tsx
import { useMemo, useState } from "react";
import { ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  compareContacts,
  contactStageTagId,
  type SortKey,
  type ViewContact,
  type ViewTag,
} from "@/lib/contacts-view";

interface ContactsTableProps {
  contacts: ViewContact[];
  allTags: ViewTag[];
  pivotTagIds: string[] | null;
  onSelect: (contactId: string) => void;
  onDelete: (contact: ViewContact) => void;
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default function ContactsTable({
  contacts,
  allTags,
  pivotTagIds,
  onSelect,
  onDelete,
}: ContactsTableProps) {
  const hasStage = !!pivotTagIds && pivotTagIds.length > 0;
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const tagById = useMemo(() => new Map(allTags.map((t) => [t.id, t])), [allTags]);

  const sorted = useMemo(
    () => [...contacts].sort((a, b) => compareContacts(a, b, sortKey, dir, pivotTagIds, allTags)),
    [contacts, sortKey, dir, pivotTagIds, allTags],
  );

  function toggleSort(key: SortKey) {
    if (key === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setDir("asc");
    }
  }

  const columns: Array<{ key: SortKey; label: string; className?: string }> = [
    { key: "name", label: "Name" },
    { key: "email", label: "Email", className: "hidden md:table-cell" },
    { key: "phone", label: "Phone", className: "hidden lg:table-cell" },
    { key: hasStage ? "stage" : "name", label: hasStage ? "Stage" : "Tags" },
    { key: "lastActivity", label: "Last activity", className: "hidden sm:table-cell" },
  ];

  function Header({ col }: { col: (typeof columns)[number] }) {
    const sortable = !(col.label === "Tags");
    const active = sortable && sortKey === col.key;
    return (
      <th
        className={cn(
          "px-3 py-2 text-left text-xs font-medium text-muted-foreground select-none",
          sortable && "cursor-pointer hover:text-foreground",
          col.className,
        )}
        onClick={sortable ? () => toggleSort(col.key) : undefined}
      >
        <span className="inline-flex items-center gap-1">
          {col.label}
          {active && (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
        </span>
      </th>
    );
  }

  return (
    <div className="overflow-x-auto px-2 pb-2">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {columns.map((col) => (
              <Header key={col.label} col={col} />
            ))}
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((contact) => {
            const stageId = contactStageTagId(contact, pivotTagIds);
            const stageTag = stageId ? tagById.get(stageId) : null;
            return (
              <tr
                key={contact.id}
                className="group/row cursor-pointer border-t border-border/50 hover:bg-muted/40"
                onClick={() => onSelect(contact.id)}
              >
                <td className="px-3 py-2.5 text-sm font-medium">{contact.name}</td>
                <td className="px-3 py-2.5 text-sm text-muted-foreground hidden md:table-cell">
                  {contact.email ?? "—"}
                </td>
                <td className="px-3 py-2.5 text-sm text-muted-foreground hidden lg:table-cell">
                  {contact.phone ?? "—"}
                </td>
                <td className="px-3 py-2.5">
                  {hasStage ? (
                    stageTag ? (
                      <span
                        className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: `${stageTag.color ?? "#6366f1"}15`,
                          color: stageTag.color ?? "#6366f1",
                        }}
                      >
                        {stageTag.name}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {contact.tags.slice(0, 3).map((t) => (
                        <span
                          key={t.id}
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                          style={{ backgroundColor: `${t.color ?? "#6366f1"}15`, color: t.color ?? "#6366f1" }}
                        >
                          {t.name}
                        </span>
                      ))}
                      {contact.tags.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5 text-sm text-muted-foreground hidden sm:table-cell">
                  {formatRelative(contact.lastActivityAt)}
                </td>
                <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive opacity-0 group-hover/row:opacity-100 hover:bg-destructive/10"
                    onClick={() => onDelete(contact)}
                    aria-label={`Delete ${contact.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run build`
Expected: `ContactsTable.tsx` compiles (it is not yet imported, so no consumer errors from this file).

- [ ] **Step 3: Commit**

```bash
git add src/pages/ContactsTable.tsx
git commit -m "feat(contacts): sortable table view"
```

---

### Task 8: Wire into `Contacts.tsx`

**Files:**
- Modify: `src/pages/Contacts.tsx`

**Interfaces:**
- Consumes: `ContactsTable` (default import), the new `ContactsKanban` props (`onStageChange`, `onStartPipeline`, `seedingPipeline`), `UNTAGGED_COLUMN_ID` from `@/lib/contacts-view`, `queryClient`, the existing `Contact`/`Tag` types.
- Produces: a working Table + Kanban experience.

- [ ] **Step 1: Add `lastActivityAt` to the SPA Contact type and import the table**

In `src/pages/Contacts.tsx`, add to the `Contact` interface: `lastActivityAt?: string | null;`. Add imports near the other page imports:

```ts
import ContactsTable from "./ContactsTable";
import { UNTAGGED_COLUMN_ID } from "@/lib/contacts-view";
```

- [ ] **Step 2: Add the seed-pipeline mutation** (next to the other mutations, ~line 818)

```ts
const seedPipelineMutation = useMutation({
  mutationFn: async () => {
    const res = await fetch(`/api/projects/${projectId}/pipeline/seed`, { method: "POST" });
    if (!res.ok) throw new Error("Failed to start pipeline");
    const data = (await res.json()) as { view: SavedView };
    return data.view;
  },
  onSuccess: (view) => {
    queryClient.invalidateQueries({ queryKey: ["projects", projectId, "contact-views"] });
    queryClient.invalidateQueries({ queryKey: ["projects", projectId, "tags"] });
    // Load the new pipeline view immediately.
    setActiveViewId(view.id);
    setConfig(view.config ?? {});
    setSearchInput("");
    setViewType("kanban");
  },
});
```

- [ ] **Step 3: Add the stage mutation with optimistic move** (next to the other mutations)

```ts
const stageMutation = useMutation({
  mutationFn: async (vars: {
    contactId: string;
    tagId: string | null;
    groupTagIds: string[];
    optimisticTag: { id: string; name: string; color: string | null } | null;
  }) => {
    const res = await fetch(
      `/api/projects/${projectId}/contacts/${vars.contactId}/stage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagId: vars.tagId, groupTagIds: vars.groupTagIds }),
      },
    );
    if (!res.ok) throw new Error("Failed to move stage");
    return res.json();
  },
  onMutate: async (vars) => {
    await queryClient.cancelQueries({ queryKey: ["projects", projectId, "contacts"] });
    const previous = queryClient.getQueriesData<Contact[]>({
      queryKey: ["projects", projectId, "contacts"],
    });
    const groupSet = new Set(vars.groupTagIds);
    queryClient.setQueriesData<Contact[]>(
      { queryKey: ["projects", projectId, "contacts"] },
      (old) =>
        Array.isArray(old)
          ? old.map((ct) => {
              if (ct.id !== vars.contactId) return ct;
              const kept = ct.tags.filter((t) => !groupSet.has(t.id));
              return {
                ...ct,
                tags: vars.optimisticTag ? [...kept, vars.optimisticTag] : kept,
              };
            })
          : old,
    );
    return { previous };
  },
  onError: (_e, _vars, context) => {
    context?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data));
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ["projects", projectId, "contacts"] });
  },
});
```

- [ ] **Step 4: Add the drag handler** (a function in the component body)

```ts
function handleStageChange(contactId: string, toColumnId: string) {
  const groupTagIds = config.pivotTagIds ?? [];
  const isUntagged = toColumnId === UNTAGGED_COLUMN_ID;
  const tagId = isUntagged ? null : toColumnId;
  const tag = tagId ? tags.find((t) => t.id === tagId) : null;
  stageMutation.mutate({
    contactId,
    tagId,
    groupTagIds,
    optimisticTag: tag ? { id: tag.id, name: tag.name, color: tag.color } : null,
  });
}
```

- [ ] **Step 5: Render `ContactsTable` for the list view + new Kanban props**

Replace the body block (`{viewType === "list" ? ( ... renderTable() ... ) : ...kanban...}`, ~lines 1751-1774) with:

```tsx
{viewType === "list" ? (
  <Card>
    {loadingContacts && renderSkeletonRows()}
    {errorContacts && !loadingContacts && renderErrorState()}
    {!loadingContacts && !errorContacts && contacts.length === 0 && renderEmptyState()}
    {!loadingContacts && !errorContacts && contacts.length > 0 && (
      <ContactsTable
        contacts={contacts}
        allTags={allTagsForKanban}
        pivotTagIds={config.pivotTagIds ?? null}
        onSelect={(id) => navigateToContact(id)}
        onDelete={(ct) => openDeleteDialog(ct as unknown as Contact)}
      />
    )}
  </Card>
) : loadingContacts ? (
  <Card className="p-12">
    <div className="flex justify-center">
      <Loader className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  </Card>
) : errorContacts ? (
  <Card>{renderErrorState()}</Card>
) : (
  <ContactsKanban
    contacts={contacts}
    allTags={allTagsForKanban}
    pivotTagIds={config.pivotTagIds ?? null}
    showUntagged={!!config.showUntagged}
    onStageChange={handleStageChange}
    onStartPipeline={() => seedPipelineMutation.mutate()}
    seedingPipeline={seedPipelineMutation.isPending}
  />
)}
```

Note: the Kanban now owns its own empty state (the seed button), so the `contacts.length === 0` kanban branch is intentionally removed — an empty pipeline still shows columns to drop into.

- [ ] **Step 6: Relabel the List tab to "Table"** (~line 1737)

```tsx
<TabsTrigger value="list" className="h-7 px-2.5">
  <ListIcon className="h-3.5 w-3.5" />
  Table
</TabsTrigger>
```

- [ ] **Step 7: Typecheck + lint**

Run: `bun run build` then `bun run lint`
Expected: build passes; no new lint errors in `Contacts.tsx`. Common fixes: the old `renderTable` helper is now unused — delete it; ensure `openDeleteDialog`/`navigateToContact` exist (they do).

- [ ] **Step 8: Commit**

```bash
git add src/pages/Contacts.tsx
git commit -m "feat(contacts): wire table + kanban pipeline (optimistic stage moves, seed)"
```

---

### Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Tests**

Run: `bun test`
Expected: all pass (includes `tests/contacts-view.test.ts` and `tests/worker/contact-pipeline.test.ts`).

- [ ] **Step 2: Lint + build**

Run: `bun run lint && bun run build`
Expected: no new errors in touched files; build succeeds.

- [ ] **Step 3: Visual check (dev server + headless Chrome)**

With `bun run dev` running and logged in, on the Contacts page:
1. Kanban view with no pipeline → click "Start a sales pipeline" → 5 columns (Lead → Met) + Untagged appear.
2. Drag a contact card from one column to another → it moves columns **instantly** (optimistic), other tags preserved.
3. Switch to Table → the moved contact shows the new Stage; click the Stage and Last-activity headers to sort.

- [ ] **Step 4: Commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "fix(contacts): verification fixes for pipeline views"
```

---

## Self-Review Notes

- **Spec coverage:** drag-to-move (Task 6 + 8 stage mutation + Task 2 setStage), exclusive stage semantics (Task 2), on-demand seed only (Task 3 + 5 + 8 empty-state button; no onboarding auto-seed), true sortable table (Task 1 + 7), Last-activity column (Task 4), column order via pivotTagIds (Task 1 `buildKanbanColumns`), optimistic move for remote-D1 latency (Task 8). All covered.
- **Type consistency:** `ViewContact`/`ViewTag` shared across Tasks 1/6/7; `setStage(contactId, tagId|null, groupTagIds)` identical in Tasks 2/5/8; `onStageChange(contactId, toColumnId)` identical Tasks 6/8; `seedPipeline` returns `{ view }` in Tasks 3/5/8.
- **Ordering caveat:** Task 6 makes `onStageChange` a required prop, so a strict per-task build is only fully green after Task 8. Run the build gate at Task 9. (Acceptable: these two tasks are one reviewer-coherent unit but split for size.)

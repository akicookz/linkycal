# Compact Kanban Contact Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace oversized Contacts Kanban cards with compact three-line cards that show stage age and a color-coded dated Next Action.

**Architecture:** Reuse the operational Next Action facts already loaded by `ContactService`, expose them on the decorated contacts response, and carry the same shape through the frontend view types. Keep the visual change inside `ContactsKanban`, using shared contact-time helpers for compact relative text and the same urgency thresholds as the detail view.

**Tech Stack:** Bun, React 19, TypeScript, Tailwind CSS v4, TanStack Query, Drizzle ORM, Bun Test, Testing Library.

## Global Constraints

- Apply the visual change only to contact cards in the Kanban view.
- Keep the card as the existing drag target and contact-detail navigation target.
- Use a 24px avatar, name, email, then a compact metadata line.
- Remove phone numbers, mail/clock icons, copy controls, and non-stage tag chips from Kanban cards.
- Render a centered dot only when both stage age and a dated Next Action are present.
- When there is no dated Next Action, render only stage age; do not render an empty-state label.
- Deadline colors are destructive red when overdue or due within one hour, amber when due within 24 hours, and primary green when due later.
- Use tabular numerals for dynamic stage and deadline text.
- Do not add a database query, endpoint, or dependency.
- Use temporary tests for implementation verification and remove them before completion.
- Center the empty contact-detail Next Action title and Add button in one compact header row without changing populated, editing, or error spacing.
- Preserve unrelated uncommitted workspace changes; do not stage or commit implementation files that already contain them.

---

## File Structure

- Modify `worker/services/contact-service.ts`: include the already-computed `nextAction` operational fact in decorated contact list results.
- Modify `src/lib/contacts-view.ts`: add the shared frontend `nextAction` shape to `ViewContact`.
- Modify `src/pages/Contacts.tsx`: add the same `nextAction` shape to the page-local API response type.
- Modify `src/lib/contact-time.ts`: add compact deadline formatting and export the shared deadline color helper.
- Modify `src/pages/ContactDetail.tsx`: consume the shared deadline color helper instead of its local duplicate.
- Modify `src/pages/ContactsKanban.tsx`: render the compact card and dated Next Action metadata.
- Create and later delete `tests/tmp-contact-list-next-action.test.ts`: red/green verification for list response data.
- Create and later delete `tests/tmp-contacts-kanban-card.test.tsx`: red/green verification for compact card content.
- Create and later delete `tests/tmp-next-action-empty-card.test.tsx`: red/green verification for the centered empty Next Action header.

### Task 1: Expose Next Action facts on contact list results

**Files:**
- Create temporarily: `tests/tmp-contact-list-next-action.test.ts`
- Modify: `worker/services/contact-service.ts:735-747`
- Modify: `src/lib/contacts-view.ts:7-17`
- Modify: `src/pages/Contacts.tsx:74-92`

**Interfaces:**
- Consumes: `ContactOperationalFacts.nextAction: { text: string; deadline: string | null } | null` from `ContactService.getOperationalFacts`.
- Produces: `ViewContact.nextAction: { text: string; deadline: string | null } | null` for `ContactsKanban`.

- [ ] **Step 1: Write the failing service test**

Create `tests/tmp-contact-list-next-action.test.ts`:

```ts
import { expect, test } from "bun:test";

import * as dbSchema from "../worker/db/schema";
import { ContactService } from "../worker/services/contact-service";
import { createTestDb } from "./worker/mcp-test-db";

test("decorates contact list results with the current Next Action", async () => {
  const db = createTestDb();
  await db.insert(dbSchema.schema.users).values({
    id: "u",
    name: "User",
    email: "user@example.com",
  });
  await db.insert(dbSchema.projects).values({
    id: "p",
    userId: "u",
    name: "Project",
    slug: "project",
  });
  await db.insert(dbSchema.contacts).values({
    id: "c",
    projectId: "p",
    name: "Alisa Svilicic",
    email: "svilicic@lucidya.com",
    nextActionText: "Send proposal",
    nextActionDeadline: new Date("2026-07-22T08:00:00.000Z"),
  });

  const [contact] = await new ContactService(db).listWithTags("p");

  expect(contact?.nextAction).toEqual({
    text: "Send proposal",
    deadline: "2026-07-22T08:00:00.000Z",
  });
});
```

- [ ] **Step 2: Run the test and verify the intended failure**

Run: `bun test tests/tmp-contact-list-next-action.test.ts`

Expected: FAIL because the decorated list result does not yet include `nextAction`.

- [ ] **Step 3: Return the existing operational fact from the service**

In `worker/services/contact-service.ts`, add `nextAction` beside `enteredAtByTagId` in `decorateWithTags`:

```ts
return contacts.map((contact) => {
  const last = lastById.get(contact.id);
  return {
    ...contact,
    tags: allContactTags
      .filter((tag) => tag.contactId === contact.id)
      .map((tag) => ({
        id: tag.tagId,
        name: tag.tagName,
        color: tag.tagColor,
      })),
    lastActivityAt:
      last != null ? new Date(Number(last) * 1000).toISOString() : null,
    enteredAtByTagId:
      operationalFacts[contact.id]?.enteredAtByTagId ?? {},
    nextAction: operationalFacts[contact.id]?.nextAction ?? null,
  };
});
```

- [ ] **Step 4: Carry the response shape through frontend types**

Add this property to `ViewContact` in `src/lib/contacts-view.ts` and `Contact` in `src/pages/Contacts.tsx`:

```ts
nextAction: {
  text: string;
  deadline: string | null;
} | null;
```

- [ ] **Step 5: Run the focused service test**

Run: `bun test tests/tmp-contact-list-next-action.test.ts`

Expected: 1 pass, 0 fail.

### Task 2: Add compact deadline presentation helpers

**Files:**
- Modify temporarily: `tests/tmp-contacts-kanban-card.test.tsx`
- Modify: `src/lib/contact-time.ts`
- Modify: `src/pages/ContactDetail.tsx:140-150, 540-550`

**Interfaces:**
- Produces: `formatNextActionRelativeCompact(deadline: string, now: Date): string | null`.
- Produces: `nextActionTimingClass(deadline: string, now: Date): string`.
- Consumed by: `ContactDetail` and `ContactsKanban`.

- [ ] **Step 1: Write failing compact-format tests**

Create `tests/tmp-contacts-kanban-card.test.tsx` with the helper assertions first:

```tsx
/// <reference lib="dom" />

import { expect, test } from "bun:test";

import {
  formatNextActionRelativeCompact,
  nextActionTimingClass,
} from "../src/lib/contact-time";

const now = new Date("2026-07-21T06:00:00.000Z");

test("formats compact Next Action deadlines", () => {
  expect(
    formatNextActionRelativeCompact("2026-07-21T08:30:00.000Z", now),
  ).toBe("Due in 2h");
  expect(
    formatNextActionRelativeCompact("2026-07-21T05:30:00.000Z", now),
  ).toBe("Overdue by 30m");
});

test("colors deadlines by urgency", () => {
  expect(nextActionTimingClass("2026-07-21T06:30:00.000Z", now)).toBe(
    "text-destructive",
  );
  expect(nextActionTimingClass("2026-07-21T12:00:00.000Z", now)).toBe(
    "text-amber-700",
  );
  expect(nextActionTimingClass("2026-07-23T06:00:00.000Z", now)).toBe(
    "text-primary",
  );
});
```

- [ ] **Step 2: Run the helper tests and verify the intended failure**

Run: `bun test tests/tmp-contacts-kanban-card.test.tsx`

Expected: FAIL because the two exports do not exist.

- [ ] **Step 3: Add the compact formatter and shared urgency class**

Add to `src/lib/contact-time.ts` after `formatNextActionRelative`:

```ts
export function formatNextActionRelativeCompact(
  deadline: string,
  now: Date,
): string | null {
  const deadlineMs = parseTimestamp(deadline);
  if (deadlineMs === null) return null;
  const diffMs = deadlineMs - now.getTime();
  const absoluteMs = Math.abs(diffMs);
  if (absoluteMs < 60_000) return "Due now";

  let distance: string;
  if (absoluteMs < HOUR_MS) {
    distance = `${Math.floor(absoluteMs / 60_000)}m`;
  } else if (absoluteMs < DAY_MS) {
    distance = `${Math.floor(absoluteMs / HOUR_MS)}h`;
  } else {
    distance = `${Math.floor(absoluteMs / DAY_MS)}d`;
  }

  return diffMs < 0 ? `Overdue by ${distance}` : `Due in ${distance}`;
}

export function nextActionTimingClass(
  deadline: string,
  now: Date,
): string {
  const deadlineMs = parseTimestamp(deadline);
  if (deadlineMs === null) return "text-muted-foreground";
  const diffMs = deadlineMs - now.getTime();
  if (diffMs <= HOUR_MS) return "text-destructive";
  if (diffMs < DAY_MS) return "text-amber-700";
  return "text-primary";
}
```

- [ ] **Step 4: Replace the local detail-page helper**

In `src/pages/ContactDetail.tsx`, import `nextActionTimingClass` from `@/lib/contact-time` and delete the local function with the same name. Keep its existing call site unchanged.

- [ ] **Step 5: Run the temporary helper tests**

Run: `bun test tests/tmp-contacts-kanban-card.test.tsx`

Expected: 2 pass, 0 fail.

### Task 3: Render the compact Kanban card

**Files:**
- Modify temporarily: `tests/tmp-contacts-kanban-card.test.tsx`
- Modify: `src/pages/ContactsKanban.tsx:1-175, 640-680`

**Interfaces:**
- Consumes: `ViewContact.nextAction` from Task 1.
- Consumes: `formatNextActionRelativeCompact` and `nextActionTimingClass` from Task 2.
- Preserves: `KanbanCard` drag listeners, navigation click, hover state, and drag overlay.

- [ ] **Step 1: Add the failing compact-card component test**

Append to `tests/tmp-contacts-kanban-card.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import ContactsKanban from "../src/pages/ContactsKanban";

test("renders compact stage and dated Next Action metadata", () => {
  const deadline = new Date(Date.now() + 2.5 * 3_600_000).toISOString();
  render(
    <MemoryRouter initialEntries={["/app/projects/p/contacts"]}>
      <ContactsKanban
        contacts={[
          {
            id: "c",
            name: "Alisa Svilicic",
            email: "svilicic@lucidya.com",
            phone: "+1 555 0100",
            createdAt: new Date(Date.now() - 86_400_000).toISOString(),
            enteredAtByTagId: {
              lead: new Date(Date.now() - 4 * 3_600_000).toISOString(),
            },
            nextAction: { text: "Send proposal", deadline },
            tags: [{ id: "lead", name: "Lead", color: "#6b7280" }],
          },
          {
            id: "c-undated",
            name: "Bishnu Gaire",
            email: "bishnu.gaire@gendo.ai",
            phone: null,
            createdAt: new Date(Date.now() - 86_400_000).toISOString(),
            enteredAtByTagId: {
              lead: new Date(Date.now() - 4 * 3_600_000).toISOString(),
            },
            nextAction: { text: "Follow up", deadline: null },
            tags: [{ id: "lead", name: "Lead", color: "#6b7280" }],
          },
        ]}
        allTags={[{ id: "lead", name: "Lead", color: "#6b7280" }]}
        pivotTagIds={["lead"]}
        showUntagged={false}
        onStageChange={() => undefined}
      />
    </MemoryRouter>,
  );

  expect(screen.getAllByText("4h in stage")).toHaveLength(2);
  expect(screen.getByText("Due in 2h")).not.toBeNull();
  expect(screen.queryByText("No next action")).toBeNull();
  expect(screen.queryByText("+1 555 0100")).toBeNull();
});
```

- [ ] **Step 2: Run the component test and verify the intended failure**

Run: `bun test tests/tmp-contacts-kanban-card.test.tsx`

Expected: the helper assertions pass, but the component assertion fails because `Due in 2h` is absent.

- [ ] **Step 3: Simplify imports and calculate metadata**

In `src/pages/ContactsKanban.tsx`:

```ts
import {
  GripVertical,
  Sparkles,
  Loader,
  MoreHorizontal,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
} from "lucide-react";
import {
  formatNextActionRelativeCompact,
  formatTimeInStage,
  nextActionTimingClass,
} from "@/lib/contact-time";
```

Remove `CopyContactButton`, `Mail`, `Phone`, and `Clock`. Inside `KanbanCard`, remove `visibleChips` and add:

```ts
const nextActionDeadline = contact.nextAction?.deadline ?? null;
const nextActionRelative = nextActionDeadline
  ? formatNextActionRelativeCompact(nextActionDeadline, now)
  : null;
const nextActionColor = nextActionDeadline
  ? nextActionTimingClass(nextActionDeadline, now)
  : "text-muted-foreground";
```

- [ ] **Step 4: Replace the card content with the compact hierarchy**

Keep the outer draggable `<div>` and replace its internal contact content with:

```tsx
<div className="flex min-w-0 items-start gap-2 text-left">
  <div
    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
    style={{ backgroundColor: getAvatarColor(contact.name) }}
  >
    {getInitial(contact.name)}
  </div>
  <div className="min-w-0 flex-1">
    <p className="truncate text-sm font-medium leading-5">{contact.name}</p>
    {contact.email && (
      <p className="mt-0.5 truncate text-xs leading-4 text-muted-foreground">
        {contact.email}
      </p>
    )}
  </div>
</div>
{(timeInStage || nextActionRelative) && (
  <p className="mt-2 flex min-w-0 items-center gap-1.5 pl-8 text-[11px] tabular-nums text-muted-foreground">
    {timeInStage && <span className="shrink-0">{timeInStage}</span>}
    {timeInStage && nextActionRelative && (
      <span aria-hidden="true" className="h-1 w-1 shrink-0 rounded-full bg-current opacity-40" />
    )}
    {nextActionRelative && (
      <span className={cn("truncate font-medium", nextActionColor)}>
        {nextActionRelative}
      </span>
    )}
  </p>
)}
```

Change the outer card padding from `p-3` to `p-2.5`. Remove the phone row, contact icons, copy button, and tag-chip block. Remove the unused `pivotTagIds` prop from `KanbanCard` and its call sites.

- [ ] **Step 5: Match the drag overlay to the new density**

In the drag overlay, change `p-3` to `p-2.5`, the avatar from `h-8 w-8` to `h-6 w-6`, its text from `text-xs` to `text-[10px]`, and the gap from `gap-2.5` to `gap-2`.

- [ ] **Step 6: Run the temporary component tests**

Run: `bun test tests/tmp-contacts-kanban-card.test.tsx`

Expected: 3 pass, 0 fail.

### Task 4: Align the empty Next Action card

**Files:**
- Create temporarily: `tests/tmp-next-action-empty-card.test.tsx`
- Modify: `src/pages/ContactDetail.tsx:535-555, 852-875`

**Interfaces:**
- Consumes: the existing `editingNextAction`, `hasNextAction`, and `nextActionError` state.
- Preserves: populated Next Action, editor, mutation error, and Add button behavior.

- [ ] **Step 1: Write the failing empty-card alignment test**

Create `tests/tmp-next-action-empty-card.test.tsx`:

```tsx
/// <reference lib="dom" />

import { expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import ContactDetailPage from "../src/pages/ContactDetail";

test("centers the empty Next Action header in a compact card", () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(["projects", "p", "contacts", "c"], {
    id: "c",
    projectId: "p",
    name: "Alisa Svilicic",
    email: "svilicic@lucidya.com",
    phone: null,
    notes: null,
    metadata: null,
    company: null,
    companyWebsite: null,
    position: null,
    companySize: null,
    estimatedRevenue: null,
    linkedinUrl: null,
    nextActionText: null,
    nextActionDeadline: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
    tags: [],
    activity: [],
  });
  queryClient.setQueryData(["projects", "p", "enrichment-usage"], {
    used: 0,
    limit: 10,
    remaining: 10,
    unlimited: false,
  });

  const { container } = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/app/projects/p/contacts/c"]}>
        <Routes>
          <Route
            path="/app/projects/:projectId/contacts/:contactId"
            element={<ContactDetailPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  const card = container.querySelector("[data-next-action-card='true']");
  const header = card?.querySelector("[data-slot='card-header']");
  const action = card?.querySelector("[data-slot='card-action']");
  expect(card?.className).toContain("py-3");
  expect(card?.className).toContain("gap-0");
  expect(header?.className).toContain("items-center");
  expect(action?.className).toContain("self-center");
});
```

- [ ] **Step 2: Run the alignment test and verify the intended failure**

Run: `bun test tests/tmp-next-action-empty-card.test.tsx`

Expected: FAIL because the empty card does not yet include the compact alignment classes.

- [ ] **Step 3: Derive the empty-card state**

In `src/pages/ContactDetail.tsx`, after `hasNextAction`:

```ts
const nextActionIsEmpty =
  !editingNextAction && !hasNextAction && !nextActionError;
```

- [ ] **Step 4: Apply compact alignment only to the empty state**

Update the Next Action card shell:

```tsx
<Card
  data-next-action-card="true"
  className={cn(nextActionIsEmpty && "gap-0 py-3")}
>
  <CardHeader className={cn(nextActionIsEmpty && "items-center")}>
    <CardTitle className="flex items-center gap-2">
      <CalendarClock className="h-4 w-4 text-muted-foreground" />
      Next Action
    </CardTitle>
    {!editingNextAction && !hasNextAction && (
      <CardAction className="self-center">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="relative after:absolute after:inset-x-0 after:-inset-y-1"
          aria-label="Add Next Action"
          onClick={startNextActionEditor}
        >
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </CardAction>
    )}
  </CardHeader>
```

- [ ] **Step 5: Run the temporary alignment test**

Run: `bun test tests/tmp-next-action-empty-card.test.tsx`

Expected: 1 pass, 0 fail.

### Task 5: Remove temporary tests and verify the implementation

**Files:**
- Delete: `tests/tmp-contact-list-next-action.test.ts`
- Delete: `tests/tmp-contacts-kanban-card.test.tsx`
- Delete: `tests/tmp-next-action-empty-card.test.tsx`
- Verify all modified production files from Tasks 1-4.

**Interfaces:**
- Produces no new interface; this task confirms the completed response and UI integration.

- [ ] **Step 1: Delete both temporary tests**

Use `apply_patch` to delete:

```text
tests/tmp-contact-list-next-action.test.ts
tests/tmp-contacts-kanban-card.test.tsx
tests/tmp-next-action-empty-card.test.tsx
```

- [ ] **Step 2: Confirm the temporary files are absent**

Run: `rg --files tests | rg "tmp-contact-list-next-action|tmp-contacts-kanban-card|tmp-next-action-empty-card"`

Expected: no output.

- [ ] **Step 3: Run the existing focused tests**

Run: `bun test tests/worker/contact-pipeline.test.ts tests/contact-detail-next-action.test.tsx`

Expected: all selected tests pass with 0 failures.

- [ ] **Step 4: Run the complete test suite**

Run: `bun test`

Expected: all tests pass with 0 failures.

- [ ] **Step 5: Run the production build**

Run: `bun run build`

Expected: exit code 0. Wrangler may report its existing sandbox log-file warning, and Vite may report its existing large-chunk warning; neither should stop the build.

- [ ] **Step 6: Validate formatting and changed-file scope**

Run: `git diff --check`

Expected: exit code 0 and no output. Inspect `git diff -- worker/services/contact-service.ts src/lib/contacts-view.ts src/pages/Contacts.tsx src/lib/contact-time.ts src/pages/ContactDetail.tsx src/pages/ContactsKanban.tsx` and confirm every hunk belongs to the approved compact-card work or was already present before it.

- [ ] **Step 7: Confirm the running dev server picked up the change**

Poll the existing `bun run dev` session.

Expected: a Vite HMR update for the modified frontend files and no new compile error. Do not treat unrelated pre-existing external integration errors as a failure of this card change.

- [ ] **Step 8: Leave implementation changes unstaged**

Because several affected files already contain unrelated uncommitted work, do not stage or commit the implementation. Report the exact modified files and verification results to the user.

# Contact Activity Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the contact detail's embedded 50-row activity array with a separately paginated, filterable activity timeline whose supported rows open booking, form-response, workflow-run, and research details in right-side drawers.

**Architecture:** A new `ContactActivityService` owns contact-scoped aggregation, normalization, exact counts, filtering, and opaque cursor pagination. `ContactActivityTimeline` owns the infinite query and drawers, while `ContactDetail` receives only count updates for its existing statistics. Booking/form details reuse `ActivityDrawer`; workflow and research details use a focused activity-details drawer.

**Tech Stack:** Bun, TypeScript, Hono, Drizzle/D1, React 19, TanStack Query, Radix Tabs/Sheet, Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-21-contact-activity-timeline-design.md`

## Global Constraints

- Use Bun for every package/test/build command.
- Named functions and React components use function declarations; inline callbacks may use arrows.
- Type-only imports use `import type` because `verbatimModuleSyntax` is enabled.
- Do not add list separators (`Separator`, `divide-y`, `border-t`, `border-b`, or `<hr>`).
- Buttons use icon + text; loading replaces the normal icon with `Loader` while retaining text.
- The filter labels are exactly `All`, `Bookings`, `Form responses`, and `Workflows`, aligned right in the timeline header.
- Interactive rows have at least a 40px hit area and `active:scale-[0.96]`; do not use `transition-all`.
- Do not stage unrelated working-tree files. Commit explicit task files only.

---

### Task 1: Contact activity aggregation and cursor pagination

**Files:**
- Create: `worker/services/contact-activity-service.ts`
- Create: `tests/worker/contact-activity-service.test.ts`

**Interfaces:**
- Produces `ContactActivityCategory = "all" | "bookings" | "form_responses" | "workflows"`.
- Produces `ContactTimelineItem`, a discriminated union with kinds `booking`, `form_response`, `workflow_run`, `research`, and `generic`.
- Produces `ContactActivityPage` with `activities`, exact `counts`, and `nextCursor`.
- Produces `ContactActivityService.list(projectId, contactId, { category, limit, cursor }): Promise<ContactActivityPage | null>`; `null` means the contact is not in the project.
- Produces `parseContactActivityCursor(value)` and `encodeContactActivityCursor(item)` for route validation and stable keyset pagination.

- [ ] **Step 1: Write failing service tests**

Create SQLite-backed fixtures with `createTestDb()` and seed two projects, contacts, one event type and booking, one standalone form response plus one booking-linked response, one workflow run with JSON `{ contactId }`, one research activity, and one generic tag activity. Assert:

```ts
const page = await service.list("proj-a", "contact-a", {
  category: "all",
  limit: 20,
  cursor: null,
});

expect(page?.activities.map((item) => item.kind)).toEqual([
  "research",
  "workflow_run",
  "form_response",
  "form_response",
  "booking",
  "generic",
]);
expect(page?.counts).toEqual({
  all: 6,
  bookings: 1,
  formResponses: 2,
  workflows: 2,
});
```

Add focused tests for `bookings`, `form_responses`, and `workflows`; response-ID deduplication; project isolation; a missing contact returning `null`; tied timestamps; two-page traversal with no duplicate IDs; and a new item inserted between page requests not shifting page two.

- [ ] **Step 2: Run the test and verify RED**

Run: `bun test tests/worker/contact-activity-service.test.ts`

Expected: FAIL because `worker/services/contact-activity-service.ts` does not exist.

- [ ] **Step 3: Implement normalized types and cursor helpers**

Define a stable shared base and discriminants:

```ts
interface ContactTimelineItemBase {
  id: string;
  occurredAt: string;
  title: string;
  description: string;
  status: string | null;
}

export type ContactTimelineItem =
  | (ContactTimelineItemBase & {
      kind: "booking";
      category: "bookings";
      bookingId: string;
      eventTypeId: string;
      startTime: string;
      endTime: string;
      timezone: string;
      meetingUrl: string | null;
      formResponseId: string | null;
    })
  | (ContactTimelineItemBase & {
      kind: "form_response";
      category: "form_responses";
      responseId: string;
      formId: string;
    })
  | (ContactTimelineItemBase & {
      kind: "workflow_run";
      category: "workflows";
      runId: string;
      workflowId: string;
    })
  | (ContactTimelineItemBase & {
      kind: "research";
      category: "workflows";
      research: Record<string, unknown>;
    })
  | (ContactTimelineItemBase & {
      kind: "generic";
      category: "all";
    });
```

Cursor payloads contain `{ occurredAt, id }`, are base64url encoded, and reject non-objects, invalid timestamps, or empty IDs.

- [ ] **Step 4: Implement source queries and normalization**

Use project-scoped Drizzle queries for:

- bookings joined to event types;
- form responses referenced by `form_submitted` activity and by booking `formResponseId`, deduped by response ID and joined to forms;
- workflow runs joined to workflows with `json_extract(context, '$.contactId')` matching the contact;
- `workflow_researched` activity;
- remaining generic contact activity, excluding `booked`, `cancelled`, `form_submitted`, and `workflow_researched` when normalized records replace them.

Sort by descending timestamp and then descending stable ID. Apply the decoded cursor using the same pair, slice `limit + 1`, and encode the final returned item when another row exists. Compute exact counts before category filtering.

- [ ] **Step 5: Run the test and verify GREEN**

Run: `bun test tests/worker/contact-activity-service.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add worker/services/contact-activity-service.ts tests/worker/contact-activity-service.test.ts
git commit -m "feat: add paginated contact activity service"
```

---

### Task 2: Activity routes, workflow-run detail, and lean contact responses

**Files:**
- Modify: `worker/services/contact-service.ts`
- Modify: `worker/services/workflow-service.ts`
- Modify: `worker/services/workflow-execution-service.ts`
- Modify: `worker/index.ts`
- Modify: `worker/lib/api-route-policy.ts`
- Modify: `tests/worker/contact-service.test.ts`
- Modify: `tests/worker/api-route-policy.test.ts`
- Create: `tests/worker/workflow-run-detail.test.ts`

**Interfaces:**
- Contact detail returns `{ ...contact, tags }` without `activity`.
- Activity route calls Task 1's `ContactActivityService.list`.
- `WorkflowService.getRunInProject(projectId, workflowId, runId)` returns the matching run or `null`.
- New research activity metadata stores `{ resultKey, summary, sourceCount, research: WorkflowResearchRecord }`.

- [ ] **Step 1: Write failing contact and workflow tests**

Extend `tests/worker/contact-service.test.ts`:

```ts
test("getWithDetails returns tags without embedded activity", async () => {
  const contact = await svc.create("p", { name: "Jane" });
  const detail = await svc.getWithDetails(contact.id, "p");
  expect(detail).not.toHaveProperty("activity");
  expect(detail).toHaveProperty("tags");
});
```

In `tests/worker/workflow-run-detail.test.ts`, seed two projects and assert the service returns the run only when project, workflow, and run IDs all match. Extend the API policy test with the concrete activity and run-detail paths.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
bun test tests/worker/contact-service.test.ts tests/worker/workflow-run-detail.test.ts tests/worker/api-route-policy.test.ts
```

Expected: FAIL because activity is still embedded and `getRunInProject`/the route policies do not exist.

- [ ] **Step 3: Remove activity from contact detail and add service ownership helper**

Change `getWithDetails` to fetch only contact and tags. Add a workflow-service query joining `workflowRuns.workflowId` to a workflow constrained by `projectId`, `workflowId`, and `runId`.

- [ ] **Step 4: Add and validate routes**

Register:

```ts
app.get("/api/projects/:projectId/contacts/:contactId/activities", async (c) => {
  // validate category, integer limit 1..100, and optional opaque cursor
  // return 404 for a foreign/missing contact, otherwise { activities, counts, nextCursor }
});

app.get(
  "/api/projects/:projectId/workflows/:workflowId/runs/:runId",
  async (c) => {
    // return { run } or project-scoped 404
  },
);
```

Add both exact paths to `PROJECT_API_KEY_ROUTES`. Add `ContactActivityService` to `worker/index.ts` imports. Invalid category/cursor/limit returns `400` with `{ error: string }`.

- [ ] **Step 5: Persist complete research metadata for future rows**

Change the `workflow_researched` log payload to include the full record:

```ts
await this.contactService.logActivity(
  contactId,
  "workflow_researched",
  undefined,
  {
    resultKey: record.resultKey,
    summary: record.result.summary,
    sourceCount: record.result.sources.length,
    research: record,
  },
);
```

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
bun test tests/worker/contact-service.test.ts tests/worker/workflow-run-detail.test.ts tests/worker/api-route-policy.test.ts tests/worker/contact-activity-service.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add worker/services/contact-service.ts worker/services/workflow-service.ts worker/services/workflow-execution-service.ts worker/index.ts worker/lib/api-route-policy.ts tests/worker/contact-service.test.ts tests/worker/workflow-run-detail.test.ts tests/worker/api-route-policy.test.ts
git commit -m "feat: expose contact activity and workflow run APIs"
```

---

### Task 3: Contact activity timeline component and drawers

**Files:**
- Create: `src/components/ContactActivityTimeline.tsx`
- Create: `src/components/ContactActivityDetailsDrawer.tsx`
- Create: `src/lib/contact-activity.ts`
- Create: `tests/contact-activity-timeline.test.tsx`

**Interfaces:**
- `ContactActivityTimeline({ projectId, contactId, contact, onSummaryChange })` owns the infinite query and selected activity.
- `ContactActivityDetailsDrawer({ projectId, contactName, item, open, onClose })` renders workflow-run and research details.
- `src/lib/contact-activity.ts` exports the API response/item types plus pure display helpers.
- `ContactActivitySummary` is `{ status: "loading" | "ready" | "error"; counts: ContactActivityCounts | null }`.

- [ ] **Step 1: Write failing component tests**

Mock `globalThis.fetch`, render inside `QueryClientProvider`, and return two activity pages. Assert:

```ts
expect(screen.getByRole("tab", { name: "All" })).not.toBeNull();
expect(screen.getByRole("tab", { name: "Bookings" })).not.toBeNull();
expect(screen.getByRole("tab", { name: "Form responses" })).not.toBeNull();
expect(screen.getByRole("tab", { name: "Workflows" })).not.toBeNull();
```

Click `Bookings` and assert the URL contains `category=bookings`. Click `Load more` and assert the next request carries the returned cursor. Click booking/form/workflow/research rows and assert the appropriate sheet title/content or detail fetch. Assert a generic row is not a button. Add error/retry and per-filter empty-state cases.

- [ ] **Step 2: Run the component test and verify RED**

Run: `bun test --preload ./tests/happydom.ts tests/contact-activity-timeline.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement shared client types and the infinite query**

Use:

```ts
useInfiniteQuery<ContactActivityPage>({
  queryKey: ["projects", projectId, "contacts", contactId, "activities", category],
  initialPageParam: null as string | null,
  queryFn: async ({ pageParam }) => {
    const params = new URLSearchParams({ category, limit: "20" });
    if (pageParam) params.set("cursor", pageParam);
    const response = await fetch(
      `/api/projects/${projectId}/contacts/${contactId}/activities?${params}`,
    );
    if (!response.ok) throw new Error("Failed to load activity");
    return response.json();
  },
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
});
```

Flatten pages through a `Map` keyed by stable activity ID. Call `onSummaryChange` with `loading` before the first page, `ready` plus exact counts after success, and `error` plus null counts after a failed first page.

- [ ] **Step 4: Implement the timeline UI**

Use `CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3"`, with the title left and `TabsList className="ml-auto"` right. Render accessible full-width buttons only for rows with detail kinds. Use explicit background/transform transitions, no separators, and an icon-and-text load-more button with the loading icon replacement convention.

- [ ] **Step 5: Reuse booking/form drawers and implement workflow/research drawer**

Map booking and form-response items to the existing `ActivityDrawer` item shape. For workflow runs, fetch the new detail route only while open and render status/timestamps/error plus each step through `WorkflowStepLog`. For research, render available metadata directly; full records show findings, insights, and sources, while legacy rows show the summary/source count.

- [ ] **Step 6: Run the component test and verify GREEN**

Run: `bun test --preload ./tests/happydom.ts tests/contact-activity-timeline.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/components/ContactActivityTimeline.tsx src/components/ContactActivityDetailsDrawer.tsx src/lib/contact-activity.ts tests/contact-activity-timeline.test.tsx
git commit -m "feat: add filterable contact activity timeline"
```

---

### Task 4: Contact page integration and verification

**Files:**
- Modify: `src/pages/ContactDetail.tsx`
- Modify: `tests/contact-detail-next-action.test.tsx`
- Modify: `docs/api-endpoint-audit.md` and generated API artifacts if `bun run docs:generate` changes them

**Interfaces:**
- `ContactDetail` no longer declares or reads `ContactActivity`/`contact.activity`.
- `ContactActivityTimeline` provides `ContactActivitySummary` to preserve sidebar stats and distinguish loading from failure.

- [ ] **Step 1: Update the existing page test first**

Remove `activity: []` from the cached contact fixture. Add a fetch response for the activity endpoint and assert the page renders exact booking/form-response/total counts after that request. Verify the contact identity and Next Action tests continue to pass without an embedded activity array.

- [ ] **Step 2: Run the page test and verify RED**

Run: `bun test --preload ./tests/happydom.ts tests/contact-detail-next-action.test.tsx`

Expected: FAIL because `ContactDetail` still reads `contact.activity`.

- [ ] **Step 3: Integrate the component**

Remove the old activity type, icons/descriptions, sorting, and inline timeline markup. Add `activitySummary` state and render:

```tsx
<ContactActivityTimeline
  projectId={projectId!}
  contactId={contactId!}
  contact={contact}
  onSummaryChange={setActivitySummary}
/>
```

Quick Stats use `activitySummary.counts.bookings` and `.formResponses`; Total Activity uses `.all`. Render skeletons while status is `loading` and an unavailable marker while status is `error`.

- [ ] **Step 4: Run focused and full verification**

Run:

```bash
bun test --preload ./tests/happydom.ts tests/contact-detail-next-action.test.tsx tests/contact-activity-timeline.test.tsx
bun test
bun run build
git diff --check
```

Expected: all tests PASS, the build exits `0`, and `git diff --check` prints nothing.

- [ ] **Step 5: Regenerate/check API documentation**

Run `bun run docs:generate`, inspect the explicit generated-file diff, then run `bun run docs:check`. Stage only generated artifacts that describe the two new GET routes or the lean contact response.

- [ ] **Step 6: Browser verification**

Start `bun run dev` and inspect a contact with activity at desktop and narrow widths. Verify the tabs align right/wrap, each filter fetches separately, Load more appends without duplicates, and all four supported detail kinds open a right-side drawer.

- [ ] **Step 7: Commit Task 4**

```bash
git add src/pages/ContactDetail.tsx tests/contact-detail-next-action.test.tsx docs/api-endpoint-audit.md
git commit -m "feat: integrate paginated contact activity"
```

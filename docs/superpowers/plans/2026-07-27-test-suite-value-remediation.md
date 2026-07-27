# Test Suite Value Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace, consolidate, or remove the 42 tests flagged by the full-suite audit so every remaining case protects a distinct product, security, persistence, or interoperability contract; fix the concrete booking and condition-evaluation defects exposed by the stronger tests without chasing a target test count.

**Architecture:** Keep tests at the narrowest seam that can observe the real contract. Pure truth tables stay unit-level, UI behavior is asserted through roles/text/network boundaries, tenant and persistence rules use the real in-memory SQLite schema, and email privacy is verified through the complete booking action rather than a disconnected email method. Production changes are limited to project-scoped booking transitions, pre-mutation confirmation validation, project-scoped contact-detail tags, fail-closed form conditions, and accessible labels needed to expose UI meaning.

**Tech Stack:** Bun test runner, `bun:test`, React 19, Testing Library, TanStack Query, Hono/Cloudflare Worker code, Drizzle ORM with the existing in-memory SQLite migration harness, TypeScript strict mode.

## Global Constraints

- The standing rule is: **never test for vanity; every test must earn its spot.**
- A test earns its spot only when its name identifies a distinct regression and its assertions fail if that contract is broken.
- Test count is not a success metric. Do not preserve, add, split, or parameterize cases to make the suite look larger.
- Do not assert Tailwind classes, DOM ancestry, internal screen keys, source-code strings, collection ordering that is not a public contract, or implementation call structure.
- A matrix is appropriate only when each row represents a distinct boundary that would produce a different customer-visible, security, persistence, or protocol failure.
- For test-only rewrites that already pass, prove the test can go red with one temporary, minimal production mutation per contract cluster. Revert the mutation with `apply_patch` before committing.
- For known defects, write the stronger failing test first and capture the focused red result before changing production code.
- Keep the 176 tests classified as “keep” unchanged unless a deliberately changed public function signature requires a mechanical update or this plan explicitly folds a formerly independent operator case into the comprehensive parity matrix.
- Use the existing real migration-backed database from `tests/worker/mcp-test-db.ts`; do not replace tenant or persistence checks with mocks.
- Keep external I/O hermetic by stubbing `globalThis.fetch` and collecting `waitUntil` promises.
- Use Bun only. Use `bun test` with the focused file paths listed in each task; run the complete suite only at the final whole-suite gate because this plan intentionally affects the whole suite.
- Follow repository conventions: function declarations for named helpers/components, `import type` for type-only imports, and `apply_patch` for edits.
- Do not add a test for a deferred gap until the matching production behavior and failure mode are scoped in its own implementation plan.

## Scope and Audit Disposition

This plan closes every item in the 218-test audit: 23 rewrites, 15 consolidations, and 4 removals. “Consolidate” means the behavior remains covered by a stronger existing scenario or a named truth table; it does not mean preserving a standalone test identity. The comprehensive form-operator matrix also absorbs two formerly retained operator examples that would otherwise become redundant during the rewrite.

| Area | Existing test(s) | Disposition | Task |
| --- | --- | --- | --- |
| Frontend | `tests/contact-activity-timeline.test.tsx` — “owns the request, renders the four right-aligned segments, and reports counts” | Rewrite around tabs, request, and summary; remove `ml-auto` assertion | 4 |
| Frontend | `tests/contact-detail-next-action.test.tsx` — “opens the natural-language Next Action composer” | Rewrite as a full PUT/save integration | 4 |
| Frontend | `tests/contact-detail-next-action.test.tsx` — “loads activity separately and renders exact contact statistics” | Rewrite with accessible statistic names; remove `parentElement` traversal | 4 |
| Frontend | Five `tests/form-experience.test.ts` cases at the former lines 59, 77, 100, 150, and 168 | Rewrite around visible field labels, step titles, and conditional behavior instead of internal `field-*` keys | 5 |
| Frontend | `tests/form-experience.test.ts` — “returns empty object when nothing is mapped” | Fold into the mapped-field table | 5 |
| Frontend | `tests/form-experience.test.ts` — “false without a form” | Fold into the eligibility table | 5 |
| Frontend | `tests/workflow-run-dialog.test.tsx` — persisted run ID callback | Fold into the builder integration that consumes the run ID | 5 |
| Frontend | `tests/workflow-run-dialog.test.tsx` — audience run | Rewrite around `/trigger`, no contact payload, callback, close, and reset | 5 |
| Workflow | `tests/worker/workflow-operational-facts.test.ts` — missing and foreign contacts | One labeled ownership matrix | 6 |
| Workflow | `tests/worker/workflow-retry.test.ts` — transient vs permanent classifier cases | One labeled classifier table | 6 |
| Workflow | `tests/worker/workflow-retry.test.ts` — unsafe webhook action-started and legacy-undefined recovery cases | One labeled unsafe-action recovery matrix | 6 |
| Workflow | `tests/worker/workflow-retry.test.ts` — credential scrubber | Rewrite as sensitive-key and safe-passthrough matrices | 6 |
| Workflow | `tests/worker/workflow-retry.test.ts` — fifteen-minute lease | Rewrite at exact boundary plus missing/invalid timestamps | 6 |
| Workflow | `tests/worker/workflow-runtime.test.ts` — metadata form-field interpolation | Remove; the existing value-resolution and interpolation tests already require it | 6 |
| Workflow | `tests/worker/workflow-retry.test.ts` — persisted retry after termination | Remove; the preceding queue-rejection repair test reaches the same persisted state and branch | 6 |
| Domain | `tests/worker/availability-service.test.ts` — below-cap day | Fold into the stronger status/count matrix | 7 |
| Domain | `tests/worker/contact-next-action.test.ts` — completion half inside the undated persistence test | Remove that half; the dedicated completion test owns the contract | 7 |
| Domain | `tests/worker/form-conditions.test.ts` — separate `any` and `all` tests | One truth table | 8 |
| Domain | `tests/worker/validation-event-type.test.ts` — two one-off invalid inputs | One labeled boundary table | 8 |
| Domain | `tests/worker/booking-actions.test.ts` — cancellation reason | Rewrite to assert email reason, persisted state, tenant, and one activity | 2 |
| Domain | `tests/worker/booking-actions.test.ts` — past confirmation | Rewrite to require pending state and zero side effects; fix production ordering | 2 |
| Domain | `tests/worker/booking-limits.test.ts` — below-cap create | Seed one existing booking, create the second, and assert persisted count | 7 |
| Domain | `tests/worker/contact-activity-service.test.ts` — foreign isolation | Rewrite with a foreign-project reference attached to the requested contact | 7 |
| Domain | `tests/worker/contact-pipeline.test.ts` — first page/full total | Rewrite across offsets, overlap, stable membership, and a real filter | 7 |
| Domain | `tests/worker/contact-service.test.ts` — details without activity | Seed owned and foreign tags/activity; assert owned tag returned, foreign data absent, activity excluded | 7 |
| Domain | `tests/worker/form-conditions.test.ts` — one representative SPA/widget parity fixture | Rewrite across all operators, field shapes, missing fields, and unknown runtime operators | 8 |
| Domain | `tests/worker/ics.test.ts` — substring-only calendar test | Rewrite around exact calendar semantics, CRLF/folding, escaping, and REQUEST/PUBLISH rules | 8 |
| Domain | `tests/worker/tag-service.test.ts` — validation grab bag | Rewrite as labeled schema boundaries | 8 |
| Domain | `tests/worker/tag-service.test.ts` — get/update/duplicate grab bag | Separate tenant lookup/filter from atomic uniqueness/update behavior | 8 |
| Domain | `tests/worker/contact-activity-service.test.ts` — standalone dedup test | Remove; the exact complete timeline and count already fail on duplication | 7 |
| Domain | `tests/worker/email-service.test.ts` — guest form privacy with no fields | Remove and replace with an end-to-end booking-action privacy assertion using a real submitted field | 3 |
| API/docs | `tests/worker/api-docs.test.ts` — exact parameter ordering | Rewrite as semantic parameter sets and schema/response contracts | 9 |
| API/docs | `tests/worker/api-docs.test.ts` — raw `Docs.tsx` source strings | Replace with a rendered docs-page contract | 9 |

## File Map

- Modify `AGENTS.md`: persist the test-value rule and review checklist.
- Modify `worker/services/booking-service.ts`: add project-scoped reads and state transitions.
- Modify `worker/lib/booking-actions.ts`: validate tenant and event time before mutation; pass project scope through decline.
- Modify `worker/index.ts`: pass `projectId` to `declineBookingAction`.
- Modify `worker/mcp/tools/bookings.ts`: pass `projectId` to `declineBookingAction`.
- Modify `worker/services/contact-service.ts`: filter detail tags by the requested project.
- Modify `src/lib/form-conditions.ts`: fail closed for unknown runtime operators.
- Modify `widget/shared/form-conditions.ts`: keep widget behavior identical and fail closed.
- Modify `src/pages/ContactDetail.tsx`: expose semantic labels for quick-stat values.
- Modify the 20 audited test files named in the disposition table.
- Create `tests/api-docs-page.test.tsx`: rendered documentation entry-point contract.

---

### Task 1: Persist the Test-Value Rule and Establish the Audit Baseline

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Run the audited suite once before edits**

Because the entire test suite is the subject of this plan, one full baseline is warranted:

```bash
bun test
git status --short
```

Record the pass/fail result in the implementation notes. Do not use the number of tests as an optimization target.

- [ ] **Step 2: Add the standing rule to `AGENTS.md`**

Add this section after the general code conventions:

```md
### Test Quality

- Never test for vanity; every test must earn its spot.
- Every test name must identify the regression it prevents.
- Assert observable behavior, persisted state, security boundaries, or protocol output—not implementation structure, styling classes, DOM ancestry, or source text.
- Consolidate equivalent inputs into a labeled table when they protect the same branch.
- Do not duplicate a contract already required by a stronger integration test.
- A new test must be demonstrated red against the missing/broken behavior before production code is changed.
- Test count is not a quality metric.
```

- [ ] **Step 3: Verify the documentation-only change**

```bash
git diff --check
git diff -- AGENTS.md
```

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs: codify test value standard"
```

---

### Task 2: Make Booking State Transitions Tenant-Safe and Mutation-Safe

**Files:**
- Modify: `tests/worker/booking-actions.test.ts`
- Modify: `worker/services/booking-service.ts`
- Modify: `worker/lib/booking-actions.ts`
- Modify: `worker/index.ts`
- Modify: `worker/mcp/tools/bookings.ts`
- Modify: `tests/worker/mcp-tools.test.ts` only if its direct decline-action call requires the new `projectId` parameter

- [ ] **Step 1: Strengthen the fixture before writing assertions**

Extend `seedFixture()` with an `et-b1` event type owned by `proj-b`, plus foreign confirmed and pending bookings. Return the raw `pending` array so rejected actions can prove that no background task was scheduled.

```ts
await db.insert(dbSchema.eventTypes).values([
  { id: "et-a1", projectId: "proj-a", name: "Intro Call", slug: "intro-call" },
  { id: "et-b1", projectId: "proj-b", name: "Private Call", slug: "private-call" },
]);

await db.insert(dbSchema.bookings).values([
  {
    id: "bk-foreign-confirmed",
    eventTypeId: "et-b1",
    name: "Foreign Guest",
    email: "foreign@example.com",
    startTime: future,
    endTime: futureEnd,
    timezone: "UTC",
    status: "confirmed",
  },
  {
    id: "bk-foreign-pending",
    eventTypeId: "et-b1",
    name: "Foreign Guest",
    email: "foreign@example.com",
    startTime: future,
    endTime: futureEnd,
    timezone: "UTC",
    status: "pending",
  },
]);
```

- [ ] **Step 2: Write the failing past-confirmation contract**

Replace the weak assertion with persisted state and side-effect assertions:

```ts
test("rejects a past booking before changing its pending state", async () => {
  const { db, deps, pending } = await seedFixture();

  const result = await confirmBookingAction(deps, "proj-a", "bk-pending-past");

  expect(result).toEqual({
    ok: false,
    status: 400,
    error: "Cannot confirm a booking whose time has already passed",
  });
  const [row] = await db
    .select({ status: dbSchema.bookings.status, expiresAt: dbSchema.bookings.expiresAt })
    .from(dbSchema.bookings)
    .where(eq(dbSchema.bookings.id, "bk-pending-past"));
  expect(row.status).toBe("pending");
  expect(row.expiresAt).not.toBeNull();
  expect(pending).toHaveLength(0);
});
```

Ensure the fixture gives `bk-pending-past` a non-null `expiresAt`, then run:

```bash
bun test tests/worker/booking-actions.test.ts
```

Expected red: the row is currently `confirmed` and `expiresAt` is cleared.

- [ ] **Step 3: Write failing cross-project transition contracts**

One test may exercise all three transitions because the single regression is “a project cannot mutate another project’s booking.” Assert both rows remain unchanged and no background task or email was scheduled.

```ts
test("does not mutate another project's booking through any organizer action", async () => {
  const { db, deps, pending } = await seedFixture();

  expect(await cancelBookingAction(deps, "proj-a", "bk-foreign-confirmed", "No"))
    .toEqual({ ok: false, status: 404, error: "Booking not found" });
  expect(await confirmBookingAction(deps, "proj-a", "bk-foreign-pending"))
    .toEqual({ ok: false, status: 404, error: "Booking not found or not pending" });
  expect(
    await declineBookingAction(
      deps,
      "proj-a",
      "bk-foreign-pending",
      { notify: true, reason: "No" },
    ),
  ).toEqual({ ok: false, status: 404, error: "Booking not found or not pending" });

  const rows = await db
    .select({ id: dbSchema.bookings.id, status: dbSchema.bookings.status })
    .from(dbSchema.bookings)
    .where(inArray(dbSchema.bookings.id, [
      "bk-foreign-confirmed",
      "bk-foreign-pending",
    ]));
  expect(new Map(rows.map((row) => [row.id, row.status]))).toEqual(
    new Map([
      ["bk-foreign-confirmed", "confirmed"],
      ["bk-foreign-pending", "pending"],
    ]),
  );
  expect(pending).toHaveLength(0);
});
```

Run the focused test and confirm it is red before implementation.

- [ ] **Step 4: Add project-scoped service operations**

Add a scoped lookup to `BookingService` using the existing booking/event-type join:

```ts
async getByIdForProject(
  projectId: string,
  id: string,
): Promise<dbSchema.BookingRow | null> {
  const rows = await this.db
    .select({ booking: dbSchema.bookings })
    .from(dbSchema.bookings)
    .innerJoin(
      dbSchema.eventTypes,
      eq(dbSchema.bookings.eventTypeId, dbSchema.eventTypes.id),
    )
    .where(
      and(
        eq(dbSchema.bookings.id, id),
        eq(dbSchema.eventTypes.projectId, projectId),
      ),
    )
    .limit(1);
  return rows[0]?.booking ?? null;
}
```

Change `cancel`, `confirm`, and `decline` to accept `projectId` and use `getByIdForProject` before updating. Their post-update read must also use `getByIdForProject`.

- [ ] **Step 5: Validate confirmation before mutation**

In `confirmBookingAction`, retrieve the scoped pending candidate first, reject a past start time, and only then call the state transition:

```ts
const bookingService = new BookingService(db);
const candidate = await bookingService.getByIdForProject(projectId, bookingId);

if (!candidate || candidate.status !== "pending") {
  return { ok: false, status: 404, error: "Booking not found or not pending" };
}
if (new Date(candidate.startTime) <= new Date()) {
  return {
    ok: false,
    status: 400,
    error: "Cannot confirm a booking whose time has already passed",
  };
}

const booking = await bookingService.confirm(projectId, bookingId);
if (!booking) {
  return { ok: false, status: 404, error: "Booking not found or not pending" };
}
```

Update cancellation to call `cancel(projectId, bookingId, reason)`. Change the decline action signature to:

```ts
export async function declineBookingAction(
  deps: BookingActionDeps,
  projectId: string,
  bookingId: string,
  opts: { reason?: string; notify: boolean },
): Promise<BookingActionResult>
```

Pass `projectId` from the HTTP route and MCP tool. Keep MCP’s existing `bookingInProject` precheck as defense in depth.

- [ ] **Step 6: Rewrite the cancellation test around its real contract**

Keep one successful cancellation case. Assert:

- booking status is `cancelled`;
- the cancellation Resend body contains `Schedule conflict`;
- the contact belongs to `proj-a`;
- exactly one `cancelled` contact activity references the booking;
- no row or side effect is created under `proj-b`.

Remove “records the reason” from the test name unless all those assertions are present.

- [ ] **Step 7: Run focused verification**

```bash
bun test tests/worker/booking-actions.test.ts tests/worker/mcp-tools.test.ts
bunx eslint worker/services/booking-service.ts worker/lib/booking-actions.ts worker/mcp/tools/bookings.ts tests/worker/booking-actions.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add worker/services/booking-service.ts worker/lib/booking-actions.ts worker/index.ts worker/mcp/tools/bookings.ts tests/worker/booking-actions.test.ts tests/worker/mcp-tools.test.ts
git commit -m "fix: fence booking transitions by project"
```

---

### Task 3: Replace the False-Positive Email Privacy Test With a Real Booking Flow

**Files:**
- Modify: `tests/worker/email-service.test.ts`
- Modify: `tests/worker/booking-actions.test.ts`

- [ ] **Step 1: Delete the no-signal guest confirmation test**

Delete `omits submitted form fields from guest confirmation`. It supplies no submitted fields, so it cannot catch the leak named by the test.

- [ ] **Step 2: Add a real privacy fixture to `booking-actions.test.ts`**

Reuse the schedule/availability pattern from `tests/worker/booking-limits.test.ts`. Seed:

- owner `owner@example.com`;
- project `project-a`;
- active form `form-a`;
- step `step-a`;
- text field `budget` labeled `Confidential Budget`;
- event type `et-private` with `bookingFormId: "form-a"`;
- an open UTC availability rule for a date 60 days ahead.

Call `createBookingAction` with:

```ts
{
  projectSlug: "project-a",
  eventTypeSlug: "private-call",
  name: "Ava",
  email: "ava@example.com",
  startTime: `${dateStr}T10:00:00.000Z`,
  timezone: "UTC",
  formFields: { budget: "$500,000" },
}
```

Collect all Resend request bodies after settling `waitUntil`.

- [ ] **Step 3: Assert the data boundary, not the email implementation**

```ts
const guestPayload = resendPayloads.find((payload) =>
  payload.to.includes("ava@example.com"),
);
const ownerPayload = resendPayloads.find((payload) =>
  payload.to.includes("owner@example.com"),
);

expect(guestPayload?.html).not.toContain("Confidential Budget");
expect(guestPayload?.html).not.toContain("$500,000");
expect(ownerPayload?.html).toContain("Confidential Budget");
expect(ownerPayload?.html).toContain("$500,000");
```

This case earns its place because it fails if submitted form fields cross the guest/owner privacy boundary. The remaining direct email-service CC test stays focused on recipient routing.

- [ ] **Step 4: Prove the replacement goes red**

Temporarily append the submitted field to the guest confirmation `notes` inside `createBookingAction`, run the focused test, and confirm the guest assertion fails. Revert that temporary mutation before continuing.

```bash
bun test tests/worker/booking-actions.test.ts tests/worker/email-service.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add tests/worker/booking-actions.test.ts tests/worker/email-service.test.ts
git commit -m "test: enforce booking email privacy boundary"
```

---

### Task 4: Rewrite Contact UI Tests Around User-Visible Semantics

**Files:**
- Modify: `tests/contact-activity-timeline.test.tsx`
- Modify: `tests/contact-detail-next-action.test.tsx`
- Modify: `src/pages/ContactDetail.tsx`

- [ ] **Step 1: Remove the layout-class assertion**

Rename the timeline test to `requests the all-activity page, exposes category tabs, and reports counts`. Keep the role assertions, exact request query, and `onSummaryChange` contract. Delete:

```ts
expect(screen.getByRole("tablist").className).toContain("ml-auto");
```

- [ ] **Step 2: Turn the Next Action composer test into a mutation integration**

Teach `renderContactDetail`’s fetch mock to accept the PUT endpoint and capture `init`. Click Add, enter `Send proposal tomorrow`, submit through the composer’s accessible Save button, then assert:

```ts
expect(putCall?.url).toBe(
  "/api/projects/p1/contacts/c1/next-action",
);
expect(putCall?.init.method).toBe("PUT");
expect(JSON.parse(String(putCall?.init.body))).toEqual({
  text: "Send proposal",
  deadline: expect.any(String),
});
expect(await screen.findByText("Send proposal")).not.toBeNull();
expect(screen.getByRole("button", { name: "Mark Done" })).not.toBeNull();
```

Return `{ contact: { ...seededContact, nextActionText: "Send proposal", nextActionDeadline: parsedDeadline } }` from the mock. Assert the composer closes after success.

- [ ] **Step 3: Give quick-stat values stable accessible names**

In `ContactDetail.tsx`, add semantic labels to the ready values without changing layout:

```tsx
<span
  aria-label={`Bookings: ${activitySummary.counts?.bookings ?? 0}`}
  className="text-sm font-semibold tabular-nums text-foreground"
>
  {activitySummary.counts?.bookings ?? 0}
</span>
```

Apply the same pattern to `Form submissions` and `Total activity`.

- [ ] **Step 4: Rewrite the statistics test**

Remove `parentElement` and `within`. Assert the separate request plus:

```ts
expect(await screen.findByLabelText("Bookings: 3")).not.toBeNull();
expect(screen.getByLabelText("Form submissions: 4")).not.toBeNull();
expect(screen.getByLabelText("Total activity: 8 events")).not.toBeNull();
```

Add one error-response assertion to the same test only if it can be expressed as a rerendered scenario without duplicating the existing timeline retry test.

- [ ] **Step 5: Mutation-prove and verify**

Temporarily change the activities URL’s default category to `bookings`; confirm the timeline request test fails. Revert it. Then run:

```bash
bun test tests/contact-activity-timeline.test.tsx tests/contact-detail-next-action.test.tsx
bunx eslint src/pages/ContactDetail.tsx tests/contact-activity-timeline.test.tsx tests/contact-detail-next-action.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add src/pages/ContactDetail.tsx tests/contact-activity-timeline.test.tsx tests/contact-detail-next-action.test.tsx
git commit -m "test: assert contact behavior through semantics"
```

---

### Task 5: Remove Frontend Helper Internals and Duplicate Dialog Coverage

**Files:**
- Modify: `tests/form-experience.test.ts`
- Modify: `tests/workflow-run-dialog.test.tsx`

- [ ] **Step 1: Add semantic form-test selectors**

Add helpers that expose the contract instead of `FormExperienceScreen.key`:

```ts
function questionLabels(model: FormExperienceModel): string[] {
  return model.screens.flatMap((screen) => {
    if (screen.kind === "question") return [screen.field.label];
    if (screen.kind === "group") {
      return screen.fields.map((currentField) => currentField.label);
    }
    return [];
  });
}

function visibleStepTitles(model: FormExperienceModel): Array<string | null> {
  return model.steps.map((step) => step.title);
}
```

Import `FormExperienceModel` as a type. Give fixture fields meaningful labels such as `Company`, `Role`, and `Work email`.

- [ ] **Step 2: Rewrite the five internal-key cases**

For focused screen construction, field conditions, step conditions, booking exclusion, and hidden titled steps:

- assert `screens.map((screen) => screen.kind)` only where screen kind/order is the actual navigation contract;
- assert `questionLabels(model)` for visible questions;
- assert `visibleStepTitles(model)` for visible sections;
- for booking exclusion, prove the excluded `Full name` is absent while the dependent `Company` question remains visible when the hidden source value is `Ada`;
- do not assert `field-first`, `field-second`, `fieldsById.first`, or raw step IDs.

- [ ] **Step 3: Fold the mapped-field empty case into one table**

```ts
test.each([
  ["name and email mappings", mappedForm, {
    nameFieldId: "full-name",
    emailFieldId: "work-email",
  }],
  ["no mappings", form(), {}],
] as const)("returns mapped contact fields for %s", (_label, input, expected) => {
  expect(getContactMappedFieldIds(input)).toEqual(expected);
});
```

- [ ] **Step 4: Fold null-form eligibility into the existing eligibility table**

Use one labeled table covering the enabled valid form, null form, flag off, missing mapping, and visibility-gated mapping. Do not create a separate test body for `null`.

- [ ] **Step 5: Make the audience dialog test own its complete contract**

Capture `RequestInit`, track `onOpenChange`, and select audience mode. Assert:

```ts
expect(triggerCall.url).toBe(
  "/api/projects/project-1/workflows/workflow-1/trigger",
);
expect(triggerCall.init.method).toBe("POST");
expect(triggerCall.init.body).toBeUndefined();
expect(onSuccess).toHaveBeenCalledWith(null);
expect(onOpenChange).toHaveBeenCalledWith(false);
```

The existing helper keeps `open={true}`, so after success assert the visible Run
Mode has reset to `Test with one contact`. This proves the component reset
without getting a false pass from unmounting and remounting fresh state.

- [ ] **Step 6: Remove the direct persisted-run-ID callback test**

The builder integration already proves the stronger chain: `/test` response run ID -> dialog callback -> runs invalidation -> Runs tab -> exact returned run expansion. Keep and, if missing, add the request payload assertion `{ contactId: "contact-1" }` to that integration.

- [ ] **Step 7: Mutation-prove and verify**

Temporarily remove `excludedFieldIds` from the booking model filter and confirm the semantic booking-exclusion test fails. Revert it. Then run:

```bash
bun test tests/form-experience.test.ts tests/workflow-run-dialog.test.tsx
```

- [ ] **Step 8: Commit**

```bash
git add tests/form-experience.test.ts tests/workflow-run-dialog.test.tsx
git commit -m "test: focus form and workflow UI contracts"
```

---

### Task 6: Consolidate Workflow Matrices and Remove Duplicate Runtime Paths

**Files:**
- Modify: `tests/worker/workflow-operational-facts.test.ts`
- Modify: `tests/worker/workflow-retry.test.ts`
- Modify: `tests/worker/workflow-runtime.test.ts`

- [ ] **Step 1: Consolidate the contact ownership failures**

Use one `test.each` with labeled setup modes `deleted` and `foreign project`. Each row must assert the same contract: run/step fail safely and the queue receives no continuation. Keep the setup difference visible in the row label.

- [ ] **Step 2: Consolidate transient classification**

Replace the two overlapping classifier tests with:

```ts
test.each([
  ["explicit transient marker", { transient: true }, true],
  ["timeout status", { status: 408 }, true],
  ["rate limit status", { status: 429 }, true],
  ["provider failure", { status: 503 }, true],
  ["validation status", { status: 422 }, false],
  ["authentication status", { status: 401 }, false],
  ["ordinary error", new Error("bad input"), false],
] as const)("classifies %s", (_label, error, expected) => {
  expect(isTransientWorkflowError(error)).toBe(expected);
});
```

Do not repeat AI SDK retryability; its separate test protects a different adapter boundary.

- [ ] **Step 3: Rewrite credential scrubbing as a security table**

Use separate labeled inputs for `Authorization`, `Bearer`, `api_key`, `token`, `secret`, `password`, and `cookie`, all expecting `Provider request failed`. Add:

- safe message passthrough;
- stable status-message replacement;
- empty/non-error fallback.

These rows earn their place because each sensitive key is a separately recognized leak shape in `SENSITIVE_ERROR_PATTERN`.

- [ ] **Step 4: Rewrite the lease boundary**

Freeze `now` and cover:

```ts
test.each([
  ["missing", undefined, false],
  ["invalid", "not-a-date", false],
  ["one millisecond before", "2026-07-27T11:45:00.001Z", false],
  ["exactly fifteen minutes", "2026-07-27T11:45:00.000Z", true],
] as const)("treats a %s lease as stale=%s", (_label, startedAt, expected) => {
  expect(
    isLeaseStale(startedAt, new Date("2026-07-27T12:00:00.000Z")),
  ).toBe(expected);
});
```

- [ ] **Step 5: Consolidate unsafe webhook recovery**

Keep one scenario body parameterized by persisted action state:

- `actionStarted: true`;
- legacy `actionStarted: undefined`.

Both must fail closed without action invocation or active-lease recovery. Keep the pre-action persistence-recovery tests separate because they protect a different state.

- [ ] **Step 6: Delete the two duplicate cases**

Delete:

- `repairs a persisted retry after termination before the delayed queue send`;
- `form field values under metadata.formFields are addressable via form.fields.*`.

The queue-rejection repair test already asserts the former persisted retry repair path. `resolveStepInputs` plus interpolation tests already require the latter resolution path.

- [ ] **Step 7: Mutation-prove and verify**

Temporarily change `>= WORKFLOW_LEASE_MS` to `> WORKFLOW_LEASE_MS`; confirm the exact-boundary row fails. Revert it. Then run:

```bash
bun test tests/worker/workflow-operational-facts.test.ts tests/worker/workflow-retry.test.ts tests/worker/workflow-runtime.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add tests/worker/workflow-operational-facts.test.ts tests/worker/workflow-retry.test.ts tests/worker/workflow-runtime.test.ts
git commit -m "test: consolidate workflow failure contracts"
```

---

### Task 7: Strengthen Domain Persistence and Isolation Tests

**Files:**
- Modify: `worker/services/contact-service.ts`
- Modify: `tests/worker/availability-service.test.ts`
- Modify: `tests/worker/booking-limits.test.ts`
- Modify: `tests/worker/contact-next-action.test.ts`
- Modify: `tests/worker/contact-activity-service.test.ts`
- Modify: `tests/worker/contact-pipeline.test.ts`
- Modify: `tests/worker/contact-service.test.ts`

- [ ] **Step 1: Remove redundant below-cap availability coverage**

Delete `daily cap stays open while below the limit`. The preceding `daily cap ignores declined/cancelled/rescheduled` case already seeds one counted confirmed booking against a cap of two and proves the day remains open. Rename that stronger case to include both rules.

- [ ] **Step 2: Make booking creation below a cap prove persistence**

Seed one confirmed booking with `maxPerDay: 2`, create a second at another available time, then assert:

```ts
expect(result.ok).toBe(true);
const rows = await db
  .select({ id: dbSchema.bookings.id })
  .from(dbSchema.bookings)
  .where(eq(dbSchema.bookings.eventTypeId, "et1"));
expect(rows).toHaveLength(2);
if (!result.ok) throw new Error(result.error);
expect(rows.some((row) => row.id === result.booking.id)).toBe(true);
```

Return `db` from the fixture; do not merely assert `result.ok`.

- [ ] **Step 3: Remove the duplicated completion half from the undated action test**

Keep persistence and `next_action_set` metadata for an undated action. Delete the completion call/assertion from that case because `completion clears both fields and records the previous action` is the sole owner of completion behavior.

- [ ] **Step 4: Remove the standalone activity dedup test**

Delete `deduplicates a booking response also linked by submission activity`. The exact ordered kinds, exact count, and exact timeline size in `normalizes the complete contact timeline and exact counts` already fail if the linked response is duplicated.

- [ ] **Step 5: Make foreign nested-data isolation adversarial**

Keep the “foreign contact returns null” assertion. For the requested `contact-a`, seed a foreign-project booking/form/workflow reference that points at `contact-a` or its activity reference ID. Assert none of the foreign IDs appears in the returned normalized items. The fixture must be cross-project at the nested record, not merely attached to `contact-b`.

- [ ] **Step 6: Rewrite list-page coverage across real pages and filters**

Give all 121 contacts explicit, distinct `createdAt` timestamps. Fetch offsets 0, 50, and 100. Assert:

```ts
expect([first.total, second.total, third.total]).toEqual([121, 121, 121]);
expect([first.contacts.length, second.contacts.length, third.contacts.length])
  .toEqual([50, 50, 21]);

const pageIds = [first, second, third].flatMap((page) =>
  page.contacts.map((contact) => contact.id),
);
expect(new Set(pageIds).size).toBe(121);
expect(pageIds).toEqual(expectedIdsInDescendingCreatedAtOrder);
```

Then issue a search-filtered page and assert its `total` and membership are computed from the filtered set, not the global set. This remains one test because the regression is page slicing/counting of one filtered ordered collection.

- [ ] **Step 7: Seed the details contract**

For `ContactService.getWithDetails`, seed:

- one owned tag assigned to the requested contact;
- one same-project activity;
- one foreign-project tag with an adversarial direct `contactTags` row linking it
  to the requested contact.

Assert the returned tag has the expected ID/name/color, no foreign tag appears, and the returned object has no `activity` property. This proves the actual response shape and tenant filtering.

- [ ] **Step 8: Scope contact-detail tags by project**

Make the new adversarial test red first. Then accept an optional `projectId` in
`getContactTags`, add `eq(dbSchema.tags.projectId, projectId)` when present, and
call it with the requested project from `getWithDetails`:

```ts
async getContactTags(contactId: string, projectId?: string) {
  const predicates = [eq(dbSchema.contactTags.contactId, contactId)];
  if (projectId) predicates.push(eq(dbSchema.tags.projectId, projectId));

  return this.db
    .select({
      id: dbSchema.contactTags.tagId,
      name: dbSchema.tags.name,
      color: dbSchema.tags.color,
    })
    .from(dbSchema.contactTags)
    .innerJoin(dbSchema.tags, eq(dbSchema.contactTags.tagId, dbSchema.tags.id))
    .where(and(...predicates));
}
```

Use `this.getContactTags(id, projectId)` inside `getWithDetails`. Existing
callers that have already scoped the contact may continue omitting `projectId`.

- [ ] **Step 9: Mutation-prove and verify**

Temporarily remove the `projectId` predicate from the nested activity query and confirm the adversarial foreign-reference test fails. Revert it. Then run:

```bash
bun test tests/worker/availability-service.test.ts tests/worker/booking-limits.test.ts tests/worker/contact-next-action.test.ts tests/worker/contact-activity-service.test.ts tests/worker/contact-pipeline.test.ts tests/worker/contact-service.test.ts
```

- [ ] **Step 10: Commit**

```bash
git add worker/services/contact-service.ts tests/worker/availability-service.test.ts tests/worker/booking-limits.test.ts tests/worker/contact-next-action.test.ts tests/worker/contact-activity-service.test.ts tests/worker/contact-pipeline.test.ts tests/worker/contact-service.test.ts
git commit -m "test: strengthen domain persistence boundaries"
```

---

### Task 8: Replace Predicate, Validation, Tag, and ICS Grab Bags With Contract Matrices

**Files:**
- Modify: `tests/worker/form-conditions.test.ts`
- Modify: `src/lib/form-conditions.ts`
- Modify: `widget/shared/form-conditions.ts`
- Modify: `tests/worker/tag-service.test.ts`
- Modify: `tests/worker/validation-event-type.test.ts`
- Modify: `tests/worker/ics.test.ts`

- [ ] **Step 1: Merge `when:any` and `when:all` into a truth table**

Use the same two rules and inputs for both modes:

```ts
test.each([
  ["any, first match", "any", { a: "x", b: "nope" }, true],
  ["any, no matches", "any", { a: "nope", b: "nope" }, false],
  ["all, both match", "all", { a: "x", b: "y" }, true],
  ["all, one misses", "all", { a: "x", b: "nope" }, false],
] as const)("%s", (_label, when, values, expected) => {
  expect(evaluateFormCondition({ when, rules }, { values, fieldsById: fields }))
    .toBe(expected);
});
```

- [ ] **Step 2: Replace representative SPA/widget parity with an operator matrix**

Cover every supported operator exactly once with the field shape that matters:

- scalar choice: `equals`, `not_equals`;
- multi-value choice: `is_one_of`, `is_not_one_of`;
- case-insensitive text: `contains`, `not_contains`;
- blank/nonblank: `exists`, `not_exists`;
- numeric boundaries: `gt`, `lt`, `gte`, `lte`;
- deleted source field;
- unknown operator arriving from untyped persisted JSON.

Once this matrix owns `equals` and multi-select `is_one_of`, delete their former
standalone test bodies so the rewrite does not create fresh duplication.

For every row, assert both evaluators equal the row’s expected result—not merely that they equal each other:

```ts
const spaResult = evaluateFormCondition(condition, inputs);
const widgetResult = widgetEvaluate(
  condition as WidgetFormCondition,
  inputs,
);
expect(spaResult).toBe(expected);
expect(widgetResult).toBe(expected);
```

- [ ] **Step 3: Make unknown operators fail closed**

The current `default` branch returns `true` in both evaluators. Change it to:

```ts
default:
  return false;
```

The unknown-operator row must be red before this production change and green afterward.

- [ ] **Step 4: Rewrite tag validation as labeled boundaries**

Use a table with exact parsed results or failure:

- create trims a valid name;
- create rejects whitespace-only name;
- update rejects an empty object;
- assignment rejects empty `tagId`;
- list trims search and coerces integer limit;
- list rejects zero, over-100, fractional, and malformed cursor values.

Do not keep unrelated assertions in one unlabeled test body.

- [ ] **Step 5: Separate tag scope from atomic uniqueness**

Create two service tests:

1. `scopes get and filterProjectTagIds to the requested project`.
2. `keeps an existing tag unchanged when a same-project rename conflicts`.

The second test must:

- create the same normalized name in another project and show it is legal there;
- attempt a conflicting rename in the original project;
- assert `TagNameConflictError`;
- reread the original tag and prove its name/color are unchanged.

Keep the existing pagination test separate because cursor order/search is a distinct contract.

- [ ] **Step 6: Consolidate event-type validation**

Use one table for:

- `maxPerDay: 0`;
- `maxPerWeek: 0`;
- `weekStart: "tuesday"`;
- valid lower boundary `1`;
- valid `monday` and `sunday`.

Each row identifies a schema boundary; do not retain the two one-assertion test bodies.

- [ ] **Step 7: Rewrite ICS tests around protocol behavior**

Add a small test-only unfolding helper:

```ts
function unfoldIcs(value: string): string[] {
  return value
    .split("\r\n")
    .reduce<string[]>((lines, line) => {
      if (line.startsWith(" ")) {
        lines[lines.length - 1] += line.slice(1);
      } else if (line.length > 0) {
        lines.push(line);
      }
      return lines;
    }, []);
}
```

Use three tests because they protect different interoperability failures:

1. REQUEST calendar: exact UID/DTSTAMP/DTSTART/DTEND, organizer, attendee, alarm, and one balanced VCALENDAR/VEVENT.
2. PUBLISH fallback: missing organizer or attendee produces `METHOD:PUBLISH` and no invalid attendee-only request.
3. Escaping/folding: commas, semicolons, backslashes, and newlines are escaped; injected CR/LF cannot create properties; every physical line is at most 75 UTF-8 octets; output uses CRLF and ends with CRLF.

Do not add a third-party parser solely for this test.

- [ ] **Step 8: Focused verification**

```bash
bun test tests/worker/form-conditions.test.ts tests/worker/tag-service.test.ts tests/worker/validation-event-type.test.ts tests/worker/ics.test.ts
bun run widget:build
```

- [ ] **Step 9: Commit**

```bash
git add src/lib/form-conditions.ts widget/shared/form-conditions.ts tests/worker/form-conditions.test.ts tests/worker/tag-service.test.ts tests/worker/validation-event-type.test.ts tests/worker/ics.test.ts
git commit -m "test: enforce predicate and protocol contracts"
```

---

### Task 9: Make API Documentation Tests Semantic

**Files:**
- Modify: `tests/worker/api-docs.test.ts`
- Create: `tests/api-docs-page.test.tsx`

- [ ] **Step 1: Replace parameter-order assertions with semantic sets**

Add:

```ts
function parameterNames(
  parameters: Array<Record<string, unknown>> | undefined,
): Set<string> {
  return new Set(
    (parameters ?? []).map((parameter) => String(parameter.name)),
  );
}
```

Assert Tags, Contacts, and Activities parameter-name sets. Keep request-body schema refs, response status contracts, and component schemas. Do not assert the generator’s array ordering.

- [ ] **Step 2: Delete the raw `Docs.tsx` source inspection**

Remove `documentation exposes the public API authentication entry points` from the worker test. Reading a source file can pass when the text exists only in a comment, dead branch, or unused constant.

- [ ] **Step 3: Add a rendered docs-page contract**

In `tests/api-docs-page.test.tsx`, render `Docs` inside `HelmetProvider` and `MemoryRouter`. Stub `requestAnimationFrame`, `cancelAnimationFrame`, and `scrollIntoView` in setup/teardown.

Assert:

```ts
expect(
  screen.getByText("Authorization: Bearer lc_live_...", { exact: true }),
).not.toBeNull();
expect(
  screen.getAllByRole("link", { name: /OpenAPI/i }).some(
    (link) => link.getAttribute("href") === "/openapi.json",
  ),
).toBe(true);
expect(
  screen.getAllByRole("link", { name: /llms\.txt/i }).some(
    (link) => link.getAttribute("href") === "/llms.txt",
  ),
).toBe(true);
expect(screen.queryByText(/Cookie: session=/)).toBeNull();
```

If duplicate visible auth examples make an exact query ambiguous, scope it to the `Endpoint Catalog` section with `within`; do not fall back to source text.

- [ ] **Step 4: Mutation-prove and verify**

Temporarily change the rendered OpenAPI link to `/openapi-old.json`; confirm the rendered test fails. Revert it. Then run:

```bash
bun test tests/worker/api-docs.test.ts tests/api-docs-page.test.tsx
bun run docs:check
```

- [ ] **Step 5: Commit**

```bash
git add tests/worker/api-docs.test.ts tests/api-docs-page.test.tsx
git commit -m "test: verify rendered API documentation contracts"
```

---

### Task 10: Whole-Suite Verification and Value Rescan

**Files:**
- Modify only if verification exposes a regression in files already in this plan.

- [ ] **Step 1: Check that all 42 audit dispositions were applied**

Search for the four removed test names and the implementation-coupled assertions:

```bash
rg -n "repairs a persisted retry after termination|form field values under metadata\\.formFields|deduplicates a booking response also linked|omits submitted form fields from guest confirmation" tests
rg -n "className.*ml-auto|parentElement|Bun\\.file\\(\"src/pages/Docs\\.tsx\"|screen\\.key|field-first|field-second|field-third" tests
```

Expected: no matches for removed tests or the audited implementation-coupled assertions. A legitimate fixture string match must be reviewed manually, not deleted blindly.

- [ ] **Step 2: Run static and artifact verification**

```bash
git diff --check
bun run lint
bun run docs:check
bun run widget:build
bun run build
```

- [ ] **Step 3: Run the complete suite once**

```bash
bun test
```

This full run is justified because the plan changes frontend, worker, widget parity, generated-doc contracts, and shared action signatures. Do not report the resulting test count as an achievement; report passing contracts and removals/replacements.

- [ ] **Step 4: Review every new or renamed test name**

For each changed test, answer:

1. What regression does this catch?
2. Which assertion fails if that regression is introduced?
3. Is a stronger existing test already guaranteed to fail?
4. Does this assert behavior rather than implementation?

Delete or merge any case without four satisfactory answers.

- [ ] **Step 5: Inspect the final diff and commits**

```bash
git status --short
git diff --stat HEAD~9..HEAD
git log --oneline -10
```

Confirm there are no temporary mutation changes, `.only`, `.skip`, placeholder assertions, snapshots added for bulk, or unrelated production edits:

```bash
rg -n "\\.(only|skip)\\(|TODO|FIXME|toBeTruthy\\(\\)|toBeDefined\\(\\)" tests
```

Review matches in context; `toBeDefined()` is allowed only when the defined value itself is the named contract.

- [ ] **Step 6: Commit any final in-scope correction**

Only if the rescan found an in-scope issue:

Stage only the corrected file paths printed by `git status --short`, with each
path written explicitly in the `git add` command, then commit with:

```bash
git commit -m "test: finish value audit remediation"
```

Do not create an empty “cleanup complete” commit.

## Deferred High-Value Gaps

The full scan also found real gaps that should not be hidden or filled with speculative tests in this cleanup. Each requires a separate design/implementation plan before adding tests:

1. Atomic booking-cap and slot reservation under concurrent creates.
2. Unsafe webhook success followed by final step-persistence failure.
3. Action-start marker rejection before commit.
4. Next Action natural-language ambiguity, past-time, timezone, and DST policy.
5. Additional MCP mutation-tool coverage selected by actual authorization or persistence risk.

Create those plans in that order. The cross-project booking transitions, past-confirmation corruption, guest/owner form privacy, unknown condition operator, and ICS interoperability are not deferred because this plan already has a precise contract and a bounded fix for each.

## Completion Criteria

- All 23 weak tests assert observable contracts.
- All 15 flagged redundant cases, plus the 2 operator examples made redundant by the new parity matrix, are folded into stronger scenarios or labeled truth tables.
- All 4 no-signal tests are gone, with the privacy contract replaced at the correct integration seam.
- Past confirmation cannot mutate a booking.
- Cancel, confirm, and decline cannot mutate another project’s booking.
- Unknown persisted form-condition operators fail closed in both SPA and widget evaluators.
- Contact details cannot expose a tag owned by another project, even if a malformed assignment row exists.
- No audited test asserts Tailwind layout, DOM ancestry, internal screen keys, raw source strings, or non-contractual parameter order.
- Focused checks, lint, generated docs, widget build, production build, and the final whole suite pass.
- The final report discusses contracts strengthened and defects fixed, not the number of tests.

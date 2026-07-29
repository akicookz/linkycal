# Contact Pipeline and UI Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct booking activity labels, Kanban deadline ordering and stage persistence, Analytics Select alignment, and the PostHog settings layout.

**Architecture:** Keep presentation fixes at the existing React component boundaries. Put deadline ordering in the contact list contract before pagination, and put the project-wide pipeline-step invariant in `TagService`, the shared write boundary used by dashboard, REST, MCP, and workflow assignments. Add a data-only D1 migration for existing duplicates and reconcile contacts whenever Kanban step configuration changes.

**Tech Stack:** Bun, React 19, TypeScript, Hono, Drizzle ORM, Cloudflare D1/SQLite, TanStack Query, Radix Select, Tailwind CSS v4, Bun test, Testing Library.

## Global Constraints

- Use Bun commands only; do not use npm or Yarn.
- Use function declarations for named functions and React components.
- Ordinary contact tags remain many-to-many.
- Only tags referenced by `pivotTagIds` in a project Kanban view are pipeline-step tags.
- A contact may persist at most one project pipeline-step tag.
- Stage ordering is earliest deadline first, followed by undated contacts.
- Booking activity becomes absolute at exactly 24 hours after the booking ends.
- PostHog persists the existing `us` and `eu` values.
- Do not add styling-class, DOM-ancestry, source-text, or snapshot assertions.
- Every production behavior test must be observed failing for the intended reason before implementation.
- Do not apply migrations or deploy to production.
- All buttons retain icon plus text and loading icons replace, rather than accompany, their normal icons.

---

## File Structure

### New files

- `tests/critical/dashboard-activity.test.ts` — protects the visible 24-hour booking-label boundary.
- `tests/critical/contact-pipeline.test.ts` — protects deadline ordering, stage exclusivity, configuration reconciliation, and the data migration.
- `worker/db/drizzle/0034_reconcile_contact_pipeline_stages.sql` — data-only cleanup of existing duplicate step tags; create it with Drizzle's custom-migration command so the journal entry is generated consistently.

### Modified files

- `src/components/ActivityCard.tsx` — formats old booking labels as absolute dates.
- `src/pages/ContactsKanban.tsx` — requests deadline sorting for every stage page.
- `worker/index.ts` — accepts the allowlisted contact sort and derives stage membership server-side.
- `worker/services/contact-service.ts` — sorts the complete filtered contact collection before slicing pages and reconciles after pipeline configuration changes.
- `worker/services/tag-service.ts` — resolves project step tags and enforces/reconciles the one-stage invariant.
- `worker/validation.ts` — removes the client-supplied stage group from the internal stage payload.
- `src/pages/Contacts.tsx` — sends only the target stage, removes all known project step tags optimistically, and refreshes contacts after step configuration changes.
- `tests/support/test-db.ts` — can apply a bounded or remaining range of real production migrations for the migration regression.
- `src/components/ui/select.tsx` — truncates Select content without replacing a flex wrapper's display mode.
- `src/pages/Analytics.tsx` — makes the period icon/label wrapper explicitly single-line and shrink-safe.
- `src/components/analytics/AnalyticsIntegrationCard.tsx` — lays out PostHog key and region inline with compact flag labels.
- `tests/analytics-settings.test.tsx` — protects the accessible PostHog region copy and unchanged save payload.
- `worker/db/drizzle/meta/_journal.json` — updated by the custom migration generator.

---

### Task 1: Replace multi-day booking hours with dates

**Files:**
- Create: `tests/critical/dashboard-activity.test.ts`
- Modify: `src/components/ActivityCard.tsx:45-99`

**Interfaces:**
- Consumes: `getRelativeTime(startTime: string, endTime: string)`.
- Produces: the same return shape with absolute past labels at `>= 24h`.

- [ ] **Step 1: Write the failing visible-label test**

```typescript
import { afterEach, describe, expect, test } from "bun:test";

import { getRelativeTime } from "../../src/components/ActivityCard";
import {
  restoreRealTime,
  setFixedTime,
} from "../support/fixed-time";

afterEach(function restoreClock() {
  restoreRealTime();
});

describe("dashboard booking activity labels", function () {
  test("bookings switch from elapsed hours to calendar dates after 24 hours", function () {
    setFixedTime("2026-07-29T12:00:00");

    const cases = [
      {
        name: "inside the relative window",
        start: "2026-07-28T11:31:00",
        end: "2026-07-28T12:01:00",
        want: "11:31 AM (23h 59m ago)",
      },
      {
        name: "at the absolute boundary",
        start: "2026-07-28T11:30:00",
        end: "2026-07-28T12:00:00",
        want: "Jul 28, 11:30 AM",
      },
      {
        name: "from a different year",
        start: "2025-12-31T08:30:00",
        end: "2025-12-31T09:00:00",
        want: "Dec 31, 2025, 8:30 AM",
      },
    ] as const;

    for (const scenario of cases) {
      expect(
        getRelativeTime(scenario.start, scenario.end).label,
        scenario.name,
      ).toBe(scenario.want);
    }
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
bun test tests/critical/dashboard-activity.test.ts
```

Expected: FAIL at the 24-hour case because the current label is
`11:30 AM (24h ago)`.

- [ ] **Step 3: Implement the absolute past branch**

In `getRelativeTime`, build `dateStr` from the booking start. Include `year:
"numeric"` only when the booking start year differs from the fixed/current
year. Keep the existing relative calculation when `diffMs < 86_400_000`; for
older bookings return `${dateStr}, ${timeStr}`.

```typescript
const startDate = new Date(startTime);
const nowDate = new Date(now);
const dateStr = startDate.toLocaleDateString("en-US", {
  month: "short",
  day: "numeric",
  ...(startDate.getFullYear() !== nowDate.getFullYear()
    ? { year: "numeric" as const }
    : {}),
});

if (diffMs >= 86_400_000) {
  return {
    label: `${dateStr}, ${timeStr}`,
    isHappening: false,
    isUpcoming: false,
    isPast: true,
  };
}
```

- [ ] **Step 4: Run focused and critical tests**

Run:

```bash
bun test tests/critical/dashboard-activity.test.ts
bun run test:critical
```

Expected: PASS with no new warnings.

- [ ] **Step 5: Commit the booking-label correction**

```bash
git add tests/critical/dashboard-activity.test.ts src/components/ActivityCard.tsx
git commit -m "fix: show dates for old booking activity"
```

---

### Task 2: Sort Kanban stages by due date before pagination

**Files:**
- Create: `tests/critical/contact-pipeline.test.ts`
- Modify: `worker/services/contact-service.ts:24-42,100-225`
- Modify: `worker/index.ts:5068-5145`
- Modify: `src/pages/ContactsKanban.tsx:102-132`

**Interfaces:**
- Produces: `ContactListOptions.sort?: "nextActionDeadline"`.
- Consumes: `GET /api/projects/:projectId/contacts?sort=nextActionDeadline`.
- Preserves: default created-date ordering when `sort` is absent.

- [ ] **Step 1: Write the failing paginated-order scenario**

Create a migration-backed fixture with one project, one `Lead` tag, and five
contacts assigned to that tag. Persist deadlines as literal dates:

```typescript
const deadlineContacts = [
  {
    id: "contact-overdue-old",
    deadline: new Date("2026-07-20T09:00:00.000Z"),
  },
  {
    id: "contact-overdue-recent",
    deadline: new Date("2026-07-28T09:00:00.000Z"),
  },
  {
    id: "contact-upcoming",
    deadline: new Date("2026-07-30T09:00:00.000Z"),
  },
  { id: "contact-undated-a", deadline: null },
  { id: "contact-undated-b", deadline: null },
] as const;
```

Give every dated contact a non-empty `nextActionText`, insert all five
`contact_tags` assignments, and call:

```typescript
const sortOptions = {
  stageTagId: "tag-lead",
  sort: "nextActionDeadline",
} as Parameters<ContactService["listPage"]>[1];

const first = await service.listPage(PROJECT_ID, sortOptions, {
  limit: 2,
  offset: 0,
});
const second = await service.listPage(PROJECT_ID, sortOptions, {
  limit: 2,
  offset: 2,
});
const third = await service.listPage(PROJECT_ID, sortOptions, {
  limit: 2,
  offset: 4,
});

expect(
  [first, second, third].flatMap(function contactIds(page) {
    return page.contacts.map(function contactId(contact) {
      return contact.id;
    });
  }),
).toEqual([
  "contact-overdue-old",
  "contact-overdue-recent",
  "contact-upcoming",
  "contact-undated-a",
  "contact-undated-b",
]);
```

Use contact IDs as the literal tie-break expectation for undated contacts.

- [ ] **Step 2: Run the scenario and verify RED**

Run:

```bash
bun test tests/critical/contact-pipeline.test.ts
```

Expected: FAIL because the existing service ignores `sort` and returns contacts
by descending creation time.

- [ ] **Step 3: Add the server-side sort contract**

Add the option:

```typescript
export interface ContactListOptions {
  // existing filters
  sort?: "nextActionDeadline";
}
```

Before returning from `ContactService.list`, sort the fully filtered rows:

```typescript
if (opts?.sort === "nextActionDeadline") {
  rows.sort(function sortByNextActionDeadline(left, right) {
    const leftDeadline = left.nextActionDeadline?.getTime();
    const rightDeadline = right.nextActionDeadline?.getTime();
    const leftValid = leftDeadline !== undefined &&
      Number.isFinite(leftDeadline);
    const rightValid = rightDeadline !== undefined &&
      Number.isFinite(rightDeadline);
    if (!leftValid && !rightValid) return left.id.localeCompare(right.id);
    if (!leftValid) return 1;
    if (!rightValid) return -1;
    return leftDeadline - rightDeadline ||
      left.id.localeCompare(right.id);
  });
}
```

Parse only the allowlisted query value in the contact route:

```typescript
const sort = url.searchParams.get("sort");

// in ContactListOptions
sort: sort === "nextActionDeadline"
  ? "nextActionDeadline"
  : undefined,
```

Add the sort to every Kanban stage page:

```typescript
params.set("sort", "nextActionDeadline");
```

- [ ] **Step 4: Run the owning test and verify GREEN**

Run:

```bash
bun test tests/critical/contact-pipeline.test.ts
```

Expected: PASS, including page boundaries and undated ordering.

- [ ] **Step 5: Run the full critical suite**

Run:

```bash
bun run test:critical
```

Expected: PASS.

- [ ] **Step 6: Commit deadline ordering**

```bash
git add tests/critical/contact-pipeline.test.ts worker/services/contact-service.ts worker/index.ts src/pages/ContactsKanban.tsx
git commit -m "fix: sort pipeline contacts by due date"
```

---

### Task 3: Enforce one project pipeline stage

**Files:**
- Modify: `tests/critical/contact-pipeline.test.ts`
- Modify: `tests/support/test-db.ts`
- Modify: `worker/services/tag-service.ts:1-485`
- Modify: `worker/services/contact-service.ts:580-613,742-816`
- Modify: `worker/index.ts:5709-5741`
- Modify: `worker/validation.ts:543-546`
- Modify: `src/pages/Contacts.tsx:560-585,890-950,1075-1100`
- Create: `worker/db/drizzle/0034_reconcile_contact_pipeline_stages.sql`
- Modify: `worker/db/drizzle/meta/_journal.json`

**Interfaces:**
- Produces: `TagService.listPipelineStageTagIds(projectId: string): Promise<string[]>`.
- Produces: `TagService.clearPipelineStage(projectId: string, contactId: string): Promise<boolean>`.
- Produces: `TagService.reconcilePipelineStageAssignments(projectId: string): Promise<void>`.
- Changes: `ContactService.setStage(projectId: string, contactId: string, tagId: string | null): Promise<void>`.
- Changes: `POST /contacts/:contactId/stage` body to `{ tagId: string | null }`.

- [ ] **Step 1: Add the failing runtime-invariant scenario**

Extend the contact pipeline fixture with `Lead`, `Follow up`, and ordinary
`VIP` tags plus two contacts. Persist a Kanban view whose config is:

```typescript
{
  pivotTagIds: ["tag-lead", "tag-follow-up"],
  showUntagged: true,
}
```

Exercise real services:

```typescript
const tags = new TagService(testDatabase.db);
const contacts = new ContactService(testDatabase.db);

await tags.assignToContact(PROJECT_ID, "contact-current", "tag-vip");
await tags.assignToContact(PROJECT_ID, "contact-current", "tag-lead");
await tags.assignToContact(
  PROJECT_ID,
  "contact-current",
  "tag-follow-up",
);

expect(
  (await contacts.getContactTags("contact-current", PROJECT_ID))
    .map(function tagId(tag) {
      return tag.id;
    })
    .sort(),
).toEqual(["tag-follow-up", "tag-vip"]);
```

Insert both step tags and `VIP` directly for `contact-legacy`. Insert literal
`tag_added` activity at `2026-07-20T09:00:00.000Z` for Lead and
`2026-07-28T09:00:00.000Z` for Follow up. Update the Kanban view with the same
config and assert the legacy contact retains Follow up plus VIP.

Finally call:

```typescript
await contacts.setStage(PROJECT_ID, "contact-current", null);
```

and assert `contact-current` retains only `tag-vip`.

- [ ] **Step 2: Run the invariant scenario and verify RED**

Run:

```bash
bun test tests/critical/contact-pipeline.test.ts
```

Expected: FAIL because direct tag assignment does not remove another pipeline
step and `setStage` still trusts a client-provided group.

- [ ] **Step 3: Resolve canonical project step tags in `TagService`**

Reuse the file's recursive `normalizeJson` helper. Add:

```typescript
function pipelineTagIdsFromConfig(value: unknown): string[] {
  const normalized = normalizeJson(value);
  if (
    !normalized ||
    typeof normalized !== "object" ||
    Array.isArray(normalized)
  ) {
    return [];
  }
  const ids = (normalized as Record<string, unknown>).pivotTagIds;
  if (!Array.isArray(ids)) return [];
  return ids.filter(function isTagId(id): id is string {
    return typeof id === "string" && id.length > 0;
  });
}
```

Implement `listPipelineStageTagIds` by selecting project Kanban views,
collecting their normalized `pivotTagIds`, filtering them through project-owned
tags in D1-safe chunks of 90, de-duplicating them, and returning lexical order.
Malformed config contributes no IDs.

- [ ] **Step 4: Enforce exclusivity for every shared assignment**

In `assignToContact`, after project ownership checks and before `addTag`, resolve
the canonical stage set. When the target is in that set, find assigned peer
steps and call the existing `removeTag` for each so `tag_removed` activity is
preserved. Then call `addTag` for the requested tag. Return `changed` from the
target `addTag`, not from peer cleanup, so reassigning an existing target does
not emit a false `tag_added` workflow trigger.

Implement:

```typescript
async clearPipelineStage(
  projectId: string,
  contactId: string,
): Promise<boolean>
```

It validates contact ownership, removes every currently assigned canonical
step with `removeTag`, leaves ordinary tags untouched, and returns whether any
step assignment changed.

- [ ] **Step 5: Reconcile after Kanban configuration changes**

Implement `reconcilePipelineStageAssignments(projectId)`:

1. resolve canonical project step IDs;
2. fetch matching assignments joined to project contacts in D1-safe chunks;
3. group assignments by contact;
4. for groups with more than one step, load `tag_added` activities for those
   contacts;
5. retain the newest assignment;
6. on missing/equal timestamps retain the lexicographically smallest tag ID;
7. remove other assignments through `removeTag`.

Call reconciliation after a Kanban `createView`, and after `updateView` when
`config` or `type` changes. Do not run it for a rename-only update.

- [ ] **Step 6: Make stage moves server-derived**

Change `ContactService.setStage` to:

```typescript
async setStage(
  projectId: string,
  contactId: string,
  tagId: string | null,
): Promise<void> {
  if (tagId) {
    const result = await this.tagService.assignToContact(
      projectId,
      contactId,
      tagId,
    );
    if (result.status !== "ok") {
      throw new Error(`Failed to set contact stage: ${result.status}`);
    }
    return;
  }
  await this.tagService.clearPipelineStage(projectId, contactId);
}
```

Change `setStageSchema` to accept only `tagId`. In the route, retain contact and
target-tag ownership responses, remove `groupTagIds` filtering, and call:

```typescript
await service.setStage(projectId, contactId, data.tagId);
```

- [ ] **Step 7: Update optimistic dashboard state**

In `Contacts.tsx`, derive all known project step IDs from every `savedViews`
entry whose type is `kanban`, then union the active `config.pivotTagIds` so a
newly added step is covered while its serialized view save is still pending.
Remove `groupTagIds` from the stage mutation variables and request body. During
`onMutate`, remove every tag in the derived project step set from the contact,
then append the optimistic target.

After a pipeline view save succeeds, invalidate project contact queries because
the server may have reconciled duplicate assignments.

- [ ] **Step 8: Verify runtime GREEN**

Run:

```bash
bun test tests/critical/contact-pipeline.test.ts
```

Expected: PASS for direct assignment, config reconciliation, ordinary-tag
preservation, and Untagged.

- [ ] **Step 9: Add staged migration support to the test database**

Refactor `tests/support/test-db.ts` so migration execution is reusable:

```typescript
export interface MigrationRange {
  through?: string;
  after?: string;
}

export function applyProductionMigrations(
  sqlite: Database,
  range: MigrationRange = {},
): void
```

Filter the sorted `.sql` filenames with inclusive `through` and exclusive
`after` semantics, then execute the same statement-breakpoint splitting already
used by `createTestDb`. Let `createTestDb(range?: MigrationRange)` call the
helper before creating Drizzle.

- [ ] **Step 10: Write the failing migration effect test**

Create a test database through `0033_persist_booking_calendar_identity.sql`,
seed the project, normal and double-encoded Kanban configs, tags, activities,
and duplicate assignments, then call:

```typescript
applyProductionMigrations(testDatabase.sqlite, {
  after: "0033_persist_booking_calendar_identity.sql",
});
```

Assert the newer step tag remains and the ordinary tag remains. Before the
custom migration exists, the call applies no remaining files and the
persistence assertion must FAIL rather than throw.

- [ ] **Step 11: Generate and fill the data-only migration**

Run:

```bash
bun run db:generate --custom --name reconcile_contact_pipeline_stages
```

Expected: Drizzle creates
`worker/db/drizzle/0034_reconcile_contact_pipeline_stages.sql` and adds journal
index 34.

Use JSON1 and a window rank. Normalize normal object configs and valid
double-encoded configs, join extracted `pivotTagIds` back to project-owned
tags, rank each contact's assigned step tags by newest matching `tag_added`
activity then ascending tag ID, and delete ranks greater than one:

```sql
WITH `normalized_views` AS (
  SELECT
    `project_id`,
    CASE
      WHEN json_valid(`config`) = 0 THEN NULL
      WHEN json_type(`config`) = 'text'
        AND json_valid(json_extract(`config`, '$')) = 1
        THEN json_extract(`config`, '$')
      ELSE `config`
    END AS `config`
  FROM `contact_views`
  WHERE `type` = 'kanban' AND `config` IS NOT NULL
),
`stage_tags` AS (
  SELECT DISTINCT
    `normalized_views`.`project_id` AS `project_id`,
    `pivot`.`value` AS `tag_id`
  FROM `normalized_views`
  JOIN json_each(`normalized_views`.`config`, '$.pivotTagIds') AS `pivot`
  JOIN `tags`
    ON `tags`.`id` = `pivot`.`value`
    AND `tags`.`project_id` = `normalized_views`.`project_id`
  WHERE
    `normalized_views`.`config` IS NOT NULL
    AND json_type(
      `normalized_views`.`config`,
      '$.pivotTagIds'
    ) = 'array'
),
`ranked_assignments` AS (
  SELECT
    `contact_tags`.`contact_id` AS `contact_id`,
    `contact_tags`.`tag_id` AS `tag_id`,
    row_number() OVER (
      PARTITION BY `contact_tags`.`contact_id`
      ORDER BY
        coalesce((
          SELECT max(`contact_activity`.`created_at`)
          FROM `contact_activity`
          WHERE
            `contact_activity`.`contact_id` =
              `contact_tags`.`contact_id`
            AND `contact_activity`.`type` = 'tag_added'
            AND `contact_activity`.`reference_id` =
              `contact_tags`.`tag_id`
        ), 0) DESC,
        `contact_tags`.`tag_id` ASC
    ) AS `stage_rank`
  FROM `contact_tags`
  JOIN `contacts`
    ON `contacts`.`id` = `contact_tags`.`contact_id`
  JOIN `stage_tags`
    ON `stage_tags`.`project_id` = `contacts`.`project_id`
    AND `stage_tags`.`tag_id` = `contact_tags`.`tag_id`
)
DELETE FROM `contact_tags`
WHERE EXISTS (
  SELECT 1
  FROM `ranked_assignments`
  WHERE
    `ranked_assignments`.`stage_rank` > 1
    AND `ranked_assignments`.`contact_id` =
      `contact_tags`.`contact_id`
    AND `ranked_assignments`.`tag_id` = `contact_tags`.`tag_id`
);
```

- [ ] **Step 12: Run migration and runtime tests**

Run:

```bash
bun test tests/critical/contact-pipeline.test.ts
bun run db:migrate:dev
```

Expected: the migration effect test passes and local D1 applies migration 0034.
Do not run `db:migrate:prod`.

- [ ] **Step 13: Run all tests and commit the invariant**

Run:

```bash
bun run test
```

Expected: PASS.

Then:

```bash
git add tests/critical/contact-pipeline.test.ts tests/support/test-db.ts worker/services/tag-service.ts worker/services/contact-service.ts worker/index.ts worker/validation.ts src/pages/Contacts.tsx worker/db/drizzle/0034_reconcile_contact_pipeline_stages.sql worker/db/drizzle/meta/_journal.json
git commit -m "fix: enforce one contact pipeline stage"
```

---

### Task 4: Keep Select content inline and compact PostHog controls

**Files:**
- Modify: `tests/analytics-settings.test.tsx:116-150`
- Modify: `src/components/ui/select.tsx:11-31`
- Modify: `src/pages/Analytics.tsx:903-913`
- Modify: `src/components/analytics/AnalyticsIntegrationCard.tsx:78-177`

**Interfaces:**
- Preserves: `aria-label="PostHog project key"` and
  `aria-label="PostHog region"`.
- Preserves: save payload `{ provider: "posthog", enabled, projectKey, host }`.
- Changes visible region text to `🇺🇸 US` and `🇪🇺 EU`.

- [ ] **Step 1: Strengthen the existing PostHog behavior test**

In the existing Pro provider scenario, assert the selected value and menu
choices:

```typescript
const region = screen.getByLabelText("PostHog region");
expect(region.textContent).toContain("🇪🇺 EU");

const user = userEvent.setup();
await user.click(region);
expect(
  await screen.findByRole("option", { name: "🇺🇸 US" }),
).toBeTruthy();
expect(
  screen.getByRole("option", { name: "🇪🇺 EU" }),
).toBeTruthy();
```

Keep the existing provider-specific accessible input and save-payload
assertions.

- [ ] **Step 2: Run the settings test and verify RED**

Run:

```bash
bun test tests/analytics-settings.test.tsx
```

Expected: FAIL because the current selected label is `European Union`.

- [ ] **Step 3: Fix shared Select truncation without changing display**

Replace:

```typescript
[&>span]:line-clamp-1
```

with:

```typescript
[&>span]:min-w-0 [&>span]:truncate
```

This preserves any direct child's `flex` display while retaining single-line
overflow handling.

- [ ] **Step 4: Make the Analytics period wrapper shrink-safe**

Use:

```tsx
<span className="flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap">
  <CalendarRange className="size-4 shrink-0 text-muted-foreground" />
  <SelectValue className="truncate" />
</span>
```

The trigger stays 155px wide and retains the existing chevron and focus
behavior.

- [ ] **Step 5: Build the responsive PostHog field grid**

For non-PostHog providers, retain the current identifier field. For PostHog,
render:

```tsx
<div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
  <div className="space-y-2">
    <label className="text-sm font-medium" htmlFor="posthog-id">
      Project key
    </label>
    <Input
      id="posthog-id"
      aria-label="PostHog project key"
      value={identifier}
      onChange={function updateProjectKey(event) {
        setIdentifier(event.target.value);
      }}
      placeholder="phc_..."
      autoComplete="off"
    />
    <p className="text-pretty text-xs text-muted-foreground">
      This is public client configuration, not a secret.
    </p>
  </div>
  <div className="space-y-2">
    <label className="text-sm font-medium" htmlFor="posthog-region">
      Data region
    </label>
    <Select
      value={host}
      onValueChange={function updateHost(value) {
        setHost(value as "us" | "eu");
      }}
    >
      <SelectTrigger
        id="posthog-region"
        aria-label="PostHog region"
        className="min-h-10"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="us">🇺🇸 US</SelectItem>
        <SelectItem value="eu">🇪🇺 EU</SelectItem>
      </SelectContent>
    </Select>
  </div>
</div>
```

Do not duplicate the helper copy below the grid. The Save button remains below
the field group with its current icon/loading behavior.

- [ ] **Step 6: Run focused UI tests**

Run:

```bash
bun test tests/analytics-settings.test.tsx
bun test tests/analytics-dashboard.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit the UI corrections**

```bash
git add tests/analytics-settings.test.tsx src/components/ui/select.tsx src/pages/Analytics.tsx src/components/analytics/AnalyticsIntegrationCard.tsx
git commit -m "fix: align analytics controls"
```

---

### Task 5: Browser and repository verification

**Files:**
- Verify all modified files.
- Modify only the owning file if verification exposes a real defect.

**Interfaces:**
- Consumes: completed Tasks 1-4.
- Produces: evidence that automated and responsive visual contracts pass.

- [ ] **Step 1: Invoke the required verification skills**

Read and follow:

- `superpowers:verification-before-completion`;
- `browser:control-in-app-browser`;
- `superpowers:requesting-code-review`.

Do not claim success before fresh command output and browser evidence exist.

- [ ] **Step 2: Start the local application**

Run:

```bash
bun run dev
```

Expected: Vite serves LinkyCal at `http://localhost:3001`.

- [ ] **Step 3: Verify Analytics period alignment**

Open the Analytics Bookings tab at a desktop viewport. Confirm:

- the calendar icon and `Last 30 days` share one row;
- the trigger remains 40px high;
- the label truncates rather than wrapping at narrower widths;
- keyboard focus and the chevron remain visible.

- [ ] **Step 4: Verify PostHog responsive layout**

Open Settings analytics integrations. At desktop width confirm:

- `Project key` and `Data region` share one row;
- the key input is wider than the region selector;
- the selected region includes its flag and compact `US` or `EU` copy;
- Save remains below the row.

At a narrow mobile viewport confirm both fields stack without clipping and the
region menu remains operable.

- [ ] **Step 5: Verify representative contact and activity output**

Open a populated Kanban pipeline and confirm:

- deadlines appear oldest overdue, later deadlines, then undated;
- one contact is not rendered in two stage columns;
- ordinary non-step tags still appear on the contact detail;
- an old booking activity displays a month/day label rather than hundreds of
  hours.

- [ ] **Step 6: Run fresh full verification**

Run:

```bash
bun run test
bun run lint
bun run build
git diff --check
git status --short
```

Expected: every command exits 0, no new warnings are introduced, and status
contains only intentional task files or is clean after task commits.

- [ ] **Step 7: Review the complete diff**

Review:

```bash
git diff e5e229d..HEAD --stat
git diff e5e229d..HEAD
```

Confirm no unrelated files changed, no production migration was applied, no
secret entered the diff, and each acceptance criterion maps to test or browser
evidence.

# Per-Day / Per-Week Booking Limits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a host cap how many calls an event type accepts per day and per week — counting `pending` + `confirmed` bookings, ignoring `cancelled`/`rescheduled`/`declined` — enforced on the booking page and at booking creation, and configurable in the UI.

**Architecture:** Caps live on the `eventTypes` row (`maxPerDay` already exists; add `maxPerWeek` and `weekStart`). `AvailabilityService` gates a schedule-tz day/week by counting existing pending+confirmed bookings and returning no slots once the cap is reached. Booking creation inherits enforcement through its existing "is this slot still available?" re-check, plus an explicit count check that returns a clear "fully booked" error. The React form gains a "Booking limits" section.

**Tech Stack:** Cloudflare Workers + Hono, Drizzle ORM (D1/SQLite), Zod validation, React + TanStack Query, Bun test runner, date-fns-tz for timezone math.

## Global Constraints

- `verbatimModuleSyntax: true` — type-only imports MUST use `import type` or the build fails.
- Never hand-write Drizzle SQL migrations. Change `worker/db/schema.ts`, then run `bun run db:generate`, then `bun run db:migrate:dev`.
- Counting rule (used everywhere): a booking counts toward a limit when `status ∈ {"pending","confirmed"}`. Ignore `"cancelled"`, `"rescheduled"`, `"declined"`.
- Day and week boundaries are computed in the **host's schedule timezone**, never the booker's.
- Booking status values are: `confirmed | cancelled | rescheduled | pending | declined`.
- Follow existing code conventions (function declarations, named services per domain, thin routes). UI follows existing form conventions (the buffers grid + card-style rows already in `EventTypeForm.tsx`).
- Test runner: `bun test <file>`; filter: `bun test -t "<name>"`.

---

### Task 1: `getWeekRangeForLocalDate` timezone helper

**Files:**
- Modify: `worker/lib/timezone.ts`
- Test: `tests/worker/timezone.test.ts`

**Interfaces:**
- Consumes: existing `getDayOfWeekForDate(dateStr, timezone)` (returns 0=Sun..6=Sat), `shiftDateString(dateStr, days)`, `localTimeToUtc(dateStr, timeStr, timezone)`.
- Produces: `getWeekRangeForLocalDate(dateStr: string, timezone: string, weekStart: "monday" | "sunday"): { start: Date; end: Date }` — the UTC instants bounding the 7-day week (in `timezone`) that contains `dateStr`. `start` is inclusive, `end` is exclusive (start of the following week).

- [ ] **Step 1: Write the failing test**

Add `getWeekRangeForLocalDate` to the existing import from `../../worker/lib/timezone` in `tests/worker/timezone.test.ts`, then append this block:

```ts
describe("getWeekRangeForLocalDate", () => {
  // 2026-06-24 is a Wednesday.
  test("monday-start week runs Mon 00:00 to next Mon 00:00 (UTC)", () => {
    const range = getWeekRangeForLocalDate("2026-06-24", "UTC", "monday");
    expect(range.start.toISOString()).toBe("2026-06-22T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-06-29T00:00:00.000Z");
  });

  test("sunday-start week runs Sun 00:00 to next Sun 00:00 (UTC)", () => {
    const range = getWeekRangeForLocalDate("2026-06-24", "UTC", "sunday");
    expect(range.start.toISOString()).toBe("2026-06-21T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-06-28T00:00:00.000Z");
  });

  test("a date that is itself the week start maps to a week starting that day", () => {
    // 2026-06-22 is a Monday.
    const range = getWeekRangeForLocalDate("2026-06-22", "UTC", "monday");
    expect(range.start.toISOString()).toBe("2026-06-22T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-06-29T00:00:00.000Z");
  });

  test("boundaries are anchored in the schedule timezone, not UTC", () => {
    // America/New_York is UTC-4 on this date, so local midnight is 04:00Z.
    const range = getWeekRangeForLocalDate("2026-06-24", "America/New_York", "monday");
    expect(range.start.toISOString()).toBe("2026-06-22T04:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-06-29T04:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/worker/timezone.test.ts -t "getWeekRangeForLocalDate"`
Expected: FAIL — `getWeekRangeForLocalDate is not a function` (or import error).

- [ ] **Step 3: Implement the helper**

In `worker/lib/timezone.ts`, add this function (place it just after `getUtcRangeForLocalDate`):

```ts
export function getWeekRangeForLocalDate(
  dateStr: string,
  timezone: string,
  weekStart: "monday" | "sunday",
): { start: Date; end: Date } {
  const dayOfWeek = getDayOfWeekForDate(dateStr, timezone); // 0=Sun..6=Sat
  const offset = weekStart === "monday" ? (dayOfWeek + 6) % 7 : dayOfWeek;
  const weekStartDate = shiftDateString(dateStr, -offset);
  return {
    start: localTimeToUtc(weekStartDate, "00:00", timezone),
    end: localTimeToUtc(shiftDateString(weekStartDate, 7), "00:00", timezone),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/worker/timezone.test.ts -t "getWeekRangeForLocalDate"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add worker/lib/timezone.ts tests/worker/timezone.test.ts
git commit -m "feat(timezone): getWeekRangeForLocalDate helper for weekly booking caps"
```

---

### Task 2: Schema columns + migration

**Files:**
- Modify: `worker/db/schema.ts:206` (the `eventTypes` table)
- Create: `worker/db/drizzle/<generated>.sql` (via `bun run db:generate` — do NOT hand-write)

**Interfaces:**
- Produces: `dbSchema.EventTypeRow` now includes `maxPerWeek: number | null` and `weekStart: string` (the DB returns `"monday"` or `"sunday"`). Later tasks read `eventType.maxPerWeek` and `eventType.weekStart`.

- [ ] **Step 1: Add the columns to the schema**

In `worker/db/schema.ts`, find the `maxPerDay` line inside `eventTypes` (currently line 206):

```ts
    maxPerDay: integer("max_per_day"),
```

Replace it with:

```ts
    maxPerDay: integer("max_per_day"),
    maxPerWeek: integer("max_per_week"),
    weekStart: text("week_start").notNull().default("monday"),
```

- [ ] **Step 2: Generate the migration**

Run: `bun run db:generate`
Expected: a new file appears under `worker/db/drizzle/` containing
`ALTER TABLE \`event_types\` ADD \`max_per_week\` integer;` and
`ALTER TABLE \`event_types\` ADD \`week_start\` text DEFAULT 'monday' NOT NULL;`.

- [ ] **Step 3: Apply locally**

Run: `bun run db:migrate:dev`
Expected: migration applies with no error.

- [ ] **Step 4: Verify migrations still load cleanly into the in-memory test DB**

`tests/worker/mcp-test-db.ts` rebuilds an in-memory SQLite from every migration file; an invalid migration breaks it. Run a test that uses it:

Run: `bun test tests/worker/booking-actions.test.ts`
Expected: PASS (existing suite) — proves the generated SQL is valid and replays cleanly.

- [ ] **Step 5: Commit**

```bash
git add worker/db/schema.ts worker/db/drizzle
git commit -m "feat(db): add maxPerWeek and weekStart to event_types"
```

---

### Task 3: AvailabilityService — count + gate day/week

**Files:**
- Modify: `worker/services/availability-service.ts`
- Test: `tests/worker/availability-service.test.ts`

**Interfaces:**
- Consumes: `getWeekRangeForLocalDate` (Task 1); existing `getUtcRangeForLocalDate`; `dbSchema.EventTypeRow.maxPerWeek` / `.weekStart` (Task 2).
- Produces:
  - `AvailabilityService.countBookingsInRange(eventTypeId: string, start: Date, end: Date): Promise<number>` — count of pending+confirmed bookings whose `startTime ∈ [start, end)`. Used by Task 6.
  - `AvailabilityService.resolveSchedule(projectId: string, eventType: dbSchema.EventTypeRow): Promise<dbSchema.ScheduleRow | undefined>` — the event type's schedule, falling back to project default then first. Used by Task 6.
  - `getAvailableSlots` now returns `[]` for a day whose schedule-tz day or week is at/over the cap.

- [ ] **Step 1: Write the failing tests**

Replace the import block at the top of `tests/worker/availability-service.test.ts` (currently lines 1-7) with:

```ts
import { describe, expect, test } from "bun:test";

import {
  formatDateInTimezone,
  formatTimeInTimezone,
  getDayOfWeekForDate,
} from "../../worker/lib/timezone";
import {
  AvailabilityService,
  buildSlotsForWindow,
} from "../../worker/services/availability-service";
import * as dbSchema from "../../worker/db/schema";
import { createTestDb } from "./mcp-test-db";
```

Then append this block at the end of the file:

```ts
type BookingStatus = "confirmed" | "pending" | "cancelled" | "rescheduled" | "declined";

// Seeds one project/schedule/rule/event-type. The schedule is UTC and open
// 09:00–17:00 on the weekday of a date ~60 days out, so generated slots are
// always in the future regardless of when the suite runs.
async function seedEventType(opts: {
  maxPerDay?: number | null;
  maxPerWeek?: number | null;
  weekStart?: "monday" | "sunday";
}) {
  const db = createTestDb();
  await db.insert(dbSchema.schema.users).values({
    id: "u1",
    name: "U",
    email: "u@example.com",
  });
  await db.insert(dbSchema.projects).values({
    id: "p1",
    userId: "u1",
    name: "P",
    slug: "p1",
  });
  await db.insert(dbSchema.schedules).values({
    id: "s1",
    projectId: "p1",
    name: "S",
    timezone: "UTC",
  });
  const base = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  const dateStr = formatDateInTimezone(base, "UTC");
  const dayOfWeek = getDayOfWeekForDate(dateStr, "UTC");
  await db.insert(dbSchema.availabilityRules).values({
    id: "r1",
    scheduleId: "s1",
    dayOfWeek,
    startTime: "09:00",
    endTime: "17:00",
  });
  await db.insert(dbSchema.eventTypes).values({
    id: "et1",
    projectId: "p1",
    name: "Call",
    slug: "call",
    duration: 30,
    scheduleId: "s1",
    maxPerDay: opts.maxPerDay ?? null,
    maxPerWeek: opts.maxPerWeek ?? null,
    weekStart: opts.weekStart ?? "monday",
  });
  return { db, dateStr };
}

function bookingAt(id: string, dateStr: string, hour: number, status: BookingStatus) {
  const start = new Date(`${dateStr}T${String(hour).padStart(2, "0")}:00:00.000Z`);
  return {
    id,
    eventTypeId: "et1",
    name: "G",
    email: "g@example.com",
    startTime: start,
    endTime: new Date(start.getTime() + 30 * 60 * 1000),
    timezone: "UTC",
    status,
  };
}

async function slotsFor(db: ReturnType<typeof createTestDb>, dateStr: string) {
  return new AvailabilityService(db).getAvailableSlots({
    projectSlug: "p1",
    eventTypeSlug: "call",
    date: dateStr,
    timezone: "UTC",
  });
}

describe("AvailabilityService booking limits", () => {
  test("no limits set → slots are returned", async () => {
    const { db, dateStr } = await seedEventType({});
    expect((await slotsFor(db, dateStr)).length).toBeGreaterThan(0);
  });

  test("daily cap gates the day once pending+confirmed reach the limit", async () => {
    const { db, dateStr } = await seedEventType({ maxPerDay: 2 });
    await db.insert(dbSchema.bookings).values([
      bookingAt("b1", dateStr, 9, "confirmed"),
      bookingAt("b2", dateStr, 10, "pending"),
    ]);
    expect(await slotsFor(db, dateStr)).toEqual([]);
  });

  test("daily cap ignores declined/cancelled/rescheduled", async () => {
    const { db, dateStr } = await seedEventType({ maxPerDay: 2 });
    await db.insert(dbSchema.bookings).values([
      bookingAt("b1", dateStr, 9, "confirmed"),
      bookingAt("b2", dateStr, 11, "declined"),
      bookingAt("b3", dateStr, 12, "cancelled"),
      bookingAt("b4", dateStr, 13, "rescheduled"),
    ]);
    // Only the confirmed one counts (1 < 2), so the day stays open.
    expect((await slotsFor(db, dateStr)).length).toBeGreaterThan(0);
  });

  test("daily cap stays open while below the limit", async () => {
    const { db, dateStr } = await seedEventType({ maxPerDay: 3 });
    await db.insert(dbSchema.bookings).values([
      bookingAt("b1", dateStr, 9, "confirmed"),
    ]);
    expect((await slotsFor(db, dateStr)).length).toBeGreaterThan(0);
  });

  test("weekly cap gates the week once the limit is reached", async () => {
    const { db, dateStr } = await seedEventType({ maxPerWeek: 2 });
    await db.insert(dbSchema.bookings).values([
      bookingAt("b1", dateStr, 9, "confirmed"),
      bookingAt("b2", dateStr, 10, "pending"),
    ]);
    expect(await slotsFor(db, dateStr)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test tests/worker/availability-service.test.ts -t "booking limits"`
Expected: FAIL — the "gates the day"/"gates the week" tests return slots instead of `[]` (current code only slices free slots and counts only confirmed).

- [ ] **Step 3: Update imports in the service**

In `worker/services/availability-service.ts`, replace the two top import lines (currently lines 1-9):

```ts
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { and, eq, gt, inArray, lt } from "drizzle-orm";
import * as dbSchema from "../db/schema";
import {
  getDayOfWeekForDate,
  getScheduleDatesForViewerDay,
  getUtcRangeForLocalDate,
  localTimeToUtc,
} from "../lib/timezone";
```

with:

```ts
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { and, eq, gt, gte, inArray, lt } from "drizzle-orm";
import * as dbSchema from "../db/schema";
import {
  getDayOfWeekForDate,
  getScheduleDatesForViewerDay,
  getUtcRangeForLocalDate,
  getWeekRangeForLocalDate,
  localTimeToUtc,
} from "../lib/timezone";
```

- [ ] **Step 4: Replace inline schedule resolution with `resolveSchedule`**

In `getAvailableSlots`, replace the whole "step 3" block (currently lines 66-103, from the `// 3. Get the event type's own schedule...` comment through `if (!schedule) return [];`) with:

```ts
    // 3. Resolve the schedule (event-type's own → project default → first)
    const schedule = await this.resolveSchedule(project.id, eventType);
    if (!schedule) return [];
```

Then add the `resolveSchedule` method to the class (place it right after the constructor, before `getAvailableSlots`):

```ts
  // ─── Resolve Schedule ─────────────────────────────────────────────────────

  async resolveSchedule(
    projectId: string,
    eventType: dbSchema.EventTypeRow,
  ): Promise<dbSchema.ScheduleRow | undefined> {
    if (eventType.scheduleId) {
      const rows = await this.db
        .select()
        .from(dbSchema.schedules)
        .where(eq(dbSchema.schedules.id, eventType.scheduleId))
        .limit(1);
      if (rows[0]) return rows[0];
    }

    const defaultRows = await this.db
      .select()
      .from(dbSchema.schedules)
      .where(
        and(
          eq(dbSchema.schedules.projectId, projectId),
          eq(dbSchema.schedules.isDefault, true),
        ),
      )
      .limit(1);
    if (defaultRows[0]) return defaultRows[0];

    const fallbackRows = await this.db
      .select()
      .from(dbSchema.schedules)
      .where(eq(dbSchema.schedules.projectId, projectId))
      .limit(1);
    return fallbackRows[0];
  }
```

- [ ] **Step 5: Add `countBookingsInRange` and compute blocked dates**

Add this method to the class (right after `resolveSchedule`):

```ts
  // ─── Count Bookings In Range ──────────────────────────────────────────────

  async countBookingsInRange(
    eventTypeId: string,
    start: Date,
    end: Date,
  ): Promise<number> {
    const rows = await this.db
      .select({ id: dbSchema.bookings.id })
      .from(dbSchema.bookings)
      .where(
        and(
          eq(dbSchema.bookings.eventTypeId, eventTypeId),
          inArray(dbSchema.bookings.status, ["pending", "confirmed"]),
          gte(dbSchema.bookings.startTime, start),
          lt(dbSchema.bookings.startTime, end),
        ),
      );
    return rows.length;
  }
```

Then, in `getAvailableSlots`, immediately after the `existingBookings` query (currently ends at line 150, the closing `);`) and before the `// 7. Generate time slots` comment, insert:

```ts
    // 6b. Gate any schedule-tz day/week that has hit its booking cap.
    const blockedScheduleDates = new Set<string>();
    if (eventType.maxPerDay !== null || eventType.maxPerWeek !== null) {
      const weekStart = eventType.weekStart === "sunday" ? "sunday" : "monday";
      for (const scheduleDate of scheduleDates) {
        if (eventType.maxPerDay !== null) {
          const dayRange = getUtcRangeForLocalDate(scheduleDate, schedule.timezone);
          const dayCount = await this.countBookingsInRange(
            eventType.id,
            dayRange.start,
            dayRange.end,
          );
          if (dayCount >= eventType.maxPerDay) {
            blockedScheduleDates.add(scheduleDate);
            continue;
          }
        }
        if (eventType.maxPerWeek !== null) {
          const weekRange = getWeekRangeForLocalDate(
            scheduleDate,
            schedule.timezone,
            weekStart,
          );
          const weekCount = await this.countBookingsInRange(
            eventType.id,
            weekRange.start,
            weekRange.end,
          );
          if (weekCount >= eventType.maxPerWeek) {
            blockedScheduleDates.add(scheduleDate);
          }
        }
      }
    }
```

- [ ] **Step 6: Pass blocked dates into `generateSlots` and drop the slice**

In the `return this.generateSlots({ ... })` call inside `getAvailableSlots`, replace the line `maxPerDay: eventType.maxPerDay,` with `blockedScheduleDates,`.

In the `generateSlots` params type, replace `maxPerDay: number | null;` with `blockedScheduleDates: Set<string>;`.

In the destructuring at the top of `generateSlots`, replace `maxPerDay,` with `blockedScheduleDates,`.

At the top of the `for (const scheduleDate of scheduleDates) {` loop body, add as the FIRST line:

```ts
      if (blockedScheduleDates.has(scheduleDate)) continue;
```

Finally, delete the slice block at the end of `generateSlots`:

```ts
    if (maxPerDay !== null && slots.length > maxPerDay) {
      return slots.slice(0, maxPerDay);
    }

    return slots;
```

so it becomes just:

```ts
    return slots;
```

(The `slots.sort(...)` line directly above it stays.)

- [ ] **Step 7: Run the tests to verify they pass**

Run: `bun test tests/worker/availability-service.test.ts`
Expected: PASS — existing slot-generation tests AND the new "booking limits" tests.

- [ ] **Step 8: Commit**

```bash
git add worker/services/availability-service.ts tests/worker/availability-service.test.ts
git commit -m "feat(availability): gate day/week by pending+confirmed booking caps"
```

---

### Task 4: Validation schemas

**Files:**
- Modify: `worker/validation.ts:65-105` (create + update event-type schemas)
- Test: `tests/worker/validation-event-type.test.ts` (create)

**Interfaces:**
- Produces: `createEventTypeSchema` and `updateEventTypeSchema` accept `maxPerWeek` (1–200, nullable, optional) and `weekStart` (`"monday" | "sunday"`). On create, `weekStart` defaults to `"monday"`; on update it is optional.

- [ ] **Step 1: Write the failing test**

Create `tests/worker/validation-event-type.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import {
  createEventTypeSchema,
  updateEventTypeSchema,
} from "../../worker/validation";

describe("event type limit validation", () => {
  test("create defaults weekStart to monday and limits to undefined", () => {
    const parsed = createEventTypeSchema.parse({ name: "Call", slug: "call" });
    expect(parsed.weekStart).toBe("monday");
    expect(parsed.maxPerWeek).toBeUndefined();
  });

  test("create accepts maxPerWeek and weekStart", () => {
    const parsed = createEventTypeSchema.parse({
      name: "Call",
      slug: "call",
      maxPerWeek: 5,
      weekStart: "sunday",
    });
    expect(parsed.maxPerWeek).toBe(5);
    expect(parsed.weekStart).toBe("sunday");
  });

  test("create accepts null maxPerWeek (unlimited)", () => {
    const parsed = createEventTypeSchema.parse({
      name: "Call",
      slug: "call",
      maxPerWeek: null,
    });
    expect(parsed.maxPerWeek).toBeNull();
  });

  test("rejects maxPerWeek below 1", () => {
    expect(() =>
      createEventTypeSchema.parse({ name: "Call", slug: "call", maxPerWeek: 0 }),
    ).toThrow();
  });

  test("rejects an unknown weekStart value", () => {
    expect(() =>
      updateEventTypeSchema.parse({ weekStart: "tuesday" }),
    ).toThrow();
  });

  test("update allows clearing maxPerWeek with null", () => {
    const parsed = updateEventTypeSchema.parse({ maxPerWeek: null });
    expect(parsed.maxPerWeek).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/worker/validation-event-type.test.ts`
Expected: FAIL — `weekStart` is stripped/undefined and unknown `weekStart` does not throw.

- [ ] **Step 3: Add the fields to both schemas**

In `worker/validation.ts`, in `createEventTypeSchema`, find:

```ts
  maxPerDay: z.number().int().min(1).max(50).nullable().optional(),
  enabled: z.boolean().default(true),
```

Replace with:

```ts
  maxPerDay: z.number().int().min(1).max(50).nullable().optional(),
  maxPerWeek: z.number().int().min(1).max(200).nullable().optional(),
  weekStart: z.enum(["monday", "sunday"]).default("monday"),
  enabled: z.boolean().default(true),
```

In `updateEventTypeSchema`, find:

```ts
  maxPerDay: z.number().int().min(1).max(50).nullable().optional(),
  enabled: z.boolean().optional(),
```

Replace with:

```ts
  maxPerDay: z.number().int().min(1).max(50).nullable().optional(),
  maxPerWeek: z.number().int().min(1).max(200).nullable().optional(),
  weekStart: z.enum(["monday", "sunday"]).optional(),
  enabled: z.boolean().optional(),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test tests/worker/validation-event-type.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add worker/validation.ts tests/worker/validation-event-type.test.ts
git commit -m "feat(validation): maxPerWeek + weekStart on event-type schemas"
```

---

### Task 5: Thread fields through service, routes, and MCP tools

**Files:**
- Modify: `worker/services/event-type-service.ts` (`CreateEventTypeInput` + insert)
- Modify: `worker/index.ts:3923-3938` (POST) and `worker/index.ts:3962-3983` (PUT)
- Modify: `worker/mcp/tools/event-types.ts` (create/update handlers + tool input schemas)
- Test: `tests/worker/event-type-service.test.ts` (create)

**Interfaces:**
- Consumes: `createEventTypeSchema` / `updateEventTypeSchema` shapes (Task 4); `EventTypeRow.maxPerWeek` / `.weekStart` (Task 2).
- Produces: `EventTypeService.create` and `.update` persist `maxPerWeek` (number | null) and `weekStart` (`"monday" | "sunday"`); HTTP + MCP create/update pass them through and allow clearing limits with `null`.

- [ ] **Step 1: Write the failing test**

Create `tests/worker/event-type-service.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import * as dbSchema from "../../worker/db/schema";
import { EventTypeService } from "../../worker/services/event-type-service";
import { createTestDb } from "./mcp-test-db";

async function seedProject() {
  const db = createTestDb();
  await db.insert(dbSchema.schema.users).values({
    id: "u1",
    name: "U",
    email: "u@example.com",
  });
  await db.insert(dbSchema.projects).values({
    id: "p1",
    userId: "u1",
    name: "P",
    slug: "p1",
  });
  return db;
}

describe("EventTypeService booking limits", () => {
  test("create persists maxPerWeek and weekStart", async () => {
    const service = new EventTypeService(await seedProject());
    const et = await service.create("p1", {
      name: "Call",
      slug: "call",
      duration: 30,
      maxPerDay: 3,
      maxPerWeek: 5,
      weekStart: "sunday",
    });
    expect(et.maxPerDay).toBe(3);
    expect(et.maxPerWeek).toBe(5);
    expect(et.weekStart).toBe("sunday");
  });

  test("create defaults weekStart to monday and limits to null", async () => {
    const service = new EventTypeService(await seedProject());
    const et = await service.create("p1", {
      name: "Call",
      slug: "call",
      duration: 30,
    });
    expect(et.maxPerDay).toBeNull();
    expect(et.maxPerWeek).toBeNull();
    expect(et.weekStart).toBe("monday");
  });

  test("update can set then clear the weekly limit", async () => {
    const service = new EventTypeService(await seedProject());
    const et = await service.create("p1", {
      name: "Call",
      slug: "call",
      duration: 30,
    });
    await service.update(et.id, { maxPerWeek: 7 });
    expect((await service.getById(et.id))!.maxPerWeek).toBe(7);
    await service.update(et.id, { maxPerWeek: null });
    expect((await service.getById(et.id))!.maxPerWeek).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/worker/event-type-service.test.ts`
Expected: FAIL — `create` does not accept `maxPerWeek`/`weekStart` (type error) and they are not persisted.

- [ ] **Step 3: Update `EventTypeService`**

In `worker/services/event-type-service.ts`, in the `CreateEventTypeInput` interface, find:

```ts
  maxPerDay?: number;
  enabled?: boolean;
```

Replace with:

```ts
  maxPerDay?: number | null;
  maxPerWeek?: number | null;
  weekStart?: "monday" | "sunday";
  enabled?: boolean;
```

In the `create` method's `insert(...).values({ ... })`, find:

```ts
      maxPerDay: data.maxPerDay ?? null,
      enabled: data.enabled ?? true,
```

Replace with:

```ts
      maxPerDay: data.maxPerDay ?? null,
      maxPerWeek: data.maxPerWeek ?? null,
      weekStart: data.weekStart ?? "monday",
      enabled: data.enabled ?? true,
```

(`update` uses `.set(data)` directly, so it already persists any field present on the input — including `maxPerWeek: null` to clear it. No change needed there.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test tests/worker/event-type-service.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Thread through the HTTP POST handler**

In `worker/index.ts`, in the POST `/api/projects/:projectId/event-types` handler's `service.create(projectId, { ... })` call, find:

```ts
      maxPerDay: data.maxPerDay ?? undefined,
      enabled: data.enabled,
```

Replace with:

```ts
      maxPerDay: data.maxPerDay ?? undefined,
      maxPerWeek: data.maxPerWeek ?? undefined,
      weekStart: data.weekStart,
      enabled: data.enabled,
```

- [ ] **Step 6: Thread through the HTTP PUT handler (and fix limit clearing)**

In the PUT `/api/projects/:projectId/event-types/:id` handler, find:

```ts
    if (data.maxPerDay !== undefined)
      updateData.maxPerDay = data.maxPerDay ?? undefined;
    if (data.enabled !== undefined) updateData.enabled = data.enabled;
```

Replace with (note: assign the value directly so a `null` clears the limit; `service.update` skips `undefined` keys but writes `null`):

```ts
    if (data.maxPerDay !== undefined) updateData.maxPerDay = data.maxPerDay;
    if (data.maxPerWeek !== undefined) updateData.maxPerWeek = data.maxPerWeek;
    if (data.weekStart !== undefined) updateData.weekStart = data.weekStart;
    if (data.enabled !== undefined) updateData.enabled = data.enabled;
```

- [ ] **Step 7: Thread through the MCP tools**

In `worker/mcp/tools/event-types.ts`, in `createEventType`'s `service.create(projectId, { ... })`, find:

```ts
    maxPerDay: input.maxPerDay ?? undefined,
    enabled: input.enabled,
```

Replace with:

```ts
    maxPerDay: input.maxPerDay ?? undefined,
    maxPerWeek: input.maxPerWeek ?? undefined,
    weekStart: input.weekStart,
    enabled: input.enabled,
```

In `updateEventType`, find:

```ts
  if (input.maxPerDay !== undefined) updateData.maxPerDay = input.maxPerDay ?? undefined;
  if (input.enabled !== undefined) updateData.enabled = input.enabled;
```

Replace with:

```ts
  if (input.maxPerDay !== undefined) updateData.maxPerDay = input.maxPerDay;
  if (input.maxPerWeek !== undefined) updateData.maxPerWeek = input.maxPerWeek;
  if (input.weekStart !== undefined) updateData.weekStart = input.weekStart;
  if (input.enabled !== undefined) updateData.enabled = input.enabled;
```

In `registerEventTypeTools`, in the `create_event_type` `inputSchema`, find:

```ts
        maxPerDay: createShape.maxPerDay.describe("Max bookings per day (null = unlimited)"),
        enabled: createShape.enabled.describe("Whether the event type is bookable (default true)"),
```

Replace with:

```ts
        maxPerDay: createShape.maxPerDay.describe("Max bookings per day (null = unlimited)"),
        maxPerWeek: createShape.maxPerWeek.describe("Max bookings per week (null = unlimited)"),
        weekStart: createShape.weekStart.describe("Week boundary for the weekly cap: 'monday' or 'sunday' (default monday)"),
        enabled: createShape.enabled.describe("Whether the event type is bookable (default true)"),
```

In the `update_event_type` `inputSchema`, find:

```ts
        maxPerDay: updateShape.maxPerDay.describe("Max bookings per day (null = unlimited)"),
        enabled: updateShape.enabled.describe("Enable/disable booking"),
```

Replace with:

```ts
        maxPerDay: updateShape.maxPerDay.describe("Max bookings per day (null = unlimited)"),
        maxPerWeek: updateShape.maxPerWeek.describe("Max bookings per week (null = unlimited)"),
        weekStart: updateShape.weekStart.describe("Week boundary for the weekly cap: 'monday' or 'sunday'"),
        enabled: updateShape.enabled.describe("Enable/disable booking"),
```

- [ ] **Step 8: Type-check the worker**

Run: `bunx tsc -b`
Expected: no type errors.

- [ ] **Step 9: Run the full worker test suite**

Run: `bun test tests/worker`
Expected: PASS (all suites, including the new ones).

- [ ] **Step 10: Commit**

```bash
git add worker/services/event-type-service.ts worker/index.ts worker/mcp/tools/event-types.ts tests/worker/event-type-service.test.ts
git commit -m "feat(event-types): thread maxPerWeek + weekStart through service, routes, MCP"
```

---

### Task 6: Explicit "fully booked" error at booking creation

**Files:**
- Modify: `worker/lib/booking-actions.ts:14` (import) and `:188-209` (create flow)
- Test: `tests/worker/booking-limits.test.ts` (create)

**Interfaces:**
- Consumes: `AvailabilityService.resolveSchedule` + `.countBookingsInRange` (Task 3); `getUtcRangeForLocalDate`, `getWeekRangeForLocalDate` (Tasks 0/1).
- Produces: `createBookingAction` returns `{ ok: false, status: 409, error: "This day is fully booked" }` (or `"This week is fully booked"`) when the day/week cap is already met, before the generic slot check.

- [ ] **Step 1: Write the failing test**

Create `tests/worker/booking-limits.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import * as dbSchema from "../../worker/db/schema";
import { createBookingAction } from "../../worker/lib/booking-actions";
import type { BookingActionDeps } from "../../worker/lib/booking-actions";
import type { AppEnv } from "../../worker/types";
import { formatDateInTimezone, getDayOfWeekForDate } from "../../worker/lib/timezone";
import { createTestDb } from "./mcp-test-db";

const realFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = (async () =>
    new Response("{}", { status: 200 })) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

async function seed(opts: { maxPerDay?: number | null; maxPerWeek?: number | null }) {
  const db = createTestDb();
  await db.insert(dbSchema.schema.users).values({
    id: "u1",
    name: "U",
    email: "u@example.com",
  });
  await db.insert(dbSchema.projects).values({
    id: "p1",
    userId: "u1",
    name: "P",
    slug: "p1",
  });
  await db.insert(dbSchema.schedules).values({
    id: "s1",
    projectId: "p1",
    name: "S",
    timezone: "UTC",
  });
  const dateStr = formatDateInTimezone(
    new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    "UTC",
  );
  await db.insert(dbSchema.availabilityRules).values({
    id: "r1",
    scheduleId: "s1",
    dayOfWeek: getDayOfWeekForDate(dateStr, "UTC"),
    startTime: "09:00",
    endTime: "17:00",
  });
  await db.insert(dbSchema.eventTypes).values({
    id: "et1",
    projectId: "p1",
    name: "Call",
    slug: "call",
    duration: 30,
    scheduleId: "s1",
    maxPerDay: opts.maxPerDay ?? null,
    maxPerWeek: opts.maxPerWeek ?? null,
    weekStart: "monday",
  });
  const deps: BookingActionDeps = {
    db,
    env: { RESEND_API_KEY: "re_test" } as AppEnv,
    waitUntil: () => {},
  };
  return { db, dateStr, deps };
}

function bookingRow(id: string, dateStr: string, hour: number, status: string) {
  const start = new Date(`${dateStr}T${String(hour).padStart(2, "0")}:00:00.000Z`);
  return {
    id,
    eventTypeId: "et1",
    name: "G",
    email: "g@example.com",
    startTime: start,
    endTime: new Date(start.getTime() + 30 * 60 * 1000),
    timezone: "UTC",
    status: status as "confirmed",
  };
}

describe("createBookingAction enforces booking limits", () => {
  test("returns 'This day is fully booked' when the daily cap is met", async () => {
    const { db, dateStr, deps } = await seed({ maxPerDay: 1 });
    await db.insert(dbSchema.bookings).values(bookingRow("b1", dateStr, 9, "confirmed"));
    const result = await createBookingAction(deps, {
      projectSlug: "p1",
      eventTypeSlug: "call",
      name: "New Guest",
      email: "new@example.com",
      startTime: `${dateStr}T10:00:00.000Z`,
      timezone: "UTC",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toBe("This day is fully booked");
    }
  });

  test("returns 'This week is fully booked' when the weekly cap is met", async () => {
    const { db, dateStr, deps } = await seed({ maxPerWeek: 1 });
    await db.insert(dbSchema.bookings).values(bookingRow("b1", dateStr, 9, "confirmed"));
    const result = await createBookingAction(deps, {
      projectSlug: "p1",
      eventTypeSlug: "call",
      name: "New Guest",
      email: "new@example.com",
      startTime: `${dateStr}T10:00:00.000Z`,
      timezone: "UTC",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toBe("This week is fully booked");
    }
  });

  test("allows the booking when below the cap", async () => {
    const { dateStr, deps } = await seed({ maxPerDay: 2 });
    const result = await createBookingAction(deps, {
      projectSlug: "p1",
      eventTypeSlug: "call",
      name: "New Guest",
      email: "new@example.com",
      startTime: `${dateStr}T10:00:00.000Z`,
      timezone: "UTC",
    });
    expect(result.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/worker/booking-limits.test.ts`
Expected: FAIL — capped cases currently return the generic `"Selected time slot is no longer available"`, not `"This day is fully booked"`.

- [ ] **Step 3: Add the timezone imports**

In `worker/lib/booking-actions.ts`, replace line 14:

```ts
import { formatDateInTimezone } from "./timezone";
```

with:

```ts
import {
  formatDateInTimezone,
  getUtcRangeForLocalDate,
  getWeekRangeForLocalDate,
} from "./timezone";
```

- [ ] **Step 4: Add the explicit cap check before the slot check**

In `createBookingAction`, find the block (currently lines 187-201):

```ts
  // 3. Parse startTime, calculate endTime from duration
  const startTime = new Date(input.startTime);
  const endTime = new Date(
    startTime.getTime() + eventType.duration * 60 * 1000,
  );

  // 4. Check availability — verify the slot is still open
  const availabilityService = new AvailabilityService(db);
  const dateStr = formatDateInTimezone(startTime, input.timezone);
```

Replace it with:

```ts
  // 3. Parse startTime, calculate endTime from duration
  const startTime = new Date(input.startTime);
  const endTime = new Date(
    startTime.getTime() + eventType.duration * 60 * 1000,
  );

  const availabilityService = new AvailabilityService(db);

  // 3b. Enforce per-day / per-week booking caps (count pending + confirmed).
  // Boundaries are measured in the host's schedule timezone.
  if (eventType.maxPerDay !== null || eventType.maxPerWeek !== null) {
    const schedule = await availabilityService.resolveSchedule(
      project.id,
      eventType,
    );
    if (schedule) {
      const scheduleDate = formatDateInTimezone(startTime, schedule.timezone);
      if (eventType.maxPerDay !== null) {
        const dayRange = getUtcRangeForLocalDate(scheduleDate, schedule.timezone);
        const dayCount = await availabilityService.countBookingsInRange(
          eventType.id,
          dayRange.start,
          dayRange.end,
        );
        if (dayCount >= eventType.maxPerDay) {
          return { ok: false, status: 409, error: "This day is fully booked" };
        }
      }
      if (eventType.maxPerWeek !== null) {
        const weekStart = eventType.weekStart === "sunday" ? "sunday" : "monday";
        const weekRange = getWeekRangeForLocalDate(
          scheduleDate,
          schedule.timezone,
          weekStart,
        );
        const weekCount = await availabilityService.countBookingsInRange(
          eventType.id,
          weekRange.start,
          weekRange.end,
        );
        if (weekCount >= eventType.maxPerWeek) {
          return { ok: false, status: 409, error: "This week is fully booked" };
        }
      }
    }
  }

  // 4. Check availability — verify the slot is still open
  const dateStr = formatDateInTimezone(startTime, input.timezone);
```

(Note: the old code created `availabilityService` inside step 4; it is now created once above and reused — make sure there is no longer a second `const availabilityService = new AvailabilityService(db);` line.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test tests/worker/booking-limits.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Type-check + full worker suite**

Run: `bunx tsc -b && bun test tests/worker`
Expected: no type errors; all suites PASS.

- [ ] **Step 7: Commit**

```bash
git add worker/lib/booking-actions.ts tests/worker/booking-limits.test.ts
git commit -m "feat(booking): clear 'fully booked' error when day/week cap is met"
```

---

### Task 7: Frontend — "Booking limits" section + AI prompt context

**Files:**
- Modify: `src/pages/EventTypeForm.tsx` (EventType type, EventTypeFormData, defaults, populate, UI, payload threads automatically via `JSON.stringify(formData)`)
- Modify: `src/lib/prompts.ts:~318` (add weekly limit to the AI context string)

**Interfaces:**
- Consumes: the API now returns/accepts `maxPerDay`, `maxPerWeek`, `weekStart` on event types (Tasks 2–5).
- Produces: the form reads and writes all three fields; empty number input = unlimited (null).

- [ ] **Step 1: Extend the `EventType` and `EventTypeFormData` interfaces**

In `src/pages/EventTypeForm.tsx`, in the `EventType` interface, find:

```ts
  maxPerDay: number | null;
  enabled: boolean;
```

Replace with:

```ts
  maxPerDay: number | null;
  maxPerWeek: number | null;
  weekStart: "monday" | "sunday";
  enabled: boolean;
```

In the `EventTypeFormData` interface, find:

```ts
  bufferBefore: number;
  bufferAfter: number;
  requiresConfirmation: boolean;
```

Replace with:

```ts
  bufferBefore: number;
  bufferAfter: number;
  maxPerDay: number | null;
  maxPerWeek: number | null;
  weekStart: "monday" | "sunday";
  requiresConfirmation: boolean;
```

- [ ] **Step 2: Add the fields to `defaultFormData`**

In `defaultFormData`, find:

```ts
  bufferBefore: 0,
  bufferAfter: 0,
  requiresConfirmation: false,
```

Replace with:

```ts
  bufferBefore: 0,
  bufferAfter: 0,
  maxPerDay: null,
  maxPerWeek: null,
  weekStart: "monday",
  requiresConfirmation: false,
```

- [ ] **Step 3: Populate the fields when editing**

In the `setFormData({ ... })` call inside the populate effect, find:

```ts
      bufferBefore: et.bufferBefore,
      bufferAfter: et.bufferAfter,
      requiresConfirmation: et.requiresConfirmation ?? false,
```

Replace with:

```ts
      bufferBefore: et.bufferBefore,
      bufferAfter: et.bufferAfter,
      maxPerDay: et.maxPerDay ?? null,
      maxPerWeek: et.maxPerWeek ?? null,
      weekStart: et.weekStart ?? "monday",
      requiresConfirmation: et.requiresConfirmation ?? false,
```

- [ ] **Step 4: Add the "Booking limits" UI**

In the JSX, find the closing of the buffers grid followed by the "Require confirmation" row:

```tsx
                </div>
              </div>
              <div className="flex items-center justify-between rounded-[12px] border px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Require confirmation</p>
```

Insert a new block between the buffers grid's closing `</div>` and the "Require confirmation" row, so it reads:

```tsx
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium">Booking limits</p>
                  <p className="text-xs text-muted-foreground">
                    Cap how many calls this event type accepts. Pending and
                    booked calls count; cancelled and declined ones don't. Leave
                    blank for no limit.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="maxPerDay">Max calls per day</Label>
                    <Input
                      id="maxPerDay"
                      type="number"
                      min={1}
                      placeholder="Unlimited"
                      value={formData.maxPerDay ?? ""}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          maxPerDay:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxPerWeek">Max calls per week</Label>
                    <Input
                      id="maxPerWeek"
                      type="number"
                      min={1}
                      placeholder="Unlimited"
                      value={formData.maxPerWeek ?? ""}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          maxPerWeek:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        }))
                      }
                    />
                  </div>
                </div>
                {formData.maxPerWeek !== null && (
                  <div className="space-y-2">
                    <Label>Week starts on</Label>
                    <Select
                      value={formData.weekStart}
                      onValueChange={(val) =>
                        setFormData((prev) => ({
                          ...prev,
                          weekStart: val as "monday" | "sunday",
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monday">Monday</SelectItem>
                        <SelectItem value="sunday">Sunday</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between rounded-[12px] border px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Require confirmation</p>
```

(The create/update mutations already send the whole `formData` via `JSON.stringify(data)`, so `maxPerDay`, `maxPerWeek`, and `weekStart` are submitted with no payload-builder change.)

- [ ] **Step 5: Add the weekly limit to the AI prompt context**

In `src/lib/prompts.ts`, find the line that emits the daily limit (around line 318):

```ts
${et.maxPerDay ? `- Max bookings per day: ${et.maxPerDay}` : ""}
```

Add a sibling line immediately after it:

```ts
${et.maxPerDay ? `- Max bookings per day: ${et.maxPerDay}` : ""}
${et.maxPerWeek ? `- Max bookings per week: ${et.maxPerWeek}` : ""}
```

If the local `EventType`-like type in `src/lib/prompts.ts` declares `maxPerDay`, add `maxPerWeek?: number | null;` next to it so this type-checks.

- [ ] **Step 6: Type-check and lint the frontend**

Run: `bunx tsc -b && bun run lint`
Expected: no type errors, no new lint errors.

- [ ] **Step 7: Manual smoke check (dev server)**

Run: `bun run dev`, open an event type, confirm the "Booking limits" section renders, that entering a weekly value reveals the "Week starts on" selector, and that saving persists the values (reload the page — values should round-trip). Note: per project memory, dev runs against remote prod D1 (~8.5s/request) — slowness is expected and not a bug.

- [ ] **Step 8: Commit**

```bash
git add src/pages/EventTypeForm.tsx src/lib/prompts.ts
git commit -m "feat(ui): booking-limits section (per-day/per-week) on event type form"
```

---

## Self-Review

**Spec coverage:**
- Data model (`maxPerWeek`, `weekStart`) → Task 2. ✓
- Counting rule (pending+confirmed) → Task 3 (`countBookingsInRange` + tests), Task 6. ✓
- Schedule-tz boundaries → Tasks 1, 3, 6. ✓
- Gating in availability (remove slice) → Task 3. ✓
- Clear booking-time error → Task 6. ✓
- Validation → Task 4. ✓
- API + service + MCP threading → Task 5. ✓
- Frontend section + configurable week start → Task 7. ✓
- Tests across day gate / week gate / weekStart boundary / counting rule → Tasks 1, 3, 4, 5, 6. ✓

**Deliberate scope deviation from the spec:** the spec mentioned updating the `EventType` type in `EventTypes.tsx`, `Dashboard.tsx`, and `Bookings.tsx`. Those screens never read `maxPerWeek`/`weekStart`, so per YAGNI this plan does NOT touch them (adding unused interface fields buys nothing and risks drift). Only `EventTypeForm.tsx` (reads/writes the fields) and `prompts.ts` (surfaces them to the AI) are updated. Flag this to the reviewer.

**Placeholder scan:** none — every code step contains complete code.

**Type consistency:** `weekStart` is `"monday" | "sunday"` everywhere it is typed (validation enum, service input, form state, helper param). The DB column returns a `string`, narrowed at the two read sites with `eventType.weekStart === "sunday" ? "sunday" : "monday"` (availability-service, booking-actions). `countBookingsInRange(eventTypeId, start, end)` and `resolveSchedule(projectId, eventType)` signatures match between definition (Task 3) and consumers (Task 6). `maxPerDay`/`maxPerWeek` are `number | null` on the service input, form state, and `EventType` interface.

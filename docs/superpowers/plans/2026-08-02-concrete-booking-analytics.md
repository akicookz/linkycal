# Concrete Booking Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace misleading visitor-local scheduling breakdowns with UTC-backed date-demand facts and persisted booking-request distributions rendered in the dashboard viewer's browser timezone.

**Architecture:** Public booking telemetry keeps the existing funnel identity, journey source, and device, but records only a UTC selected-date instant and numeric slot count. Cloudflare Analytics Engine answers pre-booking date demand; a focused D1 query answers booked weekday/time demand from every persisted booking request. The shared booking analytics action merges both sources, and REST, MCP, and the React dashboard consume the same timezone-aware report.

**Tech Stack:** Bun, TypeScript, React 19, Hono, Cloudflare Workers Analytics Engine, Cloudflare D1, Drizzle ORM, Zod, date-fns-tz, TanStack Query, Testing Library, Bun test.

## Global Constraints

- Implement the approved design in `docs/superpowers/specs/2026-08-02-concrete-booking-analytics-design.md`.
- Keep the detailed funnel, Journey sources, and Visitor devices; remove Selected dates, Availability outcomes, Available times shown, Selected times, Validation failures, and Submit failures.
- Count `booking_date_selected` event occurrences as clicks, not unique journeys. Repeated date choices are repeated clicks.
- Store the start of the selected visitor-local calendar day as an ISO-8601 UTC instant named `selectedDateUtc`.
- Record a slot observation only after a successful availability response. An empty successful response records `slotCount: 0`; a failed response records no slot observation.
- Display every date, weekday, and time in the dashboard viewer's requested IANA timezone.
- Count every persisted booking request once regardless of current status, including confirmed, pending, cancelled, declined, rescheduled, and replacement rows.
- Apply period and event-type filters to D1 booking distributions. Do not claim UTM, source, or device filters apply to D1 booking rows because those dimensions are not persisted there.
- Do not add a D1 migration, backfill historical Analytics Engine events, deploy, or mutate production data.
- Follow strict TDD: add the regression assertion, run it against the current code and confirm the expected failure, make the minimum production change, and rerun it green.
- Tests assert rendered behavior, emitted protocol payloads, persisted booking facts, and API output. Do not assert styling classes, DOM ancestry, source text, or mock-only behavior.
- Use Bun, function declarations for named functions/components, `import type` for type-only imports, and `apply_patch` for file edits.

## File Structure

- `shared/funnel-analytics.ts`: canonical minimal event context and report DTOs shared by browser, Worker, and MCP.
- `src/pages/PublicBooking.tsx`: emit UTC date-click and successful slot-count facts.
- `src/pages/PublicForm.tsx`: retain stage events without removed failure-category context.
- `src/lib/analytics-providers.ts`: forward only properties still in the canonical event context.
- `worker/services/analytics-service.ts`: keep unique-journey funnels and query/aggregate UTC booking-demand events from Analytics Engine.
- `worker/lib/booking-request-analytics.ts`: query D1 booking rows and aggregate requested start weekday/time in a supplied timezone.
- `worker/lib/analytics-actions.ts`: merge Analytics Engine and D1 booking report sections behind entitlement and ownership checks.
- `worker/validation.ts`: strict minimal event context plus a booking-report query that requires a valid IANA timezone.
- `src/pages/Analytics.tsx`: send browser timezone and render the four concrete booking datasets.
- `src/components/analytics/AnalyticsBreakdownCard.tsx`: support explicit value labels such as clicks, checks/slots, bookings, and visitors.
- `worker/mcp/tools/analytics.ts`, `scripts/*`, `src/lib/api-reference.ts`: publish the same timezone-aware contract through MCP and generated docs.

---

### Task 1: Remove misleading telemetry and context cards

**Files:**

- Modify: `shared/funnel-analytics.ts`
- Modify: `worker/validation.ts`
- Modify: `worker/services/analytics-service.ts`
- Modify: `src/pages/PublicBooking.tsx`
- Modify: `src/pages/PublicForm.tsx`
- Modify: `src/lib/analytics-providers.ts`
- Delete: `src/lib/booking-analytics.ts`
- Modify: `src/pages/Analytics.tsx`
- Modify: `tests/critical/public-booking-analytics.test.tsx`
- Modify: `tests/analytics-event-contract.test.ts`
- Modify: `tests/analytics-providers.test.ts`
- Modify: `tests/analytics-rest-api.test.ts`
- Modify: `tests/analytics-reporting.test.ts`
- Modify: `tests/analytics-dashboard.test.tsx`
- Modify: `tests/funnel-analytics-client.test.ts`

**Interfaces:**

- Produces:

```ts
export interface FunnelEventContext {
  selectedDateUtc?: string;
  fieldType?: string;
  required?: boolean;
  stageOutcome?: FunnelStageOutcome;
}

export interface FunnelStageReport {
  key: string;
  label: string;
  kind: string;
  order: number;
  visitors: number;
  continued: number;
  continuationRate: number;
  dropOffs: number;
  dropOffRate: number;
  skipped?: number;
}

export interface DetailedFunnelReport {
  availableSince: string | null;
  stages: FunnelStageReport[];
  bySource: Array<{ source: AnalyticsSource; visitors: number }>;
  byDevice: Array<{
    deviceType: AnalyticsDeviceType;
    visitors: number;
  }>;
}
```

- Removes `AnalyticsFailureCategory`, `ANALYTICS_FAILURE_CATEGORIES`, `FunnelContextValue`, `FunnelContextBreakdowns`, `FunnelStageReport.contextBreakdowns`, and `DetailedFunnelReport.failures`.

- Removes these accepted/emitted context keys: `selectedDate`, `weekday`, `viewerTimezone`, `offeredSlotStarts`, `earliestSlot`, `latestSlot`, `availabilityOutcome`, `selectedTime`, and `failureCategory`.

- [ ] **Step 1: Change the existing critical booking journey to specify the UTC telemetry contract.**

Update the existing `one booking journey records safe scheduling and attached-form stages in order` test so it opens without `?date=...`, clicks the calendar button named `23`, and asserts the literal Helsinki-local midnight instant:

```ts
await user.click(await screen.findByRole("button", { name: "23" }));

expect(events[1]).toMatchObject({
  event: "booking_date_selected",
  primaryValue: "2026-03-22T22:00:00.000Z",
  context: {
    selectedDateUtc: "2026-03-22T22:00:00.000Z",
  },
});
expect(events[2]).toMatchObject({
  event: "booking_availability_shown",
  primaryValue: "2026-03-22T22:00:00.000Z",
  slotCount: 1,
  context: {
    selectedDateUtc: "2026-03-22T22:00:00.000Z",
  },
});
expect(events[3]?.event).toBe("booking_time_selected");
expect(events[3]?.primaryValue).toBeUndefined();

const serialized = JSON.stringify(events);
for (const removed of [
  "viewerTimezone",
  "offeredSlotStarts",
  "availabilityOutcome",
  "selectedTime",
  "failureCategory",
]) {
  expect(serialized).not.toContain(removed);
}
```

Rename the test to `one booking journey records UTC date demand and slot counts without local-time or failure context`. Remove the standalone failure-classification test because the removed dataset is no longer a production contract.

- [ ] **Step 2: Add the distinct failed-availability regression to the same component test file.**

Use the real `PublicBooking` component, return the real public event type, return HTTP 500 for `/api/v1/availability/acme`, click date `23`, wait for the settled empty/error UI, and assert:

```ts
expect(events.some(function isDateClick(event) {
  return event.event === "booking_date_selected";
})).toBe(true);
expect(events.some(function isSlotObservation(event) {
  return event.event === "booking_availability_shown";
})).toBe(false);
```

Name the test `failed availability preserves the date click without inventing a slot count`.

- [ ] **Step 3: Tighten the canonical event and provider tests.**

In `tests/analytics-event-contract.test.ts`, replace the old scheduling context with:

```ts
context: {
  selectedDateUtc: "2026-08-03T15:00:00.000Z",
  stageOutcome: "viewed",
},
```

Add the removed keys to the existing invalid-case table and require each to fail strict validation. In `tests/analytics-providers.test.ts`, assert providers receive `selected_date_utc` and do not receive any removed local-time or failure property.

In `tests/analytics-rest-api.test.ts`, change the direct Analytics Engine write fixture to `primaryValue: "2026-08-03T15:00:00.000Z"` plus `context.selectedDateUtc`, and assert blob 13 and blob 19 preserve only that UTC value. This keeps the stored wire layout covered after the context reduction.

- [ ] **Step 4: Change the reporting and dashboard tests to reject the old report surface.**

In `tests/analytics-reporting.test.ts`, keep the existing literal unique-journey stage/source/device expectations, delete context/failure expectations, and assert the report equals a DTO without `contextBreakdowns` or `failures`.

In `tests/analytics-dashboard.test.tsx`, retain the selected booking/form funnel assertions, assert Journey sources and Visitor devices still render, and assert the six removed card headings are absent:

```ts
for (const heading of [
  "Selected dates",
  "Availability outcomes",
  "Available times shown",
  "Selected times",
  "Validation failures",
  "Submit failures",
]) {
  expect(screen.queryByText(heading)).toBeNull();
}
```

Rename the form test to `selected form keeps stage skips, journey source, and device without removed failure cards`.

- [ ] **Step 5: Run the focused tests and verify RED for the intended reasons.**

Run:

```bash
bun test tests/critical/public-booking-analytics.test.tsx tests/analytics-event-contract.test.ts tests/analytics-providers.test.ts tests/analytics-rest-api.test.ts tests/analytics-reporting.test.ts tests/analytics-dashboard.test.tsx tests/funnel-analytics-client.test.ts
```

Expected failures: visitor events still contain local date/time context, the validator still accepts removed keys, detailed reports still contain context/failure breakdowns, and the dashboard still renders the six old cards.

- [ ] **Step 6: Implement minimal UTC date telemetry in `PublicBooking`.**

Import `fromZonedTime` from `date-fns-tz` and add:

```ts
function selectedDateStartUtc(date: string, timezone: string): string {
  return fromZonedTime(`${date}T00:00:00`, timezone).toISOString();
}
```

Move `booking_date_selected` emission out of the `selectedDate` effect and into `handleDateSelect` so only actual clicks count. Set both `primaryValue` and `context.selectedDateUtc` to the helper result.

For availability, emit only when `slotsData` exists. Use the same UTC instant, `slotCount: slots.length`, and no local slot list/outcome. Include the query's `dataUpdatedAt` in the effect's dedupe key so one successful response produces one observation while ordinary rerenders do not duplicate it.

Keep `booking_time_selected`, `booking_submit_failed`, and form validation/submission stage events for funnel reach, but remove their local time and failure-category context. Remove `classifyBookingFailure`, delete `src/lib/booking-analytics.ts`, and remove now-unused imports and variables.

- [ ] **Step 7: Implement the slim shared/Worker report contract.**

Reduce `FunnelEventContext` and `funnelEventContextSchema` to the produced interface. Use an ISO datetime validator for `selectedDateUtc`.

In `analytics-service.ts`, remove context parsing, context maps, failure maps, and context-breakdown construction. Keep unique-journey stage presence, skip, continuation, source, device, and `availableSince` behavior unchanged. Stop selecting blob 13 in the detailed-funnel SQL because the funnel report no longer consumes it.

In `analytics-providers.ts`, replace the removed provider properties with:

```ts
addProperty(
  properties,
  "selected_date_utc",
  event.context?.selectedDateUtc,
);
```

Remove the six cards and their `contextItems` helper/imports from `Analytics.tsx`. Leave DetailedFunnel, Journey sources, and Visitor devices in `DetailedReportSection`.

- [ ] **Step 8: Rerun focused tests and build GREEN.**

Run:

```bash
bun test tests/critical/public-booking-analytics.test.tsx tests/analytics-event-contract.test.ts tests/analytics-providers.test.ts tests/analytics-rest-api.test.ts tests/analytics-reporting.test.ts tests/analytics-dashboard.test.tsx tests/funnel-analytics-client.test.ts
bun run build
```

Expected: all focused tests pass, TypeScript has no references to removed report/context fields, and the app/Worker bundles build.

- [ ] **Step 9: Commit the completed removal.**

```bash
git add shared/funnel-analytics.ts worker/validation.ts worker/services/analytics-service.ts src/pages/PublicBooking.tsx src/pages/PublicForm.tsx src/lib/analytics-providers.ts src/lib/booking-analytics.ts src/pages/Analytics.tsx tests/critical/public-booking-analytics.test.tsx tests/analytics-event-contract.test.ts tests/analytics-providers.test.ts tests/analytics-rest-api.test.ts tests/analytics-reporting.test.ts tests/analytics-dashboard.test.tsx tests/funnel-analytics-client.test.ts
git commit -m "refactor: remove misleading analytics breakdowns"
```

---

### Task 2: Build the timezone-aware booking report from Analytics Engine and D1

**Files:**

- Modify: `shared/funnel-analytics.ts`
- Modify: `worker/validation.ts`
- Modify: `worker/services/analytics-service.ts`
- Create: `worker/lib/booking-request-analytics.ts`
- Modify: `worker/lib/analytics-actions.ts`
- Modify: `worker/index.ts`
- Modify: `worker/mcp/tools/analytics.ts`
- Modify: `tests/analytics-reporting.test.ts`
- Modify: `tests/analytics-event-contract.test.ts`
- Modify: `tests/analytics-mcp.test.ts`

**Interfaces:**

- Produces:

```ts
export interface ClickedWeekday {
  weekday: string;
  clicks: number;
}

export interface SelectedDateAvailability {
  date: string;
  checks: number;
  minimumSlots: number;
  maximumSlots: number;
}

export interface BookedWeekday {
  weekday: string;
  bookings: number;
}

export interface BookedTime {
  time: string;
  bookings: number;
}

export interface BookingAnalyticsBreakdowns {
  clickedWeekdays: ClickedWeekday[];
  selectedDateAvailability: SelectedDateAvailability[];
  bookedWeekdays: BookedWeekday[];
  bookedTimes: BookedTime[];
}
```

- `bookingAnalyticsQuerySchema`: the existing analytics filters plus required validated `timezone: string`.

- `queryBookingRequestAnalytics(input: BookingRequestAnalyticsInput): Promise<Pick<BookingAnalyticsBreakdowns, "bookedWeekdays" | "bookedTimes">>`.

- `queryBookingDemand(accountId: string, apiToken: string, params: AnalyticsQueryParams & { timezone: string }): Promise<Pick<BookingAnalyticsBreakdowns, "clickedWeekdays" | "selectedDateAvailability">>`.

- [ ] **Step 1: Add one migration-backed action test for the complete backend answer.**

Extend `tests/analytics-reporting.test.ts` with `dashboard timezone controls date demand and every persisted booking request counts once`.

Seed one owned event type and six booking rows created inside custom period `2026-07-01` through `2026-07-31`: confirmed, pending, cancelled, declined, an original `rescheduled` row, and its confirmed replacement. Give all six `startTime: new Date("2026-08-03T15:00:00.000Z")`. Seed an outside-period row and a foreign-project row that must not count.

Have the Analytics Engine capture return these grouped demand facts only for the demand SQL:

```ts
[
  {
    event: "booking_date_selected",
    selectedDateUtc: "2026-08-03T15:00:00.000Z",
    slotCount: 0,
    occurrences: 3,
  },
  {
    event: "booking_availability_shown",
    selectedDateUtc: "2026-08-03T15:00:00.000Z",
    slotCount: 4,
    occurrences: 1,
  },
  {
    event: "booking_availability_shown",
    selectedDateUtc: "2026-08-03T15:00:00.000Z",
    slotCount: 7,
    occurrences: 2,
  },
]
```

Call the real `getBookingAnalyticsAction` with `timezone: "Asia/Seoul"` and literal expectations:

```ts
expect(result.body).toMatchObject({
  clickedWeekdays: [{ weekday: "Tuesday", clicks: 3 }],
  selectedDateAvailability: [{
    date: "2026-08-04",
    checks: 3,
    minimumSlots: 4,
    maximumSlots: 7,
  }],
  bookedWeekdays: [{ weekday: "Tuesday", bookings: 6 }],
  bookedTimes: [{ time: "00:00", bookings: 6 }],
});
```

Call it again with `timezone: "America/Los_Angeles"` and expect Monday, `2026-08-03`, and booked time `08:00`. These literals prove the same UTC facts regroup in the dashboard timezone.

- [ ] **Step 2: Add query validation and MCP contract assertions.**

In `tests/analytics-event-contract.test.ts`, add a table proving `bookingAnalyticsQuerySchema` accepts `Asia/Seoul` and rejects `Not/A_Zone`, an empty timezone, and a booking query without timezone.

In `tests/analytics-mcp.test.ts`, pass `timezone: "Asia/Seoul"` to `getBookingFunnelAnalytics` and expect all four new arrays. Add one malformed-timezone call and expect the existing MCP error envelope.

- [ ] **Step 3: Run backend tests RED.**

```bash
bun test tests/analytics-reporting.test.ts tests/analytics-event-contract.test.ts tests/analytics-mcp.test.ts
```

Expected failures: the booking query has no timezone contract, no Analytics Engine demand query exists, the action does not read booking rows, and the report lacks all four arrays.

- [ ] **Step 4: Implement the shared report and strict timezone query types.**

Add the four row interfaces and `BookingAnalyticsBreakdowns` to `shared/funnel-analytics.ts`.

In `worker/validation.ts`, add a reusable IANA validator:

```ts
export const analyticsTimezoneSchema = z
  .string()
  .min(1)
  .max(100)
  .refine(function isIanaTimezone(value) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, "Must be a valid IANA timezone");

export const bookingAnalyticsQuerySchema = analyticsQuerySchema.safeExtend({
  timezone: analyticsTimezoneSchema,
});
```

Keep overview and form queries on `analyticsQuerySchema`; only booking analytics requires timezone.

In `worker/lib/analytics-actions.ts`, introduce a booking-specific action input whose `query` is `Omit<AnalyticsQueryParams, "projectId"> & { timezone: string }`. Leave overview/form action inputs on the existing common query type.

- [ ] **Step 5: Query and aggregate UTC date demand in `analytics-service.ts`.**

Add:

```ts
interface BookingDemandRow {
  event: "booking_date_selected" | "booking_availability_shown";
  selectedDateUtc: string;
  slotCount: number;
  occurrences: number;
}

export function aggregateBookingDemand(
  rows: BookingDemandRow[],
  timezone: string,
): Pick<
  BookingAnalyticsBreakdowns,
  "clickedWeekdays" | "selectedDateAvailability"
>;
```

Use `formatInTimeZone` from `date-fns-tz` with `EEEE` and `yyyy-MM-dd`. Sum `occurrences` for clicks/checks, retain minimum/maximum numeric slot observations, sort descending by count, and use Sunday-through-Saturday/date order as deterministic tie-breakers.

Add `queryBookingDemand(accountId, apiToken, params)` and issue one Analytics Engine query for selected event types:

```sql
SELECT
  blob2 AS event,
  blob19 AS selectedDateUtc,
  double3 AS slotCount,
  SUM(_sample_interval) AS occurrences
FROM linkycal_analytics
<existing project/period/resource/UTM/source/device filters>
AND blob2 IN ('booking_date_selected', 'booking_availability_shown')
AND blob19 != ''
GROUP BY event, selectedDateUtc, slotCount
```

Return empty click/availability arrays when no event type is selected, matching the existing detailed-report boundary. Historical rows with non-ISO `blob19` are ignored.

- [ ] **Step 6: Query every persisted booking request in a focused D1 module.**

Create `worker/lib/booking-request-analytics.ts` with:

```ts
export interface BookingRequestAnalyticsInput {
  db: DrizzleD1Database<Record<string, unknown>>;
  projectId: string;
  period: "7d" | "30d" | "90d" | "custom";
  start?: string;
  end?: string;
  resourceSlug?: string;
  timezone: string;
  now?: Date;
}

export async function queryBookingRequestAnalytics(
  input: BookingRequestAnalyticsInput,
): Promise<Pick<
  BookingAnalyticsBreakdowns,
  "bookedWeekdays" | "bookedTimes"
>>;
```

Join `bookings.eventTypeId` to `eventTypes.id`, require `eventTypes.projectId = input.projectId`, optionally require `eventTypes.slug = resourceSlug`, and filter `bookings.createdAt` by the requested period. For custom dates, use `getUtcRangeForLocalDate(start, timezone).start` through `getUtcRangeForLocalDate(end, timezone).end`; for presets use a rolling `now - N days` lower bound.

Do not add a status predicate. Format every selected `startTime` with `formatInTimeZone(..., timezone, "EEEE")` and `HH:mm`, count rows, and apply deterministic count/calendar/clock sorting.

- [ ] **Step 7: Merge both sources in the production action and expose the query contract.**

Change `getBookingAnalyticsAction` to run `queryBookings`, `queryBookingDemand` (only when `resourceSlug` is present), and `queryBookingRequestAnalytics` together after entitlement/resource ownership succeeds. Merge the Analytics Engine clicked/availability arrays and D1 booked arrays into the response. Add all four empty arrays to `emptyBookingReport`.

Use `bookingAnalyticsQuerySchema` in the REST booking route. Keep overview/form routes unchanged.

In `worker/mcp/tools/analytics.ts`:

```ts
interface BookingAnalyticsInput extends CommonAnalyticsInput {
  eventTypeId?: string;
  timezone: string;
}
```

Parse booking inputs with `bookingAnalyticsQuerySchema`, make the MCP `timezone` input required, and update the tool description to describe UTC-backed clicked weekday/availability and persisted booking-request distributions.

Build the MCP booking query with:

```ts
const query = bookingAnalyticsQuerySchema.parse({
  ...parseCommonQuery(input),
  timezone: input.timezone,
  ...(resourceSlug ? { resourceSlug } : {}),
});
```

- [ ] **Step 8: Rerun backend tests and build GREEN.**

```bash
bun test tests/analytics-reporting.test.ts tests/analytics-event-contract.test.ts tests/analytics-mcp.test.ts
bun run build
```

Expected: timezone shifts all four buckets, six in-scope rows across every status count exactly once, foreign/out-of-period rows are absent, and REST/MCP compile against the same action result.

- [ ] **Step 9: Commit the backend report.**

```bash
git add shared/funnel-analytics.ts worker/validation.ts worker/services/analytics-service.ts worker/lib/booking-request-analytics.ts worker/lib/analytics-actions.ts worker/index.ts worker/mcp/tools/analytics.ts tests/analytics-reporting.test.ts tests/analytics-event-contract.test.ts tests/analytics-mcp.test.ts
git commit -m "feat: report concrete booking demand"
```

---

### Task 3: Render concrete booking datasets in the dashboard timezone

**Files:**

- Modify: `src/components/analytics/AnalyticsBreakdownCard.tsx`
- Modify: `src/pages/Analytics.tsx`
- Modify: `tests/analytics-dashboard.test.tsx`

**Interfaces:**

- `BookingsData` extends `BookingAnalyticsBreakdowns`.
- `AnalyticsBreakdownItem` adds `displayValue?: string`.
- `AnalyticsBreakdownCard` adds `description?: string` and `emptyMessage?: string`; the existing visitor label remains the default for Journey sources and Visitor devices.

- [ ] **Step 1: Replace the dashboard fixture with literal concrete booking facts.**

Add to the booking API fixture:

```ts
clickedWeekdays: [
  { weekday: "Tuesday", clicks: 12 },
  { weekday: "Wednesday", clicks: 6 },
],
selectedDateAvailability: [{
  date: "2026-08-04",
  checks: 3,
  minimumSlots: 6,
  maximumSlots: 9,
}],
bookedWeekdays: [{ weekday: "Monday", bookings: 14 }],
bookedTimes: [{ time: "13:00", bookings: 8 }],
```

In the selected-booking test, assert the visible headings and values:

```ts
expect(screen.getByText("Clicked weekdays")).toBeTruthy();
expect(screen.getByText("12 clicks")).toBeTruthy();
expect(screen.getByText("Availability by selected date")).toBeTruthy();
expect(screen.getByText("3 checks · 6–9 slots")).toBeTruthy();
expect(screen.getByText("Most booked weekdays")).toBeTruthy();
expect(screen.getByText("14 bookings")).toBeTruthy();
expect(screen.getByText("Most booked times")).toBeTruthy();
expect(screen.getByText("8 bookings")).toBeTruthy();
expect(screen.getByText("Journey sources")).toBeTruthy();
expect(screen.getByText("Visitor devices")).toBeTruthy();
```

Keep the Task 1 assertions that the six removed headings never render.

Add a second fixture branch with all four arrays empty and assert the selected event type renders `No date clicks in this period`, `No availability checks in this period`, and `No booking requests in this period` instead of hiding the datasets.

- [ ] **Step 2: Require the browser timezone on booking API requests.**

Extend the existing exact-filter test:

```ts
const expectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
expect(selected?.url.searchParams.get("timezone")).toBe(expectedTimezone);
```

This assertion exercises the real query assembled by `Analytics`, not a helper or source string.

- [ ] **Step 3: Run the dashboard test RED.**

```bash
bun test tests/analytics-dashboard.test.tsx
```

Expected failures: the request lacks timezone, `BookingsData` ignores the new arrays, and none of the four cards/value labels render.

- [ ] **Step 4: Generalize the existing breakdown card without changing source/device behavior.**

Change the item and card props to:

```ts
export interface AnalyticsBreakdownItem {
  label: string;
  value: number;
  displayValue?: string;
}

interface AnalyticsBreakdownCardProps {
  title: string;
  description?: string;
  emptyMessage?: string;
  icon: LucideIcon;
  items: AnalyticsBreakdownItem[];
}
```

Render `item.displayValue ?? `${item.value.toLocaleString()} visitors``. Render the optional description beneath the title. When `items` is empty, render `emptyMessage ?? "No data yet"` inside the card instead of returning `null`; preserve the existing card/list layout for populated data.

- [ ] **Step 5: Send timezone and render booking-specific cards.**

Resolve once in `Analytics`:

```ts
const dashboardTimezone =
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
```

Add it only to `bookingFilters`. Extend `BookingsData` with `BookingAnalyticsBreakdowns`.

Add a named `BookingAnalyticsBreakdownsSection` component that maps API rows to `AnalyticsBreakdownCard` items:

- Clicked weekdays: `N click(s)`;
- Availability by selected date: format the date in the local browser without reparsing it as UTC, then show `N check(s) · M slot(s)` or `N check(s) · M–P slots`;
- Most booked weekdays/times: `N booking(s)`.

Pass `No date clicks in this period`, `No availability checks in this period`, and `No booking requests in this period` as the corresponding empty messages.

Render click/availability cards only when an event type is selected. Render booked weekday/time cards in both all-event-types and selected-event-type views. Give both D1-derived cards this description (adjusting “and event type” when none is selected):

> Booking requests in the selected period and event type; traffic and device filters do not apply.

Place the section after `DetailedReportSection` and before the existing Booking Funnel card.

- [ ] **Step 6: Rerun dashboard and build GREEN.**

```bash
bun test tests/analytics-dashboard.test.tsx
bun run build
```

Expected: all four concrete datasets render with their correct units, Journey sources and Visitor devices still say visitors, the booking request carries the browser timezone, and no removed card returns.

- [ ] **Step 7: Commit the dashboard change.**

```bash
git add src/components/analytics/AnalyticsBreakdownCard.tsx src/pages/Analytics.tsx tests/analytics-dashboard.test.tsx
git commit -m "feat: show concrete booking analytics"
```

---

### Task 4: Publish and verify the new REST/MCP documentation contract

**Files:**

- Modify: `scripts/api-docs-catalog.ts`
- Modify: `scripts/generate-api-docs.ts`
- Modify: `scripts/llms-template.ts`
- Modify: `src/lib/api-reference.ts`
- Modify: `docs/deployment/detailed-funnel-analytics.md`
- Modify: `tests/api-docs-analytics.test.ts`
- Regenerate: `public/openapi.json`
- Regenerate: `public/llms.txt`
- Regenerate: `docs/api-endpoint-audit.md`

**Interfaces:**

- Booking REST query adds required `timezone` with an IANA example.
- `BookingAnalyticsResponse` documents `clickedWeekdays`, `selectedDateAvailability`, `bookedWeekdays`, and `bookedTimes`.
- Detailed funnel schemas expose stages, source, and device only.
- Anonymous event context exposes `selectedDateUtc`, form field metadata, and stage outcome only.

- [ ] **Step 1: Change generated-doc tests to specify the public contract.**

In `tests/api-docs-analytics.test.ts`, require booking query parameter names to include `timezone`, require that parameter's OpenAPI `required` flag to be true, require all four booking response properties, and assert `FunnelContextBreakdowns` is absent.

Require `AnonymousAnalyticsEventContext` to expose `selectedDateUtc` and not expose any removed local scheduling/failure property.

- [ ] **Step 2: Run the docs test RED.**

```bash
bun test tests/api-docs-analytics.test.ts
```

Expected failures: generated metadata still documents the six removed datasets, booking timezone is absent/optional, and the four replacement response fields do not exist.

- [ ] **Step 3: Update the source catalogs and schemas.**

Add optional `required?: boolean` to `PublicApiQueryParameter` and make the generator use `parameter.required ?? false`. Add a booking-only timezone query parameter:

```ts
{
  name: "timezone",
  required: true,
  description:
    "IANA timezone used to group and label dates, weekdays, and times.",
  schema: { type: "string", example: "Asia/Seoul" },
}
```

Update booking/form notes, remove `FunnelContextValue`, `FunnelContextBreakdowns`, stage `contextBreakdowns`, and detailed `failures` schemas, and add literal schemas for the four new booking arrays. Reduce `AnonymousAnalyticsEventContext` to the final allowlist.

Update `worker/mcp/tools/analytics.ts` descriptions if Task 2 did not already make the final copy explicit.

- [ ] **Step 4: Update human-facing API/deployment copy.**

In `scripts/llms-template.ts` and `src/lib/api-reference.ts`, describe UTC-backed clicked weekdays/availability, persisted booking-request weekday/time distributions, and the booking timezone parameter. State that every persisted booking request counts regardless of status and that source/device remain separate journey dimensions.

In `docs/deployment/detailed-funnel-analytics.md`, replace the removed failure/local-time smoke checks with:

- select a date and confirm a UTC click plus numeric slot count is ingested;
- select an event type and verify clicked weekday/selected-date slot range in the dashboard timezone;
- verify every-status seeded booking requests appear in booked weekday/time totals;
- verify Journey sources and Visitor devices remain;
- verify the six removed cards never render.

Update the REST curl example with `timezone=Asia%2FSeoul`.

- [ ] **Step 5: Generate artifacts and verify docs GREEN.**

```bash
bun run docs:generate
bun test tests/api-docs-analytics.test.ts
bun run docs:check
```

Expected: OpenAPI, llms.txt, and endpoint audit match their generators; booking timezone is required; old breakdown schemas/copy are absent.

- [ ] **Step 6: Run the complete release gate.**

Use `superpowers:verification-before-completion`, then run:

```bash
bun test
bun run lint
bun run docs:check
bun run build
git diff --check
git status --short
```

Expected: every command exits 0; only intended implementation/docs changes are present before the final commit.

- [ ] **Step 7: Request code review and resolve every finding.**

Use `superpowers:requesting-code-review`. Review specifically for UTC/date-boundary correctness, all-status D1 counting, source/device retention, eliminated local-time telemetry, REST/MCP parity, and tests that prove user-visible behavior. Return to the owning red-green step for any correction, rerun the release gate, and commit corrections separately with `git commit -am "fix: address booking analytics review"` before continuing.

- [ ] **Step 8: Commit the documentation and verified release state.**

```bash
git add scripts/api-docs-catalog.ts scripts/generate-api-docs.ts scripts/llms-template.ts src/lib/api-reference.ts docs/deployment/detailed-funnel-analytics.md tests/api-docs-analytics.test.ts public/openapi.json public/llms.txt docs/api-endpoint-audit.md
git commit -m "docs: publish concrete booking analytics"
```

- [ ] **Step 9: Confirm the final worktree is clean.**

```bash
git status --short
```

Expected: no output. Do not deploy. Deployment remains a separate explicitly authorized operation.

# Critical User-Outcome Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task by task, stopping at each review checkpoint.

**Goal:** Replace the deleted broad suite with a small integration-first suite that protects scheduling, booking delivery, forms, and workflows by asserting the exact outcomes a user or external provider receives.

**Architecture:** Bun runs all tests. Production services and components execute against an in-memory SQLite database initialized from every production migration. Only external boundaries are replaced: captured HTTP for Google, Resend, public APIs, and webhooks; a deterministic queue; a collected `waitUntil`; fixed time; and deterministic AI output. Tests assert persisted rows, rendered behavior, submitted UTC instants, exact provider payloads, and decoded calendar protocol data.

**Tech Stack:** Bun test, TypeScript, React 19, Testing Library, happy-dom, Drizzle ORM, `bun:sqlite`, Hono/Cloudflare application types.

## Global Constraints

- Follow the test-admission rule in `AGENTS.md` and the approved design in `docs/superpowers/specs/2026-07-27-critical-user-outcome-test-suite-design.md`.
- Do not restore any deleted test just because it existed before commit `e2dc383`.
- Do not set a test-count or coverage-percentage target.
- Do not add snapshots, source-text assertions, CSS-class assertions, `typeof` assertions, or tests whose only result is that a mock was called.
- Do not contact live Google, Resend, webhook, or AI services.
- Calculate expected timezone values as literal fixtures. Do not call the production formatter to derive the expected value.
- Before accepting a new scenario, prove it detects the protected failure:
  - If the production behavior is currently wrong, capture the natural red result before fixing it.
  - If the production behavior is already right, make the smallest named temporary mutation described below, run only the affected test, observe the expected failure, then revert that mutation before committing.
- Every task ends with a focused test run, review of the diff, and a commit. Never commit a temporary mutation.

---

## Task 1: Restore the Minimal Harness and Protect Slot Generation

**Files:**

- Modify: `package.json`
- Modify: `bun.lock`
- Create: `bunfig.toml`
- Create: `tests/setup/dom.ts`
- Create: `tests/setup/cleanup.ts`
- Create: `tests/support/test-db.ts`
- Create: `tests/support/fixed-time.ts`
- Create: `tests/support/fixtures.ts`
- Create: `tests/critical/availability-timezones.test.ts`
- Test: `tests/critical/availability-timezones.test.ts`

### Step 1: Install only the component-test dependencies and add focused scripts

- [ ] Run:

```bash
bun add --dev @happy-dom/global-registrator @testing-library/dom @testing-library/react @testing-library/user-event
```

- [ ] Add these scripts to `package.json` without changing the existing build, lint, or deploy scripts:

```json
"test": "bun test",
"test:critical": "bun test tests/critical"
```

- [ ] Confirm the lockfile contains only the requested test packages and their transitive dependencies:

```bash
git diff -- package.json bun.lock
```

### Step 2: Add deterministic DOM setup and cleanup

- [ ] Create `bunfig.toml`:

```toml
[test]
preload = ["./tests/setup/dom.ts", "./tests/setup/cleanup.ts"]
```

- [ ] Create `tests/setup/dom.ts` with happy-dom plus only the browser APIs used by the real components:

```ts
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: function matchMedia(query: string): MediaQueryList {
    return {
      matches: false,
      media: query,
      onchange: null,
      addListener: function addListener() {},
      removeListener: function removeListener() {},
      addEventListener: function addEventListener() {},
      removeEventListener: function removeEventListener() {},
      dispatchEvent: function dispatchEvent() {
        return false;
      },
    };
  },
});

class TestResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver = TestResizeObserver;
```

- [ ] Create `tests/setup/cleanup.ts`:

```ts
import { afterEach } from "bun:test";
import { cleanup } from "@testing-library/react";

afterEach(function cleanRenderedComponents() {
  cleanup();
});
```

### Step 3: Build a migration-backed database helper

- [ ] Create `tests/support/test-db.ts`. It must:
  - open `new Database(":memory:")`;
  - enable foreign keys with `sqlite.run("PRAGMA foreign_keys = ON")`;
  - read every sorted `*.sql` file from `worker/db/drizzle`;
  - split statements on `--> statement-breakpoint`;
  - run every non-empty statement;
  - return both the Drizzle handle and a `close()` function so each test releases SQLite.

```ts
import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import * as dbSchema from "../../worker/db/schema";

export interface TestDatabase {
  db: DrizzleD1Database<Record<string, unknown>>;
  sqlite: Database;
  close(): void;
}

export function createTestDb(): TestDatabase {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA foreign_keys = ON");
  const migrationsDirectory = join(
    import.meta.dir,
    "../../worker/db/drizzle",
  );
  const migrationFiles = readdirSync(migrationsDirectory)
    .filter(function isSql(file) {
      return file.endsWith(".sql");
    })
    .sort();

  for (const file of migrationFiles) {
    const sql = readFileSync(join(migrationsDirectory, file), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed) sqlite.run(trimmed);
    }
  }

  const db = drizzle(sqlite, {
    schema: dbSchema.schema,
  }) as unknown as DrizzleD1Database<Record<string, unknown>>;

  return {
    db,
    sqlite,
    close: function close() {
      sqlite.close();
    },
  };
}
```

- [ ] Add `tests/support/fixed-time.ts`:

```ts
import { setSystemTime } from "bun:test";

export function setFixedTime(iso: string): void {
  setSystemTime(new Date(iso));
}

export function restoreRealTime(): void {
  setSystemTime();
}
```

- [ ] Every test file that fixes time must call `restoreRealTime()` from `afterEach`.

### Step 4: Add realistic scheduling fixtures without duplicating production decisions

- [ ] In `tests/support/fixtures.ts`, export descriptive constant IDs and insert helpers:

```ts
export const FIXTURE_IDS = {
  owner: "owner-aki",
  project: "project-acme",
  schedule: "schedule-new-york",
  eventType: "event-discovery",
  destinationConnection: "calendar-destination",
  inviteConnection: "calendar-invite",
  booking: "booking-existing",
} as const;

export const CROSS_TIMEZONE_SLOT_ISO = "2026-03-23T13:00:00.000Z";

export const CROSS_TIMEZONE_VIEWERS = [
  {
    timezone: "Europe/Berlin",
    date: "2026-03-23",
    startLabel: "2:00 PM",
    endLabel: "2:30 PM",
  },
  {
    timezone: "Europe/Helsinki",
    date: "2026-03-23",
    startLabel: "3:00 PM",
    endLabel: "3:30 PM",
  },
  {
    timezone: "Europe/Guernsey",
    date: "2026-03-23",
    startLabel: "1:00 PM",
    endLabel: "1:30 PM",
  },
  {
    timezone: "Asia/Kathmandu",
    date: "2026-03-23",
    startLabel: "6:45 PM",
    endLabel: "7:15 PM",
  },
  {
    timezone: "Asia/Seoul",
    date: "2026-03-23",
    startLabel: "10:00 PM",
    endLabel: "10:30 PM",
  },
  {
    timezone: "Pacific/Kiritimati",
    date: "2026-03-24",
    startLabel: "3:00 AM",
    endLabel: "3:30 AM",
  },
  {
    timezone: "Pacific/Pago_Pago",
    date: "2026-03-23",
    startLabel: "2:00 AM",
    endLabel: "2:30 AM",
  },
] as const;
```

- [ ] Add `seedAvailabilityScenario(db, overrides)` that inserts the real user, project, schedule, weekly availability rule, and event type. Its defaults are:
  - project slug `acme`;
  - event slug `discovery-call`;
  - organizer timezone `America/New_York`;
  - Monday availability `09:00`–`09:30`;
  - duration 30 minutes;
  - slot interval 30 minutes;
  - enabled;
  - no confirmation, buffers, caps, or overrides.
- [ ] Let `overrides` alter stored schedule, rule, and event-type columns, but do not let the fixture calculate availability or expected slots.

### Step 5: Write the cross-timezone and DST scenarios

- [ ] In `tests/critical/availability-timezones.test.ts`, use `AvailabilityService.getAvailableSlots()` for the cross-timezone table. Each labeled row must assert that:
  - querying the literal viewer date returns one slot;
  - its `start` is exactly `2026-03-23T13:00:00.000Z`;
  - its `end` is exactly `2026-03-23T13:30:00.000Z`.
- [ ] Use `formatInTimeZone` only to display returned instants for diagnostic assertions. Compare against the literal date and `HH:mm` values below:

```ts
const expectedLocalValues = [
  ["Europe/Berlin", "2026-03-23", "14:00"],
  ["Europe/Helsinki", "2026-03-23", "15:00"],
  ["Europe/Guernsey", "2026-03-23", "13:00"],
  ["Asia/Kathmandu", "2026-03-23", "18:45"],
  ["Asia/Seoul", "2026-03-23", "22:00"],
  ["Pacific/Kiritimati", "2026-03-24", "03:00"],
  ["Pacific/Pago_Pago", "2026-03-23", "02:00"],
] as const;
```

- [ ] Add one spring-forward scenario using `buildSlotsForWindow()` for New York on `2026-03-08`. Assert literal local labels `01:00`, `01:30`, `03:00`, and `03:30`; assert no label starts with `02:`.
- [ ] Add one fall-back scenario for New York on `2026-11-01`. Assert the
  repeated local `01:00` hour contains the two distinct UTC starts
  `2026-11-01T05:00:00.000Z` and `2026-11-01T06:00:00.000Z` instead of
  deduplicating by label.
- [ ] Add one scenario containing both extreme viewers:
  - `Pacific/Kiritimati` sees the Monday 09:00 New York slot on Tuesday, March 24;
  - `Pacific/Pago_Pago` sees it on Monday, March 23;
  - adjacent viewer dates return no copy of that slot.
- [ ] Prove the extreme-date scenario detects the failure by temporarily changing `getScheduleDatesForViewerDay()` in `worker/lib/timezone.ts` to return only its first date. Run:

```bash
bun test tests/critical/availability-timezones.test.ts --test-name-pattern "queries every organizer date overlapping an extreme viewer day"
```

Expected red result: either Kiritimati or Pago Pago loses the real slot. Restore the original function immediately and rerun green.

### Step 6: Write buffer, confirmation, busy-time, and override scenarios

- [ ] Seed Monday availability `09:00`–`12:00`, duration 30, buffer before 15, and buffer after 15. Insert:
  - one confirmed booking from 10:00–10:30 organizer-local time,
    `2026-03-23T14:00:00.000Z`–`2026-03-23T14:30:00.000Z`;
  - one captured Google busy interval from 11:45–12:00 organizer-local time,
    `2026-03-23T15:45:00.000Z`–`2026-03-23T16:00:00.000Z`.
- [ ] Call `getAvailableSlots()` with the Google interval passed through
  `externalBusySlots`. Assert the exact remaining starts are
  `2026-03-23T13:00:00.000Z` and `2026-03-23T15:00:00.000Z`. This single
  scenario proves overlap against the pre-buffer, meeting, and post-buffer
  ranges for database and provider conflicts.
- [ ] Fix `now` at `2026-03-23T12:00:00.000Z`. Seed confirmation-required Monday availability `09:00`–`11:00`, duration 30, and a 30-minute pre-event buffer. Assert the exact eligible starts are `2026-03-23T14:00:00.000Z` and `2026-03-23T14:30:00.000Z`; `13:00Z` and `13:30Z` must be absent because the buffer boundary is not strictly more than one hour away.
- [ ] Prove this test detects the failure by temporarily passing `0` instead of `eventType.bufferBefore` to `isBookableStartTime()` in `AvailabilityService`. Run only the confirmation test and observe an ineligible earlier slot appear. Restore the argument and rerun green.
- [ ] Add one override scenario with two subcases in the same test:
  - a blocked organizer-local Monday produces no slots even when the visitor's selected calendar date differs;
  - a custom override of `15:00`–`16:00` replaces, rather than supplements, the weekly `09:00` window.

### Step 7: Review, verify, and commit Task 1

- [ ] Run:

```bash
bun test tests/critical/availability-timezones.test.ts
bun run lint
git diff --check
git status --short
```

- [ ] Review each test name against the admission rule. Remove any assertion that only checks a return type or repeats a stronger scenario.
- [ ] Commit:

```bash
git add package.json bun.lock bunfig.toml tests/setup tests/support tests/critical/availability-timezones.test.ts
git commit -m "test: protect critical availability outcomes"
```

---

## Task 2: Protect the Rendered Public Booking Timezone Journey

**Files:**

- Modify: `src/pages/PublicBooking.tsx`
- Create: `tests/support/http-capture.ts`
- Create: `tests/support/render.tsx`
- Create: `tests/critical/public-booking-timezones.test.tsx`
- Test: `tests/critical/public-booking-timezones.test.tsx`

### Step 1: Add a strict captured-fetch router

- [ ] Create `tests/support/http-capture.ts` with these public shapes:

```ts
export interface CapturedRequest {
  method: string;
  url: URL;
  headers: Headers;
  text: string;
  json: unknown;
}

export interface HttpCapture {
  requests: CapturedRequest[];
  fetch: typeof globalThis.fetch;
  requestsFor(method: string, pathname: string): CapturedRequest[];
  restore(): void;
}

export function installHttpCapture(
  routes: Array<{
    method: string;
    matches(url: URL): boolean;
    respond(request: CapturedRequest): Response | Promise<Response>;
  }>,
): HttpCapture;
```

- [ ] Parse request bodies once. Set `json` to the parsed value only for valid JSON; otherwise set it to `null`.
- [ ] Reject every unexpected request with an error containing its method and complete URL. Never silently return a generic 200 response.
- [ ] Preserve the original `globalThis.fetch` and restore it in `restore()`.

### Step 2: Add an isolated component render helper

- [ ] Create `tests/support/render.tsx` with:
  - a fresh `QueryClient` per render;
  - retries disabled;
  - `MemoryRouter` initialized with the supplied route;
  - the real React Query and router providers;
  - a return value containing the Testing Library result and `queryClient`.

```ts
export interface RenderRouteOptions {
  route: string;
  routePattern: string;
}

export function renderRoute(
  element: React.ReactElement,
  options: RenderRouteOptions,
): RenderResult & { queryClient: QueryClient };
```

- [ ] Implement the router wrapper with a real route match so `useParams()` sees
  the production parameter names:

```tsx
<MemoryRouter initialEntries={[options.route]}>
  <Routes>
    <Route path={options.routePattern} element={element} />
  </Routes>
</MemoryRouter>
```

### Step 3: Add a narrow timezone seam to `PublicBooking`

- [ ] Change only the timezone source; do not change default runtime behavior:

```ts
interface PublicBookingProps {
  viewerTimezone?: string;
}

export default function PublicBooking({
  viewerTimezone,
}: PublicBookingProps = {}) {
  const timezone =
    viewerTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
```

- [ ] Continue sending `timezone` through the existing availability query and booking POST. Do not introduce a test-only branch elsewhere in the component.

### Step 4: Render the real booking journey for five meaningful viewers

- [ ] Seed the same New York `2026-03-23 09:00` event used by Task 1.
- [ ] Fix wall time at `2026-03-20T12:00:00.000Z` so the component treats
  March 23 and March 24 as selectable future dates. Restore real time after
  every row.
- [ ] Configure captured public API routes:
  - `GET /api/v1/event-types/acme/discovery-call` returns the realistic public event type;
  - `GET /api/v1/availability/acme` delegates to the seeded real `AvailabilityService`, using the request's `date`, `timezone`, and `eventTypeSlug`;
  - `POST /api/v1/bookings` captures the body and returns a realistic confirmed booking response.
- [ ] Table-drive only these viewer journeys because each has a distinct conversion risk:
  - Berlin: same-day positive offset;
  - Helsinki: different European offset;
  - Guernsey: British-island timezone identifier;
  - Kathmandu: 45-minute offset;
  - Kiritimati: UTC+14 next-day crossing.
- [ ] For each viewer, render:

```tsx
<PublicBooking viewerTimezone={scenario.timezone} />
```

with route:

```ts
`/acme/discovery-call?date=${scenario.date}`
```

- [ ] Pass `routePattern: "/:projectSlug/:slug"` to `renderRoute()`.
- [ ] Assert the availability request includes the literal selected `date`, viewer `timezone`, and `eventTypeSlug=discovery-call`.
- [ ] Assert the literal local start and end labels from `CROSS_TIMEZONE_VIEWERS` appear.
- [ ] Select the slot, activate `Your details`, enter `Hanna Guest` and `hanna@example.com`, and activate `Confirm Booking`.
- [ ] Assert the POST body contains:

```ts
{
  projectSlug: "acme",
  eventTypeSlug: "discovery-call",
  name: "Hanna Guest",
  email: "hanna@example.com",
  startTime: "2026-03-23T13:00:00.000Z",
  timezone: scenario.timezone,
}
```

- [ ] The Kiritimati row must additionally assert that March 24 shows `3:00 AM` and does not render `No available times on this date`.

### Step 5: Prove the component scenario catches display/instant divergence

- [ ] Temporarily make the slot label formatter in `PublicBooking.tsx` format the returned instant in `"UTC"` instead of the viewer timezone.
- [ ] Run:

```bash
bun test tests/critical/public-booking-timezones.test.tsx --test-name-pattern "Kathmandu"
```

Expected red result: `6:45 PM` is absent even though the ISO instant remains correct.
- [ ] Restore viewer-timezone formatting and rerun the entire file.

### Step 6: Review, verify, and commit Task 2

- [ ] Run:

```bash
bun test tests/critical/public-booking-timezones.test.tsx
bun test tests/critical/availability-timezones.test.ts
bun run lint
git diff --check
```

- [ ] Commit:

```bash
git add src/pages/PublicBooking.tsx tests/support/http-capture.ts tests/support/render.tsx tests/critical/public-booking-timezones.test.tsx
git commit -m "test: protect public booking timezone journey"
```

---

## Task 3: Protect Booking, Calendar, Invite, and Email Delivery

**Files:**

- Modify: `worker/db/schema.ts`
- Create: `worker/db/drizzle/0033_persist_booking_calendar_identity.sql`
- Create: `worker/db/drizzle/meta/0033_snapshot.json`
- Modify: `worker/db/drizzle/meta/_journal.json`
- Modify: `worker/services/email-service.ts`
- Modify: `worker/lib/booking-actions.ts`
- Modify: `worker/index.ts`
- Create: `tests/support/wait-until.ts`
- Create: `tests/support/fake-queue.ts`
- Extend: `tests/support/fixtures.ts`
- Extend: `tests/support/http-capture.ts`
- Create: `tests/critical/booking-delivery.test.ts`
- Test: `tests/critical/booking-delivery.test.ts`

### Step 1: Add background-work and provider helpers

- [ ] Create `tests/support/wait-until.ts`:

```ts
export interface WaitUntilCollector {
  waitUntil(promise: Promise<unknown>): void;
  flush(): Promise<void>;
}

export function createWaitUntilCollector(): WaitUntilCollector {
  const pending: Promise<unknown>[] = [];
  return {
    waitUntil: function waitUntil(promise) {
      pending.push(promise);
    },
    flush: async function flush() {
      while (pending.length > 0) {
        const batch = pending.splice(0, pending.length);
        await Promise.all(batch);
      }
    },
  };
}
```

- [ ] Create `tests/support/fake-queue.ts` now because booking actions dispatch
  real workflow triggers. Use the `FakeQueue<T>` interface and implementation
  specified in Task 5, Step 1. Task 3 may inspect captured messages but must not
  drain workflow execution yet.
- [ ] Extend the HTTP capture with exact hermetic provider routes:
  - Google OAuth token returns `access_token: "google-access-token"` and `expires_in: 3600`;
  - Google event creation returns `id: "google-event-123"`, `iCalUID: "google-uid-123@google.com"`, organizer `calendar-owner@example.com`, and Meet URL `https://meet.google.com/abc-defg-hij`;
  - Google delete returns 204;
  - Resend returns a unique deterministic message ID for each accepted payload.
- [ ] Add helpers that return all Google requests and all parsed Resend payloads. These helpers may parse requests; they must not decide whether a payload is correct.

### Step 2: Seed one realistic delivery fixture

- [ ] Extend `tests/support/fixtures.ts` with `seedBookingDeliveryScenario(db, options)`. Default stored values:
  - owner `Aki Owner <aki@encited.com>`;
  - project `Acme`, slug `acme`;
  - project settings
    `{"theme":{"primaryBg":"#1B4332","primaryText":"#ffffff","borderRadius":16}}`;
  - event `Discovery call`, slug `discovery-call`, 30 minutes;
  - location `Remote studio`;
  - destination connection `calendar-owner@example.com`, calendar ID `team/calendar@group.calendar.google.com`;
  - additional invite connection `observer@example.com`;
  - guest `Hanna Guest <hanna@example.com>`;
  - guest timezone `Europe/Helsinki`;
  - start `2026-03-23T13:00:00.000Z`, end `2026-03-23T13:30:00.000Z`;
  - notes containing a comma, semicolon, backslash, and `\r\nX-EVIL:injected`;
  - linked form response with non-empty `Company = Northstar Oy` and empty `Optional note`.
- [ ] Store destination and invite connection IDs in the event type. Include the destination connection in the invite-ID list as well, so the test proves it is excluded instead of relying on a tidy fixture.

### Step 3: Test immediate confirmation as one delivery contract

- [ ] Call the real `createBookingAction()` with the seeded database, captured provider HTTP, fake queue environment, and collected `waitUntil`.
- [ ] Assert the synchronous result is confirmed, then `await collector.flush()`.
- [ ] Assert one Google event POST targets the URL-encoded destination calendar and has:
  - `sendUpdates=all`;
  - `conferenceDataVersion=1`;
  - `Authorization: Bearer google-access-token`;
  - JSON content type;
  - summary `Discovery call with Hanna Guest`;
  - start `{dateTime: "2026-03-23T13:00:00.000Z"}`;
  - end `{dateTime: "2026-03-23T13:30:00.000Z"}`;
  - the exact notes, email-60-minute and popup-10-minute reminders, and
    Hangouts Meet conference solution;
  - attendees exactly `hanna@example.com` and `observer@example.com`, once each;
  - no `calendar-owner@example.com` attendee.
- [ ] The conference request ID is provider-required nondeterministic data.
  Assert it is a valid UUID without snapshotting the whole body.
- [ ] The first test run must also expose that provider iCal UID and organizer
  identity are currently used for the email but discarded from persistence.
  Keep assertions that the real booking row stores:
  - `google-event-123`;
  - `google-uid-123@google.com`;
  - `calendar-owner@example.com`;
  - `https://meet.google.com/abc-defg-hij`.
- [ ] Add `gcalICalUid: text("gcal_ical_uid")` and
  `gcalOrganizerEmail: text("gcal_organizer_email")` to the booking schema.
- [ ] Generate the exact migration artifacts:

```bash
bunx drizzle-kit generate --name persist_booking_calendar_identity
```

- [ ] Inspect
  `worker/db/drizzle/0033_persist_booking_calendar_identity.sql`; it must add
  only nullable `gcal_ical_uid` and `gcal_organizer_email` columns. Inspect the
  generated snapshot and journal rather than editing their schema content by
  hand.
- [ ] Update both the immediate and approval paths in
  `worker/lib/booking-actions.ts` to persist all four provider results in the
  same booking update:

```ts
{
  gcalEventId: gcalResult.id,
  gcalICalUid: gcalResult.iCalUID,
  gcalOrganizerEmail: gcalResult.organizer ?? calConnection.email,
  meetingUrl: gcalResult.meetingUrl,
}
```

- [ ] Assert the guest Resend payload exactly identifies:
  - sender `LinkyCal <noreply@updates.linkycal.com>`;
  - only `hanna@example.com` as recipient;
  - subject `Booking Confirmed: Discovery call`;
  - one `invite.ics` attachment with the exact content type.
- [ ] Parse the guest HTML with the DOM and assert rendered text contains
  Hanna, Discovery call, `Monday, March 23, 2026`,
  `3:00 PM - 3:30 PM EET`, Remote studio, notes, and Meet URL. Assert it does
  not contain `Company` or `Northstar Oy`.
- [ ] Assert the organizer payload is sent to `calendar-owner@example.com`, CCs `aki@encited.com`, and its rendered text includes the guest identity and `Company / Northstar Oy` but omits the empty optional field.

### Step 4: Decode and validate the calendar invitation as a protocol artifact

- [ ] Decode the attachment base64 and assert:
  - filename and content type;
  - every line break is CRLF;
  - every physical line is at most 75 octets, except continuation lines governed by RFC folding;
  - exactly one `BEGIN:VCALENDAR`, `BEGIN:VEVENT`, and `BEGIN:VALARM`;
  - `METHOD:REQUEST`;
  - `UID:google-uid-123@google.com`;
  - `DTSTART:20260323T130000Z`;
  - `DTEND:20260323T133000Z`;
  - organizer `calendar-owner@example.com`;
  - attendee `hanna@example.com`;
  - Discovery call summary, escaped notes, Remote studio, and Meet URL;
  - no physical line beginning `X-EVIL:`.
- [ ] Do not snapshot the ICS file. Parse/unfold it and assert the named protocol properties.
- [ ] Prove the test catches attendee delivery failure by temporarily removing `attendees` from the Google request builder, run the immediate-confirmation test, observe the exact attendee assertion fail, then restore it.

### Step 5: Test pending creation followed by approval

- [ ] Seed the same scenario with `requiresConfirmation=true`.
- [ ] Seed one active `booking_confirmed` workflow with one observable first
  step so confirmation dispatch creates a real workflow run and queue message.
- [ ] Fix time at `2026-03-20T12:00:00.000Z` so the requested booking passes
  the real confirmation lead rule. With the Monday start and no pre-buffer,
  assert the stored expiration is exactly `2026-03-21T12:00:00.000Z`, the
  earlier of 24 hours and the confirmation deadline.
- [ ] Call `createBookingAction()` and flush background work.
- [ ] Assert:
  - persisted status is `pending`;
  - the real confirmation deadline is stored;
  - no Google event POST occurred;
  - guest Resend subject and rendered body say the request is awaiting confirmation and show the Helsinki-local requested time;
  - organizer Resend body includes the exact dashboard URL, guest identity, and non-empty submitted field.
- [ ] Call the real `confirmBookingAction()` for the same booking and flush.
- [ ] Assert:
  - exactly one Google event POST now exists;
  - status becomes confirmed;
  - Google identifiers and Meet URL are stored;
  - the guest receives the same confirmation and valid ICS contract as the immediate path;
  - the workflow-run context contains the confirmed booking ID;
  - the fake queue contains that run's `{workflowRunId, stepIndex: 0}` message.

### Step 6: Capture the existing cancellation regression, then fix it

- [ ] Seed a confirmed booking with Google event ID `google-event-to-delete`.
- [ ] Call `cancelBookingAction()` with reason `Host is unavailable` and flush.
- [ ] First run must naturally fail because current production code sends the event-type ID and UTC time in the cancellation email.
- [ ] Keep the failing assertions:
  - Google DELETE targets the encoded destination calendar and event ID with `sendUpdates=all`;
  - booking status persists as `cancelled`;
  - guest email subject/body identifies `Discovery call`, not `event-discovery`;
  - body shows the Helsinki-local date/time and timezone abbreviation;
  - body includes `Host is unavailable`.
- [ ] Fix `worker/services/email-service.ts`:

```ts
interface BookingCancellationParams {
  to: string;
  guestName: string;
  eventTypeName: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  reason?: string;
  theme?: EmailTheme;
}
```

- [ ] Destructure `timezone` in `sendBookingCancellation()` and format date/time with it, including `formatTimeZoneShort(startTime, timezone)`.
- [ ] In `cancelBookingAction()`, select both `projectId` and `name` from the event type in the cancellation-email background task. Pass:

```ts
eventTypeName: eventType?.name ?? "Meeting",
timezone: booking.timezone,
```

- [ ] Reuse that same lookup for the project theme within the background task. Do not add a second event-type query.
- [ ] Run only the cancellation test and confirm it is green.

### Step 7: Test decline and paid form-response notification

- [ ] Decline a pending booking with `notify=true` and reason `Requested time cannot be hosted`.
- [ ] Assert no Google event request occurs, status persists as declined, and the guest payload/rendered HTML contains:
  - host `Aki Owner`;
  - event `Discovery call`;
  - Helsinki-local requested date/time;
  - the reason.
- [ ] Change `notifyFormResponseCompleted()` in `worker/index.ts` to a named export without changing its runtime call sites:

```ts
export async function notifyFormResponseCompleted(
```

- [ ] Seed a Pro entitlement, a form named `Partner application`, configured notification recipient `forms@encited.com`, response email `respondent@example.com`, and fields:
  - `Company = <Northstar & Co>`;
  - `Website = https://northstar.example`.
- [ ] Call the real exported notification function.
- [ ] Assert the exact Resend recipient and subject; parse rendered HTML and assert the form name, respondent, labels, and values. Assert the captured HTML contains escaped user input and no executable `<Northstar` element.

### Step 8: Review, verify, and commit Task 3

- [ ] Run:

```bash
bun test tests/critical/booking-delivery.test.ts
bun test tests/critical/availability-timezones.test.ts tests/critical/public-booking-timezones.test.tsx
bun run lint
git diff --check
```

- [ ] Inspect every provider assertion. It must validate payload content, persistence, or protocol output—not just request count.
- [ ] Commit:

```bash
git add worker/db/schema.ts worker/db/drizzle worker/services/email-service.ts worker/lib/booking-actions.ts worker/index.ts tests/support tests/critical/booking-delivery.test.ts
git commit -m "test: protect booking delivery contracts"
```

---

## Task 4: Protect Form Layout, Interaction, Conditions, and Submitted Payload

**Files:**

- Extend: `tests/support/fixtures.ts`
- Create: `tests/critical/form-experience.test.tsx`
- Test: `tests/critical/form-experience.test.tsx`

### Step 1: Create stored form fixtures that mirror real settings

- [ ] Add fixture builders for:
  - focused multi-step;
  - focused grouped section with `settings: "{\"groupFields\":true}"`;
  - classic single-page;
  - conditional source field, dependent field, and dependent step.
- [ ] Persist `sortOrder` values that differ from insertion order. Expected UI order must be literal in the test.
- [ ] Use production field types and settings; do not invent simplified test-only form shapes.

### Step 2: Test the focused form as a respondent journey

- [ ] Render the real public form path with:
  - introduction `Tell us about your project`;
  - required text field `Company name`;
  - choice field `Team size`;
  - completion copy `Thanks, we will be in touch`.
- [ ] Pass `routePattern: "/:projectSlug/:slug"` and route
  `/acme/project-intake` to `renderRoute()`.
- [ ] Capture these production public API calls:
  - `GET /api/public/forms/acme/project-intake` returns the stored form and
    project settings;
  - `POST /api/public/forms/acme/project-intake/responses` returns
    `{ "id": "response-hanna" }`;
  - `PATCH /api/public/forms/acme/project-intake/responses/response-hanna/steps/:stepIndex`
    records `{fields, complete}` and returns a successful response.
- [ ] Interact through accessible roles and labels.
- [ ] Assert:
  - introduction precedes the first question;
  - only one ungrouped question is visible at a time;
  - continuing with an empty required field shows the real validation message and does not PATCH or POST;
  - keyboard entry and pointer choice both work;
  - the final request contains the exact entered values and `complete: true`;
  - the configured completion copy is rendered.

### Step 3: Test grouped and classic stored settings

- [ ] For focused grouped mode, assert all fields in that section render on one screen in literal persisted `sortOrder`, both required messages appear together, and one checkpoint submits the whole group.
- [ ] For classic mode, assert every visible field is present before interaction and the real submit action sends all answers once.
- [ ] Assert persisted theme values on actual inline style properties of the input/control and submit action:
  - primary `#123456`;
  - text `#fefefe`;
  - radius `18px`.
- [ ] Do not assert Tailwind classes, ancestry, or a DOM snapshot.

### Step 4: Test conditional rendering and stale-answer removal end to end

- [ ] Seed source choice `Do you need implementation help?` with answers `Yes` and `No`.
- [ ] Make dependent field `Implementation budget` and dependent step `Technical details` visible only for `Yes`.
- [ ] In the rendered journey:
  1. choose `Yes`;
  2. assert both dependents appear;
  3. enter `25000` and `React migration`;
  4. change the source to `No`;
  5. assert both dependents disappear;
  6. submit.
- [ ] Assert the final PATCH/POST body includes the source answer `No` and excludes both hidden dependent field IDs. This payload assertion is the protected outcome; visibility alone is insufficient.

### Step 5: Test only condition semantics not diagnosed by the journey

- [ ] Add one labeled table against the real condition evaluator covering:

```ts
const conditionCases = [
  "all requires every rule",
  "any accepts one matching rule",
  "scalar equality distinguishes different values",
  "multiselect membership finds a selected option",
  "numeric equality does not coerce a different boundary",
  "exists distinguishes an answer from an empty value",
  "missing source does not reveal a dependent",
  "unknown persisted operator fails closed",
] as const;
```

- [ ] Each row must supply literal answers, a literal persisted condition, and one expected visibility boolean. Do not make separate tests for equivalent operators already proven by a row.

### Step 6: Prove the form tests detect setting and stale-value failures

- [ ] Temporarily ignore `settings.groupFields` in the production model. Run only the grouped test and observe the one-screen/order contract fail. Restore it.
- [ ] Temporarily suppress `onClearFields(hiddenValueFieldIds)` in the real form experience. Run only the conditional journey and observe hidden IDs remain in the submitted payload. Restore it.
- [ ] Rerun the whole file green.

### Step 7: Review, verify, and commit Task 4

- [ ] Run:

```bash
bun test tests/critical/form-experience.test.tsx
bun test tests/critical
bun run lint
git diff --check
```

- [ ] Remove any DOM assertion that does not protect accessibility, visible flow, stored settings, validation, or final submitted data.
- [ ] Commit:

```bash
git add tests/support/fixtures.ts tests/critical/form-experience.test.tsx
git commit -m "test: protect public form outcomes"
```

---

## Task 5: Protect Queue-Driven Workflow Outcomes and Exact Outbound Payloads

**Files:**

- Extend: `tests/support/fake-queue.ts`
- Extend: `tests/support/fixtures.ts`
- Create: `tests/critical/workflow-journeys.test.ts`
- Test: `tests/critical/workflow-journeys.test.ts`

### Step 1: Extend the queue helper to drain delivery semantics

- [ ] Complete `tests/support/fake-queue.ts` with:

```ts
export interface CapturedQueueMessage<T> {
  body: T;
  delaySeconds: number;
}

export interface FakeQueue<T> {
  binding: Queue;
  messages: CapturedQueueMessage<T>[];
  drainNext(
    handler: (message: CapturedQueueMessage<T>) => Promise<void>,
  ): Promise<void>;
}

export function createFakeQueue<T>(): FakeQueue<T>;
```

- [ ] `binding.send(body, options)` records `options?.delaySeconds ?? 0`.
- [ ] `binding.sendBatch()` records every message and its delay.
- [ ] `drainNext()` removes exactly one message and throws if the queue is empty.
- [ ] Tests must explicitly drain messages through `WorkflowExecutionService.executeStep(workflowRunId, stepIndex, env)`. The fake queue must not implement workflow decisions.

### Step 2: Add workflow fixtures and deterministic environment

- [ ] Add helpers that seed a real contact, tag, active workflow, ordered workflow steps, and trigger context.
- [ ] Add `makeTestEnv(queue)` returning an `AppEnv` with the queue, test Resend key, and only the deterministic values required by these production paths. Cast at the boundary; do not spread a production environment.
- [ ] Add a deterministic `WorkflowAiResearchService` subclass that returns this exact public record:

```ts
{
  resultKey: "research-northstar",
  provider: "chatgpt",
  model: "deterministic-test-model",
  executedAt: "2026-03-23T12:00:00.000Z",
  result: {
    summary: "Northstar builds scheduling software for clinics.",
    company: "Northstar Oy",
    role: "Operations Lead",
    website: "https://northstar.example",
    linkedinUrl: "https://linkedin.com/company/northstar-oy",
    location: "Helsinki, Finland",
    description: "Clinic scheduling infrastructure",
    companySize: "51-200",
    estimatedRevenue: "€10M-€25M",
    recommendedTags: ["healthtech", "qualified"],
    insights: ["Expanding across the Nordic region"],
    sources: [
      {
        title: "Northstar company profile",
        url: "https://northstar.example/about",
        snippet: "Scheduling infrastructure for clinics",
      },
    ],
  },
}
```

### Step 3: Test one complete booking-triggered workflow

- [ ] Seed an active `booking_created` workflow with ordered steps:
  1. passing condition;
  2. add tag `Qualified`;
  3. send email;
  4. POST webhook;
  5. update contact company and notes.
- [ ] Dispatch through the real `WorkflowExecutionService.dispatchTrigger()` and drain every queued message in order.
- [ ] Assert:
  - one workflow run exists for the literal booking/contact;
  - the tag relation and contact values persist;
  - Resend receives the exact interpolated `to`, subject, and rendered HTML;
  - Resend header `Idempotency-Key` is exactly `workflow-run/<run-id>/step/2/send-email`;
  - webhook method, URL, interpolated headers, and parsed JSON body exactly match stored configuration;
  - step logs persist resolved inputs and provider-safe outputs for each step;
  - run status is `completed`.

### Step 4: Test the false condition and delayed continuation

- [ ] Run the same workflow with a contact that fails the user-configured condition.
- [ ] Assert no Resend or webhook request, no tag relation, no contact mutation, and persisted run/log state indicating the stopped path.
- [ ] Seed a separate workflow with:
  1. wait 900 seconds;
  2. update contact notes to `Follow-up due`.
- [ ] Drain the wait step and assert the next captured message has `delaySeconds: 900`.
- [ ] Assert the contact remains unchanged before draining that message.
- [ ] Drain it once, assert the notes persist and the run completes. Attempting to drain again must find no continuation message.

### Step 5: Test deterministic AI research persistence

- [ ] Inject the deterministic research service into the real `WorkflowExecutionService`.
- [ ] Run an AI-research step against a real contact.
- [ ] Assert the contact's company, role, website, LinkedIn URL, location, company size, revenue, notes, and metadata reflect the exact result.
- [ ] Assert the contact activity retains the public source title, URL, and snippet.
- [ ] Assert no expanded provider prompt, API key, or hidden instruction is persisted in contact data, activity, or step logs.
- [ ] Assert the run completes.

### Step 6: Test replay safety and permanent provider failure

- [ ] For an email step, execute the same queued `{workflowRunId, stepIndex}` twice.
- [ ] Assert only one logical Resend request exists and its idempotency key remains the exact run/step key. Assert the completed step/run state prevents a second independent delivery.
- [ ] Prove this scenario detects a failure by temporarily bypassing the completed-step early return in `executeStep()`, observe the duplicate outbound request, then restore the guard.
- [ ] In a separate webhook workflow, return a permanent 400 provider response with body containing `provider-secret-body`.
- [ ] Assert:
  - run becomes failed with a safe persisted message;
  - a later contact mutation does not execute;
  - `provider-secret-body`, configured authorization header values, and API keys are absent from run error, logs, and contact activity.
- [ ] Do not restore the former exhaustive retry/lease matrix. Add no additional retry test unless this journey fails to diagnose a demonstrated customer-impacting regression.

### Step 7: Review, verify, and commit Task 5

- [ ] Run:

```bash
bun test tests/critical/workflow-journeys.test.ts
bun test tests/critical
bun run lint
git diff --check
```

- [ ] Confirm every workflow test observes at least one real persistence, queue timing, outbound payload, or safe-failure result.
- [ ] Commit:

```bash
git add tests/support/fake-queue.ts tests/support/fixtures.ts tests/critical/workflow-journeys.test.ts
git commit -m "test: protect workflow user outcomes"
```

---

## Task 6: Admission Audit and Production Verification

**Files:**

- Review: `tests/critical/availability-timezones.test.ts`
- Review: `tests/critical/public-booking-timezones.test.tsx`
- Review: `tests/critical/booking-delivery.test.ts`
- Review: `tests/critical/form-experience.test.tsx`
- Review: `tests/critical/workflow-journeys.test.ts`
- Review: `tests/support/`
- Modify only if verification exposes a real defect.

### Step 1: Audit every test against the standing rule

- [ ] For each test, write its protected failure in one sentence during review. Delete the test if that sentence only says:
  - a value exists;
  - a function was called;
  - a source/export/class shape remains;
  - a string is a string;
  - a stronger journey already proves the same result.
- [ ] Merge table rows that exercise the same semantic branch and have the same failure diagnosis.
- [ ] Verify no file contains `toMatchSnapshot`, source-file reads, CSS class assertions, or a count/coverage target:

```bash
rg -n "toMatchSnapshot|readFileSync\\(.*(src|worker)|className|toHaveClass|coverage|test count|tests passed" tests
```

Any match must be reviewed. `readFileSync` is allowed only in `tests/support/test-db.ts` for production migrations.

### Step 2: Run the critical suite from a clean process

- [ ] Run:

```bash
bun test tests/critical
```

- [ ] Run the focused alias to prove the package script is wired:

```bash
bun run test:critical
```

- [ ] Repeat the critical suite once to catch leaked clocks, fetch handlers, DOM state, databases, or queue messages:

```bash
bun test tests/critical
```

### Step 3: Run repository validation

- [ ] Run:

```bash
bun run lint
bun run build
git diff --check
git status --short
```

- [ ] If the build regenerates `worker-configuration.d.ts`, inspect it and include it only if it reflects the current `wrangler.jsonc`; do not commit unrelated generated churn.
- [ ] If validation exposes a production defect, add or retain only the scenario that demonstrates its customer effect, implement the smallest fix, and rerun the affected file plus every command above.

### Step 4: Final diff review and commit

- [ ] Inspect the complete implementation against the approved design:

```bash
git diff --stat 9f5b81a..HEAD
git log --oneline 9f5b81a..HEAD
git status --short
```

- [ ] Confirm no temporary failure-proof mutation remains.
- [ ] If Task 6 required changes, commit them:

```bash
git add tests package.json bun.lock bunfig.toml src/pages/PublicBooking.tsx worker/services/email-service.ts worker/lib/booking-actions.ts worker/index.ts
git commit -m "test: finalize critical outcome suite"
```

- [ ] If Task 6 required no changes, do not create an empty commit.

## Done When

- A visitor in each selected edge timezone sees the correct literal local slot and submits the original UTC instant.
- Buffers, confirmation lead time, existing bookings, Google busy intervals, overrides, DST gaps/repeats, and date-line crossings produce the exact literal slots.
- Booking creation, approval, cancellation, and decline persist the right state and send exact Google/Resend payloads.
- The decoded ICS invite carries correct, safe calendar protocol data.
- Focused, grouped, classic, and conditional forms render and submit their stored behavior; hidden stale answers never leave the browser.
- Workflows persist configured mutations, emit exact email/webhook payloads, honor waits and conditions, retain public AI evidence, prevent duplicate logical delivery, and fail safely.
- No test exists to improve a count.
- `bun test tests/critical`, `bun run lint`, and `bun run build` all pass from a clean process.

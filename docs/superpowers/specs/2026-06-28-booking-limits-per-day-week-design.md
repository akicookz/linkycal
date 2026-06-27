# Booking limits: max calls per day / per week

**Date:** 2026-06-28
**Status:** Approved, pending implementation plan

## Problem

Hosts want to cap how many calls (bookings) a given event type accepts per day and
per week, to control their workload. A partial `maxPerDay` field already exists on
`eventTypes` but its enforcement is incorrect and there is no weekly limit and no UI.

### Current state of `maxPerDay`

- `worker/db/schema.ts` — `eventTypes.maxPerDay INTEGER` (nullable) exists.
- `worker/validation.ts` — create/update schemas validate `maxPerDay` (1–50, nullable).
- `worker/services/availability-service.ts:289` — enforcement is
  `if (maxPerDay !== null && slots.length > maxPerDay) return slots.slice(0, maxPerDay)`.
  This caps the number of **free slots shown**, but never subtracts already-booked
  calls, so with `maxPerDay: 2` and 2 calls already booked a visitor can still book
  2 more.
- `worker/services/availability-service.ts:146` — the existing booking query counts
  only `status = 'confirmed'`, ignoring `pending`.
- No frontend UI exposes `maxPerDay`.

### Booking status values (`worker/db/schema.ts`)

`confirmed | cancelled | rescheduled | pending | declined`.

"Count pending + booked, ignore rejected" maps to: count `pending` + `confirmed`;
ignore `cancelled`, `rescheduled`, `declined`.

## Decisions (from brainstorming)

1. **Scope:** per event type (extends the existing per-event-type `maxPerDay`).
2. **Timezone basis:** the host's **schedule timezone** (the limit is about host
   workload; the booker's timezone must not affect it).
3. **Week start:** configurable **per event type** (`'monday'` or `'sunday'`).
4. **Display behavior:** **gate** the day/week. Show all normally-available slots
   until the day's (or week's) count of pending+confirmed reaches the limit; once
   reached, that day (or the whole week) shows no slots.
5. **`maxPerDay` semantics change:** replace the slice behavior with true
   count-based gating that counts pending+confirmed. This is a deliberate fix.

## Approach

Enforce caps inside `AvailabilityService` via count-based gating. Booking creation
already rejects any booking whose slot is not in the freshly-computed available list
(`worker/lib/booking-actions.ts:203`), so a gated (empty) day/week automatically
blocks booking creation — no duplicate logic to keep in sync.

Additionally, add an explicit cap check in `createBookingAction` so a capped booking
returns a clear *"This day is fully booked"* / *"This week is fully booked"* error
instead of the generic *"Selected time slot is no longer available."*

Rejected alternative: enforcing only in `booking-actions` would leave the booking
page showing slots that fail on submit — bad UX.

## Design

### Data model — `worker/db/schema.ts` (+ generated migration)

Add to `eventTypes`:
- `maxPerWeek INTEGER` (nullable) — max pending+confirmed calls per week; null = unlimited.
- `weekStart TEXT NOT NULL DEFAULT 'monday'` — `'monday' | 'sunday'`; only meaningful
  when `maxPerWeek` is set.

Keep `maxPerDay` as-is (column unchanged; behavior changes in the service).

Generate the migration with `bun run db:generate` (never hand-write SQL). Apply with
`db:migrate:dev` locally and `db:migrate:prod` on deploy.

### Counting rule (shared)

A call counts toward a limit when `status ∈ {pending, confirmed}`, filtered by its
`startTime` falling within the relevant day/week range. Day and week ranges are
computed in the **schedule timezone**.

### Timezone helper — `worker/lib/timezone.ts`

Add `getWeekRangeForLocalDate(date: string, timezone: string, weekStart: 'monday' | 'sunday')`
returning `{ start: Date, end: Date }` (UTC) for the 7-day week (in `timezone`) that
contains `date`. Reuse the existing `getUtcRangeForLocalDate` for the per-day range.

### Enforcement — `worker/services/availability-service.ts`

- Remove the `slots.slice(0, maxPerDay)` block (lines 289–291).
- In `getAvailableSlots`, after resolving the schedule and before/around slot
  generation, when `maxPerDay` is set: count pending+confirmed bookings for the event
  type whose `startTime` is within the schedule-tz day for `date`; if `>= maxPerDay`,
  return `[]`.
- When `maxPerWeek` is set: count pending+confirmed bookings for the event type whose
  `startTime` is within the schedule-tz week (per `weekStart`) containing `date`; if
  `>= maxPerWeek`, return `[]`.
- These are separate count queries from the conflict-detection query; conflict
  detection (which only blocks on `confirmed` overlaps) is unchanged.

### Booking creation — `worker/lib/booking-actions.ts`

After the existing slot-availability check, add explicit day/week cap checks (same
counting rule) returning `409` with a clear message:
- day full → `"This day is fully booked"`
- week full → `"This week is fully booked"`

### Validation — `worker/validation.ts`

Add to create + update event-type schemas:
- `maxPerWeek: z.number().int().min(1).max(200).nullable().optional()`
- `weekStart: z.enum(['monday', 'sunday']).optional()`

### API + service + MCP

Thread `maxPerWeek` and `weekStart` through:
- `worker/index.ts` POST `/api/projects/:projectId/event-types` and PUT
  `/api/projects/:projectId/event-types/:id` handlers.
- `worker/services/event-type-service.ts` (`CreateEventTypeInput` + insert; update
  pass-through).
- `worker/mcp/tools/event-types.ts` for parity.

### Frontend — `src/pages/EventTypeForm.tsx`

Add a "Booking limits" section near the buffer settings:
- "Max calls per day" number input (empty = unlimited) → `maxPerDay`.
- "Max calls per week" number input (empty = unlimited) → `maxPerWeek`.
- "Week starts on" Monday/Sunday selector, shown when a weekly limit is entered →
  `weekStart`.

Follow existing UI conventions (squircle radii, forest-green palette, card-style
rows, icon+text, no border separators). Update the `EventType` type definitions in
`EventTypeForm.tsx`, `EventTypes.tsx`, `Dashboard.tsx`, `Bookings.tsx` to include
`maxPerWeek` and `weekStart`.

## Testing — `tests/worker/availability-service.test.ts`

- Daily gate counts pending **and** confirmed (not just confirmed).
- Daily gate ignores declined / cancelled / rescheduled.
- Daily gate: count below limit → slots returned; count at/over limit → `[]`.
- Weekly gate: at/over limit → `[]` for days in that week.
- `weekStart` boundary: a booking on Sunday counts in the prior or current week
  depending on Monday vs Sunday start.
- No limits set → behavior unchanged.
- (Optional) add a `getWeekRangeForLocalDate` unit test.

## Out of scope

- Project-wide (cross-event-type) caps.
- Changing conflict detection to block on `pending` bookings.
- Per-month or rolling-window limits.

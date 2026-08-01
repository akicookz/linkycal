# Concrete Booking Analytics

## Problem

The detailed analytics report currently exposes six context breakdowns that do
not give the project owner reliable scheduling answers:

- selected dates are repeated across multiple funnel stages and can overcount a
  single journey;
- availability outcomes do not explain visitor demand;
- offered and selected times are stored as visitor-local `HH:mm` strings, so
  different dates and timezones collapse into the same bucket;
- validation and submit-failure lists add noise without answering the booking
  questions the dashboard is meant to answer.

The useful retained dimensions are the anonymous journey source and device.
The useful new questions are:

- which weekday receives the most booking-date clicks;
- how many slots were available when visitors checked a selected date;
- which weekdays and start times receive the most booking requests.

Every date, weekday, and time displayed by the dashboard must use the current
dashboard viewer's browser timezone.

## Scope

Replace the six misleading context cards with concrete booking-demand facts.
Keep the existing detailed funnel, Journey sources, and Visitor devices.

Remove these cards from the detailed report for both booking and form funnels:

- Selected dates;
- Availability outcomes;
- Available times shown;
- Selected times;
- Validation failures;
- Submit failures.

Add these booking-only breakdowns:

- Clicked weekdays;
- Availability by selected date;
- Most booked weekdays;
- Most booked times.

Do not redesign the overview, headline conversion metrics, funnel stages,
time-series charts, event-type report, source card, or device card.

## Minimal Visitor Telemetry

Continue emitting funnel-stage events so the detailed funnel, source, and
device reports keep working. Reduce scheduling context to the facts required by
the replacement booking report.

### Date selection

When a visitor selects a booking calendar date, emit
`booking_date_selected` with:

- the existing anonymous journey, source, device, event-type, and stage
  identity;
- `selectedDateUtc`, an ISO-8601 UTC instant representing the start of the
  selected visitor-local calendar day.

This is a click event. Reports count event occurrences, not unique journeys, so
selecting three dates produces three clicks. Re-selecting a date produces
another click.

### Availability result

After a successful availability response, emit
`booking_availability_shown` with:

- the same `selectedDateUtc` convention;
- the existing numeric `slotCount`.

An empty successful response records `slotCount: 0`. A failed availability
request records no slot observation because the available-slot count is
unknown. The date-selection click remains recorded independently.

### Removed context

Stop sending and accepting these internal context fields:

- visitor-local selected-date strings and weekday labels;
- `viewerTimezone`;
- offered slot start strings;
- earliest and latest offered slot strings;
- availability outcome labels;
- selected clock-time strings;
- validation and submit failure categories used by the removed cards.

The stage events themselves remain. Removing their context breakdowns does not
remove funnel reach, continuation, skip, source, or device counts.

Customer-configured GA4, Meta Pixel, and PostHog integrations must receive only
properties that remain in the canonical event contract. They must not continue
receiving removed scheduling-context properties.

## Dashboard Timezone Contract

The Analytics page resolves the current browser's IANA timezone and includes it
as a required `timezone` query parameter on booking-analytics requests. The
Worker validates the IANA timezone before using it.

The Worker formats UTC instants into that timezone before grouping by calendar
date, weekday, or wall-clock start time. The API returns display-ready date,
weekday, and `HH:mm` labels so REST, MCP, and the dashboard use the same
calculation.

Changing the browser timezone and refetching the report may move an instant to
a different date, weekday, or clock-time bucket. No report uses the booking
visitor's timezone as its display timezone.

## Clicked Weekdays

Aggregate `booking_date_selected` event occurrences by the weekday obtained
from `selectedDateUtc` in the dashboard timezone. Return all observed weekdays
sorted by descending click count, with calendar order as the tie-breaker.

Each row contains:

- `weekday`;
- `clicks`.

This measures date interest, including visitors who never complete a booking.

## Availability by Selected Date

Combine successful `booking_availability_shown` observations by the calendar
date obtained from `selectedDateUtc` in the dashboard timezone. Each row
contains:

- `date`;
- `checks`, the number of successful availability responses;
- `minimumSlots`;
- `maximumSlots`.

If availability was stable, the minimum and maximum are equal and the UI shows
one exact slot count. If availability changed, the UI shows the concrete range
rather than inventing one representative number. Sort rows by descending
checks, then ascending date.

## Booking-Request Distributions

Use persisted booking rows as the source of truth. Do not emit another
analytics event for booked weekdays or times.

The report selects bookings belonging to the project, optionally limited to
the selected event type. The analytics period applies to `bookings.createdAt`,
which answers which requests were made during the selected reporting period.
Group each matching row's UTC `startTime` in the dashboard timezone.

Every persisted booking request counts exactly once regardless of its current
status. This includes confirmed, pending, cancelled, declined, rescheduled, and
superseded requests. A reschedule creates another persisted request, so both
the original request and the replacement request contribute once.

Return:

- `bookedWeekdays`: `{ weekday, bookings }[]`;
- `bookedTimes`: `{ time, bookings }[]`, where `time` is `HH:mm`.

Sort each list by descending request count, with calendar order or clock order
as the tie-breaker.

Because booking rows do not persist UTM, journey-source, or device attribution,
these two booking-request distributions follow the reporting period and event
type filters only. Source and device remain separate visitor-journey
breakdowns. The UI must not imply that an attribution filter was applied to a
D1-derived booking distribution.

## API and Report Shape

Replace the removed funnel context breakdowns in the booking report with:

```ts
interface ClickedWeekday {
  weekday: string;
  clicks: number;
}

interface SelectedDateAvailability {
  date: string;
  checks: number;
  minimumSlots: number;
  maximumSlots: number;
}

interface BookedWeekday {
  weekday: string;
  bookings: number;
}

interface BookedTime {
  time: string;
  bookings: number;
}
```

The booking report exposes `clickedWeekdays`, `selectedDateAvailability`,
`bookedWeekdays`, and `bookedTimes`. Journey source and device stay in the
detailed funnel report. Removed context arrays leave the shared report types and
dashboard types.

The form report retains detailed funnel stages, journey sources, and visitor
devices, but no longer exposes the six removed context cards.

The REST and MCP booking-analytics paths call the same production action and
return the same new fields.

## UI

Within the selected event-type detailed report:

- keep the detailed funnel first;
- show Clicked weekdays and Availability by selected date;
- show Most booked weekdays and Most booked times;
- show Journey sources and Visitor devices;
- render the standard empty state when a dataset has no rows.

Availability rows render either `N slots` when minimum and maximum match or
`N–M slots` when they differ. Counts use `clicks`, `checks`, or `bookings`; do
not label these values as visitors.

Booking-request distributions may also be shown in the all-event-types booking
view because they come from D1 and do not require detailed funnel selection.
Clicked-weekday and selected-date availability breakdowns continue to require
an event type, matching the current detailed Analytics Engine query boundary.

## Error Handling and Historical Data

If the Analytics Engine query succeeds but the booking query fails, the booking
analytics request fails rather than returning a partially contradictory
report. Existing API error handling returns the standard analytics failure.

Historical booking rows can populate booked weekday and time distributions
immediately. Historical visitor events lack `selectedDateUtc`, so clicked
weekday and selected-date availability breakdowns begin filling only after the
new event contract ships. The removed cards are not shown for historical data.

## Test Contract

Tests must protect observable reporting behavior rather than source shape or
styling classes:

- a public booking journey emits UTC date-selection and numeric slot-count
  facts without the removed context fields;
- changing the requested dashboard timezone changes clicked weekday/date
  buckets for the same stored UTC instants;
- repeated date clicks count as repeated clicks;
- successful availability responses report exact or ranged slot counts, while
  failed responses create no slot observation;
- every persisted booking row counts once regardless of status;
- rescheduled original and replacement rows both count;
- booked weekday and time grouping uses the requested dashboard timezone;
- event-type and period filters constrain booking rows;
- the dashboard renders the four replacement datasets plus Journey sources and
  Visitor devices and does not render the six removed cards;
- REST and MCP booking analytics return the same report contract;
- malformed IANA timezones are rejected.

Each new regression test must be demonstrated failing before production code is
changed, then the focused test, full suite, lint, and build must pass.

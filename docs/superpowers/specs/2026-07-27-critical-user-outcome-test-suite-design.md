# Critical User-Outcome Test Suite Design

**Date:** 2026-07-27

## Status and supersession

This design replaces the deleted broad test suite with a deliberately small,
integration-first suite for the product paths where a failure directly harms a
respondent, organizer, or workflow recipient.

This design supersedes
`docs/superpowers/plans/2026-07-27-test-suite-value-remediation.md`. That plan
assumed most of the former 218-test suite would remain. The suite and its
tooling were removed in commit `e2dc383`; this design does not restore it.

## Goal

Protect the following user outcomes with deterministic tests:

- A visitor sees the organizer's real availability on the correct local date
  and at the correct local time.
- Buffers, confirmation notice, busy events, overrides, and daylight-saving
  transitions remove or preserve the correct slots.
- A confirmed booking sends the correct Google Calendar request and the
  correct Resend messages.
- Guest email attachments contain a valid, correctly addressed calendar
  invitation with the booking's real data.
- Focused, grouped, and classic forms render and submit according to their
  stored settings.
- Form and step conditions change the rendered form and prevent hidden stale
  answers from being submitted.
- Workflows trigger, execute side effects, wait, stop, fail, and complete as
  users configured them.

There is no test-count or coverage-percentage target.

## Test admission rule

A test earns its place only when all of these are true:

1. Its name states a distinct user-visible, persistence, security, delivery, or
   interoperability failure.
2. It exercises the production path that can cause that failure.
3. It asserts the final observable result, not merely an internal function call.
4. Removing or breaking the protected behavior makes the test fail for a clear
   reason.
5. A stronger existing scenario does not already require the same behavior.

The suite must not contain:

- source-text, export-presence, or type-shape tests;
- `typeof value === "string"`-style assertions;
- tests whose only claim is that a mock was called;
- Tailwind class, DOM ancestry, implementation-key, or snapshot assertions;
- one test per trivial input when a labeled table describes one semantic
  contract;
- duplicate unit tests for behavior already proved by a stronger vertical
  journey;
- tests added to improve a count or percentage.

## Architecture

Use Bun's test runner for every suite. Restore only the tooling required to
render React components:

- `@happy-dom/global-registrator`
- `@testing-library/dom`
- `@testing-library/react`
- `@testing-library/user-event`

Restore `bunfig.toml` with DOM and Testing Library cleanup preloads. Add
`bun test` as the `test` script and a focused `test:critical` alias that runs
only `tests/critical`.

### Real dependencies

Tests use:

- the production timezone and slot-generation functions;
- `AvailabilityService`;
- the production booking lifecycle actions;
- `EmailService` and `CalendarService` through booking actions;
- `PublicBooking`, `PublicForm`, and `FormExperience`;
- `WorkflowExecutionService`;
- a real in-memory SQLite database initialized from every production migration.

### Replaced boundaries

Only boundaries that cannot run hermetically are replaced:

- `globalThis.fetch` captures Google, Resend, webhook, and public API requests;
- a fake Cloudflare queue records and drains queue messages;
- `waitUntil` collects promises so the test can await actual background work;
- the wall clock and browser timezone are fixed per scenario;
- AI providers return a deterministic structured research record.

Mocks must return realistic provider responses. Assertions inspect the complete
request or persisted result; they do not stop at call counts.

### Shared support

Create:

- `tests/support/test-db.ts` — migration-backed in-memory SQLite.
- `tests/support/fixed-time.ts` — fixed wall clock and browser IANA timezone.
- `tests/support/http-capture.ts` — URL-aware fetch router plus parsed request
  capture for Google, Resend, webhooks, and public APIs.
- `tests/support/fake-queue.ts` — Cloudflare-compatible message capture and
  deterministic queue draining.
- `tests/support/wait-until.ts` — collect and await background promises.
- `tests/support/render.tsx` — Query Client and router wrappers with per-render
  isolation.
- `tests/support/fixtures.ts` — realistic project, owner, schedule, event type,
  calendar connection, form, contact, tag, and workflow seed helpers.

Support modules may expose typed data builders, but they must not reimplement
production decisions or calculate expected values with the same production
helper being tested.

## Scheduling and timezone contracts

### Fixed cross-timezone anchor

Use an organizer schedule in `America/New_York` on Monday, 2026-03-23. The US
is already on daylight time while Europe has not changed yet. A 09:00 organizer
slot is the instant `2026-03-23T13:00:00.000Z`.

The same instant must render as:

| Viewer timezone | Viewer date and time |
| --- | --- |
| `Europe/Berlin` | 2026-03-23 14:00 |
| `Europe/Helsinki` | 2026-03-23 15:00 |
| `Europe/Guernsey` | 2026-03-23 13:00 |
| `Asia/Kathmandu` | 2026-03-23 18:45 |
| `Asia/Seoul` | 2026-03-23 22:00 |
| `Pacific/Kiritimati` | 2026-03-24 03:00 |
| `Pacific/Pago_Pago` | 2026-03-23 02:00 |

The expected values above are literal test fixtures. Tests must not generate
them with the production formatter.

### Function and service scenarios

`tests/critical/availability-timezones.test.ts` will prove:

1. The cross-timezone table above returns the same ISO slot while assigning it
   to each viewer's correct local date.
2. New York's 2026-03-08 spring-forward window produces 01:00, 01:30, 03:00,
   and 03:30 local slots and never invents 02:00.
3. New York's 2026-11-01 fall-back window preserves the two distinct UTC
   instants that both display as 01:00 locally.
4. A viewer day in UTC+14 or UTC-11 queries every overlapping organizer-local
   date and neither loses a real slot nor includes an adjacent-day slot.
5. Existing confirmed bookings and captured Google busy intervals block any
   candidate whose pre-buffer, meeting interval, or post-buffer overlaps them.
6. A confirmation-required slot is eligible only when the organizer's
   pre-event buffer starts strictly more than one hour after the fixed current
   instant.
7. A blocked schedule override removes the organizer-local day even when the
   visitor selected a different calendar date; a custom override replaces the
   weekly window.

The database scenarios use `AvailabilityService.getAvailableSlots`, not a
mocked repository.

### Rendered booking scenario

`tests/critical/public-booking-timezones.test.tsx` will render
`PublicBooking`. Its public event-type request returns a realistic event type,
and its availability request delegates to the real seeded
`AvailabilityService`.

For Berlin, Helsinki, Guernsey, Kathmandu, and Kiritimati, the test will:

1. set the browser IANA timezone;
2. select the literal viewer-local date;
3. assert the component requested that date and timezone;
4. assert the expected local start/end text is visible;
5. select the slot;
6. continue to the summary;
7. assert the booking request contains the original UTC ISO instant and the
   viewer timezone.

The Kiritimati path must explicitly prove the slot appears on March 24 and that
the component does not show “No available times on this date.”

## Booking delivery contracts

`tests/critical/booking-delivery.test.ts` will exercise production booking
actions with SQLite, captured `fetch`, captured `waitUntil`, and a fake queue.

### Immediate confirmation

Create a confirmed booking with:

- a destination Google Calendar connection;
- one additional invite connection;
- a guest in `Europe/Helsinki`;
- notes, location, a booking form response, and themed email settings.

Assert the Google Calendar request has:

- the encoded destination calendar URL;
- `sendUpdates=all` and `conferenceDataVersion=1`;
- bearer authorization and JSON content type;
- the exact event summary, UTC start/end, notes, and reminder configuration;
- the guest and configured invitee exactly once;
- no attendee entry for the destination organizer itself;
- conference creation enabled.

Return a provider event ID, iCal UID, organizer address, and meeting URL. Assert
those values are persisted on the booking.

Assert the captured guest Resend request has the exact sender, recipient,
subject, event name, guest name, viewer-local date/time, timezone abbreviation,
location, notes, meeting URL, and project theme. Parse the HTML as rendered text
instead of comparing an opaque snapshot.

Assert the organizer Resend request is addressed to the destination organizer,
CCs the owning account when those addresses differ, and contains the guest
identity and non-empty submitted form fields. The guest email must not contain
the private submitted-field section.

Decode the guest attachment from base64 and assert:

- filename `invite.ics`;
- content type `text/calendar; method=REQUEST; charset=utf-8`;
- CRLF line endings and legal folded-line lengths;
- one VCALENDAR, VEVENT, and VALARM;
- `METHOD:REQUEST`;
- the provider iCal UID;
- exact UTC `DTSTART` and `DTEND`;
- the provider organizer and guest attendee;
- event summary, escaped notes, location, and meeting URL;
- no injected ICS property when user text contains CR/LF or delimiters.

### Confirmation-required lifecycle

Create a pending booking and assert:

- Google Calendar receives no event request;
- the guest receives an “awaiting confirmation” message with the requested
  viewer-local time;
- the organizer receives an action-needed message with the correct dashboard
  URL and submitted details;
- the booking remains pending with its confirmation deadline.

Then approve the same booking and assert:

- exactly one Google event request is produced;
- the booking becomes confirmed and stores the returned calendar identifiers;
- the guest receives the same valid confirmation/ICS contract as the immediate
  path;
- workflow dispatch is queued for the confirmed event.

### Cancellation, decline, and form-response delivery

Cancel a confirmed booking that has a Google event ID. Assert the Google DELETE
request targets that event with `sendUpdates=all`, the booking is persisted as
cancelled, and the guest cancellation email contains the event, the booking's
viewer-local date/time, and the organizer's reason.

Decline a pending booking. Assert no Google request occurs, the pending booking
is persisted as declined, and the guest email contains the host identity,
event, requested viewer-local date/time, and decline reason.

Complete a public form response with mapped respondent email and non-empty
fields. Assert the owner notification is sent to the resolved recipient, its
subject identifies the form, its rendered HTML contains the respondent and
submitted values, and user-provided HTML is escaped rather than executed.

No test contacts live Google or Resend services.

## Form rendering and condition contracts

`tests/critical/form-experience.test.tsx` will render real form components and
interact by accessible names and visible copy.

### Focused form

A focused multi-step form with a meaningful introduction, required text input,
choice input, and completion field must:

- show the introduction before the first question;
- show one ungrouped question at a time;
- block progression with the real validation message when required input is
  empty;
- accept keyboard and pointer input;
- submit the entered values at the final checkpoint;
- show the configured completion copy.

### Grouped focused section

A focused section with `{ "groupFields": true }` must render every section
question together, validate all required fields on that screen, and submit the
group in one checkpoint. Question order must follow persisted `sortOrder`.

### Classic form

A single-page form must render every currently visible field together and apply
the persisted project theme to the actual controls and submission action.
Assertions use accessible controls and computed inline theme values, not
Tailwind class names.

### Conditional interaction

A real source choice controls both a dependent field and a dependent section.
The test will:

1. choose the revealing answer and observe both dependents;
2. enter values in them;
3. change the source answer;
4. observe both dependents disappear;
5. submit;
6. assert the hidden answers were cleared and are absent from the network
   payload.

A compact function-level table will cover distinct condition semantics not
fully diagnosed by the rendered journey: `all` versus `any`, scalar equality,
multiselect membership, numeric equality boundaries, presence, a missing source
field, and an unknown persisted operator. Rows are labeled by the user-visible
failure they represent.

## Workflow contracts

`tests/critical/workflow-journeys.test.ts` will use real workflow tables,
`WorkflowExecutionService`, a fake Cloudflare queue, captured HTTP, and
deterministic AI output.

### Booking-triggered side effects

Seed an active `booking_created` workflow containing a passing condition, tag
assignment, email, webhook, and contact update. Dispatch the trigger and drain
the queue in order.

Assert:

- one workflow run exists for the booking/contact;
- the tag relation and contact update are persisted;
- the Resend payload contains the exact interpolated recipients, subject, HTML,
  and stable idempotency key;
- the webhook receives the configured method, interpolated headers, and parsed
  JSON body;
- step logs show the actual resolved inputs and outputs;
- the run completes.

### False condition

Run the same user configuration with a contact that fails its condition. Assert
the downstream email and webhook do not occur, no tag or contact mutation
occurs, and the run/log state communicates the stopped path.

### Wait and continuation

Seed a wait followed by an observable contact update. Assert the next queue
message has the exact delay, the contact remains unchanged before that message
is drained, and the continuation performs the update and completes once.

### AI research

Inject a deterministic research service result with company, role, website,
location, size, revenue, LinkedIn URL, summary, sources, tags, and insights.
Assert the real workflow updates the contact columns, notes, metadata, and
activity; retains public evidence; excludes the expanded provider prompt; and
completes the run.

### Delivery safety and failure

Deliver the same queued email step twice and assert the workflow cannot produce
two independent logical sends: completed state prevents replay and the outbound
request carries the same run-and-step idempotency key.

Return a permanent provider failure in a separate journey. Assert the run
becomes failed with a safe message, later mutating steps remain unexecuted, and
secrets or raw provider response bodies are not persisted.

The former exhaustive lease/retry branch matrix is intentionally not restored.
Additional retry cases require a demonstrated production regression with a
distinct customer effect.

## Error handling and diagnostics

- Captured HTTP routers reject unexpected requests immediately and print the
  unmatched method and URL.
- Queue drains fail when a message is unhandled or enqueued with an unexpected
  delay.
- Fixed time is restored after every test.
- Fetch, DOM, Query Client, and global browser overrides are restored after
  every test.
- Provider-response tests assert the user-visible fallback or persisted failure
  state, not only the thrown exception.
- Scenario fixtures use descriptive IDs and addresses so a failed diff explains
  which participant or boundary is wrong.

## Execution and maintenance

The implementation plan will introduce the suite in this order:

1. minimal test tooling and shared hermetic support;
2. timezone and availability service contracts;
3. rendered booking timezone journey;
4. booking email and invite delivery;
5. rendered forms and conditions;
6. queue-driven workflow journeys;
7. full critical-suite, lint, and production-build verification.

Each area is committed separately. A test must be shown failing against the
missing or temporarily broken contract before it is accepted. Temporary
production mutations used to prove the test goes red are reverted before the
task commit.

Production changes are permitted only when an accepted scenario exposes a real
contract failure or when a narrow dependency-injection seam is required to
observe an external boundary. The implementation must not refactor unrelated
product code to make tests easier.

## Acceptance criteria

- Every scenario above executes production behavior and asserts its final
  observable result.
- All timezone expectations use literal independent values.
- Public booking component assertions cover both local display and submitted UTC
  identity.
- Google and Resend payloads are parsed and checked in full; no live service is
  contacted.
- Confirmation, pending, approval, cancellation, decline, form-response, and
  workflow-email delivery paths assert their distinct recipient-facing content.
- ICS content is decoded and validated as a calendar protocol artifact.
- Form tests interact through accessible controls and verify submitted data.
- Workflow tests drain the real execution path and verify database, queue,
  provider payload, and run-state effects.
- The suite has no snapshots, source-string checks, styling-class assertions,
  duplicate contracts, or count-based goals.
- `bun test tests/critical`, ESLint, and the production build succeed.

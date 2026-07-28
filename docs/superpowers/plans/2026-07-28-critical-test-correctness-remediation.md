# Critical Test Correctness Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the critical suite fail on the customer-visible scheduling, form, delivery, and workflow regressions found in the 2026-07-28 audit, without adding vanity coverage.

**Architecture:** Keep the five outcome-oriented suites. Replace hand-normalized fixtures and permissive provider doubles with fixtures that pass through production services or narrow shared handler functions. Fix the attendee identity and workflow-log redaction defects exposed by the stronger assertions. Add one cap scenario because no existing journey owns that behavior.

**Tech Stack:** Bun test, React Testing Library, Hono, Drizzle, migration-backed in-memory SQLite.

## Global Constraints

- Every test must protect an observable payload, persisted result, security boundary, or user interaction.
- Strengthen existing journeys instead of adding duplicate scenarios.
- Expected timezone and provider payload values remain literal and independent of production formatting code.
- No snapshot, source-text, type-shape, CSS-class, or test-count assertions.
- Use Bun, never npm or yarn.

---

### Task 1: Public booking weekday projection

**Files:**
- Modify: `tests/critical/public-booking-timezones.test.tsx`
- Modify: `worker/lib/timezone.ts` only if the strengthened journey exposes a production defect

**Interfaces:**
- Consumes: `getViewerAvailableWeekdays(rules, scheduleTimezone, viewerTimezone, now)`
- Produces: a rendered booking journey whose event-detail request carries the viewer timezone and whose calendar date is enabled by production weekday projection

- [ ] Make the event-detail responder assert the exact `timezone` query and derive `availableDays` with `getViewerAvailableWeekdays`.
- [ ] Select the literal calendar date through the rendered UI before asserting the availability request and slot.
- [ ] Run the Kiritimati row and confirm it fails if the event-detail timezone is omitted or weekday projection is replaced with organizer weekdays.
- [ ] Run `bun test tests/critical/public-booking-timezones.test.tsx`.

### Task 2: Persisted form payload and submission wiring

**Files:**
- Modify: `tests/critical/form-experience.test.tsx`
- Create: `worker/lib/public-form-actions.ts`
- Modify: `worker/index.ts`

**Interfaces:**
- Produces: `loadPublicFormAction(db, projectSlug, formSlug)` for the public GET payload
- Produces: `submitPublicFormStepAction(db, responseId, stepIndex, rawBody)` for shared Zod validation and service submission

- [ ] Persist focused, grouped, and classic form fixtures, including JSON settings and project theme.
- [ ] Load component GET responses through `loadPublicFormAction` and assert the same rendered outcomes.
- [ ] Route conditional PATCH responses through `submitPublicFormStepAction` so `clearedFieldIds` passes through the production schema and service wiring.
- [ ] Update the Hono routes to call the same shared actions.
- [ ] Run `bun test tests/critical/form-experience.test.tsx`.

### Task 3: Booking provider and approval payloads

**Files:**
- Modify: `worker/services/calendar-service.ts`
- Modify: `worker/lib/booking-actions.ts`
- Modify: `tests/critical/booking-delivery.test.ts`

**Interfaces:**
- Change calendar attendees from an email-only list plus one shared guest name to attendee objects with per-address optional display names.
- Reuse literal payload assertion helpers across immediate and approval journeys.

- [ ] Assert the OAuth refresh form body and content type, Resend authorization/JSON headers, and Google DELETE authorization.
- [ ] Require only the guest attendee to carry the guest display name; additional invitees carry their own email without a false guest identity.
- [ ] Assert approval Google attendees, viewer-local confirmation text, and complete ICS UID/time/organizer/attendee fields.
- [ ] Run `bun test tests/critical/booking-delivery.test.ts`.

### Task 4: Workflow input-secret redaction

**Files:**
- Modify: `worker/services/workflow-execution-service.ts`
- Modify: `tests/critical/workflow-journeys.test.ts`

**Interfaces:**
- Produces: sanitized persisted workflow config, resolved inputs, and run context while leaving outbound interpolated values intact

- [ ] Configure the permanent-failure journey with a literal `webhookToken` input and interpolate it into the Authorization header.
- [ ] Assert the outbound header is exact while the secret is absent from step logs, run context, and activity.
- [ ] Sanitize sensitive input definitions and resolved input values before persistence.
- [ ] Run `bun test tests/critical/workflow-journeys.test.ts`.

### Task 5: Booking cap outcome

**Files:**
- Modify: `tests/critical/availability-timezones.test.ts` or `tests/critical/booking-delivery.test.ts`

**Interfaces:**
- Consumes: `AvailabilityService.getAvailableSlots()` and `createBookingAction()`
- Produces: one vertical scenario proving stored pending/confirmed bookings close a host-local cap and reject creation

- [ ] Seed host-local daily and weekly limits with counted and excluded statuses.
- [ ] Assert the capped date exposes no slots and booking creation returns the literal user-facing conflict.
- [ ] Keep the scenario consolidated; do not create one test per status or boundary.
- [ ] Run the owning critical file.

### Task 6: Verification and review

**Files:**
- Review all modified files

- [ ] Run `bun test tests/critical`.
- [ ] Run `bun run lint`.
- [ ] Run `bun run build`.
- [ ] Run `git diff --check`.
- [ ] Review every added assertion against the test-admission rule.
- [ ] Request an independent code review and resolve important findings.

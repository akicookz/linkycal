# Merged booking details + URL prefill

## Problem

When an event type has a form attached (`eventTypes.bookingFormId`), the public booking
page renders two consecutive data-entry steps: the built-in "Your Information" step
(Name / Email / Notes) and then the attached form. If the form already collects name,
email, and whatever extra info the host wants, the booker types their identity twice.

Today `PublicBooking.tsx` handles the overlap by *hiding* the form's name/email-mapped
fields (`excludedFieldIds`) and keeping the built-in step as the source of truth. The
goal is the inverse: when the form covers identity, let the form own the whole step and
drop the built-in one.

Separately, a booking link carries no prefill into the attached form. `prefillFromQuery`
already exists in `src/lib/form-prefill.ts` and is wired into the standalone form page
(`/f/:formSlug`) and the form widget, but not into the booking page.

## Scope

1. A per-event-type option to collect booker details with the attached form, skipping the
   built-in details step.
2. URL prefill on the booking page, for both the attached form's fields and the built-in
   Name / Email / Notes inputs.

Out of scope: the booking widget keeps forwarding only UTM and theme params (prefill
through widget options is a possible follow-up); no MCP tool changes.

## Setting storage

Store `collectDetailsWithForm: true` in the existing `eventTypes.settings` JSON column.

No migration, no validation change, no service change: `settings` is already
`z.record(z.string(), z.unknown())` in `createEventTypeSchema` / `updateEventTypeSchema`
(`worker/validation.ts:84`, `:108`) and already round-trips through
`EventTypeService` and the MCP event-type tools. The flag is pure presentation — no
server code branches on it.

Absent or `false` means today's behavior, so every existing event type is unaffected.

## Dashboard UI (`src/pages/EventTypeForm.tsx`)

Under the existing "Booking Form" select, when a form is selected, fetch that form's
full definition via the existing `GET /api/projects/:projectId/forms/:formId` (returns
`{ form }` with steps and fields). Derive whether the form has a field with
`contactMapping === "name"` **and** one with `contactMapping === "email"`.

- Both mappings present: render a card-style toggle row matching the "Require
  confirmation" pattern at `EventTypeForm.tsx:1048` — title "Collect details with this
  form", subtitle explaining the built-in Name/Email/Notes step is skipped and the form
  collects them instead.
- Either mapping missing: do not render the toggle, and force the flag to `false` on
  save. Render a short hint under the select telling the host to map a name and an email
  field on the form to enable it, so the absence is explained rather than mysterious.
- No form selected: no toggle, flag forced `false` on save.

Default for new event types: off.

## Public booking flow (`src/pages/PublicBooking.tsx`)

### Merge decision

```
mergeDetails = settings.collectDetailsWithForm === true
            && bookingForm is present (already filtered to status "active" server-side)
            && mappedFields.nameFieldId && mappedFields.emailFieldId
```

The mapping re-check is a runtime guard: the host can enable the toggle and later edit
the form to remove the email field. In that case `mergeDetails` is false and the page
falls back to today's two-step flow rather than losing the booker's identity.

### When `mergeDetails` is true

- **Step 2 never renders.** "Next" on step 1 goes straight to `setStep(3)`, and the form
  step's `onExitBack` returns to step 1 (`setStep(1)`, plus `goMobileSubStep("time")` on
  mobile) instead of step 2. Step numbering is otherwise untouched; `confirmationStep`
  stays 4.
- **Mapped fields are no longer excluded.** `mappedFieldIds` is passed as an empty set to
  both `buildFormExperienceModel` and `<FormExperience>`, so name and email render inline
  in the form author's chosen position and order.
- **Mapped fields are forced required.** A booking cannot be created without a name and
  email (`handleBook` early-returns without them, and `createBookingSchema` requires
  both). Add an optional `requiredFieldIds?: ReadonlySet<string>` input to
  `buildFormExperienceModel` that ORs into each field's `required` flag, so a host who
  left the form field optional still can't produce an unbookable submission. This keeps
  the override inside the shared model rather than duplicating validation in the page.
- **Notes is not collected.** The built-in Notes input belongs to the skipped step; the
  attached form is the "extra info" surface. `guestNotes` stays empty and `notes` is
  omitted from the payload.
- **The honeypot moves.** The visually-hidden `website` spam input currently lives in
  step 2's markup, which no longer renders. In merged mode render it alongside the form
  step so `spamField` is still populated and submitted.

### Identity sync

`setBookingFormValue` (`PublicBooking.tsx:502`) already mirrors a changed mapped field
into `guestName` / `guestEmail`, so typing into the form keeps the booking payload
correct with no additional wiring. The existing `[step]`-triggered sync effect
(`:352`) stays for the unmerged flow. Prefill writes to `formValues` directly rather
than through `setBookingFormValue`, so the prefill effect must seed `guestName` /
`guestEmail` itself from any prefilled mapped fields.

Submission is unchanged: `handleBook` merges `guestName` / `guestEmail` into
`formFields` and POSTs to `/api/v1/bookings`, which creates the form response and links
it via `formResponseId` (`worker/lib/booking-actions.ts:325`). No server change.

## URL prefill

Mirror the PublicForm implementation (`PublicForm.tsx:178`): a `useRef` guard so prefill
runs once per form load, reading `parseQueryString(window.location.search)` and
`prefillFromQuery(...)`, merging as `{ ...prefilled, ...previous }` so anything the
booker already typed wins.

- **Form fields**, keyed by field id, for any booking link with an attached form. The
  helper already blocks `file` fields, validates `select` / `radio` / `multi_select` /
  `checkbox` values against the field's options, and clamps `rating` to 1–5.
- **Built-in fields** via reserved `name`, `email`, and `notes` params, seeding
  `guestName` / `guestEmail` / `guestNotes`. These apply whether or not a form is
  attached; in merged mode they seed the mapped form fields instead so the values show
  up in the inputs the booker actually sees.
- **Collision rule:** a param whose key matches a form field id is treated as a form
  field. The reserved names only apply when no field carries that id.

Prefilled values are ordinary editable inputs — nothing is locked or hidden — and
prefilled required fields still validate on submit.

## Testing

Put the merge decision and the required-override in testable units rather than inline in
the 1100-line page component:

- `buildFormExperienceModel` gains `requiredFieldIds`; add cases to the existing
  form-experience tests covering the override and its interaction with conditional
  visibility.
- A small exported helper for the merge decision (flag + form present + both mappings)
  with unit tests for: flag off, flag on with both mappings, flag on with a mapping
  removed after the fact, and no form attached.
- Prefill: extend coverage for the booking-page rules — field-id params, reserved
  `name`/`email`/`notes` params, collision precedence, and mapped-field prefill seeding
  `guestName` / `guestEmail`.

`src/lib/form-prefill.ts` coercion itself is already covered and needs no new tests.

## Risks

- A host enables the toggle, then edits the form to drop the email field. Handled by the
  runtime mapping guard — the page silently falls back to the built-in step.
- A form whose only fields are name and email produces a merged step that looks like the
  old details step. That is the intended outcome, not a defect.
- `hasBookingFormContent` currently drives whether step 2 submits directly or advances to
  step 3. In merged mode the form always has content by definition (it has the mapped
  fields), so this branch is only exercised in the unmerged flow and stays as-is.

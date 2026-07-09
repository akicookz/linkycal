# Reliable `.ics` on booking confirmation emails

**Date:** 2026-07-09
**Status:** Approved design, pending implementation plan

## Problem

Google Calendar invites sent to guests are landing in spam. Today a confirmed
booking triggers two independent notifications (`worker/lib/booking-actions.ts`):

1. A Google Calendar event is created on the host's calendar with
   `?sendUpdates=all` (`worker/services/calendar-service.ts:262`). Google itself
   emails the guest the actual calendar invite. **This is the email hitting spam.**
2. LinkyCal sends its own branded HTML confirmation via Resend from the verified
   domain `noreply@updates.linkycal.com` (`worker/services/email-service.ts:229`).
   This reliably reaches the inbox but carries **no calendar file** — the guest
   can read the details but cannot one-click add the event.

There is no `.ics`/iCalendar generation anywhere in the codebase, and the Resend
transport (`email-service.ts:557`) does not support attachments.

## Goal

Attach a standards-compliant `.ics` file to the branded confirmation email we
already send. That email reaches the inbox, so the guest gets a reliable,
one-click "add to calendar" that works in Apple Calendar, Google Calendar, and
Outlook — carrying the event time and the meeting link.

## Decisions (confirmed with product owner)

| Decision | Choice | Rationale |
|---|---|---|
| ICS shape | **One universal `.ics`** carrying time + meeting link | One file works across Apple/Google/Outlook; no per-platform buttons needed. |
| Google's native invite | **Keep it** (`sendUpdates=all` unchanged) | Belt-and-suspenders: our `.ics` is an additional reliable copy, not a replacement. |
| Recipient | **Guest / booker only** | The host already has the event on their connected calendar. |
| ICS `METHOD` | **`PUBLISH`** | Avoids a duelling RSVP card against Google's kept `REQUEST` invite; a clean "add to my calendar" file. |
| Duplicate prevention | **Share Google's `iCalUID`** as the `.ics` UID | Calendar apps dedupe by UID, so a guest acting on both Google's invite and our file ends up with a single event. |

### Accepted trade-off

"Keep both" means the guest **still receives Google's spam-bound invite** — this
change does not reduce spam, it adds a reliable inbox copy alongside it. A future
enhancement could add a per-project toggle to silence Google (`sendUpdates=none`)
so our `.ics` email becomes the only invite. Out of scope here.

## Architecture

Three focused units, each independently testable:

### 1. `worker/lib/ics.ts` — `buildIcs()`

Framework-agnostic pure function. Fits the existing `lib/` convention alongside
`timezone.ts`, `rich-text.ts`, etc. No I/O, no `Date.now()` inside — all
time-dependent values are passed in so it is deterministic under test.

```ts
export interface IcsInput {
  uid: string;                 // Google iCalUID when available, else booking-{id}@linkycal.com
  dtstamp: Date;               // injected (defaults handled by caller) — keeps buildIcs pure
  start: Date;
  end: Date;
  summary: string;             // e.g. "Intro Call with Ava"
  description?: string;        // notes + join link
  location?: string;           // meeting URL or physical location
  organizerName?: string;
  organizerEmail?: string;
  meetingUrl?: string;
}

export function buildIcs(input: IcsInput): string;
```

RFC 5545 requirements the implementation MUST satisfy (Apple Calendar is strict
and will silently reject a malformed file):

- `BEGIN:VCALENDAR` / `VERSION:2.0` / `PRODID:-//LinkyCal//Booking//EN` /
  `CALSCALE:GREGORIAN` / `METHOD:PUBLISH`.
- One `VEVENT` with `UID`, `DTSTAMP`, `DTSTART`, `DTEND`, `SUMMARY`, `SEQUENCE:0`,
  `STATUS:CONFIRMED`, optional `DESCRIPTION` / `LOCATION` / `ORGANIZER` / `URL`,
  and a `VALARM` (`TRIGGER:-PT30M`, display) reminder.
- `DTSTART`/`DTEND`/`DTSTAMP` in **UTC** (`YYYYMMDDTHHMMSSZ`) — avoids needing a
  `VTIMEZONE` block; the guest's client renders local time. (The HTML body already
  shows local time in the guest's timezone.)
- **CRLF** (`\r\n`) line endings.
- **Line folding** at 75 octets (continuation lines start with a single space).
- **Property-value escaping**: `\\`, `\;`, `\,`, and `\n` for embedded newlines.

### 2. `worker/services/email-service.ts` — attachment support

- Extend the private `send()` (line 557) to accept an optional
  `attachments?: Array<{ filename: string; content: string; contentType?: string }>`
  and forward it to Resend's API as
  `attachments: [{ filename, content, content_type }]` (Resend expects base64
  `content`).
- **Base64 must be UTF-8-safe.** Plain `btoa()` throws / corrupts on non-Latin1
  characters (guest names, notes). Use a `TextEncoder` + base64 helper (or
  `btoa(String.fromCharCode(...new TextEncoder().encode(str)))` for small
  payloads — an `.ics` is tiny). Add a small `toBase64(utf8: string)` helper.
- `sendBookingConfirmation` gains an optional `icsContent?: string` param; when
  present it attaches `invite.ics` with content type
  `text/calendar; method=PUBLISH; charset=utf-8`.
- All other senders are untouched.

### 3. `worker/services/calendar-service.ts` — expose `iCalUID`

- `createEvent` return type becomes `{ id: string; meetingUrl: string | null; iCalUID: string | null }`.
- Parse `iCalUID` from Google's insert response (currently only `id` +
  `hangoutLink` are read, line ~278).
- No change to `sendUpdates=all`.

### 4. `worker/lib/booking-actions.ts` — wiring

Both confirmed-booking paths build the ICS and pass it to
`sendBookingConfirmation`:

- Instant-confirm path (`~444`).
- Confirm-after-approval path (`~783`).

UID selection: use the Google event's `iCalUID` when a Google event was created
in that request; otherwise `booking-${booking.id}@linkycal.com`. `dtstamp` is
`new Date()` at send time (valid in the worker runtime — the no-`Date` rule only
applies to Workflow scripts). Meeting link and time already flow into the email;
they now also populate the `.ics`.

If Google event creation failed or no calendar is connected, we still send the
`.ics` with a self-minted UID — a strict improvement over today (guest currently
gets no calendar file at all in that case).

## Data flow

```
createBookingAction (confirmed)
  ├─ calendarService.createEvent(...)  → { id, meetingUrl, iCalUID }   [sendUpdates=all kept]
  │     └─ (on failure) iCalUID = null
  ├─ uid = iCalUID ?? `booking-${booking.id}@linkycal.com`
  ├─ ics = buildIcs({ uid, dtstamp: new Date(), start, end, summary, description, location, organizer, meetingUrl })
  └─ emailService.sendBookingConfirmation({ ...existing, icsContent: ics })
        └─ send({ ..., attachments: [{ filename: "invite.ics", content: toBase64(ics), contentType: "text/calendar; method=PUBLISH; charset=utf-8" }] })
```

## Error handling

- `buildIcs` is total (pure string building) — no throwing paths beyond bad input
  types caught by TS.
- ICS generation and attachment are wrapped in the existing email `try/catch` in
  `booking-actions.ts`; a failure to build/attach must not block the booking or
  the HTML email. Log and continue.
- Google `iCalUID` absent (no connection / insert failed) → fall back to minted
  UID; never fail the email.

## Testing

- **`tests/worker/ics.test.ts`** (new):
  - Emits a well-formed `VCALENDAR` with required properties and `METHOD:PUBLISH`.
  - `DTSTART`/`DTEND`/`DTSTAMP` are UTC `...Z` and match injected instants.
  - Escapes `,` `;` `\` and newlines in `SUMMARY`/`DESCRIPTION`/`LOCATION`.
  - Folds lines longer than 75 octets; uses CRLF.
  - Passes through the provided `uid` verbatim.
- **`tests/worker/email-service.test.ts`** (extend):
  - When `icsContent` is provided, the Resend payload includes an `attachments`
    array with `filename: "invite.ics"` and base64 `content` that round-trips
    back to the ICS string.
  - When `icsContent` is absent, no `attachments` key is sent (existing tests
    still pass).

## Out of scope

- Reschedule / cancellation `.ics` updates (`METHOD:CANCEL` / `SEQUENCE` bumps).
- Attaching the `.ics` to the host notification email.
- Per-platform "add to calendar" buttons in the email body.
- A per-project toggle to silence Google's native invite.

## Residual risks

- Cross-client UID dedupe is best-effort. `PUBLISH` + shared UID is the strongest
  portable option, but a minority of calendar clients may still show two entries
  if the guest manually acts on both Google's invite and the `.ics`.
- Since Google's invite is kept, the underlying spam complaint persists for the
  Google-sent copy; this change guarantees a deliverable copy exists, not that the
  spammy one disappears.

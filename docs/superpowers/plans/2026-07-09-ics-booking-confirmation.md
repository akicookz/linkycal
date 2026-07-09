# ICS on Booking Confirmation Emails — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attach a standards-compliant `.ics` calendar file to the branded booking-confirmation email LinkyCal already sends, so guests get a reliable, one-click "add to calendar" that works in Apple Calendar, Google Calendar, and Outlook.

**Architecture:** A new pure `buildIcs()` helper generates an RFC 5545 `VCALENDAR`. `EmailService` gains attachment support and attaches `invite.ics` to the confirmation email. `CalendarService.createEvent` starts returning Google's `iCalUID` so our `.ics` can reuse it as its `UID`, letting calendar apps dedupe our file against Google's kept native invite. Both confirmed-booking paths in `booking-actions.ts` are wired to build and attach the file.

**Tech Stack:** Cloudflare Workers, Hono, Drizzle (D1), Resend REST API, Bun test runner, TypeScript (`verbatimModuleSyntax: true` — use `import type` for type-only imports).

## Global Constraints

- `verbatimModuleSyntax: true` — type-only imports MUST use `import type`, or `bun run build` fails.
- Never hand-edit `worker-configuration.d.ts` (generated). No `wrangler.jsonc` binding changes in this plan, so no `cf-typegen` needed.
- Follow existing code conventions in `AGENTS.md` (function declarations, naming, imports). Do not add gratuitous comments — comments explain non-obvious *why* only.
- Google's native invite stays ON: `sendUpdates=all` in `calendar-service.ts` is **unchanged**. Our `.ics` is an additional copy, deduped by shared `UID`.
- ICS `METHOD` is `PUBLISH` (not `REQUEST`) — a plain "add to calendar" file, no RSVP card.
- Recipient of the `.ics` is the **guest only**. Do not attach it to the host notification email.
- `.ics` timestamps are UTC (`YYYYMMDDTHHMMSSZ`); lines use CRLF (`\r\n`) and fold at 75 octets; TEXT values escape `\`, `;`, `,`, and newlines.
- Base64 for the attachment must be UTF-8-safe (guest names/notes may be non-ASCII). Do not use bare `btoa(str)`.
- Run `bun run lint` and `bun run build` clean before the final commit of each task that changes worker code.

---

### Task 1: `buildIcs()` iCalendar generator

**Files:**
- Create: `worker/lib/ics.ts`
- Test: `tests/worker/ics.test.ts`

**Interfaces:**
- Consumes: nothing (pure, no I/O).
- Produces:
  ```ts
  export interface IcsInput {
    uid: string;
    dtstamp: Date;
    start: Date;
    end: Date;
    summary: string;
    description?: string;
    location?: string;
    organizerName?: string;
    organizerEmail?: string;
    url?: string;
  }
  export function buildIcs(input: IcsInput): string;
  ```

- [ ] **Step 1: Write the failing tests**

Create `tests/worker/ics.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { buildIcs } from "../../worker/lib/ics";

const base = {
  uid: "booking-abc@linkycal.com",
  dtstamp: new Date("2026-04-01T09:00:00.000Z"),
  start: new Date("2026-04-01T13:00:00.000Z"),
  end: new Date("2026-04-01T13:30:00.000Z"),
  summary: "Intro Call with Ava",
};

describe("buildIcs", () => {
  test("emits a well-formed VCALENDAR with PUBLISH method", () => {
    const ics = buildIcs(base);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:-//LinkyCal//Booking//EN");
    expect(ics).toContain("CALSCALE:GREGORIAN");
    expect(ics).toContain("METHOD:PUBLISH");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });

  test("formats timestamps as UTC basic form", () => {
    const ics = buildIcs(base);
    expect(ics).toContain("DTSTAMP:20260401T090000Z");
    expect(ics).toContain("DTSTART:20260401T130000Z");
    expect(ics).toContain("DTEND:20260401T133000Z");
  });

  test("passes the UID through verbatim", () => {
    const ics = buildIcs({ ...base, uid: "evt123@google.com" });
    expect(ics).toContain("UID:evt123@google.com");
  });

  test("uses CRLF line endings", () => {
    const ics = buildIcs(base);
    expect(ics).toContain("\r\n");
    expect(ics.includes("\n\n")).toBe(false); // no bare LF pairs
  });

  test("escapes TEXT special characters", () => {
    const ics = buildIcs({
      ...base,
      summary: "A, B; C \\ D",
      description: "line1\nline2",
    });
    expect(ics).toContain("SUMMARY:A\\, B\\; C \\\\ D");
    expect(ics).toContain("DESCRIPTION:line1\\nline2");
  });

  test("folds lines longer than 75 octets with a leading space", () => {
    const ics = buildIcs({ ...base, summary: "x".repeat(200) });
    const rawLines = ics.split("\r\n");
    for (const line of rawLines) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }
    // continuation lines begin with a single space
    expect(ics).toContain("\r\n x");
  });

  test("omits optional properties when absent", () => {
    const ics = buildIcs(base);
    expect(ics).not.toContain("DESCRIPTION:");
    expect(ics).not.toContain("LOCATION:");
    expect(ics).not.toContain("ORGANIZER");
    expect(ics).not.toContain("URL:");
  });

  test("includes optional properties when provided", () => {
    const ics = buildIcs({
      ...base,
      description: "notes",
      location: "https://meet.google.com/abc",
      url: "https://meet.google.com/abc",
      organizerName: "Owner Name",
      organizerEmail: "owner@example.com",
    });
    expect(ics).toContain("DESCRIPTION:notes");
    expect(ics).toContain("LOCATION:https://meet.google.com/abc");
    expect(ics).toContain("URL:https://meet.google.com/abc");
    expect(ics).toContain("ORGANIZER;CN=Owner Name:mailto:owner@example.com");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/worker/ics.test.ts`
Expected: FAIL — `Cannot find module '../../worker/lib/ics'`.

- [ ] **Step 3: Implement `worker/lib/ics.ts`**

```ts
export interface IcsInput {
  uid: string;
  dtstamp: Date;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  location?: string;
  organizerName?: string;
  organizerEmail?: string;
  url?: string;
}

const CRLF = "\r\n";

function formatUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\n|\r/g, "\\n");
}

function sanitizeParam(value: string): string {
  return value.replace(/[",;:\r\n]/g, " ").trim();
}

function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const out: string[] = [];
  let current = "";
  let currentBytes = 0;
  let isFirst = true;

  for (const ch of line) {
    const chBytes = encoder.encode(ch).length;
    const limit = isFirst ? 75 : 74; // continuation lines reserve 1 octet for the leading space
    if (currentBytes + chBytes > limit) {
      out.push(isFirst ? current : ` ${current}`);
      isFirst = false;
      current = "";
      currentBytes = 0;
    }
    current += ch;
    currentBytes += chBytes;
  }
  if (current) out.push(isFirst ? current : ` ${current}`);

  return out.join(CRLF);
}

export function buildIcs(input: IcsInput): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LinkyCal//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${formatUtc(input.dtstamp)}`,
    `DTSTART:${formatUtc(input.start)}`,
    `DTEND:${formatUtc(input.end)}`,
    `SUMMARY:${escapeText(input.summary)}`,
    "SEQUENCE:0",
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
  ];

  if (input.description) lines.push(`DESCRIPTION:${escapeText(input.description)}`);
  if (input.location) lines.push(`LOCATION:${escapeText(input.location)}`);
  if (input.url) lines.push(`URL:${escapeText(input.url)}`);
  if (input.organizerEmail) {
    const cn = input.organizerName ? `;CN=${sanitizeParam(input.organizerName)}` : "";
    lines.push(`ORGANIZER${cn}:mailto:${input.organizerEmail}`);
  }

  lines.push(
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Reminder",
    "TRIGGER:-PT30M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  );

  return `${lines.map(foldLine).join(CRLF)}${CRLF}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/worker/ics.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Lint**

Run: `bun run lint`
Expected: no errors for `worker/lib/ics.ts` or the test.

- [ ] **Step 6: Commit**

```bash
git add worker/lib/ics.ts tests/worker/ics.test.ts
git commit -m "feat(ics): add RFC 5545 iCalendar generator"
```

---

### Task 2: Resend attachment support in `EmailService`

**Files:**
- Modify: `worker/services/email-service.ts` (`BookingConfirmationParams` ~line 22, `sendBookingConfirmation` ~line 229, private `send` ~line 557; add a module-level `toBase64` helper near the other helper functions at the bottom)
- Test: `tests/worker/email-service.test.ts` (extend)

**Interfaces:**
- Consumes: `buildIcs` output is passed in by the caller as a plain string (Task 4 supplies it); this task only needs the string.
- Produces:
  - `BookingConfirmationParams` gains `icsContent?: string`.
  - `send()` gains `attachments?: Array<{ filename: string; content: string; contentType?: string }>` and forwards them to Resend as `attachments: [{ filename, content, content_type }]`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/worker/email-service.test.ts`. First add a decode helper and an attachments-aware payload reader near the top helpers (after `lastPayload`):

```ts
function lastBody(
  fetchMock: ReturnType<typeof mockFetch>,
): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

function decodeBase64Utf8(b64: string): string {
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
```

Then add a new `describe` block:

```ts
describe("booking confirmation ICS attachment", () => {
  test("attaches invite.ics when icsContent is provided", async () => {
    const fetchMock = mockFetch();
    const emailService = new EmailService("test-key");
    const ics = "BEGIN:VCALENDAR\r\nSUMMARY:Café ☕\r\nEND:VCALENDAR\r\n";

    await emailService.sendBookingConfirmation({
      to: "guest@example.com",
      guestName: "Ava",
      eventTypeName: "Intro Call",
      startTime: new Date("2026-04-01T13:00:00.000Z"),
      endTime: new Date("2026-04-01T13:30:00.000Z"),
      timezone: "Europe/Berlin",
      icsContent: ics,
    });

    const body = lastBody(fetchMock);
    const attachments = body.attachments as Array<{
      filename: string;
      content: string;
      content_type?: string;
    }>;
    expect(attachments).toHaveLength(1);
    expect(attachments[0].filename).toBe("invite.ics");
    expect(attachments[0].content_type).toContain("text/calendar");
    expect(decodeBase64Utf8(attachments[0].content)).toBe(ics);
  });

  test("sends no attachments key when icsContent is absent", async () => {
    const fetchMock = mockFetch();
    const emailService = new EmailService("test-key");

    await emailService.sendBookingConfirmation({
      to: "guest@example.com",
      guestName: "Ava",
      eventTypeName: "Intro Call",
      startTime: new Date("2026-04-01T13:00:00.000Z"),
      endTime: new Date("2026-04-01T13:30:00.000Z"),
      timezone: "Europe/Berlin",
    });

    const body = lastBody(fetchMock);
    expect(body.attachments).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/worker/email-service.test.ts`
Expected: FAIL — the attachments test fails (no `attachments` in payload / `icsContent` not accepted).

- [ ] **Step 3: Add `icsContent` to `BookingConfirmationParams`**

In `worker/services/email-service.ts`, the interface at ~line 22:

```ts
interface BookingConfirmationParams {
  to: string;
  guestName: string;
  eventTypeName: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  location?: string;
  notes?: string;
  meetingUrl?: string;
  icsContent?: string;
  theme?: EmailTheme;
}
```

- [ ] **Step 4: Add the `toBase64` helper**

At the bottom of `worker/services/email-service.ts`, alongside the other module-level helpers (`formatDate`, `escapeHtml`, …):

```ts
function toBase64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
```

- [ ] **Step 5: Forward attachments in `send()`**

Replace the private `send()` (~line 557) body's construction so it accepts and forwards attachments:

```ts
private async send(params: {
  to: string;
  cc?: string[];
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: string; contentType?: string }>;
}): Promise<void> {
  const body: Record<string, unknown> = {
    from: FROM_ADDRESS,
    to: [params.to],
    subject: params.subject,
    html: params.html,
  };
  if (params.cc && params.cc.length > 0) {
    body.cc = params.cc;
  }
  if (params.attachments && params.attachments.length > 0) {
    body.attachments = params.attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
      ...(a.contentType ? { content_type: a.contentType } : {}),
    }));
  }

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${this.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send email: ${error}`);
  }
}
```

- [ ] **Step 6: Attach the ICS in `sendBookingConfirmation`**

Destructure `icsContent` at the top of `sendBookingConfirmation` (add it to the existing destructure of `params`), then change the final `this.send({...})` call (~line 274) to:

```ts
await this.send({
  to,
  subject: `Booking Confirmed: ${eventTypeName}`,
  html,
  attachments: icsContent
    ? [
        {
          filename: "invite.ics",
          content: toBase64(icsContent),
          contentType: "text/calendar; method=PUBLISH; charset=utf-8",
        },
      ]
    : undefined,
});
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `bun test tests/worker/email-service.test.ts`
Expected: PASS (existing tests + 2 new).

- [ ] **Step 8: Lint and commit**

Run: `bun run lint`
Expected: clean.

```bash
git add worker/services/email-service.ts tests/worker/email-service.test.ts
git commit -m "feat(email): support Resend attachments and attach ICS to booking confirmation"
```

---

### Task 3: Return `iCalUID` from `CalendarService.createEvent`

**Files:**
- Modify: `worker/services/calendar-service.ts` (`createEvent` return type ~line 220 and response parse ~line 278)
- Test: `tests/worker/calendar-service.test.ts` (create)

**Interfaces:**
- Consumes: nothing new.
- Produces: `createEvent(...)` now returns `{ id: string; meetingUrl: string | null; iCalUID: string | null }`.

- [ ] **Step 1: Write the failing test**

Create `tests/worker/calendar-service.test.ts`:

```ts
import { afterEach, describe, expect, mock, test } from "bun:test";

import { CalendarService } from "../../worker/services/calendar-service";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function makeService(): CalendarService {
  return new CalendarService({} as never, {
    GOOGLE_CALENDAR_CLIENT_ID: "id",
    GOOGLE_CALENDAR_CLIENT_SECRET: "secret",
  });
}

describe("CalendarService.createEvent", () => {
  test("returns id, meetingUrl and iCalUID from Google's response", async () => {
    globalThis.fetch = mock(async () =>
      new Response(
        JSON.stringify({
          id: "evt1",
          hangoutLink: "https://meet.google.com/abc-defg-hij",
          iCalUID: "evt1@google.com",
        }),
        { status: 200 },
      ),
    ) as typeof fetch;

    const result = await makeService().createEvent("token", "primary", {
      summary: "Intro Call with Ava",
      start: "2026-04-01T13:00:00.000Z",
      end: "2026-04-01T13:30:00.000Z",
    });

    expect(result.id).toBe("evt1");
    expect(result.meetingUrl).toBe("https://meet.google.com/abc-defg-hij");
    expect(result.iCalUID).toBe("evt1@google.com");
  });

  test("returns null iCalUID when Google omits it", async () => {
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ id: "evt2" }), { status: 200 }),
    ) as typeof fetch;

    const result = await makeService().createEvent("token", "primary", {
      summary: "Intro Call",
      start: "2026-04-01T13:00:00.000Z",
      end: "2026-04-01T13:30:00.000Z",
    });

    expect(result.id).toBe("evt2");
    expect(result.meetingUrl).toBeNull();
    expect(result.iCalUID).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/worker/calendar-service.test.ts`
Expected: FAIL — `result.iCalUID` is `undefined` (property does not exist on the return type / not parsed).

- [ ] **Step 3: Update `createEvent` return type and parse**

In `worker/services/calendar-service.ts`, change the method signature return type (~line 220) from
`Promise<{ id: string; meetingUrl: string | null }>` to:

```ts
  ): Promise<{ id: string; meetingUrl: string | null; iCalUID: string | null }> {
```

Then change the response parse + return at the end of the method (~line 277) from the current two lines to:

```ts
    const data = (await response.json()) as {
      id: string;
      hangoutLink?: string;
      iCalUID?: string;
    };
    return {
      id: data.id,
      meetingUrl: data.hangoutLink ?? null,
      iCalUID: data.iCalUID ?? null,
    };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/worker/calendar-service.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Lint and commit**

Run: `bun run lint`
Expected: clean.

```bash
git add worker/services/calendar-service.ts tests/worker/calendar-service.test.ts
git commit -m "feat(calendar): return iCalUID from createEvent"
```

---

### Task 4: Wire ICS into both confirmed-booking paths

**Files:**
- Modify: `worker/lib/booking-actions.ts` — add import; instant-confirm path (`createBookingAction`, ~lines 380–460); confirm-after-approval path (`confirmBookingAction`, ~lines 719–800)
- Test: `tests/worker/booking-actions.test.ts` (extend + make the fetch stub record calls)

**Interfaces:**
- Consumes: `buildIcs` from Task 1; `sendBookingConfirmation({ ..., icsContent })` from Task 2; `createEvent(...).iCalUID` from Task 3.
- Produces: no new exports. Confirmed bookings send a confirmation email carrying an `invite.ics` attachment.

- [ ] **Step 1: Make the test fetch stub record calls, and add a failing test**

In `tests/worker/booking-actions.test.ts`, replace the `beforeAll`/`afterAll` fetch stub (top of file) with a recording version:

```ts
const realFetch = globalThis.fetch;
let fetchCalls: Array<{ url: string; body: string }> = [];
beforeAll(() => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({ url: String(input), body: String(init?.body ?? "") });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});
```

Add a helper below the fixtures and a new test. This exercises `confirmBookingAction` (the fixture has no calendar connection, so `iCalUID` is null and the UID falls back to the booking id):

```ts
function resendConfirmationBody(): Record<string, unknown> | undefined {
  const call = fetchCalls.find(
    (c) =>
      c.url.includes("api.resend.com") &&
      c.body.includes("Booking Confirmed"),
  );
  return call ? (JSON.parse(call.body) as Record<string, unknown>) : undefined;
}

test("confirming a booking attaches an invite.ics to the guest email", async () => {
  fetchCalls = [];
  const { db, deps } = await seedFixture();

  const result = await confirmBookingAction(deps, "proj-a", "bk-pending");
  expect(result.ok).toBe(true);
  await Promise.all(pendingTasks); // drain waitUntil background tasks

  const body = resendConfirmationBody();
  expect(body).toBeDefined();
  const attachments = body!.attachments as Array<{
    filename: string;
    content: string;
  }>;
  expect(attachments).toHaveLength(1);
  expect(attachments[0].filename).toBe("invite.ics");

  const binary = atob(attachments[0].content);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const ics = new TextDecoder().decode(bytes);
  expect(ics).toContain("BEGIN:VCALENDAR");
  expect(ics).toContain("UID:booking-bk-pending@linkycal.com");
});
```

> Note: match the fixture's existing accessors for `db`, `deps`, and the drained
> background-task array (in this file they are collected via the `pending`
> array shown at the top of `seedFixture`). Use the same names the file already
> uses; adjust `pendingTasks`/`db`/`deps` in the snippet to the file's actual
> identifiers if they differ.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/worker/booking-actions.test.ts -t "attaches an invite.ics"`
Expected: FAIL — no `attachments` in the confirmation payload.

- [ ] **Step 3: Import `buildIcs`**

At the top of `worker/lib/booking-actions.ts`, add alongside the existing local imports (near `import { parseInviteConnectionIds } from "./calendar-refs";`):

```ts
import { buildIcs } from "./ics";
```

- [ ] **Step 4: Wire the instant-confirm path (`createBookingAction`)**

Just after `let meetingUrl: string | undefined;` (~line 380), add:

```ts
        let gcalICalUid: string | null = null;
```

Inside the `if (calConnection) { ... }` block, right after `meetingUrl = gcalResult.meetingUrl ?? undefined;` (~line 430), add:

```ts
            gcalICalUid = gcalResult.iCalUID;
```

Then, in the email `try` block, immediately before the `await emailService.sendBookingConfirmation({` call (~line 444), build the ICS:

```ts
          const icsDescriptionParts: string[] = [];
          if (input.notes) icsDescriptionParts.push(input.notes);
          if (meetingUrl) icsDescriptionParts.push(`Join: ${meetingUrl}`);

          const icsContent = buildIcs({
            uid: gcalICalUid ?? `booking-${booking.id}@linkycal.com`,
            dtstamp: new Date(),
            start: startTime,
            end: endTime,
            summary: `${eventType.name} with ${input.name}`,
            description: icsDescriptionParts.length
              ? icsDescriptionParts.join("\n\n")
              : undefined,
            location: meetingUrl ?? eventType.location ?? undefined,
            url: meetingUrl,
            organizerName: owner?.name,
            organizerEmail: owner?.email,
          });
```

Add `icsContent,` to the `sendBookingConfirmation({ ... })` argument object (alongside `meetingUrl,` and `theme: projectTheme,`).

- [ ] **Step 5: Wire the confirm-after-approval path (`confirmBookingAction`)**

Just after `let meetingUrl: string | undefined;` (~line 719), add:

```ts
      let gcalICalUid: string | null = null;
```

Inside the `if (calConnection) { ... }` block, right after `meetingUrl = gcalResult.meetingUrl ?? undefined;` (~line 769), add:

```ts
          gcalICalUid = gcalResult.iCalUID;
```

Then, in the email `try` block, immediately before `await emailService.sendBookingConfirmation({` (~line 783), build the ICS (no `owner` in scope here, so organizer fields are omitted):

```ts
        const icsDescriptionParts: string[] = [];
        if (booking.notes) icsDescriptionParts.push(booking.notes);
        if (meetingUrl) icsDescriptionParts.push(`Join: ${meetingUrl}`);

        const icsContent = buildIcs({
          uid: gcalICalUid ?? `booking-${booking.id}@linkycal.com`,
          dtstamp: new Date(),
          start: new Date(booking.startTime),
          end: new Date(booking.endTime),
          summary: `${eventType.name} with ${booking.name}`,
          description: icsDescriptionParts.length
            ? icsDescriptionParts.join("\n\n")
            : undefined,
          location: meetingUrl ?? eventType.location ?? undefined,
          url: meetingUrl,
        });
```

Add `icsContent,` to the `sendBookingConfirmation({ ... })` argument object.

- [ ] **Step 6: Run the booking-actions tests**

Run: `bun test tests/worker/booking-actions.test.ts`
Expected: PASS — new test plus all pre-existing tests.

- [ ] **Step 7: Full typecheck, lint, and test suite**

Run: `bun run build`
Expected: `tsc -b` + `vite build` succeed (no type errors from the changed return types / new param).

Run: `bun run lint`
Expected: clean.

Run: `bun test`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add worker/lib/booking-actions.ts tests/worker/booking-actions.test.ts
git commit -m "feat(booking): attach ICS to confirmation emails, deduped via gcal iCalUID"
```

---

## Self-Review

**Spec coverage:**
- `worker/lib/ics.ts` / `buildIcs` (RFC 5545, UTC, CRLF, folding, escaping, PUBLISH, VALARM) → Task 1. ✅
- EmailService attachment support + UTF-8-safe base64 + `icsContent` param → Task 2. ✅
- `createEvent` returns `iCalUID` → Task 3. ✅
- Wiring in both booking paths, UID = `iCalUID ?? booking-{id}@linkycal.com`, guest-only, meeting link + time in the file → Task 4. ✅
- Decision "keep `sendUpdates=all`" → honored (no change to that line; Global Constraints). ✅
- Error handling: ICS build sits inside the existing email `try/catch` in both paths; a throw is logged and does not block the booking. ✅
- Out of scope (reschedule/cancel ICS, host attachment, per-platform buttons, silence-Google toggle) → not implemented, matching the spec. ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code. The one advisory note in Task 4 Step 1 (match the fixture's real identifiers) is a guardrail for a file whose exact local variable names must be read at implementation time, not a placeholder for missing logic.

**Type consistency:** `buildIcs(IcsInput): string` used identically in Tasks 1 and 4. `createEvent` return `{ id, meetingUrl, iCalUID }` defined in Task 3 and consumed via `gcalResult.iCalUID` in Task 4. `sendBookingConfirmation` `icsContent?: string` defined in Task 2 and passed in Task 4. `send()` `attachments` shape (`{ filename, content, contentType }` → Resend `content_type`) consistent between Task 2 implementation and its test. ✅

# ICS Property Injection Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan.

**Goal:** Prevent UID and participant email values from injecting physical ICS properties through carriage returns or line feeds.

**Architecture:** Keep `buildIcs` and its public input type unchanged. Add one private sanitizer for raw property values, use it at the three unsafe serialization sites, and extend the existing protocol test to own those injection boundaries.

**Tech Stack:** TypeScript, Bun test

## Global Constraints

- Remove only `\r` and `\n`; do not introduce broader validation.
- Valid ICS inputs must serialize exactly as before.
- Do not refactor unrelated escaping, folding, request-method, or calendar behavior.
- Verification is focused on the serializer and its booking-action consumer; do not run unrelated suites for vanity.

---

### Task 1: Close Raw ICS Property Injection

**Files:**
- Modify: `worker/lib/ics.ts:22-38,66-100`
- Modify: `tests/worker/ics.test.ts:105-132`

**Interfaces:**
- Consumes: existing `buildIcs(input: IcsInput): string`
- Produces: unchanged `buildIcs` interface with CR/LF-safe UID, organizer email, and attendee email serialization

- [ ] **Step 1: Extend the existing injection contract**

Change the escaping/folding fixture to inject all three raw property values:

```ts
const ics = buildIcs({
  ...base,
  uid: "booking-abc@linkycal.com\r\nX-UID-EVIL:1",
  summary: "Roadmap, phase; path\\folder\r\nX-EVIL:1",
  description: `Résumé ${"漢".repeat(40)}, next; path\\file`,
  url: "https://example.com/book\r\nX-URL-EVIL:1",
  organizerName: "Host\r\nX-CN-EVIL:1",
  organizerEmail: "host@example.com\r\nX-ORGANIZER-EVIL:1",
  attendeeEmail: "guest@example.com\r\nX-ATTENDEE-EVIL:1",
});
```

After `const lines = unfoldIcs(ics)`, assert the sanitized properties retain
their non-newline content:

```ts
expect(lines).toContain(
  "UID:booking-abc@linkycal.comX-UID-EVIL:1",
);
expect(lines).toContain(
  "ORGANIZER;CN=Host  X-CN-EVIL 1:mailto:host@example.comX-ORGANIZER-EVIL:1",
);
expect(lines).toContain(
  "ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:guest@example.comX-ATTENDEE-EVIL:1",
);
```

Extend the existing no-injected-property assertions:

```ts
for (const prefix of [
  "X-EVIL:",
  "X-URL-EVIL:",
  "X-CN-EVIL:",
  "X-UID-EVIL:",
  "X-ORGANIZER-EVIL:",
  "X-ATTENDEE-EVIL:",
]) {
  expect(lines.some((line) => line.startsWith(prefix))).toBe(false);
}
```

Keep the existing CRLF termination, bare-newline, continuation-line, and
75-octet assertions in the same test because they are the same serialization
contract.

- [ ] **Step 2: Sanitize raw property values**

Add a private helper beside `sanitizeParam`:

```ts
function sanitizePropertyValue(value: string): string {
  return value.replace(/[\r\n]/g, "");
}
```

Use it at every affected serialization site:

```ts
`UID:${sanitizePropertyValue(input.uid)}`,
```

```ts
lines.push(
  `ORGANIZER${cnParam(input.organizerName)}:mailto:${sanitizePropertyValue(input.organizerEmail)}`,
);
```

```ts
lines.push(
  `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE${cnParam(
    input.attendeeName,
  )}:mailto:${sanitizePropertyValue(input.attendeeEmail)}`,
);
```

Do not change the truthiness checks used to choose `METHOD:REQUEST` or whether
the participant properties are emitted.

- [ ] **Step 3: Run focused verification**

Run only the serializer and its booking-action integration consumer:

```bash
bun test tests/worker/ics.test.ts tests/worker/booking-actions.test.ts
bun node_modules/eslint/bin/eslint.js worker/lib/ics.ts tests/worker/ics.test.ts
git diff --check
```

Expected: all focused tests pass, lint emits no findings, and the diff check is
clean.

- [ ] **Step 4: Run the TypeScript check**

```bash
bun --bun x tsc -b
```

Expected: exit code `0`.

- [ ] **Step 5: Review and commit**

Confirm the diff contains only the serializer, its regression test, and this
plan:

```bash
git status --short
git diff -- worker/lib/ics.ts tests/worker/ics.test.ts
```

Commit the implementation:

```bash
git add worker/lib/ics.ts tests/worker/ics.test.ts
git commit -m "fix: prevent ICS property injection"
```

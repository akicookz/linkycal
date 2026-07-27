# ICS Property Injection Hardening

## Problem

`buildIcs` escapes text fields and sanitizes parameter names, but it writes the
UID, organizer email, and attendee email directly into ICS property lines. A
carriage return or line feed in any of those values can create an additional
attacker-controlled calendar property.

The existing protocol test covers injection through summary, URL, and common
name parameters, so it does not detect this remaining raw-property path.

## Scope

Remove carriage returns and line feeds from:

- `uid`;
- `organizerEmail`;
- `attendeeEmail`.

Do not alter other ASCII control characters, change public types, introduce
email validation, or refactor the existing text, parameter, and URL escaping.
Valid values must produce the same ICS output as before.

## Design

Add one private helper in `worker/lib/ics.ts` that removes `\r` and `\n` from a
raw ICS property value. Use it when writing UID and both `mailto:` property
values.

Keep the existing behavior that emits `METHOD:REQUEST` only when both email
inputs are present. Sanitization affects serialization, not request-method
selection.

## Test Contract

Extend the existing escaping and folding test with injected UID, organizer
email, and attendee email values. Before the production change, the test must
fail because each injected `X-*` property appears as a physical ICS line.

After the change, assert:

- no injected UID, organizer, or attendee property line exists;
- the sanitized UID, organizer, and attendee properties retain the non-newline
  content;
- existing text escaping, CRLF framing, and 75-octet folding assertions still
  pass.

Run the focused ICS test first, followed by the full suite and relevant artifact
and build checks.

## Compatibility

The change is internal to ICS serialization. It adds no API or schema changes.
Inputs without `\r` or `\n` remain byte-for-byte compatible.

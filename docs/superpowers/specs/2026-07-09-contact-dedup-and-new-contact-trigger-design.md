# Contact dedup + `new_contact_created` trigger + enrich fix

Date: 2026-07-09

## Problem

Three related issues on the contacts surface:

1. **Contact enrich returns a 500.** Clicking "Enrich" on a contact fails with an
   error toast.
2. **Duplicate contacts.** Repeat bookings/form submits create separate contact
   rows because matching is exact-email only (`Jane@Acme.com` ≠ `jane@acme.com`),
   and name-only leads always insert a new row.
3. **No "new contact" automation.** There is no workflow trigger that fires the
   first time a contact is created, so users can't automate onboarding of a
   brand-new contact.

## Root cause — enrich 500 (reproduced)

Reproduced locally by driving the real OpenAI call with the key from `.dev.vars`:

```
AI_APICallError: Incorrect API key provided: sk-proj-…tmUA
```

OpenAI rejects the key (401). `enrichContact` →
`WorkflowAiResearchService.execute` → `generateText` throws; the route's `catch`
collapses every error into an opaque `500 { error: "Failed to enrich contact" }`,
so the real cause is invisible. This is a **credential failure, not a logic bug** —
the AI call works with a valid key (the stubbed unit test already passes).

The `.dev.vars` key is dead; prod almost certainly shares the cause (same OpenAI
account, same code path).

**Provider health (re-verified after the owner rotated keys, 2026-07-09):**
- OpenAI → **now works.** Returns a valid structured research result. The primary
  enrich path is unblocked at the credential level.
- Gemini → **now fails with a code bug**, not billing:
  `AI_APICallError: Tool use with a response mime type: 'application/json' is
  unsupported`. `executeGeminiResearch` combines `Output.object` (forces
  `responseMimeType: application/json`) with the `google_search` grounding tool +
  forced `toolChoice`; Gemini rejects structured-JSON output together with tool
  use. This also breaks any workflow `ai_research` step configured for Gemini.

Implication: the Gemini fallback only becomes useful once `executeGeminiResearch`
is restructured. **Decision (2026-07-09): fix it now** via the two-pass approach
in §1 — call 1 does grounded `google_search` (text out, no `Output.object`);
call 2 structures that text into `workflowResearchResultSchema` with
`Output.object` and **no tools**.

## Goals

- Enrich fails loudly and diagnosably; enrichment works again with a valid key.
- No duplicate contacts from normalized-equal email or name.
- A `new_contact_created` workflow trigger that fires exactly once when a contact
  is first created, selectable in the workflow builder.

## Non-goals

- Merging existing duplicate contacts already in the DB (backfill/merge tool).
- Fuzzy matching beyond case/whitespace normalization.
- Changing the AI research prompt or provider behavior.

## Design

### 1. Enrich fix

**Operational (owner action):** DONE — keys were rotated 2026-07-09; OpenAI now
returns valid results locally. Remaining owner step: confirm the same valid
`OPENAI_API_KEY` (and Gemini key/quota) is set in **prod**
(`wrangler secret put OPENAI_API_KEY`), since prod secrets are separate from
`.dev.vars`.

**Code hardening (`worker/index.ts` enrich route + `WorkflowAiResearchService`):**
- Stop swallowing the provider error. Detect provider auth/config failures
  (`AI_APICallError`, missing key) and return `502` with a specific, actionable
  message (e.g. `"Enrichment provider unavailable"`) instead of a generic `500`.
  Keep logging the underlying message server-side.
- **Fix the Gemini research path (in scope — decided 2026-07-09).** Restructure
  `WorkflowAiResearchService.executeGeminiResearch` as **two-pass** to avoid the
  unsupported "structured JSON + grounding tool" combo:
  1. Grounded search: `generateText` with the `google_search` tool, **no**
     `Output.object` — returns grounded text.
  2. Structure: `generateText` with `Output.object({ schema:
     workflowResearchResultSchema })` and **no tools** — converts the grounded
     text into the typed result. Preserve `withFallbackSources` behavior using the
     search step's sources.
  This fixes Gemini both for the enrich fallback and for workflow `ai_research`
  steps configured for Gemini.
- **Gemini fallback (default behavior):** `enrichContact` hardcodes
  `provider: "chatgpt"` in a single `execute` call with no try/catch. Wrap it: on
  a ChatGPT provider/availability error, retry once via Gemini when
  `GOOGLE_GENERATIVE_AI_API_KEY` is configured. Only surface an error to the user
  if **both** providers fail (or neither key is configured). With the two-pass fix
  above, this makes a single dead/over-quota provider non-fatal.
- Usage is only incremented after success (already true) — keep it that way so a
  provider failure never burns quota.

### 2. Contact normalization + dedup

Location: `worker/services/contact-service.ts` (service stays pure — no trigger
dispatch here).

- **Normalize on write:** `create()` stores `email` trimmed + lowercased. `name`
  keeps original casing for display.
- **Lookup (SQLite `lower(trim())`, project-scoped):**
  - `getByEmail(projectId, email)` → `WHERE project_id = ? AND
    lower(trim(email)) = ?` (matches existing mixed-case/whitespace rows too).
- **Dedup key — normalized email only (revised 2026-07-09 after code review).**
  The initial design added a name fallback for emailless records; review showed
  it merges two different people who share a name and silently drops the second
  record's data, so it was dropped. Booking/form always carry an email, so
  email-only fully covers the repeat-booking duplicate case; only emailless
  manual/MCP adds change (they now always create instead of maybe-merging).
- **`findOrCreate` returns `{ contact, created }`.**
  1. `findDuplicate` = normalized-email lookup (null when no email).
  2. Hit → `{ existing, created:false }`.
  3. Miss → `create()` (stores normalized email) → `{ contact, created:true }`.
- **`contact_created` activity:** log it inside `create()` so every new contact
  row gets a timeline entry regardless of path.

Caller changes:
- **Trigger-firing creation paths** switch to `ensureContact` (see §3):
  `worker/lib/booking-actions.ts` booking-create, `worker/index.ts` form-submit,
  `worker/index.ts` manual create endpoint (`POST /contacts`), and
  `worker/mcp/tools/contacts.ts` `createContact`. The manual + MCP paths use
  `service.create` today and move to `ensureContact`.
- **Non-firing paths** (`booking-actions.ts` cancel/confirm, and reschedule if it
  resolves a contact) keep calling `findOrCreate` directly, ignore `created`, and
  fire no trigger — they still get the improved dedup.
- **Import** (`POST /contacts/import`) keeps its bulk path but routes each row's
  insert through the dedup-aware `findOrCreate`/`create`; it fires no trigger.

### 3. `new_contact_created` trigger

- **New `worker/lib/contact-actions.ts`** → `ensureContact(db, env, projectId,
  input, source)`: calls `ContactService.findOrCreate`; **if `created`**,
  dispatches `new_contact_created` via `dispatchWorkflowTrigger` with context
  `{ projectId, contactId, contactEmail, contactName, metadata: { source } }`.
  Lives in the request-handler layer (like `booking-actions.ts`), never in step
  execution — preserves the no-workflow-loop contract.
- **Fires on:** public booking create, form submit, manual UI create, MCP create.
- **Does NOT fire on:** cancel / reschedule / confirm; **bulk CSV import**
  (decision: dedup + activity only, no fan-out); the trigger fires only for
  genuinely new contacts.
- **Manual UI create matching an existing contact (decision):** return the
  existing contact, create no duplicate, do not fire the trigger. The plan-limit
  check only counts against the limit when a row is actually inserted.

**Trigger wiring — all TypeScript, no DB migration** (columns are plain `TEXT`,
Drizzle `text({enum})` emits no `CHECK`):
- `worker/db/schema.ts`: add `"new_contact_created"` to `workflows.trigger` enum;
  add `"contact_created"` to `contactActivity.type` enum.
- `worker/validation.ts`: add `"new_contact_created"` to `workflowTriggerEnum`;
  add `"contact_created"` to `activityTypeEnum`.
- `worker/lib/workflow-dispatch.ts`: add `"new_contact_created"` to the trigger
  union.
- `worker/services/contact-service.ts`: add `"contact_created"` to
  `ContactActivityType`.
- `src/pages/Workflows.tsx`: add to `TRIGGER_OPTIONS` (`UserPlus` icon).
- `src/pages/WorkflowBuilder.tsx`: add to `TriggerType` union + `TRIGGER_META`.
- `src/lib/workflow-templates.ts`: add to `TriggerType` union.

Dispatch matching (`WorkflowExecutionService.dispatchTrigger`) is generic — it
selects active workflows by trigger name, so no execution-service change is
needed beyond the enum widening.

## Data flow (new contact via booking)

```
createBooking (booking-actions.ts, inside waitUntil)
  → ensureContact(db, env, projectId, {name, email}, "booking")
      → ContactService.findOrCreate  → { contact, created }
          (normalize email, dedup, insert if new, log contact_created activity)
      → if created: dispatchWorkflowTrigger("new_contact_created", ctx)
  → link contact to booking row
  → logActivity(contact, "booked")
  → dispatchWorkflowTrigger("booking_created", ctx)
```

## Testing

`tests/worker/contact-service.test.ts` (extend or add):
- `findOrCreate` returns `created:true` on first insert, `false` on repeat.
- Normalized email dedup: `Jane@Acme.com` then `jane@acme.com` → one row.
- Name fallback dedup when email absent.
- `create()` logs a `contact_created` activity.

`tests/worker/contact-actions.test.ts` (new):
- `ensureContact` dispatches `new_contact_created` only when `created`.
- Repeat booking (existing contact) does not dispatch.

Enrich fallback (`tests/worker/contact-enrich.test.ts`, extend):
- Stub `workflowAiResearchService.execute` so the ChatGPT provider throws and the
  Gemini provider succeeds → `enrichContact` still writes the enriched columns
  (fallback path). Both providers failing → error surfaces.

Gemini two-pass restructure: unit tests stub at the `execute` boundary (the repo
does not mock the AI SDK), so the two-pass call itself is verified manually via a
throwaway repro against the live API (network) — not in `bun test`.

## Rollout

No migration. Ship code + set the valid `OPENAI_API_KEY` secret in prod. Existing
duplicate rows are left as-is (out of scope); dedup applies going forward.

# NLP Next Action Design

**Date:** 2026-07-19
**Status:** Approved interaction design

## Context

The contact detail page currently creates a Next Action with two structured
fields: an action text input and a `datetime-local` deadline input. This is
reliable, but it makes a common CRM operation feel like form entry. The desired
experience is a single natural-language command such as:

> Call Atul by next week Friday at 5pm EST

LinkyCal should deterministically extract the action and exact deadline, show
the interpretation before saving, and retain the structured editor as a safe
fallback.

## Goals

- Let users enter an action and deadline in one sentence.
- Parse common relative dates, weekday phrases, business-time aliases, and
  timezone abbreviations entirely in the browser.
- Show the resolved action, exact deadline, timezone, and local-time conversion
  before persistence.
- Make every assumption visible and editable.
- Preserve the existing REST payload and database representation: action text
  plus an exact UTC deadline.
- Keep parsing deterministic, private, fast, and usable without an AI service.

## Non-goals

- Recurring actions or reminders.
- Multiple actions from one sentence.
- General-purpose conversational task management.
- LLM-based date interpretation.
- Persisting the original timezone or natural-language sentence after save.
- Changing workflow condition paths or Next Action API semantics.

## Approaches Considered

### Deterministic browser parser with confirmation preview

Use `chrono-node/en` to extract date expressions from the sentence, add a small
LinkyCal normalization layer for CRM-specific phrasing, and require a valid
preview before save. This is the selected approach because it provides source
ranges for action extraction, accepts parsing references and timezones, has no
runtime dependencies, and avoids network latency and probabilistic output.

### NLP-assisted deadline field

Keep action and deadline as separate inputs and allow natural language only in
the deadline input. This has the smallest behavior change, but does not deliver
the desired one-sentence workflow.

### Server-side LLM parsing

Send the sentence to an AI provider and request structured action/deadline
output. This accepts broader language but adds latency, cost, availability
failure modes, and unacceptable uncertainty around exact deadlines.

`compromise-dates` was also evaluated as the deterministic parser. It captured
more of the sample phrase but resolved the tested `next week Friday` expression
incorrectly and requires a larger NLP stack, so it is not selected.

## Interaction Design

### Empty state

The existing **Add Next Action** button opens a single composer input. Its
placeholder demonstrates the full interaction:

> Call Atul by next Friday at 5pm ET

A short helper line may show one additional example, but the card must remain
compact.

### Parsing state

`chrono-node/en` is lazy-loaded when the composer first opens. While the module
loads or the latest text is being parsed, Save remains disabled and the helper
copy reads **Understanding deadline…**. Parsing is local and should normally
resolve within one interaction frame after the module is cached.

### Valid preview

After a successful parse, the composer shows two compact, clickable preview
rows or chips:

- **Action:** Call Atul
- **Deadline:** Fri, Jul 24 · 5:00 PM EST
- **Your time:** Sat, Jul 25 · 6:00 AM KST, when an explicit input timezone
  differs from the browser timezone

Clicking the action preview reveals a normal text input. Clicking the deadline
preview reveals the existing `datetime-local` control. Manual edits become the
authoritative values submitted to the API; the natural-language sentence stays
visible until save or cancel.

If the parser supplies a date but no explicit time, the deadline preview uses
5:00 PM and includes a restrained **time assumed** label. The assumption never
hides inside a tooltip.

### Save and keyboard behavior

- Enter saves when the preview has a non-empty action and valid deadline.
- Enter does nothing while parsing or when the interpretation is invalid.
- Escape cancels the composer and restores the previously saved action.
- The existing icon-and-text Save and Cancel buttons remain available.
- Saving uses the current `PUT /next-action` request and existing pending/error
  behavior.

### Saved state

After save, the card continues to show the action, exact deadline, relative
deadline, Edit, and Mark Done controls. The deadline is formatted in the
viewer's current browser timezone, matching the existing contact UI. The input
timezone is used to calculate the correct instant but is not persisted.

## Parser Contract

The UI depends on a small application-owned interface rather than importing
Chrono types into the contact page:

```ts
interface ParsedNextAction {
  actionText: string;
  deadlineIso: string;
  matchedDateText: string;
  timezoneLabel: string;
  timezoneOffsetMinutes: number;
  assumedTime: boolean;
}

type NextActionParseResult =
  | { status: "valid"; value: ParsedNextAction }
  | { status: "empty" }
  | { status: "missing_action" }
  | { status: "missing_deadline" }
  | { status: "ambiguous"; matches: string[] }
  | { status: "past_deadline" };
```

The parsing module accepts the sentence, a reference instant, and the browser's
IANA timezone. Tests always inject the reference instant and timezone so results
do not depend on the machine running the suite.

## Normalization Rules

Normalization occurs on a parsing copy; the user's original sentence remains
unchanged.

- `next week <weekday>` becomes `<weekday> next week` for Chrono.
- `EOD` and `end of day` become `5pm`.
- `COB` and `close of business` become `5pm`.
- Whitespace and punctuation introduced by normalization are collapsed.

The normalizer retains a mapping to the original source range so action cleanup
removes the correct original date phrase even when word order changes.

After Chrono identifies the temporal range, action cleanup removes that range
and its adjacent deadline connector (`by`, `on`, `at`, or `before`), then
collapses whitespace and punctuation. Cleanup must work when the deadline is at
the beginning or end of the sentence. A result with no remaining action is
invalid.

## Deadline Rules

- Parsing always uses `{ forwardDate: true }` for implicit weekday references.
- An explicitly supplied time is retained exactly.
- A recognized named time such as `noon` or `midnight` is explicit.
- A date with no explicit time defaults to 5:00 PM in the resolved timezone and
  sets `assumedTime: true`.
- An explicit past expression is still rejected for Next Actions; the user must
  correct it manually.
- If Chrono finds more than one distinct temporal expression, the parser returns
  `ambiguous` instead of choosing. The UI displays **Choose one deadline** and
  opens the structured deadline control.

## Timezone Rules

Timezone precedence is:

1. Explicit timezone in the sentence.
2. Browser IANA timezone from `Intl.DateTimeFormat().resolvedOptions().timeZone`.
3. UTC only if the browser does not expose a valid IANA timezone.

Supported business aliases include:

- `EST`: fixed UTC-05:00.
- `EDT`: fixed UTC-04:00.
- `ET` and `Eastern time`: daylight-aware US Eastern time.
- `PST`: fixed UTC-08:00.
- `PDT`: fixed UTC-07:00.
- `PT` and `Pacific time`: daylight-aware US Pacific time.
- `UTC`, `GMT`, and explicit numeric UTC offsets.

Chrono's built-in mappings are used where they match these semantics; LinkyCal
adds explicit mappings only where needed. The confirmation preview always names
the timezone used. The submitted value is converted to an ISO UTC instant, which
the existing API already validates and stores.

## Component Boundaries

### Parser module

Owns normalization, Chrono invocation, timezone handling, source-range mapping,
action cleanup, default-time behavior, and parse-result errors. It has no React
dependency and exposes a deterministic async function.

### Next Action composer

Owns sentence state, parser loading, debounced interpretation, preview/manual
editing, keyboard behavior, and accessible status announcements. It receives
initial action/deadline values and emits the existing `{ text, deadline }`
mutation payload.

### Contact detail page

Continues to own fetching, mutation, cache invalidation, and the saved Next
Action display. It delegates editor-specific state and parsing to the composer
so the already-large route component does not absorb parser behavior.

## Error Handling

- Empty input: no error; Save disabled.
- No date found: **Add a deadline or choose it manually.**
- No action remains: **Add what needs to be done.**
- Multiple dates: **Choose one deadline.** Candidate phrases may be shown as
  context, but LinkyCal does not select one automatically.
- Past deadline: **Choose a future deadline.**
- Parser module load failure: show the structured action and deadline fields;
  creating a Next Action must remain possible.
- API failure: retain the sentence and manual edits, show the existing inline
  mutation error, and allow retry.

## Accessibility and Interface Details

- The sentence input has a persistent visible label: **What should happen, and
  when?**
- Parse status and errors use an `aria-live="polite"` region.
- Preview controls are real buttons with at least 40px hit areas and visible
  focus states.
- Dynamic dates and relative values use tabular numerals.
- Action and error copy use pretty wrapping; long action text cannot overflow
  the sidebar card.
- The preview uses spacing and muted surfaces rather than divider lines.
- Loading replaces the Save icon with a spinner while retaining the Save label.

## Testing Strategy

### Parser contract tests

Use a fixed reference instant and timezone to cover:

- `Call Atul tomorrow at 3pm`.
- `Follow up by next week Friday at 5pm EST`.
- `Send proposal Friday EOD ET`.
- `Email quote in 3 days`.
- `Review contract August 4 at noon`.
- Deadline-first sentences such as `By Friday at 5pm, call Atul`.
- Date-only 5:00 PM assumption.
- Fixed EST versus daylight-aware ET.
- Browser-timezone fallback and UTC fallback.
- Connector and punctuation cleanup.
- Empty, missing-action, missing-deadline, past, and multiple-date results.
- Source-range preservation through phrase normalization.

### Component tests

- Empty composer and placeholder.
- Valid preview rendering.
- Visible assumed-time label.
- Editing parsed action and deadline manually.
- Enter-to-save and Escape-to-cancel.
- Disabled save during parsing and invalid states.
- Accessible live error text.
- Parser-load failure falling back to structured fields.

### Integration checks

- The existing REST payload remains `{ text, deadline }`.
- Saved deadlines render in browser-local time after cache refresh.
- Existing edit, complete, workflow-condition, REST, and MCP tests remain green.
- Production build creates the English parser as a lazy client chunk rather
  than adding all Chrono locales to the initial dashboard bundle.

## Acceptance Criteria

- Every listed primary phrase resolves to the expected action and exact instant
  under a fixed reference date.
- The exact phrase `by next week Friday` is supported.
- No assumption or ambiguity is saved without visible UI feedback.
- Users can always correct the action and deadline with structured controls.
- No server, schema, REST, workflow, or MCP changes are required.
- The full test suite and production build pass.

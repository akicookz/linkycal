# Optional Next Action Deadline Design

**Date:** 2026-07-21
**Status:** Approved interaction design

## Context

LinkyCal currently treats a Next Action as an action plus a mandatory exact
deadline. The natural-language composer reinforces that contract by showing an
error when no date is detected, disabling Save until a deadline exists, and
rendering parsed action and deadline values as separate editable rows.

For quick CRM capture, the action is the essential value. A deadline should
enhance an action with scheduling, reminders, overdue state, and deadline-based
workflow facts, but it should not be required to record what happens next.

This design supersedes the mandatory-deadline and confirmation-preview portions
of the 2026-07-19 Next Action designs. The deterministic parser and timezone
resolution rules remain in use.

## Goals

- Require action text and make the deadline optional across the UI, REST API,
  service layer, activity metadata, MCP tool, and workflow facts.
- Keep natural-language deadline extraction without requiring a separate
  confirmation interface.
- Reduce the editor to one action input with an embedded deadline control.
- Show a local-time conversion only when the user's sentence contains a
  timezone whose offset differs from the browser timezone.
- Preserve existing completion, mutation, loading, and API-error behavior.

## Non-goals

- Multiple pending tasks per contact.
- Recurrence, reminders, or a new unscheduled-task page.
- Persisting the original natural-language sentence or timezone label.
- Replacing the deterministic parser.
- Changing the saved-card layout beyond supporting actions without deadlines.

## Approaches Considered

### Unified composer state with an embedded popover

Use one visible text input as the editing surface. The parser silently derives
the action text and optional deadline. A calendar icon inside the input opens a
small structured date-time popover and indicates whether a deadline is set.
This is selected because it matches the requested compact interaction and
removes the fragmented parser/manual-editor state that currently makes a
missing deadline invalid.

### Native picker overlaid on the icon

Place a transparent `datetime-local` input over the calendar icon and rely on
the browser's native picker. This uses less markup, but picker activation,
clearing, focus behavior, and accessible naming vary across browsers.

### Cosmetic simplification only

Hide the warning and parsed preview rows while retaining the current state
model. This is rejected because Save, REST validation, persistence, rendering,
and automation would still treat the deadline as required.

## Interaction Design

### Composer

The editor retains the visible label **What should happen, and when?** and
renders one rounded input wrapper containing:

- the natural-language action input;
- a calendar-clock icon button aligned inside the right edge.

The input retains exactly what the user typed while the editor is open. A
successful parse silently derives the action text that will be stored and its
deadline. For example:

```text
Follow up by tomorrow 3pm ET                         [calendar selected]
```

If no date is detected, the trimmed sentence becomes the stored action and the
deadline is `null`:

```text
Follow up                                            [calendar unselected]
```

No missing-deadline error or manual-picker row is rendered. The separate parsed
action row, parsed deadline row, edit icon, and **time assumed** text are
removed.

### Deadline picker

The icon button has a minimum 40 by 40 pixel hit area. Without a deadline it is
neutral. With a parsed or manually selected deadline it uses primary-colored
text and a restrained primary ring/background so the state remains visible
without adding another row.

Clicking it opens a compact popover containing the existing local
`datetime-local` control. When a deadline exists, the popover also offers an
icon-and-text **Clear deadline** action. Manual selection overrides the parsed
deadline until the sentence changes again.

The icon's accessible name states its action and selection state, including a
formatted local deadline when available.

### Timezone guidance

When a parsed sentence explicitly identifies a timezone and its offset differs
from the browser timezone at that instant, render one muted line:

```text
Deadline in your time: Thu, Jul 23, 6:00 AM GMT+9
```

Do not render this line when the sentence has no timezone, the parsed timezone
matches the browser offset, the deadline was selected manually, or no deadline
exists. Do not render **time assumed**.

### Validation and keyboard behavior

- Empty or whitespace-only action: Save disabled; no error until the existing
  action validation needs to be shown.
- Non-empty action of at most 500 stored characters: valid with or without a
  deadline.
- Enter saves when parsing has settled and the action is valid.
- Escape cancels and restores the persisted value.
- A manually selected deadline must be a valid future local time. Genuine
  ambiguous, invalid, or past date expressions may retain focused guidance;
  the absence of a date never produces an error.
- Parser load failure degrades to the typed sentence plus the embedded manual
  picker, not a separate structured form.

### Editing and saved display

Existing actions use the same single-input composer. An action with no deadline
opens with an unselected icon; an action with a deadline opens with a selected
icon.

The saved card considers `nextActionText` sufficient for an action to exist.
It always displays the text. The formatted deadline and relative due/overdue
lines render only when `nextActionDeadline` is present.

## Data and API Contract

The contact columns remain unchanged because both are already nullable.

The REST endpoint accepts either an active action or the existing clear
operation:

```ts
type SetNextActionInput =
  | { text: string; deadline: string | null }
  | { text: null; deadline: null };
```

Non-null text is trimmed and constrained to 1-500 characters. A non-null
deadline remains a valid offset ISO date-time. `text: null` is reserved for
completion and must be paired with `deadline: null`.

The contact service accepts `{ text: string; deadline: Date | null } | null`.
Setting an action writes both fields and logs `next_action_set` metadata with a
nullable deadline. Completing an action clears both fields and logs the previous
text even when its deadline was null.

The MCP `set_contact_next_action` tool makes `deadline` optional/nullable and
describes it as an optional exact ISO deadline. The completion tool is unchanged.

## Workflow Facts

An undated action still exposes `contact.nextAction.text`. Deadline-derived
facts are present only when the stored deadline exists and is valid:

```ts
nextAction?: {
  text: string;
  deadline?: string;
  overdue?: boolean;
  hoursUntilDeadline?: number;
  daysUntilDeadline?: number;
};
```

This keeps text-based `exists` and content conditions useful for every action.
Deadline, overdue, hours, and days conditions resolve as missing for undated
actions.

## Error Handling

- Missing deadline: no error; save `deadline: null`.
- Missing action: Save disabled and retain the existing focused guidance.
- Parser failure: preserve the sentence as action text and allow manual date
  selection.
- Invalid manual deadline: do not submit it; retain the editor for correction.
- API failure: preserve all editor state, show the existing inline mutation
  error, and allow retry.

## Testing Strategy

### Component tests

- A sentence without a date saves trimmed action text and `deadline: null`.
- Missing-date parsing renders no error and no standalone picker button.
- A parsed deadline selects/highlights the embedded calendar button.
- Parsed action/deadline preview rows and **time assumed** are absent.
- Different-timezone parsing renders **Deadline in your time**.
- Same-timezone, timezone-free, manual, and undated values render no conversion.
- The popover allows setting and clearing a manual deadline.
- Existing dated and undated actions initialize correctly.
- Enter, Escape, loading, length validation, and API errors continue to work.

### Worker and integration tests

- REST validation accepts non-null text with a null deadline.
- REST validation still rejects null text with a non-null deadline and malformed
  non-null deadlines.
- The contact service persists, replaces, completes, and logs undated actions.
- MCP can create an undated action.
- Contact detail renders an action whenever text exists.
- Workflow facts expose text for an undated action and omit deadline-derived
  values.

## Acceptance Criteria

- `Follow up` can be saved without selecting or typing a date.
- The composer has one visible input and one embedded calendar icon control.
- The calendar icon clearly distinguishes selected and unselected states.
- Missing deadlines never render an error.
- No separate parsed action, deadline, picker, or assumed-time rows remain.
- Local-time conversion appears only when an explicit parsed timezone differs
  from the browser timezone.
- REST, service, MCP, saved-card, and workflow behavior consistently support a
  nullable deadline.
- Focused tests, the full test suite, and the production build pass.

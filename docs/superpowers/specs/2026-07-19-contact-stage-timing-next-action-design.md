# Contact Stage Timing and Next Action Design

**Date:** 2026-07-19

**Status:** Approved for implementation planning

## Summary

LinkyCal will add two conventional CRM capabilities to contacts:

1. Time in stage, derived from the timestamp of the contact's current stage-tag assignment.
2. A single Next Action containing text and an exact deadline timestamp.

Stage timing will remain built on LinkyCal's existing tag-based pipeline. It will not introduce a separate stage column or a stage-history table. Next Action will be stored directly on the contact and rendered as the first card in the contact-detail sidebar, above Quick Stats.

Both capabilities will be available to workflow step conditions. Stage thresholds will support hours and days. Deadline conditions will support overdue state and exact hours or days remaining.

## Goals

- Show how long a contact has occupied the active tag column on a Kanban board.
- Derive stage entry from existing `tag_added` activity timestamps.
- Reset current stage duration when a contact leaves and later re-enters a tag.
- Let a user set, edit, and complete one Next Action for a contact.
- Store an exact Next Action deadline, including date and time.
- Display deadlines in the user's browser timezone while storing UTC.
- Expose stage age and Next Action facts as typed workflow condition sources.
- Refresh operational facts before each workflow step condition is evaluated.
- Keep Kanban stage age and Next Action relative time labels current while a page stays open.
- Preserve LinkyCal's API-first behavior through authenticated REST and MCP surfaces.

## Non-Goals

- A separate deals or opportunities object.
- A general-purpose task manager or multiple pending activities per contact.
- A new stage column on `contacts`.
- A stage-history table or cumulative time-in-stage analytics.
- Time in the Untagged column.
- An automatic workflow trigger at the moment a stage-age or deadline threshold is crossed.
- Workflow enrollment filtering before a run is created; the existing step-condition model remains in place.
- A time-in-stage card on the contact-detail page, because that route has no active Kanban-view context.

## Existing System Constraints

- Pipeline stages are project tags selected as columns by a saved Kanban contact view.
- Current tag assignments are stored in `contact_tags`.
- Adding a tag logs `contact_activity.type = "tag_added"` with `referenceId = tagId` and a `createdAt` timestamp.
- Stage moves remove the old stage tag and add the new stage tag.
- Workflow contexts currently carry only a small contact identity envelope and are persisted between queued steps.
- Workflow step conditions resolve string paths from the context view.
- Scheduled workflows fan out to matching contacts and then evaluate step conditions inside each run.

## Design Decisions

### Stage timing remains activity-derived

The source of truth is the combination of current tag assignment and the latest matching tag-add activity:

```text
For every tag currently assigned to a contact:
  enteredAt = MAX(contact_activity.createdAt)
    WHERE contact_activity.contactId = contact.id
      AND contact_activity.type = "tag_added"
      AND contact_activity.referenceId = tag.id

  if no matching activity exists:
    enteredAt = contact.createdAt
```

Only currently assigned tags receive an entry timestamp. Historical activity for a tag that is no longer assigned is not exposed as current stage timing.

Re-entering a tag produces a newer `tag_added` activity, so the newest timestamp resets the current duration naturally.

The backend returns entry timestamps, not precomputed durations. This prevents an age value from becoming stale immediately after a response is produced.

### Stage timing is tag-specific

A contact may appear in different saved Kanban views that use different tags as columns. Stage timing therefore remains keyed by tag ID rather than claiming one global stage per contact.

The Kanban card already knows its current column tag. It selects that tag's entry timestamp and calculates the display duration locally. Workflow conditions also select an exact tag, avoiding ambiguity between views.

### Next Action is one contact-level operational field

The `contacts` table gains two nullable columns:

```text
next_action_text       TEXT NULL
next_action_deadline   INTEGER TIMESTAMP NULL
```

Both values are set or cleared together. The database row is the current source of truth. Activity entries provide audit context but are not used to reconstruct the current Next Action.

### Exact timestamps and timezone behavior

The UI collects a local date and time through a `datetime-local` control. The browser converts the value into a UTC ISO timestamp before sending it.

The worker validates a complete ISO timestamp and persists it through Drizzle's timestamp mode. API responses serialize the deadline as an ISO timestamp. The UI formats it in the browser's local timezone.

Past deadlines are valid because an action may be overdue when it is created or edited.

## Data Model

### Contacts

Add `nextActionText` and `nextActionDeadline` to `contacts`. Both are nullable and have no defaults.

Add a generated Drizzle migration that adds the two columns without backfilling existing contacts.

### Contact activity

Add two activity types:

- `next_action_set`
- `next_action_completed`

`next_action_set` metadata contains the new text and deadline. Editing an existing action emits another set entry containing the replacement values.

`next_action_completed` metadata contains the previous text and deadline before the contact fields are cleared.

The contact-row update writes the two Next Action columns in one SQL statement. Activity logging is a separate audit write and is not the source of truth for the current action.

### Activity query index

Add a composite index supporting the grouped stage-entry lookup:

```text
contact_activity(contact_id, type, reference_id, created_at)
```

The existing contact ID chunking remains in effect so D1 queries stay below the bound-parameter limit.

## Service Contracts

### Stage entry facts

The contact service exposes a focused operational-facts query that can work for one contact or a chunk of contacts.

The returned shape is:

```ts
interface ContactOperationalFacts {
  enteredAtByTagId: Record<string, string>;
  nextAction: {
    text: string;
    deadline: string;
  } | null;
}
```

The service must:

- Read current tag assignments.
- Query the maximum matching `tag_added` timestamp per contact and tag.
- Apply the contact creation fallback only for currently assigned tags without matching activity.
- Normalize all returned timestamps to ISO strings.
- Return `nextAction: null` unless both stored fields are present.

The paginated contact decorator also attaches `enteredAtByTagId` so Kanban cards do not produce N+1 queries.

### Next Action mutation

The contact service accepts either a complete action or `null`:

```ts
setNextAction(
  contactId: string,
  action: { text: string; deadline: Date } | null,
): Promise<ContactRow | null>
```

When `action` is present, it updates both fields and logs `next_action_set`.

When `action` is `null`, it reads the previous values, clears both fields in one update, and logs `next_action_completed` only when a complete previous action existed. Completing an already-empty action is an idempotent no-op.

## REST and MCP Surfaces

### REST

Add an authenticated, project-scoped endpoint:

```text
PUT /api/projects/:projectId/contacts/:contactId/next-action
```

Accepted payloads:

```json
{
  "text": "Send revised proposal",
  "deadline": "2026-07-25T14:30:00.000Z"
}
```

or:

```json
{
  "text": null,
  "deadline": null
}
```

Validation rules:

- Non-null text is trimmed, 1–500 characters.
- Non-null deadline is a valid ISO date-time.
- Text and deadline must either both be non-null or both be null.
- A past timestamp is allowed.
- Project ownership is verified before mutation.

The endpoint returns the updated contact.

### MCP

Add two explicit project-scoped contact tools:

- `set_contact_next_action(contactId, text, deadline)`
- `complete_contact_next_action(contactId)`

Both call the same contact-service method as the REST endpoint. The set tool accepts an ISO deadline and the complete tool clears the existing action.

Existing `list_contacts` and `get_contact` results include the new contact fields through their normal contact serialization.

## Contact Detail UI

### Placement

Render a new Next Action card as the first card in the right sidebar, above Quick Stats. This occupies the position previously used by the separate Tags card. Tags remain inline below the contact name in the main identity card.

### Empty state

When no action exists, show:

- A compact empty-state message: `No next action`.
- An icon-and-text `Add Next Action` button.

### View state

When an action exists, show:

- The action text as the primary content.
- The formatted local deadline with a calendar/clock icon.
- A relative status such as `Due in 4 hours` or `Overdue by 2 days`.
- An icon-and-text Edit button.
- An icon-and-text Mark Done button.

The overdue state uses the destructive color sparingly for the relative status, not the entire card.

### Edit state

The card editor contains:

- A labeled text input.
- A labeled `datetime-local` input.
- An icon-and-text Save button.
- An icon-and-text Cancel action, consistent with the application's button convention.

Save remains disabled until both values are valid. A failed mutation keeps the editor open and shows an inline error.

Mark Done shows its loading state in place and clears the action after success.

### Live relative time

A shared minute clock updates once every 60 seconds while mounted. Contact-detail deadline labels and Kanban stage-age labels derive from this clock. It does not refetch data every minute.

## Kanban UI

Extend the contact-list response and `ViewContact` with:

```ts
enteredAtByTagId: Record<string, string>;
```

Each Kanban card uses its real tag column ID to select `enteredAt`. Untagged cards render no time-in-stage label.

Display formatting:

- Less than one hour: `<1h in stage`
- One hour through less than one day: whole elapsed hours, for example `6h in stage`
- One day or more: whole elapsed days, for example `3d in stage`

The UI display is rounded down. Workflow comparisons use exact fractional durations.

## Workflow Runtime

### Live operational-fact hydration

Before resolving inputs or evaluating a step condition, workflow execution reloads the contact's current operational facts when `context.contactId` is present.

Hydration updates only dedicated contact operational fields. It preserves trigger metadata, form fields, research results, and accumulated step inputs.

Refreshing per step is required because:

- A workflow may wait before its next condition.
- The contact may change stage while the run is waiting.
- The Next Action may be edited or completed while the run is waiting.

### Context view

The workflow context view adds:

```text
contact.stage.byTag.<tagId>.enteredAt
contact.stage.byTag.<tagId>.ageHours
contact.stage.byTag.<tagId>.ageDays

contact.nextAction.text
contact.nextAction.deadline
contact.nextAction.overdue
contact.nextAction.hoursUntilDeadline
contact.nextAction.daysUntilDeadline
```

Age calculations:

```text
ageHours = (now - enteredAt) / 3,600,000
ageDays  = (now - enteredAt) / 86,400,000
```

Deadline calculations:

```text
hoursUntilDeadline = (deadline - now) / 3,600,000
daysUntilDeadline  = (deadline - now) / 86,400,000
overdue             = deadline < now
```

Positive deadline-distance values mean time remains. Negative values mean the deadline is overdue.

When no complete Next Action exists, the `nextAction` object exposes none of these fields. In particular, `overdue` is absent rather than `false`, so `overdue = false` does not accidentally match contacts with no Next Action.

When a tag is not currently assigned, its `byTag` entry is absent. Historical tag activity alone never creates a current stage fact.

### Evaluation timing

Crossing a time threshold does not itself start a workflow. Conditions are evaluated only when an existing manual, event, or scheduled workflow run reaches the guarded step.

Users who want periodic overdue or stage-age automation configure a scheduled workflow and apply these condition sources to its steps.

## Workflow Condition Editor

### Condition-only variable catalog

Do not add per-tag timing facts to the globally seeded workflow input catalog. That would inject every project's stage facts into unrelated email, webhook, and AI step inputs.

Instead, the condition editor receives a condition-specific variable catalog composed of:

- Existing workflow condition sources.
- Fixed Next Action sources.
- Dynamic time-in-stage sources generated from the project's current tags.

Friendly source labels include:

- `Follow Up — time in stage (hours)`
- `Follow Up — time in stage (days)`
- `Next action text`
- `Next action deadline`
- `Next action overdue`
- `Hours until next action`
- `Days until next action`

### Source types and operators

Condition sources declare a value type.

| Value type | Allowed operators |
| --- | --- |
| Text | equals, not equals, contains, does not contain, is filled, is empty |
| Number | equals, not equals, greater than, less than, at least, at most, is filled, is empty |
| Boolean | equals, not equals, is filled, is empty |
| Timestamp | is filled, is empty |

Boolean sources render a true/false select instead of a free-text input. Numeric sources render a numeric input. Existing untyped sources default to text behavior.

The worker evaluator remains backward-compatible with already-saved generic rules.

### Deleted tags

Workflow rules persist the tag ID in their source path. Renaming a tag updates its display label without changing the condition path.

If a referenced tag is deleted:

- The editor keeps the saved source visible as `Stage tag removed` rather than dropping the rule.
- Runtime hydration produces no matching `byTag` entry.
- Numeric and equality comparisons evaluate false.
- `is empty` evaluates true.

## Error and Edge-Case Behavior

- A missing tag-add activity for a currently assigned tag falls back to contact creation time.
- Multiple historical entries for the same tag use the newest timestamp.
- A removed tag exposes no current duration even if historical activity remains.
- Re-adding a tag resets the current duration.
- Renaming or recoloring a tag does not affect timing because tag IDs remain stable.
- Untagged cards have no duration.
- Completing an empty Next Action is idempotent.
- A partial Next Action payload is rejected.
- An invalid ISO timestamp is rejected.
- Deadline parsing and rendering must remain correct across browser timezone and daylight-saving transitions.
- A workflow without contact context exposes no contact operational facts.
- A delayed workflow step must use the contact's facts at execution time, not run-start time.

## Testing Strategy

### Worker and service tests

- Latest matching `tag_added` timestamp wins.
- Contact creation fallback applies only to currently assigned tags without matching activity.
- Removed tags expose no current entry timestamp.
- Re-entry resets the current timestamp.
- Batched contact decoration attaches stage timestamps beyond the first D1-sized chunk.
- Next Action set writes both fields.
- Next Action completion clears both fields and preserves prior values in activity metadata.
- Partial and malformed Next Action payloads are rejected.
- REST and MCP mutations enforce project ownership.

### Workflow tests

- Hours and days are exact fractional values.
- Missing stage tags produce missing values.
- Missing Next Action does not match `overdue = false`.
- Positive and negative deadline-distance values have the documented meaning.
- A contact changing stage during a workflow wait is rehydrated before the next condition.
- A completed or edited Next Action during a wait is rehydrated before the next condition.
- Deleted-tag rules remain parseable and evaluate against missing data.
- Existing workflow condition rules remain backward-compatible.

### Frontend tests

- Kanban duration formatting covers `<1h`, hours, and days.
- Untagged cards omit time in stage.
- Minute ticks update displayed duration without a refetch.
- The Next Action card renders its empty state.
- The card renders local deadline and overdue state.
- The editor requires both text and deadline.
- Save converts a browser-local date-time to UTC ISO.
- Mark Done clears the rendered action after success.
- The condition editor shows both hour and day sources for each tag.
- Numeric, boolean, and timestamp sources show their correct controls and operators.
- A condition referencing a deleted tag remains visible.

## Rollout and Compatibility

- Existing contacts receive null Next Action fields.
- No stage data is migrated or rewritten.
- Existing tag activity remains the source for stage entry.
- Legacy tag assignments without activity use contact creation time.
- Existing API consumers tolerate the two additional nullable contact fields.
- Existing workflow condition data remains valid.
- The feature requires no new dependency.

## External Pattern References

- HubSpot deal properties expose date entered current stage and time in current stage: <https://knowledge.hubspot.com/properties/hubspots-default-deal-properties>
- Salesforce documents current-stage duration as current time minus the last stage-change date: <https://help.salesforce.com/s/articleView?id=000395972&language=en_US&type=1>
- Pipedrive displays days spent in stages and prioritizes work around upcoming activities: <https://support.pipedrive.com/en/article/deal-detail-view>

# Contact Pipeline and UI Corrections

**Date:** 2026-07-29

## Goal

Correct five related dashboard behaviors:

- keep the Analytics period icon and label on one row;
- replace unbounded hour-based labels for old bookings with calendar dates;
- order contacts in each Kanban stage by their Next Action deadline;
- guarantee that a contact has at most one pipeline-step tag across a project;
- place the PostHog project key and data region controls inline on wider screens.

## Scope

The work applies to the dashboard Analytics filters, booking activity cards,
Contacts Kanban queries, contact tag assignment, saved Kanban pipeline
configuration, and the PostHog analytics-integration card.

Ordinary contact tags remain many-to-many. Only tags referenced by
`pivotTagIds` in at least one project Kanban view are pipeline-step tags and
participate in the single-stage rule.

This design does not change contact-stage names, Kanban drag-and-drop,
Next Action editing, public booking pages, analytics provider payloads, or the
meaning of ordinary list-view tag filters.

## Select alignment

The shared Select trigger currently applies a line-clamp utility to every
direct child `span`. On the Analytics period filter, that utility replaces the
display behavior of the wrapper that is intended to hold the calendar icon and
period label in a flex row. The resulting wrapper can render as two lines.

The shared trigger will use truncation rules that do not change the child's
display mode. The period wrapper will remain a non-wrapping, minimum-width-aware
flex row with a non-shrinking calendar icon and truncated label. Other Select
controls retain their current height, focus, disabled, and overflow behavior.

Because this is a visual layout contract, it will be verified in the running
application rather than with Tailwind-class, DOM-ancestry, or snapshot tests.

## Booking activity time labels

Booking activity labels will remain relative when the booking is happening,
upcoming within 24 hours, or ended less than 24 hours ago.

Bookings that ended at least 24 hours ago will render an absolute label:

- same calendar year: `Jul 16, 8:30 PM`;
- different calendar year: `Jul 16, 2025, 8:30 PM`.

Future bookings more than one day away continue to use an absolute month, day,
and time label. Invalid-date behavior is unchanged.

## Kanban due-date ordering

Every Kanban stage request will explicitly ask for Next Action deadline
ordering. The contact service will sort the complete filtered result before
pagination so loading additional pages cannot insert an earlier deadline
behind a later one.

The order is:

1. earliest deadline first, which places the oldest overdue contact first;
2. later overdue and upcoming deadlines in chronological order;
3. contacts without a deadline last.

Equal deadlines use a stable contact-ID tie-breaker so pagination is
deterministic. The ordinary contacts list keeps its existing sort behavior.

## Pipeline-stage exclusivity

### Canonical stage set

The service resolves the project-wide union of `pivotTagIds` from every saved
Kanban view. A tag in that union is a pipeline-step tag. A tag not in the union
is an ordinary tag, even if its name resembles a default pipeline stage.

### Assignment behavior

All dashboard, REST, MCP, and workflow tag assignments already converge on
`TagService.assignToContact`. When the requested tag is a pipeline-step tag,
that service will remove every other project pipeline-step tag from the
contact, log the corresponding `tag_removed` activities, and then ensure the
requested tag is assigned.

Assigning an ordinary tag will not remove a pipeline stage or any other
ordinary tag. Reassigning the contact's current stage remains idempotent. If
the contact also has stale pipeline-step tags, reassigning the retained stage
will remove the stale peers without emitting a second `tag_added` event.

The stage-move endpoint will derive the canonical project step set on the
server. It will no longer trust a client-supplied `groupTagIds` list. Moving to
Untagged removes all project pipeline-step tags and leaves ordinary tags
untouched.

### Pipeline configuration changes

Creating or updating a Kanban view can turn an ordinary tag into a
pipeline-step tag. After a pipeline configuration change, the service will
reconcile project contacts against the new project-wide step set. When a
contact has multiple step tags, it retains the tag with the newest persisted
`tag_added` activity. A deterministic tag-ID tie-breaker handles missing or
equal activity timestamps.

### Existing data

A checked-in D1 data migration will repair duplicate pipeline-step assignments
that exist before the new write rule is deployed. It will use the same
most-recent-assignment rule and will not alter ordinary tags. The migration is
part of the repository change but will not be applied to production unless a
production migration/deployment is separately requested.

## PostHog settings layout

The PostHog card will render its provider-specific controls in a responsive
two-column grid:

- a wider `Project key` input;
- a narrower `Data region` selector.

The fields share one row at the card's wider breakpoints and stack on narrow
screens. The public-configuration helper remains under the project-key input.
The region choices display `🇺🇸 US` and `🇪🇺 EU`, while the persisted values
remain the existing `us` and `eu`. The Save action, loading behavior,
entitlement rules, payload, and accessible provider-specific input name remain
unchanged.

## Error handling

- An assignment for a missing contact or tag retains the existing 404
  behavior.
- Stage reconciliation operates only on contacts, tags, and views belonging to
  the resolved project.
- Valid legacy double-encoded view configuration is normalized before stage
  tags are resolved. Malformed configuration is ignored rather than widening
  the set of removable tags.
- Removing peer stages does not cause an existing target assignment to be
  reported as newly added.
- Due-date sorting treats invalid or absent deadlines as undated and places
  them last.

## Testing

One migration-backed contact pipeline suite will protect two distinct
contracts. The stage-exclusivity scenario will:

1. create a project, contact, ordinary tag, multiple step tags, and Kanban
   configuration;
2. assign ordinary and step tags through production services;
3. assign a second step tag;
4. assert the persisted contact retains the ordinary tag and only the new
   step tag.

That scenario will also prove that a pipeline configuration change reconciles
pre-existing duplicate stage assignments.

The due-ordering scenario will query a Kanban stage containing overdue,
upcoming, and undated contacts across pagination and assert literal
chronological results.

A focused booking-activity scenario will fix the wall clock and assert literal
labels immediately before and after the 24-hour boundary, including a
different-year booking.

The PostHog settings test will continue to assert accessible labels, persisted
US/EU values, and the exact save payload. It will not assert styling classes or
DOM ancestry. The inline field layout and Analytics period alignment will be
verified in the running browser at desktop and narrow widths.

Before handoff, the owning tests, full suite, lint, and production build must
pass. New tests must first be observed failing for the missing behavior.

## Acceptance criteria

- The Analytics period icon and label render on one row.
- Booking cards never show multi-day values as hundreds of hours ago.
- Each Kanban column is ordered oldest overdue, later deadlines, then undated.
- Pagination preserves that ordering.
- A contact persists at most one project pipeline-step tag.
- Ordinary tags remain independently assignable.
- Dashboard, REST, MCP, workflows, drag moves, and pipeline configuration
  changes share the same exclusivity rule.
- Existing duplicate stage assignments are repaired by the checked-in data
  migration.
- PostHog project key and region controls are inline on wider cards, responsive
  on narrow cards, and show flag-prefixed `US` and `EU` choices.

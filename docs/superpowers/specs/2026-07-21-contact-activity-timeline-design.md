# Contact Activity Timeline Design

## Goal

Give a user a complete, filterable history for one contact and let them open
booking, form-response, lead-research, and workflow-run details without leaving
the contact page.

## Scope

- Remove activity from the existing contact-detail response.
- Add a separately paginated, server-filtered contact-activity endpoint.
- Move activity fetching, filtering, pagination, and detail drawers into a
  focused contact-activity component.
- Add the four requested segments: `All`, `Bookings`, `Form responses`, and
  `Workflows`, aligned to the right of the timeline heading.
- Open supported activity details in a right-side drawer.

Out of scope: changing the project-wide bookings, form responses, or workflows
pages; adding new activity categories; changing how contacts are associated
with submissions.

## API Boundary

### Contact detail

`GET /api/projects/:projectId/contacts/:contactId` will return the contact and
its tags only. `ContactService.getWithDetails` will stop calling
`getActivity`, and the response will no longer contain an `activity` array.

### Contact activity

Add:

```http
GET /api/projects/:projectId/contacts/:contactId/activities
  ?category=all|bookings|form_responses|workflows
  &limit=20
  &cursor=<opaque cursor>
```

`category` defaults to `all`. `limit` defaults to `20` and is clamped to a
safe maximum of `100`. The endpoint returns `400` for an invalid category,
cursor, or limit and `404` when the contact does not belong to the project.
The route must be classified with the existing project API policy so session
and project API-key authentication behave consistently with the contact route.

Response shape:

```ts
interface ContactActivityPage {
  activities: ContactTimelineItem[];
  counts: {
    all: number;
    bookings: number;
    formResponses: number;
    workflows: number;
  };
  nextCursor: string | null;
}
```

Counts are exact across the contact's complete history, not just the loaded
page. They are returned with every page so a refreshed or directly requested
page remains self-contained.

The cursor is an opaque encoding of the last item's timestamp and stable
tie-break key. Pagination is newest-first and keyset-based, so activity added
after page one does not shift older pages or create duplicates. The service
fetches only enough candidates from each applicable source to fill the next
page, merges them, and returns a new cursor when more matching items exist.

### Workflow-run detail

Add a project-scoped run-detail endpoint for the drawer:

```http
GET /api/projects/:projectId/workflows/:workflowId/runs/:runId
```

It returns one run, including its step logs, only when both the workflow and
run belong to the requested project. Missing or foreign records return `404`.
Booking and form-response drawers continue using their existing detail
endpoints.

## Timeline Sources and Normalization

Create `worker/services/contact-activity-service.ts` to keep aggregation and
pagination separate from contact CRUD. It validates project ownership and
normalizes these sources into a shared timeline item shape:

1. Booking records whose `contactId` matches the contact. Each booking appears
   once with its current status, event type, creation time, and booking ID.
2. Completed form responses referenced by the contact's `form_submitted`
   activity, plus form responses linked from the contact's bookings. Response
   IDs are deduplicated before normalization, so a booking response is not
   shown twice.
3. Workflow runs joined through their workflow's project and matched by
   `contactId` in the run's JSON context.
4. Lead-research activity (`workflow_researched`). This remains a separate
   timeline item from its containing workflow run because it has its own
   research-specific detail view.
5. Other contact activity, such as contact creation, tag changes, and next
   actions. These appear only in `All`.

Booking lifecycle rows (`booked` and `cancelled`) are not emitted separately
when the corresponding booking record exists; the normalized booking row is
the single source of truth and exposes the current status. Legacy activity
without a surviving booking may remain as a non-clickable item in `All` so
historical context is not silently lost.

Each `ContactTimelineItem` contains:

- a stable ID and occurrence timestamp;
- category and item kind;
- title, description, and optional status;
- the reference IDs required to fetch details (`bookingId`, or `formId` plus
  `responseId`, or `workflowId` plus `runId`);
- optional lightweight research detail for a lead-research row.

The service does not place full booking records, full form values, or workflow
step logs in the paginated response.

### Lead-research detail compatibility

New research activity will persist the complete research record in its
activity metadata so the drawer can show summary, structured findings,
insights, and sources. Existing activity rows contain only a summary,
`resultKey`, and source count; those rows render the available summary and a
clear reduced-detail state rather than failing. The contact's current research
metadata may enrich an old row only when its key and execution time identify
the same record unambiguously.

## Frontend Component

Extract the current timeline from `src/pages/ContactDetail.tsx` into a focused
`src/components/ContactActivityTimeline.tsx` component. Its public inputs are
the project ID, contact ID, and an optional counts callback used by the parent
to preserve the existing Quick Stats and Total Activity displays.

The component owns:

- the `useInfiniteQuery` request to the contact-activity endpoint;
- selected category state;
- query reset through category-specific query keys;
- page flattening and deduplication by stable timeline item ID;
- loading, per-category empty, retry, and load-more states;
- the selected item and all activity detail drawers.

`ContactDetail.tsx` will remove its `ContactActivity` type, sorting helpers,
activity rendering, and all reads of `contact.activity`. It will store only the
exact counts reported by the timeline component for the existing sidebar
statistics. During the first activity request, the existing statistics render
skeletons. If the activity request fails, statistics render an unavailable
state rather than an incorrect zero.

## Timeline UI

The card header uses a responsive flex layout:

- `Activity Timeline` and its clock icon remain on the left.
- A compact segmented control containing `All`, `Bookings`, `Form responses`,
  and `Workflows` is aligned to the right.
- On narrow screens the control wraps beneath the title without horizontal
  page overflow.

Segments are text tabs, matching the user's requested labels. Timeline items
use the established clean list pattern inside the card: an icon circle, primary
text, timestamp, and an optional status badge. No divider borders are added.
Rows with details are full-width interactive targets with at least a 40px hit
area, a subtle background hover, and `active:scale-[0.96]`. Generic rows without
details do not receive hover or pressed affordances.

When another page exists, an icon-and-text `Load more` button appears below the
list. While loading, its icon is replaced by a spinning `Loader` and its text
remains. Changing segments immediately shows that segment's cached data when
available and otherwise its skeleton state.

## Detail Drawers

All supported details open in a right-side drawer so the user stays on the
contact page.

- Booking items reuse `ActivityDrawer` and the existing booking detail route.
- Form-response items reuse `ActivityDrawer` and the existing response detail
  route.
- Workflow-run items use a new drawer that fetches the run-detail endpoint and
  shows workflow name, run status, start/completion timestamps, errors, and the
  existing `WorkflowStepLog` presentation for each step.
- Lead-research items use a research drawer showing the stored summary,
  structured company/person findings, insights, and linked sources. Historical
  rows with reduced metadata show only the available values.

Drawer request failures keep the drawer open and show a retry action. Closing a
drawer clears its transient selection and error state.

## Filtering Semantics

- `All`: bookings, form responses, workflow runs, lead research, and generic
  contact activity.
- `Bookings`: normalized booking records only.
- `Form responses`: distinct standalone and booking-linked form responses.
- `Workflows`: workflow runs and lead-research activity.

Filtering is performed by the server. Selecting a segment changes the infinite
query key and begins pagination for that category from its first page.

## Testing

Backend tests cover:

- contact detail no longer querying or returning activity;
- contact and project ownership isolation;
- normalization of each source;
- booking-linked form-response deduplication;
- workflow-run JSON-context matching;
- exact category counts;
- category filtering;
- stable cursor pagination, including tied timestamps and newly inserted
  activity;
- invalid category, cursor, and limit handling;
- workflow-run detail ownership.

Frontend tests cover:

- the timeline issues its own request;
- the four requested labels and right-side header placement classes;
- category-specific query keys and reset behavior;
- loading, empty, error/retry, and load-more states;
- count propagation to Quick Stats;
- booking, form-response, workflow-run, and research drawer selection;
- generic rows remaining non-interactive.

Final verification includes the focused tests, the full Bun test suite,
`bun run build`, and browser inspection at desktop and narrow widths.

## Risks and Mitigations

- **Cross-source pagination:** use a stable timestamp plus source-kind/record-ID
  tie-break key and query each applicable source against the same cursor.
- **Duplicate booking responses:** collect response IDs into a set before
  normalization.
- **Historical research has partial metadata:** render the available summary
  and source count; persist full records for new research activity.
- **Large histories:** use keyset pagination and source-level limits rather
  than loading an entire contact history into memory.
- **Contact page regressions after removing embedded activity:** drive existing
  sidebar statistics from the activity page's exact counts and explicitly test
  the loading and failure states.

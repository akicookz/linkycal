# Entitlement enforcement and pricing — design

Date: 2026-08-02
Status: Draft for review

## Goal

Create one authoritative entitlement system for LinkyCal, enforce plan and usage
limits consistently across the dashboard, public endpoints, REST API, MCP, widgets,
and background workflows, and add a dedicated pricing page backed by the same plan
catalog.

This design also fixes the current team behavior where an invited member can receive
`Forbidden` while listing other members and can see their personal Free plan even
when the active team has a paid subscription.

The system must make upgrade paths visible without deleting customer data or
blocking bookings. Standard widgets, theme overrides, REST API access, and MCP
access remain available on every plan. The old “Custom widgets” entitlement is
retired and replaced by project-wide Custom CSS on Pro and Business.

## Product decisions

### Prices

| Plan | Monthly | Annual billing display | Annual charge |
| --- | ---: | ---: | ---: |
| Free | $0 | $0/month | $0 |
| Pro | $29/month | $24/month, billed annually | $288/year |
| Business | $99/month | $82/month, billed annually | $984/year |

Prices are per workspace, not per member. Team members are not seat-billed in this
version.

### Limits and features

“Per month” means per workspace usage period. “Per project” means each project has
its own independent resource cap. Unlimited values are represented as `null` in the
catalog and responses, never as an arbitrarily large number.

| Capability | Scope | Free | Pro | Business |
| --- | --- | ---: | ---: | ---: |
| Projects | workspace | 1 | 5 | 20 |
| Forms | project | 3 | 20 | Unlimited |
| Event types | project | 3 | 20 | Unlimited |
| Contacts | project | 500 | 5,000 | 10,000 |
| Workflows | project | 1 | 10 | Unlimited |
| Calendar connections | workspace | 1 | Unlimited | Unlimited |
| Team members | workspace | None | Unlimited | Unlimited |
| Form responses | workspace/month | 500 | 10,000 | 50,000 |
| Bookings | workspace/month | Unlimited | Unlimited | Unlimited |
| Workflow executions | workspace/month | 250 | 5,000 | 25,000 |
| Transactional emails | workspace/month | 500 | 10,000 | 50,000 |
| API + MCP requests | workspace/month | 10,000 | 100,000 | 1,000,000 |
| Enrichments | workspace/month | 5 | 50 | 100 |
| Storage | workspace | 500 MB | 10 GB | 50 GB |
| Analytics | feature | No | Yes | Yes |
| Analytics history | feature access window | None | 12 months | 36 months |
| Standard form and booking widgets | feature | Yes | Yes | Yes |
| Theme overrides | feature | Yes | Yes | Yes |
| REST API access | feature | Yes | Yes | Yes |
| MCP access | feature | Yes | Yes | Yes |
| Custom CSS | feature | No | Yes | Yes |
| Remove LinkyCal branding | feature | No | Yes | Yes |

Support is not differentiated in this version. The pricing page must not advertise
a plan-specific SLA, priority queue, or support promise that the product does not
currently provide.

### Limit policy

Static resource limits, such as projects, forms, contacts, and workflows, are hard
at the published value. They do not receive a 10% grace allowance. At the cap, a
user can read, edit, export, or delete existing resources but cannot create
another resource of that type.

Finite static resources are normal below `ceil(limit * 0.80)`, warning from that
threshold until the cap, and blocked at the cap. The blocked state takes precedence
when a small integer cap makes the warning threshold equal to the cap.

Metered monthly limits and storage use these thresholds:

- Below 80%: normal.
- At 80% through 99.99%: warning.
- At 100% through immediately below the grace ceiling: grace state with an
  upgrade prompt.
- At or above the grace ceiling: further counted operations are blocked.
- The warning threshold is `ceil(publishedLimit * 0.80)`.
- The grace ceiling is `ceil(publishedLimit * 1.10)`.

For example, Pro workflow executions warn at 4,000, enter grace at 5,000, and stop
accepting new executions at 5,500. Free enrichments warn at 4, enter grace at 5,
and block new enrichments at 6.

Storage display units are decimal: 1 MB is 1,000,000 bytes and 1 GB is
1,000,000,000 bytes. The catalog and enforcement layer store only the exact byte
values.

Bookings are never blocked by a plan or usage limit. They are counted for customer
visibility and future capacity planning only.

No enforcement path deletes customer data. A downgrade can disable creation or
access to a paid feature, but stored resources and settings remain available for a
later upgrade or for deletion by an authorized user.

## Workspace ownership model

The workspace is the billing and entitlement boundary.

- A team project belongs to workspace `{ type: "team", id: teamId }` and inherits
  that team’s subscription.
- A project without a team belongs to workspace
  `{ type: "personal", id: project.ownerUserId }` and inherits that user’s personal
  subscription.
- An invited member’s personal subscription is irrelevant while they are working in
  a team project. The team subscription is authoritative.
- Project-scoped API keys and MCP requests inherit the workspace of their project.
- Resource and usage totals include all projects in the same workspace when their
  scope is `workspace`.

Plan resolution is performed from the target project or explicit workspace, never
from the currently signed-in user alone. This prevents an invited member from being
shown Free while operating inside a paid team.

Paid usage periods follow the Stripe subscription’s current period start and end.
Free workspaces use UTC calendar months. An upgrade applies the larger limits
immediately without resetting usage. A scheduled downgrade applies when Stripe
moves the subscription to the lower plan; if an administrative change makes a
downgrade immediate, the over-limit behavior below applies immediately.

## Single plan catalog

Add a shared, client-safe plan catalog, conceptually
`shared/plan-catalog.ts`. It is the sole source for:

- plan ids, names, ordering, and recommended-plan progression;
- monthly and annual display prices;
- feature availability;
- static limits;
- metered limits and storage bytes;
- analytics access windows;
- pricing-page feature copy and grouping.

The catalog contains no Stripe secrets or environment-specific price ids. A
worker-only mapping connects configured Stripe price ids to catalog plan ids. The
mapping is validated at startup or in a contract test so a checkout price cannot
silently resolve to the wrong plan.

The existing duplicated plan definitions in `src/lib/constants.ts`,
`src/components/PricingCards.tsx`, marketing sections, onboarding, billing, and
`worker/lib/plan-limits.ts` are replaced by catalog consumers. Temporary adapters
may remain during rollout, but they must delegate to the shared catalog and cannot
carry independent values.

## Entitlement architecture

### Responsibilities

A per-request `EntitlementService` is the authoritative policy layer. It:

1. Resolves the target project’s workspace.
2. Resolves the workspace subscription and current usage period.
3. Reads the shared plan catalog.
4. Counts project- or workspace-scoped resources when needed.
5. Returns structured feature, resource, or metered decisions.
6. Atomically reserves metered usage before a counted operation.
7. Produces a transport-neutral entitlement error that REST and MCP adapters can
   serialize consistently.

The worker remains authoritative. Frontend checks are for explanation and early
feedback only; they never replace a backend guard.

Cross-request entitlement caching is intentionally excluded from the first version.
The service may memoize resolution within one request, but plan changes should not
be delayed by stale KV data. A short-lived cache can be added later after webhook
invalidation is proven.

### Entitlement keys

Use stable machine keys rather than display labels:

```ts
type EntitlementKey =
  | "projects"
  | "forms"
  | "eventTypes"
  | "contacts"
  | "workflows"
  | "calendarConnections"
  | "teamMembers"
  | "formResponses"
  | "bookings"
  | "workflowExecutions"
  | "transactionalEmails"
  | "integrationRequests"
  | "enrichments"
  | "storageBytes"
  | "analytics"
  | "analyticsRetentionMonths"
  | "widgets"
  | "themeOverrides"
  | "apiAccess"
  | "mcpAccess"
  | "customCss"
  | "removeBranding";
```

`integrationRequests` is the combined API and MCP monthly quota. `apiAccess` and
`mcpAccess` remain feature keys so clients can state that both are included on all
plans, but their enabled value is always true in this catalog.

### Decision shape

Feature decisions report whether the feature is enabled. Resource and metered
decisions report scope, usage, thresholds, reset information, and the next plan when
one exists.

```ts
interface EntitlementDecision {
  key: EntitlementKey;
  kind: "feature" | "resource" | "metered";
  scope: "project" | "workspace";
  enabled: boolean;
  allowed: boolean;
  status: "available" | "warning" | "grace" | "blocked" | "unavailable";
  used: number | null;
  limit: number | null;
  hardLimit: number | null;
  periodStart: string | null;
  resetAt: string | null;
  recommendedPlan: "pro" | "business" | null;
}
```

For static resource limits, `hardLimit === limit`, and `resetAt` is `null`. For an
unlimited capability, `limit` and `hardLimit` are `null`, `allowed` is true, and
the status is `available`. Storage uses `kind: "metered"` but has no period or reset,
because bytes are released only when an object is removed or replaced with a
smaller object. A Business limit has `recommendedPlan: null` because no higher
self-serve plan exists.

`recommendedPlan` is the lowest higher self-serve plan that would permit the
requested operation at current usage. The resolver skips a plan whose limit would
still be too small. It returns `null` when no self-serve plan resolves the decision.

### Dashboard snapshot

Add `GET /api/projects/:projectId/entitlements`. Any user who can read the project
can read this endpoint. It returns:

- workspace identity and display name;
- effective plan and billing interval;
- whether the current member may manage billing;
- all feature decisions;
- all relevant workspace- and project-scoped resource decisions;
- metered usage, period boundaries, warning status, and reset time.

The response is the source for navigation plan badges, billing summaries, settings
locks, usage cards, and upgrade dialogs. Billing management URLs are returned only
to a workspace owner or admin; ordinary invited members see the effective plan and
usage but not management controls.

### Structured errors

Every denied operation preserves the current human-readable `error` property for
backward compatibility and adds stable fields:

```json
{
  "error": "Monthly workflow execution limit reached",
  "code": "plan_usage_limit_reached",
  "entitlement": "workflowExecutions",
  "scope": "workspace",
  "used": 5500,
  "limit": 5000,
  "hardLimit": 5500,
  "resetAt": "2026-08-31T23:59:59.999Z",
  "recommendedPlan": "business"
}
```

Error codes are:

- `plan_feature_unavailable` for a feature not included in the plan;
- `plan_resource_limit_reached` for a static resource cap;
- `plan_usage_limit_reached` for a monthly or storage grace ceiling.

REST uses HTTP `403` for unavailable features or static plan caps and HTTP `429`
for exhausted metered usage. A metered `429` includes `Retry-After` when the reset
time is known. UI behavior must key off the structured `code` and `entitlement`,
not parse the message or depend only on the status code.

MCP tool calls return a protocol-valid tool result with `isError: true`, a concise
human-readable text block, and the same fields under
`structuredContent.entitlementError`. Protocol negotiation and `tools/list` are
not rejected as usage events; only actual authenticated tool invocations consume
the shared integration quota.

Public form visitors receive a neutral availability message at a hard response
limit. They never see workspace billing details, usage counts, or an upgrade CTA.

## Counting and enforcement semantics

### Static resource creation

Every creation route must call the entitlement service with the target workspace or
project. The final database insert must remain guarded against concurrent creates;
a frontend pre-check or a separate unguarded `COUNT` is insufficient. Domain
services should use a transactional or conditional insert based on the resolved
limit and report `plan_resource_limit_reached` when no row was inserted.

Resource counts use persisted, non-deleted rows. Draft and disabled forms, event
types, and workflows still count because they remain usable configuration. The
workspace owner is not a team member for quota purposes; active non-owner members
and outstanding invitations count. A calendar connection is one persisted provider
account, not each event type that uses it. Reauthorization of the same account is an
update.

After a downgrade leaves a workspace above a static cap:

- existing rows remain readable and editable;
- delete and export remain available;
- creation stays blocked until usage is below the current cap or the plan is
  upgraded;
- existing invited members keep project access, but a Free workspace cannot invite
  or add another member.

Specific creation paths include dashboard routes, onboarding defaults, REST API,
MCP tools, imports, duplication, OAuth callbacks, and any future background create
operation. No path is exempt merely because it is not initiated from the dashboard.

### Projects, forms, event types, and workflows

Project creation checks the workspace count. Forms, event types, and workflows
check the target project count. Onboarding’s default-form creation uses the same
guard as normal creation; it cannot bypass the Free form cap.

Duplicating a resource is creation and must consume capacity. Updating an existing
resource does not consume another slot.

### Contacts

Manual creation, import, REST API, and MCP contact creation stop at the project
contact cap. A bulk import performs deduplication and capacity calculation before
writing. If the import would require more new contacts than remain, it rejects the
entire import with required and remaining counts; it does not silently write a
partial import. Updates to already-matched contacts remain allowed.

Public forms and bookings never fail because the CRM contact cap is exhausted.
When a submission matches an existing contact, normal matching and updates may
continue. When it would create a new contact at the cap, LinkyCal stores the form
response or booking, preserves the supplied person fields on that source record,
skips only CRM contact creation, and writes an observable audit event such as
`contact_creation_skipped` with the entitlement decision.

### Form responses

The published count is completed form responses across the workspace. A response
enters usage when it transitions to `completed`; saving an in-progress answer or an
abandoned response does not count.

At the 110% grace ceiling, LinkyCal refuses to start a new public form response.
Responses with an existing in-progress response id may finish so a visitor is not
stopped halfway through. Those completions remain counted and can make the final
number exceed the ceiling temporarily. This is an intentional user-experience
exception, not a concurrency bug. New starts remain blocked until reset, deletion
does not reduce monthly usage, and upgrading immediately applies the larger ceiling.

Booking intake questions are part of the booking and do not count as form
responses. Bookings remain unlimited.

### Bookings

Every persisted booking increments the observational bookings counter. There is no
published booking ceiling and no booking creation guard.

If contacts, workflows, or email are exhausted, the booking still persists. The
system skips only the exhausted downstream side effect, records why it was skipped,
and exposes that state to workspace members. Calendar event creation remains part
of normal booking behavior and is not treated as a new calendar connection.

### Workflow executions

One accepted workflow trigger consumes one execution, regardless of how many
actions the workflow contains. Reserve the execution atomically before queueing the
run. If no quota remains, do not enqueue the run; preserve the source form response
or booking and record a `workflow_execution_skipped` event.

An accepted run remains counted if a later action fails. Retries of the same run id
do not consume another execution; a newly triggered run does.

### Transactional emails

Count one message per recipient for customer-facing operational email sent on
behalf of a workspace, including workflow email actions, booking confirmations and
reminders, and form notifications. Authentication OTPs, security notices, team
invitations, LinkyCal billing messages, and LinkyCal operational alerts are excluded.

Reserve immediately before handing the message to the email provider. An accepted
provider request remains counted even if downstream delivery later bounces. When
quota is exhausted, the source booking, response, or workflow record persists; only
the email is skipped and the skip reason is visible to workspace members.

If the provider request fails before acceptance, release the reservation. Every
message has a stable operation id derived from its source operation and recipient,
so a retry cannot reserve the same message twice.

### API and MCP requests

REST API and MCP are enabled on every plan. The combined quota counts:

- each authenticated project API request after API-key authentication and route
  resolution, whether the domain operation later succeeds or returns a validation
  or domain error;
- each authenticated MCP tool invocation after tool-name resolution, including a
  known tool call that later fails argument validation or domain execution.

Dashboard session-authenticated requests, public form or booking traffic, auth
failures, CORS preflight, health checks, MCP initialization, and MCP discovery calls
do not consume the integration quota. An MCP tool that calls internal service
methods consumes one tool invocation, not one additional REST request.

Reserve the slot before domain execution. REST responses may include usage, limit,
and reset headers for authenticated callers; the JSON entitlement error remains the
canonical contract.

### Enrichments

Reserve one enrichment before starting external enrichment work. If the operation
fails before any enrichment result is persisted, release that reservation. A
successful persisted result remains counted even if the user later removes it.

### Idempotency and retries

Form completions, workflow runs, customer email messages, and enrichment jobs use a
stable operation id when reserving usage. The reservation and counter change are
atomic. Repeating an already reserved or consumed operation id returns the existing
decision without incrementing again. A failed operation moves to `released`; an
intentional retry may atomically move that same event back to `reserved` against the
current period when capacity exists. It reuses the event rather than creating a
second charge record.

Integration requests deliberately do not deduplicate: each authenticated request
or MCP tool call is a usage event. Booking observation increments in the same
atomic database operation that first persists the unique booking id.

### Calendar connections

The Free workspace may have one connected calendar across all of its projects.
Connection initiation performs an early entitlement check for fast feedback, and
the OAuth callback performs the authoritative check again before persistence. This
closes the current callback and concurrent-tab bypass.

Refreshing or reauthorizing the same stored connection does not consume another
slot. Pro and Business have no calendar-connection cap.

### Storage

Storage is the current total bytes of customer-owned R2 objects across the
workspace, including project logos, form and section images, and response uploads.
System widget bundles and other LinkyCal-owned assets are excluded.

Before an upload, calculate the actual buffered payload size and the delta from an
object being replaced. Reject the upload before `R2.put` when the new workspace
total would exceed the grace ceiling. Reserve the byte delta atomically against the
workspace storage-total row before `R2.put`. After a successful put, upsert the
metadata row. If the put fails, release the reservation. Deletion removes the
object and metadata and then releases its bytes. An overwrite stores only the size
delta, not the entire replacement as additional usage.

Only a positive overwrite delta is reserved before the put. A negative delta is
released after the smaller replacement and metadata update succeed. If R2 succeeds
but metadata persistence fails, keep the reservation and let reconciliation repair
metadata rather than undercount the object that now exists.

A reconciliation job compares R2 listings with metadata so failed historical
writes or deletes cannot permanently drift the total. Storage enforcement remains
observe-only until the initial backfill and reconciliation agree.

### Analytics and retention

Free has no analytics endpoint or dashboard access. Pro can query the most recent
12 months and Business the most recent 36 months. The endpoint, not just the date
picker, clamps or rejects an out-of-window query.

The retention value is an analytics access window, not permission to delete source
bookings, responses, or contacts. Downgrading hides analytics or shortens the query
window without deleting source data. Upgrading restores the larger available
window when source data still exists.

### Custom CSS, branding, widgets, and themes

Standard form and booking widget embeds and existing structured theme overrides are
available on every plan. The current `customWidgets` entitlement is removed; there
is no feature for arbitrary user-supplied widget JavaScript.

Custom CSS is project-wide on Pro and Business. It applies to public form pages,
public booking pages, and their iframe widget renderings. Removing LinkyCal branding
is also available on Pro and Business.

On downgrade to Free:

- stored Custom CSS remains in the database but is not included in public output;
- the Custom CSS editor becomes read-only with an upgrade explanation;
- LinkyCal branding returns;
- structured theme overrides and standard embeds continue working.

## Custom CSS design and safety

Custom CSS is stored separately from the existing opaque project settings so it can
be validated, versioned, queried, and gated independently.

The editor accepts at most 20 KB measured as UTF-8 bytes. On save, the worker parses
the stylesheet with a standards-compliant CSS AST parser; the implementation will
add `css-tree` as a direct dependency rather than relying on a transitive build-tool
dependency or regular expressions.

Validation and compilation rules are:

- reject malformed CSS;
- reject `@import`, `@font-face`, `@namespace`, and `@page`;
- reject every `url()` token, including one inside a custom property, to prevent
  remote tracking and unexpected asset loading;
- allow ordinary declarations plus nested `@media`, `@supports`, `@container`,
  `@layer`, and local `@keyframes` rules;
- reject every other at-rule not in that allow-list;
- prefix every qualified selector with the LinkyCal public root
  `[data-linkycal-public]`;
- rewrite `html`, `body`, and `:root` targets to the public root rather than letting
  them escape it;
- scope animation names with a project-specific prefix and rewrite corresponding
  animation declarations to avoid collisions;
- serialize and persist the compiled CSS; public pages render only compiled CSS.

Both the public form and booking roots carry `data-linkycal-public`. CSS is emitted
only after server-side entitlement resolution. Hiding the editor in the frontend is
not an enforcement mechanism.

The settings experience includes an editor, validation feedback, a live form and
booking preview, save, and reset. A user with project-settings edit permission may
manage CSS; billing management remains restricted to workspace owners and admins.
Free users see the preview of standard theme controls and a locked Custom CSS card
with a Pro upgrade action.

Dashboard routes are `GET`, `PUT`, and `DELETE`
`/api/projects/:projectId/custom-css`. They require the corresponding existing
project-settings permission. The public form and booking response never exposes
`sourceCss`; it receives `compiledCss` only after the entitlement check.

## Team membership and billing corrections

Member-list authorization becomes method-aware:

- `GET` member-list routes require project or team read access;
- invitation, role changes, and removal require member-management permission;
- billing checkout, portal, cancellation, and subscription mutation require
  workspace owner or admin permission;
- effective plan name, limits, and usage are readable by every member who can read
  the active project.

The project permission router must stop mapping every path containing `/members` to
the mutation-only `project:members` permission. Response fields on the readable
member list remain limited to the profile and role information already needed by
the team UI.

Navigation and Billing must use the active workspace context. A team member opening
Billing from a team project resolves the team subscription, not `/api/billing` for
their personal account. Ordinary members see plan name, feature availability,
limits, usage, and reset dates. Owner/admin-only controls are hidden or disabled
with a clear role explanation.

## Pricing and upgrade experience

### Dedicated pricing page

Add public route `/pricing`. The homepage keeps a compact pricing teaser and links
to the dedicated page instead of maintaining a separate full plan definition.

The page reads the shared plan catalog and includes:

- monthly/annual billing toggle with annual equivalent and total charge stated
  clearly;
- three plan cards with Free, Pro, and Business calls to action;
- a grouped comparison matrix for Capacity, Automation, Integrations,
  Customization, and Collaboration & analytics;
- the exact limits in this document;
- clear “All plans” rows for standard widgets, theme overrides, REST API, MCP, and
  unlimited bookings;
- FAQ entries for what counts toward usage, the 80% warning, 10% grace allowance,
  billing-period resets, downgrades, API/MCP access, and annual billing.

The page must not imply that Custom CSS is arbitrary JavaScript or a custom widget
SDK. Copy should say that CSS styles the hosted and embedded public experiences.

### Responsive and visual behavior

Desktop uses aligned plan cards and a grouped comparison grid. Mobile uses one plan
card and feature group at a time; it does not squeeze a desktop table into a narrow
viewport. Feature groups use spacing and soft surfaces instead of divider rules.

Visual implementation follows the LinkyCal squircle system and forest-green accent.
Prices use tabular numerals so the monthly/annual toggle does not jump. The primary
plan card uses a restrained layered shadow and glow, while other cards remain
quieter. Hover, toggle, disclosure, and dialog transitions declare the properties
they animate instead of using `transition: all`. The existing Satoshi typography
and font smoothing remain unchanged. Motion respects `prefers-reduced-motion`.
Every non-close button follows the product rule of pairing a Lucide icon with its
text label.

The route sets a specific page title, description, and canonical `/pricing` URL so
the dedicated page has usable search and share metadata.

### Role-aware calls to action

- Signed-out visitors: Free says “Get started”; paid plans say “Start with Pro” or
  “Start with Business” and enter the existing auth/onboarding flow.
- Free workspace owner/admin: paid actions open checkout for the active workspace.
- Paid workspace owner/admin: current plan is labeled; valid plan changes use the
  existing billing flow.
- Invited non-admin member: cards show plan information but billing actions explain
  that an owner or admin must change the plan.
- Business users at a Business cap receive reset and usage-management guidance,
  not a nonexistent higher self-serve plan.

### Structured upgrade UI

Evolve the existing `UpgradeDialog` into a shared plan-limit dialog driven by an
`EntitlementDecision`. It shows:

- what action was stopped;
- current usage, published limit, grace ceiling when applicable, and reset time;
- which higher plan resolves the limit when one exists;
- a checkout action only when the current member can manage billing;
- owner/admin guidance for invited members;
- wait-until-reset or reduce-usage guidance when there is no higher plan.

At 80%, non-blocking banners or usage cards warn owners/admins. At 100%, the UI
shows grace status and the upgrade action, but does not falsely claim the action is
already blocked. At the hard ceiling, the operation error opens the blocking state.

## Persistence changes

### `workspace_usage_periods`

Add one row per workspace and usage period:

- `id` UUID primary key;
- `workspaceType` (`personal` or `team`);
- `workspaceId`;
- `periodStart` and `periodEnd` timestamps;
- `formResponses`;
- `bookings`;
- `workflowExecutions`;
- `transactionalEmails`;
- `integrationRequests`;
- `enrichments`;
- standard `createdAt` and `updatedAt` timestamps;
- unique index on `(workspaceType, workspaceId, periodStart)`;
- lookup index on `(workspaceType, workspaceId, periodEnd)`.

Counters are non-negative integers. Atomic conditional updates reserve monthly
usage only when `current + amount <= hardLimit`, except form completions already in
progress as described above. Period rows keep their explicit boundaries so Stripe
billing cycles do not need to align with calendar months.

### `workspace_usage_events`

Add a compact idempotency ledger for retryable metered operations:

- `id` UUID primary key;
- `usagePeriodId` with cascade delete;
- workspace type and id;
- entitlement key;
- stable `operationId`;
- `amount`;
- state (`reserved`, `consumed`, or `released`);
- standard timestamps;
- unique index on `(workspaceType, workspaceId, entitlementKey, operationId)`;
- period/state index for reconciliation and cleanup.

This table covers form completions, workflow runs, transactional emails, and
enrichments. It does not store one row per REST or MCP request. Event rows can be
removed after their period and rollback window have passed; aggregate period rows
remain the reporting authority.

### `workspace_storage_totals`

Add one current total per workspace:

- `id` UUID primary key;
- workspace type and id;
- `sizeBytes`;
- standard timestamps;
- unique index on `(workspaceType, workspaceId)`.

Conditional updates to this row provide atomic upload reservations. It is not tied
to a usage period. Reconciliation sets it to the verified sum of `stored_objects`.

### `stored_objects`

Track customer-owned R2 objects:

- `id` UUID primary key;
- workspace type and id;
- `projectId` with cascade delete;
- unique `objectKey`;
- category (`project_asset`, `form_asset`, or `response_upload`);
- `sizeBytes`;
- standard timestamps;
- indexes for workspace byte totals and project cleanup.

Object deletion and metadata deletion are handled together by the storage service.
Reconciliation repairs differences rather than trusting one side indefinitely.

### `project_custom_css`

Store one optional stylesheet per project:

- `id` UUID primary key;
- unique `projectId` with cascade delete;
- `sourceCss`;
- `compiledCss`;
- `sourceBytes`;
- `updatedByUserId`;
- standard timestamps.

The source is retained for editing. Only compiled CSS can reach a public response.

### Legacy usage data

The existing user-scoped `usage` table is not a valid authority for team usage.
During migration:

- copy the current personal workspace’s enrichment count into the matching new
  period when it can be mapped unambiguously;
- do not charge a paid team for its owner’s personal enrichment usage; team current
  periods start at zero when no team-scoped history exists;
- keep the legacy table read-only for at least one deployment and remove it only
  after reconciliation and rollback windows have passed.

## Rollout strategy

Enforcement is controlled by a worker environment mode with explicit stages rather
than one global on/off deployment.

1. **Catalog and observation:** ship the shared catalog, workspace resolution,
   entitlement snapshots, structured decisions, operation ids, and new counters.
   Record decisions and compare counts without blocking.
2. **Visibility and team fix:** ship `/pricing`, billing/usage surfaces, member-list
   read correction, workspace-aware plan display, and structured upgrade dialogs.
3. **Central route adoption:** move dashboard, onboarding, REST, MCP, OAuth callback,
   public submission, upload, and workflow paths onto the entitlement service while
   enforcement remains observable.
4. **Static and feature enforcement:** enable project/resource caps, analytics,
   branding, and Custom CSS gates after route coverage is verified.
5. **Metered enforcement:** enable monthly quota warnings and blocks after counter
   comparisons show no double counting or missed paths for a full verification
   window.
6. **Storage enforcement:** list and backfill R2 metadata, reconcile totals, then
   enable storage warnings and blocks.

Each entitlement key can be returned to observe-only mode independently if a
counter or route is found to be wrong. Billing webhooks and plan changes trigger a
fresh entitlement read; the first version does not rely on a persistent cache that
needs invalidation.

## Testing strategy

Tests must protect externally observable behavior and security boundaries, not
source text or styling classes.

### Catalog and plan resolution

- A table-driven catalog test asserts every approved numeric limit, price, feature,
  scope, and upgrade progression.
- Rendered pricing and onboarding/billing plan summaries consume the catalog and
  show the same values for monthly and annual modes.
- Team projects resolve the team plan for owners, admins, editors, and invited
  viewers even when their personal plan is Free.
- Personal projects continue to resolve the personal subscription.

### Authorization regressions

- Every invited project reader can list the members they are allowed to see.
- A non-admin member cannot invite, remove, change roles, open checkout, or mutate a
  subscription.
- A non-admin member can read effective plan, usage, and reset information.

### Static limits and bypasses

- Each plan is tested at one below, exactly at, and above each finite resource cap.
- Dashboard, onboarding default creation, REST, MCP, duplication, import, and OAuth
  callback paths cannot bypass the same decision.
- Conditional creation tests demonstrate that concurrent requests cannot both take
  the final available resource slot.
- A downgrade preserves read/edit/delete access while blocking another create.

### Public conversion safety

- A booking persists when contact creation, workflow execution, or email is
  exhausted, and each skipped side effect is observable.
- A form response persists when only the contact cap or downstream automation is
  exhausted.
- A form response cannot start at the response grace ceiling, while an existing
  in-progress response can finish.
- Booking intake answers do not consume form-response usage.

### Metered usage

- Atomic reservations allow exactly the remaining workflow, email, API/MCP, and
  enrichment capacity under concurrent requests.
- Warnings begin at 80%, grace begins at 100%, and blocking begins at the calculated
  grace ceiling for each finite plan.
- Paid periods use Stripe boundaries; Free periods reset on UTC month boundaries.
- Upgrade applies a larger ceiling without clearing usage.
- REST and MCP return the structured entitlement contract and correct transport
  behavior.
- Dashboard requests and MCP discovery do not consume integration usage.

### Custom CSS and paid features

- Free cannot save or receive Custom CSS; Pro and Business can.
- CSS parsing rejects malformed input, disallowed at-rules, every URL token, and
  input over 20 KB.
- Compiled selectors and animation names are scoped to the project’s public root.
- Public forms, bookings, and iframe widget renders include compiled CSS only when
  entitled.
- Downgrade retains source CSS but stops serving it and restores branding.
- Analytics endpoints enforce feature access and the 12-/36-month query windows.

### Storage

- Upload, replacement, and deletion apply the correct byte delta.
- Concurrent uploads cannot cross the hard ceiling.
- Reconciliation identifies and repairs missing, stale, and mismatched metadata.
- System widget assets do not count against customer storage.

## Operational visibility

Structured logs for denied or skipped operations include workspace type/id,
project id when present, plan, entitlement key, status, used, limit, hard limit,
request channel (`dashboard`, `public`, `api`, `mcp`, `queue`, or `oauth`), and a
request/run id. Logs must not include form answers, contact fields, CSS source, API
keys, or other customer content.

Usage cards expose current count, published limit, grace ceiling, and reset time to
workspace members. Only owners/admins see checkout or billing-portal actions.

## Documentation updates during implementation

The implementation must update the repository README, AGENTS plan-limit table,
OpenAPI descriptions, API/MCP documentation, onboarding plan copy, and billing FAQ.
The old claims that Free lacks API access, Business contacts are unlimited, Pro has
100 enrichments, or Custom widgets are a Business-only feature must not remain in
customer-facing or contributor documentation.

## Out of scope

- Usage-based overage billing or automatic per-unit charges.
- Enterprise plans, negotiated custom limits, or an admin override system.
- Per-seat billing.
- A booking cap.
- Arbitrary custom widget JavaScript or an uploaded widget runtime.
- Physical deletion of source data to enforce analytics history.
- Plan-specific support SLAs.
- Burst rate limiting, abuse prevention, or infrastructure-level throttling; those
  are separate from monthly product entitlements.

## Acceptance criteria

The design is implemented when:

1. One catalog supplies every plan value shown or enforced by LinkyCal.
2. The effective plan is workspace-scoped and identical for every member and API
   key operating on the same project.
3. Every creation and metered path returns the same structured decision and has no
   dashboard, onboarding, REST, MCP, OAuth, queue, or public bypass.
4. Invited members can read the member list and paid workspace plan while billing
   and membership mutations remain owner/admin-only.
5. Free, Pro, and Business receive the exact approved limits and warning/grace
   behavior.
6. Bookings always persist even when downstream contacts, workflows, or email are
   exhausted.
7. Standard widgets, theme overrides, REST API, and MCP work on all plans within
   their published usage quotas.
8. Custom CSS and branding removal work only on Pro and Business, and downgrade
   retains settings without serving paid output.
9. `/pricing`, onboarding, billing, usage UI, and upgrade dialogs agree with backend
   decisions and handle member roles correctly.
10. Counter observation, migration, reconciliation, and staged enforcement can be
    rolled back per entitlement without deleting customer data.

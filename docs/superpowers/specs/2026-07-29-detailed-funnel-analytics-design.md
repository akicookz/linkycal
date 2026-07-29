# Detailed Booking and Form Funnel Analytics

Date: 2026-07-29
Status: Approved

## Goal

Give project owners exact, aggregate drop-off analytics for public booking and
form experiences while preserving visitor privacy and the reliability of the
submission flows.

The dashboard must answer:

- which booking stage loses visitors;
- which rendered form screen or question loses visitors;
- which dates and times visitors saw or selected;
- whether a lack of availability or a safe error category contributed to the
  drop-off;
- whether traffic came from a direct page or widget; and
- how funnels differ by resource, device, UTM attribution, and period.

The same canonical events may be forwarded to customer-owned analytics
providers. Provider configuration and detailed analytics remain available only
to Pro and Business projects.

## Product decisions

### Aggregate funnels, not visitor histories

Project owners see unique journey counts and aggregate breakdowns. They cannot
open an individual visitor timeline.

Each public resource visit receives an anonymous journey ID scoped to that
booking event type or form and stored in browser session storage. The ID is not
a contact ID, is not shared between unrelated resources, and is never presented
in the dashboard.

### Extend Cloudflare Analytics Engine

Detailed events extend the existing `linkycal_analytics` Analytics Engine
dataset. This keeps the current analytics architecture, avoids a high-volume D1
event table, and preserves the existing project-scoped index.

D1 continues to store booking and form business records. It does not become a
raw behavioral-event store.

### Provider integrations before arbitrary scripts

The initial customer integration set is:

- Google Analytics 4;
- Meta Pixel; and
- PostHog.

Customers configure public provider identifiers, not raw JavaScript. Google Tag
Manager and free-form scripts are excluded from this release because they can
execute customer-controlled code. They require a separate sandboxed runtime
that cannot access LinkyCal DOM state, cookies, storage, or authenticated APIs.

Provider scripts load only on public booking and form experiences. They never
load in the dashboard, authentication routes, or other authenticated pages.

## Canonical event contract

Every detailed event carries this common context:

```ts
interface FunnelAnalyticsEvent {
  event: FunnelAnalyticsEventName;
  projectSlug: string;
  resourceSlug: string;
  journeyId: string;
  funnelType: "booking" | "form";
  source: "direct" | "widget";
  deviceType: "mobile" | "tablet" | "desktop";
  stageKey: string;
  stageLabel: string;
  stageKind: FunnelStageKind;
  stageOrder: number;
  context?: FunnelEventContext;
}
```

The existing UTM, referrer, country, and city context remains part of the
stored data point. Client-provided labels and context have explicit length and
shape limits.

The journey ID enables unique-journey aggregation. A browser-side dispatcher
deduplicates view and completion events by journey ID plus stage key. Retry and
failure events may occur more than once, but the primary funnel still counts
unique journeys.

Existing aggregate event names remain valid so historical reporting continues
to work. New detailed events begin at deployment and are not synthesized for
older traffic.

## Booking funnel

The booking funnel uses these ordered stages:

1. `page_view`
2. `booking_date_selected`
3. `booking_availability_shown`
4. `booking_time_selected`
5. `booking_details_viewed`
6. zero or more attached-form stages
7. `booking_submit_attempted`
8. `booking_created`

`booking_submit_failed` is a diagnostic event associated with the attempted
stage, not a successful funnel stage.

### Booking context

Booking events may store:

- selected local date;
- weekday;
- days between viewing and the selected date;
- viewer timezone;
- event duration;
- number of available slots;
- exact local slot-start times shown;
- earliest and latest slot shown;
- availability outcome: `available`, `none`, or `error`;
- selected local start time; and
- safe failure category.

The dashboard aggregates slot-start times into a distribution so owners can
see which times were offered and which times were selected. Exact slot arrays
are operational scheduling metadata, not guest data.

Booking failure categories are limited to:

- `validation`;
- `slot_unavailable`;
- `rate_limited`;
- `network`;
- `server`; and
- `unknown`.

Raw response bodies, exception messages, names, emails, notes, and attached
form answers are never analytics properties.

### Attached booking forms

When a booking contains an attached form, its actual rendered screens appear
between Details opened and Submit attempted. Those stages use the same form
stage contract described below with the `booking` funnel type.

## Form funnel

The form funnel uses:

1. `form_view`;
2. one `form_stage_viewed` stage for every rendered screen;
3. one `form_stage_completed` event when the visitor successfully advances
   from that screen;
4. `form_submit_attempted`; and
5. `form_completed`.

`form_stage_skipped` records configured stages bypassed by conditional logic.
`form_submit_failed` records a safe error category without replacing a funnel
stage.

### Actual rendered experience

Analytics follows what the visitor sees:

- focused multi-step forms use each rendered statement, question, or group as a
  stage;
- classic forms use each rendered configured step as a stage; and
- attached booking forms use the same actual-screen rules.

Each stage stores:

- stable step, screen, or field-derived key;
- label snapshot;
- one-based displayed position;
- stage kind: `statement`, `question`, `group`, or `step`;
- field type where the stage represents a question;
- required or optional status;
- viewed, completed, skipped, or validation-failed outcome; and
- safe validation category.

Question answers, uploaded filenames, field values, contact mappings, and
prefilled values are never copied into analytics.

Customer-defined labels are available only inside LinkyCal reporting. External
providers receive stable stage keys, kinds, and positions by default, not
question text.

## Focused-form persistence invariant

Analytics is observational and cannot change form persistence.

The existing `FormExperience` checkpoint contract remains the only mechanism
that controls persistence and navigation:

1. validate the current visible content;
2. persist the existing checkpoint through the current response-step endpoint;
3. advance only after that checkpoint succeeds; and
4. set the response to completed only at the final checkpoint.

Analytics lifecycle callbacks are separate, non-blocking callbacks. They may
observe screen entry, successful advancement, skipped conditional stages, and
safe failures, but they cannot replace `onCheckpoint`, change its payload,
delay it, or turn an analytics failure into a form failure.

Intermediate focused-form responses remain `in_progress`. File upload behavior
and the final completion notification/workflow path remain unchanged.

## Analytics Engine layout

The existing first thirteen blobs retain their meaning for backward
compatibility:

```text
blob1:  project ID
blob2:  event name
blob3:  resource slug
blob4:  UTM source
blob5:  UTM medium
blob6:  UTM campaign
blob7:  UTM term
blob8:  UTM content
blob9:  referrer
blob10: country
blob11: city
blob12: direct or widget source
blob13: bounded JSON context
```

Detailed funnels use the remaining blobs:

```text
blob14: anonymous journey ID
blob15: funnel type
blob16: stable stage key
blob17: stage label snapshot
blob18: stage kind
blob19: primary context value, interpreted by event type
blob20: device type
```

Numeric context uses:

```text
double1: event weight
double2: stage order
double3: available slot count
double4: days in advance
double5: duration in minutes
```

Exact offered slot starts and secondary safe metadata use bounded JSON in
`blob13`. The server rejects unsupported keys, oversized arrays, invalid
time/date formats, and values outside the public contract.

## Event delivery and authority

A framework-independent client analytics module owns:

- resource-scoped journey ID creation;
- source and device context;
- UTM and referrer context;
- per-stage deduplication;
- best-effort LinkyCal delivery; and
- dispatch to configured external providers.

The direct SPA and both widgets use this shared contract. A widget passes
`source=widget` and its journey ID into the iframe so the iframe and host loader
do not create duplicate funnels.

Views, user selections, stage entry, attempts, and client-safe failures are
client events. The following events remain server-authoritative:

- `booking_created`;
- persisted form checkpoint completion; and
- `form_completed`.

Booking creation and form response/checkpoint requests carry the optional
journey and stage identifiers needed to correlate the authoritative event.
Older clients remain valid when those fields are absent.

Analytics delivery is always best effort. LinkyCal or external-provider
failure cannot block availability, navigation, form persistence, booking
creation, uploads, notifications, or workflows.

## Reporting API

The booking and form analytics responses add a detailed funnel:

```ts
interface FunnelStageReport {
  key: string;
  label: string;
  kind: string;
  order: number;
  visitors: number;
  continued: number;
  continuationRate: number;
  dropOffs: number;
  dropOffRate: number;
  contextBreakdowns?: FunnelContextBreakdowns;
}
```

Counts use unique journey IDs rather than raw event totals. A stage compares
against the preceding stage in the actual report order. Conditional form stages
also expose skipped counts so a conditional bypass is not mislabeled as
abandonment.

The API returns:

- existing high-level totals and time series;
- a detailed-funnel availability timestamp;
- detailed stages for a selected event type or form;
- direct versus widget and device breakdowns;
- date-selection and offered/selected-time distributions for bookings; and
- safe validation/failure-category breakdowns.

The existing period and UTM filters continue to apply. Source and device become
first-class filters.

Detailed form stages require a selected form because different forms have
different stage definitions. Detailed attached-form booking stages require a
selected event type. The All resources view remains a stable high-level
summary.

## Public REST API

Detailed analytics is part of the authenticated project REST API, not a
dashboard-only feature. The existing project analytics routes already accept a
dashboard session or a project-scoped API key and remain the canonical public
contract:

```text
GET /api/projects/:projectId/analytics/filters
GET /api/projects/:projectId/analytics/overview
GET /api/projects/:projectId/analytics/bookings
GET /api/projects/:projectId/analytics/forms
```

The booking and form routes return the detailed funnel and context breakdowns
defined above in addition to their backward-compatible aggregate fields.
Supported query parameters are:

```text
period=7d|30d|90d|custom
start=<ISO date>
end=<ISO date>
resourceSlug=<event type or form slug>
utmSource=<value>
utmMedium=<value>
utmCampaign=<value>
source=direct|widget
deviceType=mobile|tablet|desktop
```

`start` and `end` are accepted only with `period=custom`. The API validates
that `resourceSlug` belongs to the project and returns an empty detailed funnel
rather than another project's existence when it does not.

The filters response adds:

- event types with ID, slug, and display name;
- forms with ID, slug, and display name;
- observed direct/widget sources; and
- observed device types.

Provider configuration receives dedicated project routes:

```text
GET /api/projects/:projectId/analytics/integrations
PUT /api/projects/:projectId/analytics/integrations/:provider
```

The provider parameter is exactly `ga4`, `meta_pixel`, or `posthog`. `PUT`
accepts the provider's structured public identifier, optional allowlisted
region, and enabled state. Disabling uses the same route with `enabled: false`;
there is no raw-script field and no arbitrary URL field.

These integration routes are added to the project API-key route policy. API-key
requests therefore require both project-scoped API access and the project's
analytics entitlement. Session and API-key requests use the same validation
and service implementation.

The anonymous visitor endpoint remains:

```text
POST /api/v1/t
```

Its public schema is expanded to the canonical detailed-event contract and
documented as a browser telemetry endpoint, not an owner-reporting endpoint.
It receives an explicit per-IP rate limit, bounded batch/event sizes, strict
journey/stage validation, and silent best-effort failure semantics. It never
returns or exposes analytics data.

No REST analytics response exposes journey IDs, IP addresses, contact data, or
individual paths.

## MCP exposure

Analytics is exposed through a new `worker/mcp/tools/analytics.ts` domain
registered by the project-scoped MCP agent. MCP handlers call the same
framework-independent analytics and integration services as REST routes; they
do not duplicate Analytics Engine SQL or entitlement logic.

The MCP server adds five tools:

```text
get_analytics_overview
get_booking_funnel_analytics
get_form_funnel_analytics
list_analytics_integrations
configure_analytics_integration
```

### Read tools

`get_analytics_overview` accepts the common period, custom range, UTM, source,
and device filters and returns aggregate traffic and conversions.

`get_booking_funnel_analytics` accepts an optional project-owned event type ID
plus the common filters. With an event type it returns exact static and
attached-form stages, date/availability/time distributions, and safe failures.
Without one it returns the All event types summary.

`get_form_funnel_analytics` accepts an optional project-owned form ID plus the
common filters. With a form it returns its exact rendered-stage funnel,
conditional skips, and safe failures. Without one it returns the All forms
summary.

`list_analytics_integrations` returns the three supported provider
configurations and enabled state. Provider identifiers are public client
configuration; no secret value is returned because no provider secret is
stored.

### Write tool

`configure_analytics_integration` accepts:

```ts
type ConfigureAnalyticsIntegrationInput =
  | {
      provider: "ga4";
      enabled: boolean;
      measurementId?: string;
    }
  | {
      provider: "meta_pixel";
      enabled: boolean;
      pixelId?: string;
    }
  | {
      provider: "posthog";
      enabled: boolean;
      projectKey?: string;
      host?: "us" | "eu";
    };
```

The tool enforces the same validation and Pro/Business analytics entitlement as
the dashboard and REST API.

Every tool is hard-scoped through `ToolContext.projectId()`. Callers never pass
a project ID. Event type and form IDs are resolved inside that boundary and
cross-project resources return the same not-found result as missing resources.

MCP results contain aggregate stages and safe context only. They never return
journey IDs, visitor identities, form values, question answers, IP addresses,
or raw provider errors.

## Documentation contract

Documentation ships in the same change as the routes, schemas, and MCP tools.
The implementation updates:

- `scripts/api-docs-catalog.ts` with analytics query parameters, detailed
  response schemas, integration management routes, entitlement notes, and the
  expanded anonymous tracking schema;
- `src/lib/api-reference.ts` with public REST examples and response
  descriptions;
- `src/pages/Docs.tsx` with the five analytics MCP tools, updated tool count,
  Pro-gating behavior, and REST examples;
- `README.md` with the expanded API/MCP capability and corrected generated-docs
  ownership;
- `public/openapi.json` through `bun run docs:generate`;
- `docs/api-endpoint-audit.md` through `bun run docs:generate`; and
- `public/llms.txt` with the new REST and MCP capabilities.

The repository currently describes `public/llms.txt` as generated, but
`docs:generate` does not own it. This feature resolves that inconsistency:
`public/llms.txt` gains an explicit source/template owned by the docs generator,
and `bun run docs:generate` plus `bun run docs:check` generate and verify all
three public artifacts:

```text
public/openapi.json
docs/api-endpoint-audit.md
public/llms.txt
```

Generated artifacts are never edited without updating their owning catalog or
template. Documentation tests fail when:

- a registered REST route is absent from the OpenAPI contract;
- the endpoint audit disagrees with API-key/session policy;
- an MCP analytics tool is missing from the in-app or LLM-facing inventory;
- the documented MCP tool count is stale; or
- a response or filter field differs between the runtime schema and public
  examples.

## Dashboard experience

### Booking analytics

The Bookings tab adds an event-type selector. For a selected event type, the
funnel lists every static booking stage plus attached-form stages.

Each row shows:

- provider-independent stage icon;
- stage label;
- unique visitor count;
- continuation percentage;
- drop-off count; and
- drop-off percentage from the previous stage.

Context cards show selected-date distribution, no-availability rate, offered
slot-time distribution, selected-time distribution, and safe submission
failures.

### Form analytics

The Forms tab adds a form selector. For a selected form, the funnel lists the
actual focused screens/questions or classic steps, using stored label
snapshots.

Each row uses the same count and drop-off presentation as booking analytics.
Conditional skipped counts and safe validation failures are visible without
showing answers.

### Historical boundary

Existing high-level history remains visible. The detailed funnel includes a
clear note such as “Detailed step tracking began July 29, 2026” based on the
first detailed event, so zero detailed stages are not misrepresented as zero
historical traffic.

## Customer provider integrations

Provider configuration lives in Project Settings under **Analytics
integrations**.

The UI contains one card per provider with:

- a bundled provider-branded icon;
- provider name and concise description;
- public identifier input;
- region or host selection where relevant;
- a card-style enabled toggle; and
- an icon-plus-text save action.

Brand icons are bundled local assets or components, not remote images.

Configuration fields are:

- GA4 measurement ID;
- Meta Pixel ID; and
- PostHog project key plus an allowlisted US or EU host.

Provider identifiers are public client configuration, not secrets. They are
stored in structured project settings and validated server-side. Arbitrary
provider hosts and script URLs are not accepted.

The external dispatcher maps canonical events as follows:

- GA4 receives namespaced LinkyCal custom events;
- Meta receives custom events, with successful booking mapped to `Schedule` and
  successful form completion mapped to `Lead`; and
- PostHog receives canonical LinkyCal event names.

External payloads include stable stage key, order, kind, resource slug, source,
device, safe booking context, and UTM attribution. They exclude project-internal
question labels and every form or contact value.

## Entitlement and public exposure

Detailed analytics and provider configuration use the existing analytics
entitlement:

- Pro and Business projects may configure providers and view detailed funnels;
- Free projects see locked integration cards and an icon-plus-text Upgrade
  action; and
- backend update routes reject configuration changes when the project lacks
  the analytics entitlement.

Public booking and form configuration includes enabled provider identifiers
only while the project is entitled. Downgrading immediately stops publishing
the provider configuration without requiring the owner to delete it.

The server never trusts a client-only entitlement check.

## Error handling

- Public tracking accepts only the canonical event and context schemas.
- Unknown events and unsupported metadata are discarded without affecting the
  visitor request.
- Provider initialization failures are isolated per provider.
- Network failures do not retry beyond the browser's bounded best-effort
  delivery.
- Server-authoritative success events are written only after the underlying
  booking or form operation succeeds.
- Spam honeypot fake-success paths do not create real conversion analytics.
- Dashboard queries return an empty detailed funnel with the availability
  boundary rather than treating missing detailed data as an application error.

## Testing strategy

Every new test must demonstrate its red state before production code changes.
The strongest tests protect these observable contracts:

1. A focused form still persists every existing intermediate checkpoint before
   advancing and completes only at the final checkpoint while analytics
   callbacks run independently.
2. Analytics failure cannot prevent a focused form checkpoint, booking
   creation, file upload, or completion.
3. A booking journey emits each stage once, retains safe date/availability/time
   context, and correlates the server-created conversion with the same journey.
4. A form journey reports actual rendered screens, completed stages, and
   conditional skips without sending field values.
5. Detailed queries calculate unique visitors, continuation, and drop-off from
   literal event fixtures, including conditional skips.
6. Direct pages and widget iframes produce one funnel with correct source
   attribution.
7. Free projects cannot mutate or publicly expose provider configuration;
   Pro and Business projects can.
8. External provider payloads contain the canonical safe context and exclude
   names, emails, answers, notes, labels, and raw error messages.
9. Invalid provider identifiers, arbitrary PostHog hosts, raw script input, and
   unsupported analytics metadata are rejected.
10. Existing aggregate booking and form analytics remain queryable alongside the
    detailed-data boundary.
11. REST analytics responses expose the detailed aggregate contract through a
    project-scoped API key and never expose journey IDs or visitor data.
12. Integration REST routes require both project scope and the analytics
    entitlement and produce the same stored result as dashboard updates.
13. Each MCP analytics tool enforces project scope, filters correctly, and
    returns the same aggregate contract as its REST counterpart.
14. The MCP integration write tool cannot bypass provider validation or the
    Pro/Business entitlement.
15. Generated OpenAPI, endpoint audit, in-app docs, MCP inventory, tool count,
    and `llms.txt` fail their checks when the analytics contract becomes stale.

## Deployment, production verification, and rollback

No historical backfill is attempted. Deployment order is:

### Local release gate

1. Run the focused analytics, booking, and form critical tests and demonstrate
   every new regression test red before its production change and green after.
2. Run `bun run test`.
3. Run `bun run lint`.
4. Run `bun run docs:generate`.
5. Run `bun run docs:check`.
6. Run `bun run widget:build`.
7. Run `bun run build`.
8. Review `git diff --check`, the generated OpenAPI diff, endpoint audit diff,
   `llms.txt` diff, MCP inventory, and built widget output.

This feature stores provider configuration in structured project settings and
extends Analytics Engine's implicit data-point layout. It does not require a
new D1 migration.

### Production database preflight

Before deploying the current `main` Worker, run:

```bash
wrangler d1 migrations list DB --remote
```

Review every pending migration by filename and SQL. Do not use
`bun run deploy:full` as a shortcut when it would apply an unreviewed migration.

At the time this design was revised,
`0033_persist_booking_calendar_identity.sql` was still pending in production
and the current booking code reads its columns. If it remains pending, apply it
explicitly before the Worker deployment:

```bash
bun run db:migrate:prod
```

Then verify the migration list is empty and the booking columns exist. This is
an existing booking-schema prerequisite, not an analytics schema change, and
must not be hidden inside the analytics rollout.

### Deployment order

1. Record the current Worker deployment/version and retain copies of the
   currently published booking and form widget bundles for rollback.
2. Deploy the Worker and SPA with `bun run deploy`. The server must accept the
   new telemetry and API/MCP contracts before new widgets emit them.
3. Deploy both widgets with `bun run widget:deploy`.
4. Confirm `/openapi.json`, `/llms.txt`, and the in-app Docs page show the new
   REST endpoints, response fields, and MCP tools.

### Production smoke checks

Use designated Free and Pro test projects rather than customer resources:

1. Open a direct booking page and a booking widget, choose dates and times, and
   confirm one journey per surface with correct source attribution.
2. Complete a focused form with at least two persisted checkpoints and confirm
   both responses remain saved before final completion.
3. Confirm booking/form detailed funnels, availability context, and safe
   failures through the dashboard.
4. Query the booking and form analytics REST endpoints with a project API key
   and confirm project scope and response parity.
5. Call all five MCP analytics tools and confirm read/write entitlement and
   project boundaries.
6. Verify a Free project receives the upgrade/forbidden result and does not
   expose provider configuration on public pages.
7. Enable each provider on a Pro test project and confirm only sanitized
   canonical events leave the browser.
8. Confirm booking creation, focused-form checkpoint persistence, uploads,
   notifications, workflows, and calendars remain functional.
9. Recheck the detailed funnel after Analytics Engine ingestion and confirm the
   deployment boundary timestamp.

### Rollback

- Disable all customer-provider publication first if an external dispatch
  problem is detected.
- Restore the previous booking and form widget bundles.
- Roll the Worker back to the recorded previous version through Cloudflare
  Workers Versions.
- Do not delete Analytics Engine rows; the additional blobs and doubles are
  additive and ignored by old queries.
- Retain structured provider settings. An older Worker ignores them, and they
  remain available for a corrected redeployment.
- Do not roll back the nullable booking identity columns from migration `0033`;
  their migration is forward-compatible and repairs an existing production
  schema mismatch.
- Re-run the public REST, MCP, booking, and focused-form smoke checks after
  rollback.

## Out of scope

- individual visitor or contact journey inspection;
- storing form answers or contact data in analytics;
- session replay;
- raw JavaScript snippets;
- Google Tag Manager;
- arbitrary analytics hosts;
- historical detailed-funnel backfill;
- a D1 behavioral-event table; and
- changing focused-form checkpoint, upload, notification, or workflow
  semantics.

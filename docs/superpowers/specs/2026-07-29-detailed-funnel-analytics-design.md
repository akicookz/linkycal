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

- high-level legacy totals and time series;
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
10. Legacy aggregate booking and form analytics remain queryable alongside the
    detailed-data boundary.

## Rollout

No historical backfill is attempted. Deployment order is:

1. ship validation, storage layout, server correlation, and query support;
2. ship public booking/form and widget instrumentation;
3. ship resource selectors, detailed funnel reporting, and contextual
   breakdowns;
4. ship Pro-gated provider configuration and dispatch; and
5. verify production Analytics Engine queries and public entitlement behavior.

Production deployment and any unrelated pending D1 migration remain separate,
explicit operations.

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

# AI Research and External Data Workflow Design

## Goal

Make AI Research useful without setup, keep long-running research work in the
existing background workflow queue, and let users pull, inspect, and verify
contact-level product data before it is used by AI or later workflow steps.

The product flow is:

```text
Capture intent -> Pull customer context -> Research -> Decide -> Act
Forms/booking    PostHog or API data    AI/web     Conditions   Email/tag/webhook
```

Each stage has one responsibility. External data steps retrieve facts. AI
Research interprets supplied facts and performs public-web research. Conditions
and action steps consume the resulting values.

## Current Behavior

- Workflow runs and AI Research already execute through `WORKFLOW_QUEUE`.
- The builder polls every three seconds while a run is active and shows
  pending, running, completed, failed, and skipped step states.
- AI Research requires a user-authored prompt even though the editor displays a
  useful placeholder.
- New steps are seeded with every trigger input, including form response ID.
- `form.responseId` resolves only to the response record ID. It does not fetch
  or expand the response. Submitted answers are separately available through
  `form.fields.*`.
- AI Research writes structured findings to contact columns, research metadata,
  contact notes, workflow context, and activity history.
- The existing Webhook step sends an outbound request but stores only the HTTP
  status. It does not expose the response body to later steps.
- Workflow context advertises contact phone and notes as variables, but the
  queued run context is not consistently refreshed with those fields before
  inputs resolve. This must be corrected before they become default research
  inputs.

## Product Decisions

### Separate retrieval from interpretation

PostHog is not embedded inside AI Research. Add a reusable **Get Product
Activity** source step with PostHog as the first supported provider.

Add a separate **API Request** source step for read-only requests to custom
systems or unsupported analytics products. Keep the existing Webhook step as
the action-oriented request step.

This separation means:

- product data can drive conditions, email, and webhooks without an AI call;
- a PostHog error is distinct from an AI-provider error;
- every retrieved value can be inspected before AI interpretation;
- later analytics providers can implement the same product-activity contract;
- generic API access remains possible without forcing every user to understand
  the PostHog API.

### Limit v1 to decision-grade data

Get Product Activity returns contact-level facts for a bounded lookback period.
It is not a general analytics or reporting product.

V1 excludes:

- arbitrary HogQL written by users;
- funnel, retention, and dashboard construction;
- session replay summaries;
- raw event-property ingestion;
- natural-language analytics queries;
- first-class Mixpanel or Amplitude connectors.

Unsupported systems can use API Request until their utility justifies a
first-class provider.

### Make API Request read-only

API Request supports `GET` only in v1. Webhook remains responsible for `POST`,
`PUT`, `PATCH`, and `DELETE`. This boundary makes previews safe, allows
transient retries, and prevents a source step from accidentally causing an
external side effect.

## External Connections

### Storage

Add a project-scoped `external_connections` table:

```ts
interface ExternalConnection {
  id: string;
  projectId: string;
  name: string;
  provider: "posthog" | "http";
  baseUrl: string;
  publicConfig: Record<string, unknown>;
  encryptedCredentials: string;
  lastVerifiedAt: Date | null;
  lastVerificationError: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

PostHog public configuration contains its project/environment ID. HTTP public
configuration contains the allowed base origin and optional non-secret default
headers. Tokens and secret headers are stored only in
`encryptedCredentials`.

Create a small encryption utility using AES-GCM and the existing
`ENCRYPTION_KEY` Worker secret. The serialized envelope includes a format
version, IV, and ciphertext so the storage format can evolve. Credentials are
encrypted before D1 writes, decrypted only inside the Worker immediately
before a request, never returned by the API, and never copied into workflow
step configuration or run logs.

Connection-management routes require a dashboard session plus project access.
Project API keys cannot create, reveal, update, verify, or delete external
credentials. Workflow steps store only a connection ID and non-secret query
configuration.

### Connection API

Add project routes for:

- listing connection metadata;
- creating a PostHog or HTTP connection;
- updating its non-secret fields or replacing credentials;
- verifying it;
- deleting it after checking workflow references.

Responses expose provider, connection name, safe configuration, verification
time, and a redacted credential label only. Deleting a referenced connection
returns `409` with the referencing workflow count. Repeating the deletion with
an explicit force flag removes the connection and leaves affected workflow
steps in a clear disconnected state.

### PostHog verification

A PostHog connection collects:

- deployment host: US Cloud, EU Cloud, or a validated self-hosted HTTPS host;
- project/environment ID;
- read-only personal API key;
- user-visible connection name.

Server-side verification checks:

1. authentication is accepted;
2. the configured project is accessible;
3. people can be read;
4. event definitions can be listed;
5. the query or person-activity capability required by the runtime is
   accessible.

The UI displays each check independently and records the last successful
verification timestamp. A failed verification never stores a replacement
credential unless the user explicitly saves it.

### HTTP verification

An HTTP connection contains an HTTPS base origin and optional encrypted
authorization headers. Verification sends a `GET` to a user-specified health
or preview path, enforcing the same response limits as workflow execution.

The base origin is fixed at connection level. Workflow variables may appear in
the path and query values, but never in the scheme, host, port, or credentials.

## Workflow Data Contract

Extend workflow context with a generic data-output map:

```ts
interface WorkflowTriggerContext {
  // existing fields
  data?: Record<string, unknown>;
}
```

Expose it to interpolation and input resolution as `data.<resultKey>`. Source
steps write their normalized result before the run context is persisted and
the next step is enqueued.

Examples:

```text
{{data.product_activity.lastSeenAt}}
{{data.product_activity.keyEvents.invited_teammate.count}}
{{data.billing.plan}}
```

AI Research retains the existing `research.*` and `research.byKey.*` aliases.
No existing workflow variable is removed.

Result keys use the existing workflow-key slug format and must be unique among
Get Product Activity and API Request steps in one workflow. The builder and
step APIs reject a duplicate rather than allowing a later source step to
silently overwrite an earlier result.

The builder derives known variables from prior steps:

- Get Product Activity exposes its fixed result fields.
- API Request exposes only user-defined response mappings.
- AI Research keeps its existing research fields.

An object wired into a step input is serialized as compact JSON. Individual
leaf fields remain selectable so a user does not need to send the complete
object to AI.

Source-step data is stored in the workflow run context and step log for that
run. It is not copied into permanent contact metadata. A later workflow pulls
fresh product data rather than silently using a stale snapshot.

## Get Product Activity Step

### Configuration

The step type is `get_product_activity`; its first provider is `posthog`.

Configuration contains:

```ts
interface GetProductActivityConfig {
  provider: "posthog";
  connectionId: string;
  identifierType: "email" | "distinct_id";
  identifier: string;
  lookbackDays: 7 | 30 | 90;
  eventNames: string[];
  includeRecentActivity: boolean;
  resultKey: string;
}
```

Defaults:

- identifier type: email;
- identifier: `{{contact.email}}`;
- lookback: 30 days;
- event names: none, which means the ten most frequent custom events in the
  period;
- recent activity: enabled with a maximum of ten items;
- result key: `product_activity`.

The event selector loads event definitions through the selected connection.
Custom events appear first. PostHog system/autocapture events are hidden by
default but can be shown and explicitly selected.

### Exact identity rules

- Email matching uses a trimmed, case-insensitive exact person-property match.
- Distinct ID matching uses an exact distinct ID.
- One exact result is accepted.
- No result completes successfully with `found: false` and a
  `reason: "not_found"` value. New leads commonly have no product history, so
  this is not a workflow failure.
- Multiple exact email matches are an `ambiguous_identity` configuration/data
  error. The step fails rather than choosing a person silently. The user can
  switch to distinct ID or repair identity merging in PostHog.
- Partial, fuzzy, name, company, and inferred matching are not supported.

### Normalized output

```ts
interface ProductActivityResult {
  provider: "posthog";
  found: boolean;
  reason?: "not_found";
  personId?: string;
  distinctIds?: string[];
  firstSeenAt?: string;
  lastSeenAt?: string;
  activeDays: number;
  totalEvents: number;
  keyEvents: Record<
    string,
    {
      count: number;
      firstSeenAt: string | null;
      lastSeenAt: string | null;
    }
  >;
  recentActivity: Array<{
    event: string;
    timestamp: string;
  }>;
}
```

The runtime does not return raw event properties, URLs, autocapture payloads,
or session recordings. The result is bounded regardless of activity volume.

### Evidence envelope

The step log stores:

```ts
interface ExternalDataEvidence {
  provider: "posthog";
  connectionId: string;
  connectionName: string;
  retrievedAt: string;
  matchedBy: "email" | "distinct_id";
  matchedValue: string;
  projectId: string;
  period: { from: string; to: string };
  sourceUrl: string | null;
  result: ProductActivityResult;
}
```

The source URL deep-links to the matched PostHog person when possible.
Credentials and internal authorization headers are never part of this
envelope.

## API Request Step

The step type is `api_request`. It supports:

- an optional HTTP connection;
- a relative path on that connection, or an unauthenticated fixed HTTPS URL;
- query parameters with workflow-variable interpolation;
- a ten-second timeout;
- JSON responses only;
- a maximum response size of 256 KiB during preview and execution;
- a result key;
- explicit response-field mappings.

Example mappings:

```text
plan       <- customer.subscription.plan
mrr        <- customer.subscription.mrr
lastLogin  <- customer.last_login_at
```

Preview temporarily shows the bounded, redacted JSON response and lets the
user choose dot paths. The saved step stores only mapping definitions. A real
run retains only the mapped result, not the entire raw response:

```text
{{data.billing.plan}}
{{data.billing.mrr}}
```

Network controls reject non-HTTPS URLs, localhost, private or reserved
destinations, credential-bearing URLs, oversized bodies, non-JSON content,
and redirects to an origin not permitted by the connection. The resolved safe
URL, status, content type, latency, retrieval time, and mapped output appear in
the step log. Authorization headers are redacted. Each mapped value is capped
at 16 KiB and the combined mapped result is capped at 64 KiB so one response
cannot bloat workflow run context.

## Preview and Verification UX

### Connection settings

Settings receives an **External Data Sources** section using card-style rows.
Each connection shows:

- provider and connection name;
- safe host/project details;
- verified, failed, or unverified state;
- last verification time;
- icon-and-text Test connection, Reconnect, and Remove actions.

The create/edit drawer reports each PostHog capability check rather than a
single generic success message.

### Step preview

Get Product Activity and API Request configuration include an icon-and-text
**Preview Data** action.

For a contact-scoped preview, the user selects an existing LinkyCal contact.
The server hydrates the same workflow context used at runtime, resolves the
configured identifier and variables, then calls the same domain service used
by the queue worker. Preview does not update the contact, create a workflow
run, or continue to another step.

The PostHog preview displays:

- LinkyCal identifier and exact PostHog match method;
- matched person ID;
- connection/project;
- lookback boundaries;
- first and last seen times;
- active days, total events, key-event counts, and recent activity;
- Open in PostHog and View normalized JSON actions.

No match is an informative empty state. An ambiguous match is an actionable
error explaining how to switch to distinct ID.

The API Request preview displays:

- redacted resolved request;
- status, content type, latency, and response size;
- bounded JSON;
- response-field mapping controls;
- the exact normalized object later steps will receive.

Preview responses are not persisted server-side. The browser discards them
when the editor closes.

## AI Research Defaults

### Default inputs

New AI Research steps start with:

```text
name  <- Contact name
email <- Contact email
phone <- Contact phone
notes <- Contact notes
```

Form response ID is not seeded. It remains available in the input selector
with the label **Form response ID (identifier only)**. Submitted form answers
remain individually selectable under Form fields.

Get Product Activity and API Request outputs are available when those steps
come earlier in the workflow, but they are not automatically sent to the
model. The user explicitly wires the whole normalized object or selected leaf
fields into AI Research inputs.

Before resolving any step inputs, the execution service reloads the current
contact and hydrates name, email, phone, notes, company, role, and other
supported contact fields. Trigger snapshots no longer leave advertised
contact variables empty.

### Default prompt

New AI Research steps store this editable default instead of an empty prompt:

```text
Research this contact using the supplied contact information and reliable
public web sources.

Contact information:
- Name: {{input.name}}
- Email: {{input.email}}
- Phone: {{input.phone}}
- Existing notes: {{input.notes}}

Identify and verify, where available:
- Full name and current role
- Company name, website, industry, and description
- Company size and estimated revenue range
- Professional profile or LinkedIn URL
- Location
- Recent company or professional signals relevant to follow-up
- Evidence of fit, buying intent, risks, or missing information

Use product activity or other supplied context when present, but distinguish it
from public-web findings. Do not infer unsupported facts. Return null for
unknown structured fields. Produce a concise summary, actionable insights,
recommended tags, and supporting source URLs.
```

Workflow templates receive inputs compatible with their prompts. Existing
saved non-empty prompts are unchanged. An existing empty prompt is displayed
with the default and persists it only when the user saves the step.

### Verification in research results

Research run detail separates:

1. supplied LinkyCal inputs;
2. exact external-data inputs, linked to their source-step evidence;
3. public-web findings and citations;
4. AI-generated summary, recommendations, and insights.

Exact product metrics are never labeled as AI findings. Interpretive language
is visibly labeled as AI-generated. A missing product-activity result is
represented as unknown/no match, not interpreted as inactivity.

## Background Execution and Feedback

Keep Cloudflare Queues as the durable execution mechanism. HTTP handlers create
or preview configuration; they do not wait for AI Research or external data
during a workflow run.

Extend step logs with optional progress metadata:

```ts
interface StepLogProgress {
  phase:
    | "queued"
    | "preparing"
    | "connecting"
    | "matching"
    | "fetching"
    | "researching"
    | "normalizing"
    | "saving"
    | "retrying";
  message: string;
  attempt: number;
  maxAttempts: number;
  nextRetryAt?: string;
}
```

The queue worker persists progress at meaningful boundaries. The existing run
polling then renders messages such as:

```text
Connecting to PostHog
Matching jane@acme.com
Fetching 30 days of activity
Normalizing 74 events
```

AI Research reports preparing inputs, researching public sources, structuring
findings, and updating the contact. It does not claim fine-grained model
progress the provider has not supplied.

Starting a test run returns the run ID immediately, switches the builder to
Runs, expands that run, and continues polling. Closing or navigating away does
not cancel the run; reopening the Runs tab shows persisted state.

Transient network failures, timeouts, HTTP 408/429, and upstream 5xx responses
retry up to three times using delayed queue messages after 15 seconds and 60
seconds.
Authentication, permission, validation, ambiguous identity, and unsupported
response errors fail immediately. The log shows the attempt number and next
retry time.

Before executing a queued step, the worker checks its persisted log state:

- completed or skipped steps are not run again;
- an already-running delivery whose lease is less than 15 minutes old is
  treated as a duplicate;
- an older running lease can be reclaimed by a queue redelivery;
- retrying steps may run at or after `nextRetryAt`.

This protects AI cost and prevents duplicate note/activity writes under normal
queue redelivery. The existing run-level failed/completed semantics remain.

## Error Semantics

User-facing errors identify the corrective action:

| Condition | Result |
| --- | --- |
| PostHog person not found | Step completes with `found: false` |
| Multiple exact matches | Fail with `ambiguous_identity`; use distinct ID |
| Connection token expired | Fail; reconnect or replace credential |
| Connection lacks access | Fail; update read permissions |
| Rate limit or upstream 5xx | Retry up to three times |
| API response too large | Fail; reduce endpoint response |
| API response is not JSON | Fail; choose a JSON endpoint |
| API mapping path absent | Output `null` for that mapping and show a warning |
| AI public research finds nothing | Complete with null structured fields and cited/empty findings |
| AI provider unavailable | Retry transient failures, then fail visibly |

Secret values are scrubbed from exception messages before step logs are saved.

## Highest-Utility Workflow Examples

### Sales or demo preparation

```text
Booking created
-> Get Product Activity
-> AI Research
-> Send internal briefing
```

The briefing combines verified company/person research with exact activation
and key-feature usage.

### High-intent lead qualification

```text
Form submitted
-> Get Product Activity
-> AI Research
-> Condition on fit and intent
-> Apply hot/warm/cold tag
```

Public research measures fit; product activity measures demonstrated intent.

### Customer re-engagement

```text
Scheduled
-> Get Product Activity
-> Condition on last active date or key event
-> Send follow-up
```

AI Research is optional because exact activity facts can drive the workflow
directly.

## API and Service Boundaries

Create focused services rather than adding provider logic to
`worker/index.ts` or the workflow executor:

- `ExternalConnectionService`: project access, CRUD metadata, reference
  checks, encryption/decryption, and verification dispatch.
- `PostHogActivityService`: capability verification, event definitions,
  exact person matching, bounded activity retrieval, and normalization.
- `ApiRequestService`: safe URL resolution, bounded GET, JSON parsing,
  redaction, and response mappings.
- `WorkflowStepPreviewService`: hydrate a sample context and invoke the same
  source service as runtime without mutations.

The workflow executor coordinates those services, updates progress, writes
`context.data`, and records the evidence snapshot. Provider-specific HTTP and
normalization logic stays out of the executor.

The frontend should extract source-step editors and connection settings into
focused components rather than making `WorkflowBuilder.tsx` larger:

- `ExternalConnectionsSettings`
- `GetProductActivityStepEditor`
- `ApiRequestStepEditor`
- shared `StepPreviewPanel`

## Migration and Compatibility

The database migration adds only `external_connections`. Workflow step configs,
run context, and step logs are JSON, so their new fields require no columns.

Existing behavior remains compatible:

- existing workflows and prompts continue to run;
- existing `research.*` variables remain valid;
- existing Webhook behavior is unchanged;
- old step logs without progress metadata render their current status;
- form response ID remains selectable but is no longer automatically seeded;
- new `data.*` outputs are additive.

Deleting a connection does not delete historical run evidence. Historical logs
retain the safe connection name/provider snapshot and normalized data, without
credentials.

## Testing

### Unit tests

- AES-GCM credential round trip, wrong-key failure, and envelope validation.
- Connection responses never expose encrypted/plain credentials.
- Exact case-insensitive email matching, exact distinct ID matching, no match,
  and ambiguous match.
- PostHog normalization bounds events and excludes raw properties.
- API URL validation rejects unsafe protocols, origins, redirects, and
  credential-bearing URLs.
- API size, timeout, JSON, redaction, and response-mapping behavior.
- `data.<resultKey>` interpolation and input resolution.
- AI default prompt and AI-specific default input seeding.
- Contact hydration makes phone and notes resolvable.
- Retry classification and backoff.

### Worker and service tests

- Connection create, verify, list, update, delete, project isolation, and
  session-only credential management.
- Preview uses runtime services but creates no run and mutates no contact.
- A PostHog step writes normalized evidence and makes its result available to a
  later condition and AI step.
- API Request stores only mapped fields.
- Not-found product activity continues the workflow.
- Ambiguous identity fails the step.
- Transient failure shows retrying progress and eventually succeeds or fails
  after the configured limit.
- Duplicate queue delivery does not repeat a completed AI step.
- Secrets do not appear in run context, step logs, API responses, or errors.

### Frontend tests

- New AI Research displays and saves the default prompt.
- AI default inputs contain name, email, phone, and notes but not response ID.
- Response ID is labeled as identifier-only.
- Connection verification renders per-capability results.
- Preview handles loading, matched, not-found, ambiguous, permission, and retry
  states.
- Run progress displays meaningful background phases and persisted evidence.
- Loading buttons replace their normal icon with a spinner while retaining
  their text.

### Final verification

Run focused tests throughout implementation, then:

```bash
bun test
bun run build
```

Manually verify one PostHog preview, one queued composition from Product
Activity to AI Research, one no-match run, and one authenticated API Request
against safe test fixtures before deployment.

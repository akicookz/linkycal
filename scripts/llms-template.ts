import {
  MCP_TOOL_COUNT,
  MCP_TOOL_GROUPS,
  PUBLIC_API_OPERATIONS,
} from "./api-docs-catalog";

function mcpInventory(): string {
  return MCP_TOOL_GROUPS.map(function renderGroup(group) {
    return `- ${group.domain}: ${group.tools.join(", ")} — ${group.notes}`;
  }).join("\n");
}

function analyticsRestInventory(): string {
  return PUBLIC_API_OPERATIONS
    .filter(function isAnalyticsOperation(operation) {
      return operation.path.includes("/analytics/");
    })
    .map(function renderOperation(operation) {
      return `- ${operation.method} ${operation.path} — ${operation.summary}. ${operation.notes}`;
    })
    .join("\n");
}

export function buildLlmsText(): string {
  return `# LinkyCal

> Headless forms, scheduling, contacts, workflows, aggregate funnel analytics, and embeddable widgets. LinkyCal is API-first and includes a project-scoped MCP server an AI agent can drive.

Base URL: https://linkycal.com
API docs: https://linkycal.com/docs
OpenAPI 3.1: https://linkycal.com/openapi.json

## Authentication

Protected REST project management uses a project-scoped API key. Create one under MCP & APIs and send:

    Authorization: Bearer lc_live_...

The REST key can reach exactly one project and must be used only from a trusted server. Visitor form, booking, availability, widget, and telemetry endpoints are anonymous and rate-limited.

Send either a dashboard session or an API key, never both. Ambiguous credentials return 400; invalid bearer credentials return 401 and never fall back to a session.

## Protected management REST API

Base path: https://linkycal.com/api/projects/:projectId

API-key-enabled domains:
- Projects and entitlements.
- Event types, schedules, availability rules, and calendar selections.
- Booking management and linked form responses.
- Forms, steps, fields, responses, and private files.
- Contacts, tags, saved views, pipeline stages, and activity.
- Workflows, runs, triggers, and tests.
- Recent activity and aggregate analytics.
- Project-owned files and calendar enumeration.

Project creation/deletion, membership, API-key management, teams, billing, onboarding, and OAuth connection lifecycle remain dashboard-only.

## Detailed analytics REST API

Detailed reports and provider configuration require Pro or Business. The Worker enforces this entitlement for dashboard sessions, REST API keys, MCP OAuth grants, provider mutation, and provider publication.

${analyticsRestInventory()}

Report filters:
- period: 7d, 30d, 90d, or custom.
- start and end: inclusive YYYY-MM-DD values accepted together only for custom.
- resourceSlug: select one project-owned event type or form for exact stages.
- utmSource, utmMedium, utmCampaign.
- source: direct or widget.
- deviceType: mobile, tablet, or desktop.
- timezone: required IANA timezone for booking reports; dates, weekdays, and times are grouped for that dashboard viewer.

Booking reports preserve high-level totals and unique-journey stages, continuation/drop-off rates, Journey sources, and Visitor devices. UTC-backed visitor events add clicked weekdays and selected-date availability checks with minimum/maximum slot counts. Persisted booking rows add most-booked weekdays and times; every request counts once regardless of confirmed, pending, cancelled, declined, rescheduled, or replacement status. Booking-request distributions follow period and event type filters because D1 booking rows do not persist UTM, source, or device attribution.

Form reports preserve high-level totals and add the rendered statement/question/group/step sequence, unique-journey continuation and drop-offs, conditional skips, Journey sources, and Visitor devices. Focused forms continue to persist every step response independently of analytics delivery.

Aggregate analytics never contain names, emails, raw answers, journey IDs, IP addresses, or raw errors. Provider payloads also exclude labels and visitor histories. Detailed results expose the first-ingestion boundary so older traffic is not presented as zero detailed activity.

Provider configuration accepts structured public identifiers only:
- GA4: measurementId matching a G- identifier.
- Meta Pixel: numeric pixelId.
- PostHog: projectKey plus host us or eu.

Raw JavaScript, GTM containers, script URLs, secrets, and arbitrary provider hosts are rejected.

Anonymous telemetry uses POST /api/v1/t. It accepts one canonical event or an array of 1–20 events, is rate-limited to 120 requests/minute/IP, ignores unknown projects, and returns 204.

## MCP server

Endpoint: https://linkycal.com/api/mcp
Transport: Streamable HTTP
Auth: OAuth 2.1 browser sign-in

Connect to https://linkycal.com/api/mcp and complete OAuth in the browser, then select one eligible project. Each grant is hard-scoped to that project, so no tool accepts projectId. OAuth scopes are read, write, and offline_access; the MCP boundary rejects LinkyCal API keys.

The server exposes ${MCP_TOOL_COUNT} tools:
${mcpInventory()}

Analytics MCP details:
- get_analytics_overview: common period, custom dates, UTM, source, and device inputs; returns aggregate totals/time series.
- get_booking_funnel_analytics: required IANA timezone plus an optional project-owned eventTypeId for UTC-backed date demand, persisted booking-request weekday/time distributions, and exact booking stages.
- get_form_funnel_analytics: optional project-owned formId for rendered form stages and skips.
- list_analytics_integrations: returns normalized GA4, Meta Pixel, and PostHog public configuration.
- configure_analytics_integration: provider, enabled, provider-specific public identifier, and allowlisted PostHog host.

Analytics MCP outputs are aggregate and use the same actions, ownership checks, validation, and Pro/Business gating as REST.

## Public forms API

Start a response:

    POST /api/v1/forms/:projectSlug/:formSlug/responses

Submit each step in order:

    PATCH /api/v1/forms/:projectSlug/:formSlug/responses/:responseId/steps/:stepIndex

Body fields is an array of fieldId/value entries. Set complete=true on the final visible step. File fields first upload with:

    POST /api/v1/forms/:projectSlug/:formSlug/responses/:responseId/uploads

Private response file download requires an API key:

    GET /api/v1/forms/:projectSlug/:formSlug/responses/:responseId/files/:valueId

The legacy /api/public form routes remain available for compatibility; new integrations should use /api/v1.

## Public booking API

Check availability:

    GET /api/v1/availability/:projectSlug?date=YYYY-MM-DD&eventTypeSlug=slug&timezone=IANA

Create a booking:

    POST /api/v1/bookings

Required JSON fields are projectSlug, eventTypeSlug, startTime, name, email, and timezone. Optional notes and formFields hold intake details. Success can trigger confirmation email, Google Calendar delivery, and workflows.

## Widgets

Booking and form widgets are zero-dependency IIFE bundles:

    <script src="https://cdn.linkycal.com/widgets/booking.js"></script>
    <script src="https://cdn.linkycal.com/widgets/form.js"></script>

Initialize LinkyCal.booking with projectSlug, container, and optional eventTypeSlug. Initialize LinkyCal.form with projectSlug, formSlug, and container. Widget journeys are attributed as source=widget and share one resource-scoped anonymous journey with their iframe.

## Workflows

Triggers include form and booking lifecycle, contacts, tags, schedules, manual, and scheduled runs. Actions include email, AI research, tags, waits, conditions, webhooks, and contact updates. Webhook/email/calendar/provider failure is isolated according to each domain's delivery contract.

## Rate limits

- Anonymous telemetry: 120/min/IP.
- Availability: 60/min/IP.
- Booking creation: 10/min/IP.
- Form response creation: 30/min/IP.
- Form step submission: 60/min/IP.
- File upload: 30/min/IP.

## Errors

Errors use JSON with error and an optional stable code. Common statuses: 400 validation or ambiguous credentials, 401 invalid key, 403 project/plan denial, 404 not found, 429 rate limited, and 500 server error.
`;
}

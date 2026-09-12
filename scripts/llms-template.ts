import {
  MCP_TOOL_COUNT,
  MCP_TOOL_GROUPS,
  PUBLIC_API_OPERATIONS,
  groupMcpToolsByDomain,
} from "./api-docs-catalog";

function toolsByDomain(tools: (typeof MCP_TOOL_GROUPS)[number]["tools"]): string {
  return groupMcpToolsByDomain(tools)
    .map(function renderDomain(entry) {
      return `- ${entry.domain}: ${entry.tools.join(", ")}`;
    })
    .join("\n");
}

function mcpInventory(): string {
  return MCP_TOOL_GROUPS.map(function renderGroup(group) {
    return `### ${group.title}\n\n${group.notes}\n\n${toolsByDomain(group.tools)}`;
  }).join("\n\n");
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

REST API and MCP access are included on Free, Pro, and Business. They share a workspace monthly request quota: 10,000 on Free, 100,000 on Pro, and 1,000,000 on Business.

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

Form reports preserve high-level totals and add the rendered page sequence, unique-journey continuation and drop-offs, conditional skips, Journey sources, and Visitor devices. Each page still persists independently of analytics delivery.

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

Recommended tool flow:
- Never invent IDs. Use a list tool first, then a get tool when current state matters.
- Book a meeting: list_event_types -> get_available_slots -> create_booking. Use an exact returned UTC slot.
- Find and tag a contact: list_contacts -> list_contact_tags -> add_tag_to_contact.
- Inspect a form and submissions: list_forms -> get_form -> list_form_responses.
- Before a destructive write, verify the target and confirm the exact action unless it was explicitly requested.

Tool display titles begin with Read or Write. MCP annotations also publish read-only, destructive, idempotent, and open-world hints. Existing tool IDs remain stable.

Further documentation:
- Human-readable docs: https://linkycal.com/docs
- AI-oriented reference: https://linkycal.com/llms.txt
- OpenAPI 3.1: https://linkycal.com/openapi.json

Form MCP details:
- create_form_field and update_form_field accept optional hidden. Hidden fields stay off the public screen, still accept prefill and conditions, and cannot be required, have visibility rules, or be type file or completion. Store a static fallback in settings.defaultValue. Public links prefill with ?field_id=value. Widgets accept hidden: { field_id: value } and forward the host page query string.
- get_form and the REST field list return each field's hidden flag.

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

Initialize LinkyCal.booking with projectSlug, container, and optional eventTypeSlug. Initialize LinkyCal.form with projectSlug, formSlug, and container. Both accept optional hidden field-id maps, optional ui chrome flags (hideBanner, hideBranding, hideTitle, hideIntro, hideAvatar, hideMedia), and forward host-page query params into the iframe for prefill. hide_* query aliases match those flags. Form and event settings.chrome store the same defaults. A URL or widget flag can only hide more. hideBranding needs Pro or Business. Widget journeys are attributed as source=widget and share one resource-scoped anonymous journey with their iframe.

Standard widgets and theme overrides are included on every plan. Safely scoped Custom CSS and LinkyCal branding removal are available on Pro and Business.

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

Errors use JSON with error and an optional stable code. Common statuses: 400 validation or ambiguous credentials, 401 invalid key, 403 project/feature/resource denial, 404 not found, 429 rate or metered usage limit, and 500 server error.

Plan errors include code, entitlement, scope, used, limit, hardLimit, resetAt, and recommendedPlan. Stable codes are plan_feature_unavailable, plan_resource_limit_reached, and plan_usage_limit_reached. MCP returns the same object under structuredContent.entitlementError.
`;
}

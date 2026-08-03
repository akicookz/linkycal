import {
  MCP_TOOL_DISCOVERY,
  type McpToolName,
  type McpToolScope,
} from "../shared/mcp-tools";

export type PublicApiAuth = "anonymous" | "apiKey" | "oauth";

export interface PublicApiQueryParameter {
  name: string;
  required?: boolean;
  description: string;
  schema: Record<string, unknown>;
}

export interface PublicApiOperationDefinition {
  method: "GET" | "POST" | "PUT" | "PATCH";
  path: string;
  summary: string;
  tag: string;
  auth: PublicApiAuth;
  notes: string;
  queryParameters?: PublicApiQueryParameter[];
  requestSchema?: string;
  responseSchema?: string;
  successStatus?: string;
  successDescription?: string;
}

export interface McpToolGroup {
  scope: McpToolScope;
  title: string;
  tools: McpToolName[];
  notes: string;
}

export interface McpToolDomainGroup {
  domain: string;
  tools: McpToolName[];
}

export const MCP_TOOL_GROUPS: McpToolGroup[] = [
  {
    scope: "read",
    title: "Read tools",
    tools: [
      "list_bookings",
      "get_booking",
      "get_available_slots",
      "list_event_types",
      "get_event_type",
      "list_schedules",
      "get_schedule",
      "list_contacts",
      "get_contact",
      "get_contact_activity",
      "list_contact_tags",
      "get_contact_tag",
      "list_forms",
      "get_form",
      "list_form_responses",
      "list_workflows",
      "get_workflow",
      "get_analytics_overview",
      "get_booking_funnel_analytics",
      "get_form_funnel_analytics",
      "list_analytics_integrations",
    ],
    notes:
      "Discover IDs and inspect project state. Read tools never mutate LinkyCal data.",
  },
  {
    scope: "write",
    title: "Write tools",
    tools: [
      "create_booking",
      "cancel_booking",
      "confirm_booking",
      "decline_booking",
      "create_event_type",
      "update_event_type",
      "create_contact",
      "update_contact",
      "set_contact_next_action",
      "complete_contact_next_action",
      "delete_contact",
      "create_contact_tag",
      "update_contact_tag",
      "delete_contact_tag",
      "add_tag_to_contact",
      "remove_tag_from_contact",
      "create_form",
      "update_form",
      "configure_analytics_integration",
    ],
    notes:
      "Create or change project data. Read the current resource first; destructive and externally visible operations are identified by MCP annotations.",
  },
];

export const MCP_TOOL_COUNT = MCP_TOOL_GROUPS.reduce(
  function countTools(total, group) {
    return total + group.tools.length;
  },
  0,
);

export function groupMcpToolsByDomain(
  tools: McpToolName[],
): McpToolDomainGroup[] {
  const domains = new Map<string, McpToolName[]>();

  for (const tool of tools) {
    const domain = MCP_TOOL_DISCOVERY[tool].domain;
    domains.set(domain, [...(domains.get(domain) ?? []), tool]);
  }

  return Array.from(domains.entries()).map(function domainGroup(entry) {
    return { domain: entry[0], tools: entry[1] };
  });
}

const ANALYTICS_REPORT_QUERY_PARAMETERS: PublicApiQueryParameter[] = [
  {
    name: "period",
    description: "Preset period or custom date range.",
    schema: {
      type: "string",
      enum: ["7d", "30d", "90d", "custom"],
      default: "30d",
    },
  },
  {
    name: "start",
    description: "Inclusive ISO date; accepted only when period=custom.",
    schema: { type: "string", format: "date" },
  },
  {
    name: "end",
    description: "Inclusive ISO date; accepted only when period=custom.",
    schema: { type: "string", format: "date" },
  },
  {
    name: "resourceSlug",
    description:
      "Project-owned event type or form slug. Required for exact stage reports.",
    schema: { type: "string" },
  },
  {
    name: "utmSource",
    description: "Filter by UTM source.",
    schema: { type: "string" },
  },
  {
    name: "utmMedium",
    description: "Filter by UTM medium.",
    schema: { type: "string" },
  },
  {
    name: "utmCampaign",
    description: "Filter by UTM campaign.",
    schema: { type: "string" },
  },
  {
    name: "source",
    description: "Filter direct pages or widget journeys.",
    schema: { type: "string", enum: ["direct", "widget"] },
  },
  {
    name: "deviceType",
    description: "Filter by coarse device class.",
    schema: {
      type: "string",
      enum: ["mobile", "tablet", "desktop"],
    },
  },
];

const BOOKING_ANALYTICS_QUERY_PARAMETERS: PublicApiQueryParameter[] = [
  ...ANALYTICS_REPORT_QUERY_PARAMETERS,
  {
    name: "timezone",
    required: true,
    description:
      "IANA timezone used to group and label dates, weekdays, and times.",
    schema: { type: "string", example: "Asia/Seoul" },
  },
];

export const PUBLIC_API_OPERATIONS: PublicApiOperationDefinition[] = [
  {
    method: "GET",
    path: "/api/projects/:projectId/analytics/filters",
    summary: "List analytics filters and project resources",
    tag: "Analytics",
    auth: "apiKey",
    notes:
      "Pro or Business required. Returns project-owned event types/forms plus observed UTM, source, and device values.",
    responseSchema: "AnalyticsFiltersResponse",
    successStatus: "200",
    successDescription: "Analytics filter catalog",
  },
  {
    method: "GET",
    path: "/api/projects/:projectId/analytics/overview",
    summary: "Get analytics overview",
    tag: "Analytics",
    auth: "apiKey",
    notes:
      "Pro or Business required. Returns aggregate traffic and conversion totals without visitor histories.",
    queryParameters: ANALYTICS_REPORT_QUERY_PARAMETERS.filter(
      (parameter) => parameter.name !== "resourceSlug",
    ),
    responseSchema: "AnalyticsOverviewResponse",
    successStatus: "200",
    successDescription: "Analytics overview",
  },
  {
    method: "GET",
    path: "/api/projects/:projectId/analytics/bookings",
    summary: "Get booking funnel analytics",
    tag: "Analytics",
    auth: "apiKey",
    notes:
      "Pro or Business required. Returns UTC-backed clicked weekday and selected-date availability facts plus persisted booking-request weekday/time distributions in the required dashboard timezone. Every booking request counts regardless of status. Select an event type for exact unique-journey stages.",
    queryParameters: BOOKING_ANALYTICS_QUERY_PARAMETERS,
    responseSchema: "BookingAnalyticsResponse",
    successStatus: "200",
    successDescription: "Booking funnel analytics",
  },
  {
    method: "GET",
    path: "/api/projects/:projectId/analytics/forms",
    summary: "Get form funnel analytics",
    tag: "Analytics",
    auth: "apiKey",
    notes:
      "Pro or Business required. Select a form for unique-journey question/step continuation, skips, drop-offs, journey sources, and visitor devices.",
    queryParameters: ANALYTICS_REPORT_QUERY_PARAMETERS,
    responseSchema: "FormAnalyticsResponse",
    successStatus: "200",
    successDescription: "Form funnel analytics",
  },
  {
    method: "GET",
    path: "/api/projects/:projectId/analytics/integrations",
    summary: "List analytics integrations",
    tag: "Analytics",
    auth: "apiKey",
    notes:
      "Pro or Business required. Returns normalized public GA4, Meta Pixel, and PostHog configuration.",
    responseSchema: "AnalyticsIntegrationsResponse",
    successStatus: "200",
    successDescription: "Analytics integrations",
  },
  {
    method: "PUT",
    path: "/api/projects/:projectId/analytics/integrations/:provider",
    summary: "Configure an analytics integration",
    tag: "Analytics",
    auth: "apiKey",
    notes:
      "Pro or Business required. Provider is ga4, meta_pixel, or posthog. Raw scripts, script URLs, secrets, and arbitrary PostHog hosts are rejected.",
    requestSchema: "ConfigureAnalyticsIntegrationRequest",
    responseSchema: "AnalyticsIntegrationResponse",
    successStatus: "200",
    successDescription: "Analytics integration saved",
  },
  {
    method: "GET",
    path: "/api/v1/availability/:slug",
    summary: "List available booking times",
    tag: "Visitor booking",
    auth: "anonymous",
    notes: "Visitor-facing; rate limited to 60 requests per minute per IP.",
  },
  {
    method: "POST",
    path: "/api/v1/t",
    summary: "Record a public tracking event",
    tag: "Visitor tracking",
    auth: "anonymous",
    notes:
      "Visitor-facing telemetry endpoint; accepts one event or a batch of at most 20 and is rate limited to 120 requests per minute per IP.",
    requestSchema: "AnonymousAnalyticsEventsRequest",
    successStatus: "204",
    successDescription: "Events accepted",
  },
  {
    method: "POST",
    path: "/api/v1/bookings",
    summary: "Create a booking",
    tag: "Visitor booking",
    auth: "anonymous",
    notes: "Visitor-facing; rate limited to 10 requests per minute per IP.",
  },
  {
    method: "POST",
    path: "/api/v1/forms/:projectSlug/:formSlug/responses",
    summary: "Start a form response",
    tag: "Visitor forms",
    auth: "anonymous",
    notes: "Visitor-facing; rate limited to 30 requests per minute per IP.",
  },
  {
    method: "POST",
    path: "/api/v1/forms/:projectSlug/:formSlug/responses/:responseId/uploads",
    summary: "Upload a form response file",
    tag: "Visitor forms",
    auth: "anonymous",
    notes: "Visitor-facing multipart upload; rate limited to 30 requests per minute per IP.",
  },
  {
    method: "GET",
    path: "/api/v1/forms/:projectSlug/:formSlug/responses/:responseId/files/:valueId",
    summary: "Download a private form response file",
    tag: "Forms",
    auth: "apiKey",
    notes: "Project-scoped API key required; the key project must own the form.",
  },
  {
    method: "PATCH",
    path: "/api/v1/forms/:projectSlug/:formSlug/responses/:responseId/steps/:stepIndex",
    summary: "Submit a form response step",
    tag: "Visitor forms",
    auth: "anonymous",
    notes: "Visitor-facing; rate limited to 60 requests per minute per IP.",
  },
  {
    method: "GET",
    path: "/api/v1/event-types/:projectSlug/:eventSlug",
    summary: "Get a public event type",
    tag: "Visitor booking",
    auth: "anonymous",
    notes: "Visitor-facing booking configuration.",
  },
  {
    method: "GET",
    path: "/api/widget/booking/:projectSlug/config",
    summary: "Get booking widget configuration",
    tag: "Widgets",
    auth: "anonymous",
    notes: "Visitor-facing widget bootstrap endpoint.",
  },
  {
    method: "GET",
    path: "/api/widget/form/:projectSlug/:formSlug/config",
    summary: "Get form widget configuration",
    tag: "Widgets",
    auth: "anonymous",
    notes: "Visitor-facing widget bootstrap endpoint.",
  },
  {
    method: "GET",
    path: "/api/public/resolve/:projectSlug/:slug",
    summary: "Resolve a public link",
    tag: "Visitor links",
    auth: "anonymous",
    notes: "Visitor-facing resolver for form and booking links.",
  },
  {
    method: "GET",
    path: "/api/public/forms/:projectSlug/:formSlug",
    summary: "Get a public form",
    tag: "Visitor forms",
    auth: "anonymous",
    notes: "Visitor-facing form definition.",
  },
  {
    method: "POST",
    path: "/api/public/forms/:projectSlug/:formSlug/responses",
    summary: "Start a public form response",
    tag: "Visitor forms",
    auth: "anonymous",
    notes: "Legacy visitor form endpoint retained for compatibility.",
  },
  {
    method: "PATCH",
    path: "/api/public/forms/:projectSlug/:formSlug/responses/:responseId/steps/:stepIndex",
    summary: "Submit a public form response step",
    tag: "Visitor forms",
    auth: "anonymous",
    notes: "Legacy visitor form endpoint retained for compatibility.",
  },
  {
    method: "POST",
    path: "/api/public/forms/:projectSlug/:formSlug/submit",
    summary: "Submit a public form",
    tag: "Visitor forms",
    auth: "anonymous",
    notes: "Legacy single-request form submission endpoint.",
  },
  {
    method: "GET",
    path: "/api/uploads/:key{.+}",
    summary: "Download a public upload",
    tag: "Public files",
    auth: "anonymous",
    notes: "Public object delivery endpoint; object keys are unguessable.",
  },
  {
    method: "POST",
    path: "/api/mcp",
    summary: "Connect to the LinkyCal MCP server",
    tag: "MCP",
    auth: "oauth",
    notes:
      "Streamable HTTP MCP transport authenticated with OAuth 2.1; each grant selects exactly one eligible project.",
  },
];

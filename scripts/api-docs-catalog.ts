export type PublicApiAuth = "anonymous" | "apiKey";

export interface PublicApiOperationDefinition {
  method: "GET" | "POST" | "PATCH";
  path: string;
  summary: string;
  tag: string;
  auth: PublicApiAuth;
  notes: string;
}

export const PUBLIC_API_OPERATIONS: PublicApiOperationDefinition[] = [
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
    notes: "Visitor-facing telemetry endpoint.",
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
    auth: "apiKey",
    notes: "Streamable HTTP MCP transport; project-scoped API key required.",
  },
];

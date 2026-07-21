// ─── Types ──────────────────────────────────────────────────────────────────

export type ApiRouteMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiRoutePolicyEntry {
  method: ApiRouteMethod;
  path: string;
}

export type ProjectRouteAccess =
  | "apiKey"
  | "sessionOnly"
  | "unclassified";

// ─── Project Route Catalog ──────────────────────────────────────────────────

export const PROJECT_API_KEY_ROUTES: ApiRoutePolicyEntry[] = [
  { method: "GET", path: "/api/projects/:projectId" },
  { method: "GET", path: "/api/projects/:projectId/entitlements" },
  { method: "PUT", path: "/api/projects/:projectId" },
  { method: "POST", path: "/api/projects/:projectId/uploads" },
  { method: "DELETE", path: "/api/projects/:projectId/uploads/:key{.+}" },
  { method: "GET", path: "/api/projects/:projectId/event-types" },
  { method: "GET", path: "/api/projects/:projectId/event-types/:id" },
  { method: "POST", path: "/api/projects/:projectId/event-types" },
  { method: "PUT", path: "/api/projects/:projectId/event-types/:id" },
  { method: "DELETE", path: "/api/projects/:projectId/event-types/:id" },
  { method: "GET", path: "/api/projects/:projectId/schedules" },
  { method: "POST", path: "/api/projects/:projectId/schedules" },
  { method: "PUT", path: "/api/projects/:projectId/schedules/:id" },
  { method: "DELETE", path: "/api/projects/:projectId/schedules/:id" },
  { method: "PUT", path: "/api/projects/:projectId/schedules/:id/rules" },
  { method: "GET", path: "/api/projects/:projectId/schedules/:id/rules" },
  { method: "GET", path: "/api/projects/:projectId/schedules/:id/overrides" },
  { method: "POST", path: "/api/projects/:projectId/schedules/:id/overrides" },
  {
    method: "DELETE",
    path: "/api/projects/:projectId/schedules/:id/overrides/:overrideId",
  },
  { method: "GET", path: "/api/projects/:projectId/bookings" },
  { method: "GET", path: "/api/projects/:projectId/bookings/:id" },
  { method: "PATCH", path: "/api/projects/:projectId/bookings/:id/cancel" },
  {
    method: "GET",
    path: "/api/projects/:projectId/bookings/:id/form-response",
  },
  { method: "PATCH", path: "/api/projects/:projectId/bookings/:id/confirm" },
  { method: "PATCH", path: "/api/projects/:projectId/bookings/:id/decline" },
  { method: "GET", path: "/api/projects/:projectId/forms" },
  { method: "GET", path: "/api/projects/:projectId/forms/:formId" },
  { method: "POST", path: "/api/projects/:projectId/forms" },
  { method: "PUT", path: "/api/projects/:projectId/forms/:id" },
  { method: "DELETE", path: "/api/projects/:projectId/forms/:id" },
  { method: "GET", path: "/api/projects/:projectId/forms/:formId/steps" },
  { method: "POST", path: "/api/projects/:projectId/forms/:formId/steps" },
  {
    method: "PUT",
    path: "/api/projects/:projectId/forms/:formId/steps/:id",
  },
  {
    method: "DELETE",
    path: "/api/projects/:projectId/forms/:formId/steps/:id",
  },
  {
    method: "PUT",
    path: "/api/projects/:projectId/forms/:formId/steps/reorder",
  },
  { method: "GET", path: "/api/projects/:projectId/forms/:formId/fields" },
  {
    method: "POST",
    path: "/api/projects/:projectId/forms/:formId/fields",
  },
  {
    method: "PUT",
    path: "/api/projects/:projectId/forms/:formId/fields/reorder",
  },
  {
    method: "PUT",
    path: "/api/projects/:projectId/forms/:formId/fields/:id",
  },
  {
    method: "DELETE",
    path: "/api/projects/:projectId/forms/:formId/fields/:id",
  },
  {
    method: "GET",
    path: "/api/projects/:projectId/forms/:formId/responses",
  },
  {
    method: "GET",
    path: "/api/projects/:projectId/forms/:formId/responses/:responseId/files/:valueId",
  },
  {
    method: "GET",
    path: "/api/projects/:projectId/forms/:formId/responses/:responseId",
  },
  { method: "DELETE", path: "/api/projects/:projectId/form-responses/:id" },
  { method: "GET", path: "/api/projects/:projectId/contacts" },
  { method: "GET", path: "/api/projects/:projectId/contact-views" },
  { method: "POST", path: "/api/projects/:projectId/contact-views" },
  { method: "PUT", path: "/api/projects/:projectId/contact-views/:id" },
  { method: "DELETE", path: "/api/projects/:projectId/contact-views/:id" },
  { method: "POST", path: "/api/projects/:projectId/contacts" },
  { method: "POST", path: "/api/projects/:projectId/contacts/import" },
  { method: "GET", path: "/api/projects/:projectId/contacts/:id" },
  { method: "PUT", path: "/api/projects/:projectId/contacts/:id" },
  {
    method: "PUT",
    path: "/api/projects/:projectId/contacts/:contactId/next-action",
  },
  { method: "DELETE", path: "/api/projects/:projectId/contacts/:id" },
  { method: "GET", path: "/api/projects/:projectId/tags" },
  { method: "POST", path: "/api/projects/:projectId/tags" },
  { method: "DELETE", path: "/api/projects/:projectId/tags/:id" },
  { method: "PATCH", path: "/api/projects/:projectId/tags/:id" },
  {
    method: "POST",
    path: "/api/projects/:projectId/contacts/:contactId/tags",
  },
  {
    method: "DELETE",
    path: "/api/projects/:projectId/contacts/:contactId/tags/:tagId",
  },
  {
    method: "POST",
    path: "/api/projects/:projectId/contacts/:contactId/stage",
  },
  {
    method: "POST",
    path: "/api/projects/:projectId/contacts/:contactId/enrich",
  },
  { method: "POST", path: "/api/projects/:projectId/pipeline/seed" },
  { method: "GET", path: "/api/projects/:projectId/workflows" },
  { method: "POST", path: "/api/projects/:projectId/workflows" },
  { method: "PUT", path: "/api/projects/:projectId/workflows/:id" },
  { method: "DELETE", path: "/api/projects/:projectId/workflows/:id" },
  {
    method: "GET",
    path: "/api/projects/:projectId/workflows/:workflowId",
  },
  {
    method: "GET",
    path: "/api/projects/:projectId/workflows/:workflowId/steps",
  },
  {
    method: "POST",
    path: "/api/projects/:projectId/workflows/:workflowId/steps",
  },
  {
    method: "PUT",
    path: "/api/projects/:projectId/workflows/:workflowId/steps/reorder",
  },
  {
    method: "PUT",
    path: "/api/projects/:projectId/workflows/:workflowId/steps/:id",
  },
  {
    method: "DELETE",
    path: "/api/projects/:projectId/workflows/:workflowId/steps/:id",
  },
  {
    method: "GET",
    path: "/api/projects/:projectId/workflows/:workflowId/runs",
  },
  {
    method: "POST",
    path: "/api/projects/:projectId/workflows/:workflowId/trigger",
  },
  {
    method: "POST",
    path: "/api/projects/:projectId/workflows/:workflowId/test",
  },
  { method: "GET", path: "/api/projects/:projectId/calendar/calendars" },
  {
    method: "GET",
    path: "/api/projects/:projectId/event-types/:eventTypeId/calendars",
  },
  {
    method: "PUT",
    path: "/api/projects/:projectId/event-types/:eventTypeId/calendars",
  },
  { method: "GET", path: "/api/projects/:projectId/activity/recent" },
  { method: "GET", path: "/api/projects/:projectId/analytics/filters" },
  { method: "GET", path: "/api/projects/:projectId/analytics/overview" },
  { method: "GET", path: "/api/projects/:projectId/analytics/bookings" },
  { method: "GET", path: "/api/projects/:projectId/analytics/forms" },
];

export const PROJECT_SESSION_ONLY_ROUTES: ApiRoutePolicyEntry[] = [
  { method: "DELETE", path: "/api/projects/:projectId" },
  { method: "GET", path: "/api/projects/:projectId/members" },
  { method: "POST", path: "/api/projects/:projectId/members" },
  { method: "PATCH", path: "/api/projects/:projectId/members/:memberId" },
  { method: "DELETE", path: "/api/projects/:projectId/members/:memberId" },
  { method: "GET", path: "/api/projects/:projectId/api-keys" },
  { method: "POST", path: "/api/projects/:projectId/api-keys" },
  { method: "DELETE", path: "/api/projects/:projectId/api-keys/:id" },
  { method: "POST", path: "/api/projects/:projectId/calendar/connect" },
  { method: "GET", path: "/api/projects/:projectId/calendar/connections" },
  {
    method: "DELETE",
    path: "/api/projects/:projectId/calendar/connections/:id",
  },
];

// ─── Matching ───────────────────────────────────────────────────────────────

interface CompiledRoutePolicyEntry extends ApiRoutePolicyEntry {
  pattern: RegExp;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileRoutePath(path: string): RegExp {
  const escaped = path
    .split("/")
    .map((segment) => {
      const constrained = /^:[^{]+\{(.+)\}$/.exec(segment);
      if (constrained) return `(?:${constrained[1]})`;
      if (segment.startsWith(":")) return "[^/]+";
      return escapeRegExp(segment);
    })
    .join("/");

  return new RegExp(`^${escaped}$`);
}

function compileEntries(
  entries: ApiRoutePolicyEntry[],
): CompiledRoutePolicyEntry[] {
  return entries.map((entry) => ({
    ...entry,
    pattern: compileRoutePath(entry.path),
  }));
}

function matchesRoute(
  entries: CompiledRoutePolicyEntry[],
  method: string,
  path: string,
): boolean {
  return entries.some(
    (entry) => entry.method === method.toUpperCase() && entry.pattern.test(path),
  );
}

const compiledApiKeyRoutes = compileEntries(PROJECT_API_KEY_ROUTES);
const compiledSessionOnlyRoutes = compileEntries(PROJECT_SESSION_ONLY_ROUTES);

export function projectRouteAccess(
  method: string,
  path: string,
): ProjectRouteAccess {
  const supportsApiKey = matchesRoute(compiledApiKeyRoutes, method, path);
  const requiresSession = matchesRoute(compiledSessionOnlyRoutes, method, path);

  if (supportsApiKey && requiresSession) {
    throw new Error(`Ambiguous project route policy for ${method} ${path}`);
  }
  if (supportsApiKey) return "apiKey";
  if (requiresSession) return "sessionOnly";
  return "unclassified";
}

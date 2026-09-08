import {
  PROJECT_API_KEY_ROUTES,
  PROJECT_SESSION_ONLY_ROUTES,
} from "../worker/lib/api-route-policy";
import {
  PUBLIC_API_OPERATIONS,
  type PublicApiAuth,
  type PublicApiQueryParameter,
  type PublicApiOperationDefinition,
} from "./api-docs-catalog";
import { buildLlmsText } from "./llms-template";

type RegisteredMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "ALL";

type OpenApiMethod = "get" | "post" | "put" | "patch" | "delete";

type AuditAuth =
  | "Anonymous"
  | "API key"
  | "OAuth"
  | "Session or API key"
  | "Session"
  | "Invite token"
  | "Invite token + session"
  | "Stripe signature"
  | "Better Auth";

export interface RegisteredRoute {
  method: RegisteredMethod;
  path: string;
}

export interface AuditRow extends RegisteredRoute {
  auth: AuditAuth;
  apiKeySupport: "Required" | "Supported" | "Not used" | "No";
  sessionSupport: "Required" | "Supported" | "Managed" | "No";
  documented: boolean;
  notes: string;
}

interface OpenApiSecurityRequirement {
  bearerAuth?: never[];
  mcpOAuth?: Array<"read" | "write">;
}

export interface OpenApiOperation {
  operationId: string;
  summary: string;
  description?: string;
  tags: string[];
  security: OpenApiSecurityRequirement[];
  parameters?: Array<Record<string, unknown>>;
  requestBody?: Record<string, unknown>;
  responses: Record<string, unknown>;
}

export interface OpenApiDocument {
  openapi: "3.1.0";
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: Array<{ url: string; description: string }>;
  tags: Array<{ name: string }>;
  paths: Record<string, Partial<Record<OpenApiMethod, OpenApiOperation>>>;
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http";
        scheme: "bearer";
        bearerFormat: "lc_live_...";
      };
      mcpOAuth: {
        type: "oauth2";
        flows: {
          authorizationCode: {
            authorizationUrl: string;
            tokenUrl: string;
            scopes: Record<string, string>;
          };
        };
      };
    };
    schemas: Record<string, unknown>;
  };
}

export interface GeneratedApiArtifacts {
  openApi: OpenApiDocument;
  openApiJson: string;
  auditMarkdown: string;
  llmsText: string;
  auditRows: AuditRow[];
  routes: RegisteredRoute[];
}

interface OperationMetadata {
  summary: string;
  tag: string;
  auth: PublicApiAuth;
  notes?: string;
  queryParameters?: PublicApiQueryParameter[];
  requestSchema?: string;
  responseSchema?: string;
  successStatus?: string;
  successDescription?: string;
}

const METHOD_ORDER: RegisteredMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "ALL",
];

const RESOURCE_PARAMETER_NAMES: Record<string, string> = {
  "api-keys": "apiKeyId",
  bookings: "bookingId",
  connections: "connectionId",
  contacts: "contactId",
  "contact-views": "viewId",
  "event-types": "eventTypeId",
  fields: "fieldId",
  "form-responses": "responseId",
  forms: "formId",
  members: "memberId",
  overrides: "overrideId",
  responses: "responseId",
  runs: "runId",
  schedules: "scheduleId",
  steps: "stepId",
  tags: "tagId",
  workflows: "workflowId",
};

const HTTP_VERBS: Record<OpenApiMethod, string> = {
  get: "Get",
  post: "Create",
  put: "Update",
  patch: "Update",
  delete: "Delete",
};

function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

function compareRoutes(a: RegisteredRoute, b: RegisteredRoute): number {
  const pathOrder = a.path.localeCompare(b.path);
  if (pathOrder !== 0) return pathOrder;
  return METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method);
}

export function extractApiRoutes(source: string): RegisteredRoute[] {
  const routes: RegisteredRoute[] = [];
  const routePattern =
    /\.(get|post|put|patch|delete|all)\(\s*"(\/api\/[^"\n]+)"/gs;

  for (const match of source.matchAll(routePattern)) {
    routes.push({
      method: match[1].toUpperCase() as RegisteredMethod,
      path: match[2],
    });
  }

  const onPattern = /\.on\(\s*\[([^\]]+)\]\s*,\s*"(\/api\/[^"\n]+)"/gs;
  for (const match of source.matchAll(onPattern)) {
    const methodList = match[1];
    for (const methodMatch of methodList.matchAll(/"(GET|POST|PUT|PATCH|DELETE)"/g)) {
      routes.push({
        method: methodMatch[1] as RegisteredMethod,
        path: match[2],
      });
    }
  }

  const uniqueRoutes = new Map<string, RegisteredRoute>();
  for (const route of routes) {
    uniqueRoutes.set(routeKey(route.method, route.path), route);
  }

  return [...uniqueRoutes.values()].sort(compareRoutes);
}

function canonicalParameterName(
  segments: string[],
  index: number,
  rawName: string,
): string {
  const previous = segments[index - 1] ?? "";

  if (previous === "projects") return "projectId";
  if (previous === "availability" && rawName === "slug") {
    return "projectSlug";
  }
  if (previous === "resolve" && rawName === "slug") return "linkSlug";
  if (rawName !== "id") return rawName;
  return RESOURCE_PARAMETER_NAMES[previous] ?? rawName;
}

export function toOpenApiPath(path: string): string {
  const segments = path.split("/");
  return segments
    .map((segment, index) => {
      if (!segment.startsWith(":")) return segment;
      const rawName = /^:([^<{]+)/.exec(segment)?.[1] ?? "parameter";
      return `{${canonicalParameterName(segments, index, rawName)}}`;
    })
    .join("/");
}

function projectRouteKeySet(
  routes: Array<{ method: string; path: string }>,
): Set<string> {
  return new Set(routes.map((route) => routeKey(route.method, route.path)));
}

function metadataByRoute(): Map<string, PublicApiOperationDefinition> {
  return new Map(
    PUBLIC_API_OPERATIONS.map((operation) => [
      routeKey(operation.method, operation.path),
      operation,
    ]),
  );
}

function classifyRoute(
  route: RegisteredRoute,
  apiKeyProjectRoutes: Set<string>,
  sessionProjectRoutes: Set<string>,
  publicMetadata: Map<string, PublicApiOperationDefinition>,
): AuditRow {
  const key = routeKey(route.method, route.path);
  const metadata = publicMetadata.get(key);

  if (apiKeyProjectRoutes.has(key)) {
    return {
      ...route,
      auth: "Session or API key",
      apiKeySupport: "Supported",
      sessionSupport: "Supported",
      documented: true,
      notes:
        "Canonical project endpoint. API keys are project-scoped and require API access entitlement.",
    };
  }

  if (sessionProjectRoutes.has(key)) {
    return {
      ...route,
      auth: "Session",
      apiKeySupport: "No",
      sessionSupport: "Required",
      documented: false,
      notes:
        "Dashboard administration endpoint; intentionally unavailable to API keys.",
    };
  }

  if (route.path.startsWith("/api/projects/:projectId")) {
    throw new Error(`Unclassified project route: ${key}`);
  }

  if (route.path === "/api/mcp") {
    return {
      ...route,
      auth: "OAuth",
      apiKeySupport: "No",
      sessionSupport: "No",
      documented: true,
      notes:
        "Provider-owned Streamable HTTP transport; OAuth grant selects one eligible project and API keys are rejected.",
    };
  }

  if (metadata?.auth === "apiKey") {
    return {
      ...route,
      auth: "API key",
      apiKeySupport: "Required",
      sessionSupport: "No",
      documented: true,
      notes: metadata.notes,
    };
  }

  if (metadata?.auth === "anonymous") {
    return {
      ...route,
      auth: "Anonymous",
      apiKeySupport: "Not used",
      sessionSupport: "No",
      documented: true,
      notes: metadata.notes,
    };
  }

  if (route.path === "/api/subscription/webhook") {
    return {
      ...route,
      auth: "Stripe signature",
      apiKeySupport: "No",
      sessionSupport: "No",
      documented: false,
      notes: "System callback authenticated with the Stripe-Signature header.",
    };
  }

  if (route.path === "/api/auth/*") {
    return {
      ...route,
      auth: "Better Auth",
      apiKeySupport: "No",
      sessionSupport: "Managed",
      documented: false,
      notes: "Better Auth protocol route with trusted-origin credentialed CORS.",
    };
  }

  if (route.path === "/api/invites/:token") {
    return {
      ...route,
      auth: "Invite token",
      apiKeySupport: "No",
      sessionSupport: "No",
      documented: false,
      notes: "Dashboard invitation preview using a single-purpose invite token.",
    };
  }

  if (route.path === "/api/invites/:token/accept") {
    return {
      ...route,
      auth: "Invite token + session",
      apiKeySupport: "No",
      sessionSupport: "Required",
      documented: false,
      notes: "Dashboard invitation acceptance; authenticated user must match the invite.",
    };
  }

  return {
    ...route,
    auth: "Session",
    apiKeySupport: "No",
    sessionSupport: "Required",
    documented: false,
    notes: "Dashboard-only account, team, billing, onboarding, or OAuth endpoint.",
  };
}

function tagForProjectPath(path: string): string {
  const tagMatchers: Array<[string, string]> = [
    ["/analytics/", "Analytics"],
    ["/activity/", "Activity"],
    ["/bookings", "Bookings"],
    ["/contacts", "Contacts"],
    ["/contact-views", "Contacts"],
    ["/tags", "Tags"],
    ["/pipeline", "Contacts"],
    ["/event-types", "Event types"],
    ["/schedules", "Availability"],
    ["/forms", "Forms"],
    ["/form-responses", "Forms"],
    ["/workflows", "Workflows"],
    ["/calendar/", "Calendars"],
    ["/calendars", "Calendars"],
    ["/uploads", "Files"],
    ["/entitlements", "Projects"],
  ];
  return tagMatchers.find(([fragment]) => path.includes(fragment))?.[1] ?? "Projects";
}

function humanize(value: string): string {
  return value
    .replace(/[{}:]/g, "")
    .replace(/-/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
}

function projectSummary(method: OpenApiMethod, path: string): string {
  const segments = path.split("/").filter(Boolean);
  const lastStatic = [...segments]
    .reverse()
    .find((segment) => !segment.startsWith(":"));
  return `${HTTP_VERBS[method]} ${humanize(lastStatic ?? "project resource")}`;
}

function operationId(method: OpenApiMethod, path: string): string {
  const pathPart = toOpenApiPath(path)
    .replace(/^\/api\//, "")
    .replace(/[{}]/g, "")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part, index) =>
      index === 0
        ? part.toLowerCase()
        : `${part.charAt(0).toUpperCase()}${part.slice(1)}`,
    )
    .join("");
  return `${method}${pathPart.charAt(0).toUpperCase()}${pathPart.slice(1)}`;
}

function pathParameters(openApiPath: string): Array<Record<string, unknown>> {
  return [...openApiPath.matchAll(/\{([^}]+)\}/g)].map((match) => ({
    name: match[1],
    in: "path",
    required: true,
    schema: { type: "string" },
  }));
}

function requestBody(
  method: OpenApiMethod,
  path: string,
): Record<string, unknown> | undefined {
  if (method === "get" || method === "delete") return undefined;
  const multipart = path.endsWith("/uploads");
  return {
    required: false,
    content: {
      [multipart ? "multipart/form-data" : "application/json"]: {
        schema: multipart
          ? {
              type: "object",
              properties: {
                file: { type: "string", format: "binary" },
                fieldId: { type: "string" },
              },
            }
          : { $ref: "#/components/schemas/JsonObject" },
      },
    },
  };
}

function responsesFor(
  auth: OperationMetadata["auth"],
): Record<string, unknown> {
  const responses: Record<string, unknown> = {
    "2XX": {
      description: "Successful response",
    },
    "400": {
      description: "Invalid request",
      content: {
        "application/json": { schema: { $ref: "#/components/schemas/Error" } },
      },
    },
    "429": {
      description: "Rate limit exceeded",
      content: {
        "application/json": { schema: { $ref: "#/components/schemas/Error" } },
      },
    },
  };

  if (auth === "apiKey" || auth === "oauth") {
    responses["401"] = {
      description:
        auth === "oauth"
          ? "Missing, expired, or invalid OAuth access token"
          : "Missing or invalid API key",
      content: {
        "application/json": { schema: { $ref: "#/components/schemas/Error" } },
      },
    };
    responses["403"] = {
      description:
        auth === "oauth"
          ? "The OAuth grant, project, or requested MCP tool is not permitted"
          : "The credential cannot access this project or operation",
      content: {
        "application/json": { schema: { $ref: "#/components/schemas/Error" } },
      },
    };
  }

  return responses;
}

function jsonRequestBody(schemaName: string): Record<string, unknown> {
  return {
    required: true,
    content: {
      "application/json": {
        schema: { $ref: `#/components/schemas/${schemaName}` },
      },
    },
  };
}

function jsonResponse(
  description: string,
  schemaName: string,
): Record<string, unknown> {
  return {
    description,
    content: {
      "application/json": {
        schema: { $ref: `#/components/schemas/${schemaName}` },
      },
    },
  };
}

function setExplicitSuccess(
  operation: OpenApiOperation,
  status: string,
  description: string,
  schemaName: string,
): void {
  delete operation.responses["2XX"];
  operation.responses[status] = jsonResponse(description, schemaName);
}

function addNotFound(operation: OpenApiOperation): void {
  operation.responses["404"] = jsonResponse("Resource not found", "Error");
}

function applyTagApiContract(
  method: OpenApiMethod,
  path: string,
  operation: OpenApiOperation,
): OpenApiOperation {
  const collectionPath = "/api/projects/:projectId/tags";
  const resourcePath = "/api/projects/:projectId/tags/:id";
  const legacyAssignmentPath =
    "/api/projects/:projectId/contacts/:contactId/tags";
  const assignmentPath =
    "/api/projects/:projectId/contacts/:contactId/tags/:tagId";

  if (
    path !== collectionPath &&
    path !== resourcePath &&
    path !== legacyAssignmentPath &&
    path !== assignmentPath
  ) {
    return operation;
  }

  operation.tags = ["Tags"];

  if (path === collectionPath && method === "get") {
    operation.summary = "List tags";
    operation.parameters = [
      ...(operation.parameters ?? []),
      {
        name: "search",
        in: "query",
        required: false,
        schema: { type: "string", minLength: 1, maxLength: 100 },
      },
      {
        name: "limit",
        in: "query",
        required: false,
        schema: { type: "integer", minimum: 1, maximum: 100 },
      },
      {
        name: "cursor",
        in: "query",
        required: false,
        schema: { type: "string" },
        description: "Opaque cursor from a previous response; requires limit.",
      },
    ];
    setExplicitSuccess(operation, "200", "Tag page", "TagListResponse");
  }

  if (path === collectionPath && method === "post") {
    operation.summary = "Create a tag";
    operation.requestBody = jsonRequestBody("CreateTagRequest");
    setExplicitSuccess(operation, "201", "Tag created", "TagResponse");
    operation.responses["409"] = jsonResponse(
      "A tag with this name already exists",
      "Error",
    );
  }

  if (path === resourcePath) {
    addNotFound(operation);
    if (method === "get") {
      operation.summary = "Get a tag";
      setExplicitSuccess(operation, "200", "Tag details", "TagResponse");
    }
    if (method === "patch") {
      operation.summary = "Update a tag";
      operation.requestBody = jsonRequestBody("UpdateTagRequest");
      setExplicitSuccess(operation, "200", "Tag updated", "TagResponse");
      operation.responses["409"] = jsonResponse(
        "A tag with this name already exists",
        "Error",
      );
    }
    if (method === "delete") {
      operation.summary = "Delete a tag";
      setExplicitSuccess(operation, "200", "Tag deleted", "SuccessResponse");
      operation.responses["409"] = jsonResponse(
        "The tag is referenced by workflows",
        "TagInUseError",
      );
    }
  }

  if (path === legacyAssignmentPath && method === "post") {
    operation.summary = "Assign a tag to a contact (legacy)";
    operation.requestBody = jsonRequestBody("AssignTagRequest");
    setExplicitSuccess(
      operation,
      "201",
      "Tag assignment processed",
      "TagAssignmentResponse",
    );
    addNotFound(operation);
  }

  if (path === assignmentPath) {
    addNotFound(operation);
    delete operation.requestBody;
    if (method === "put") {
      operation.summary = "Assign a tag to a contact";
      setExplicitSuccess(
        operation,
        "200",
        "Tag assignment processed",
        "TagAssignmentResponse",
      );
    }
    if (method === "delete") {
      operation.summary = "Remove a tag from a contact";
      setExplicitSuccess(
        operation,
        "200",
        "Tag removal processed",
        "TagRemovalResponse",
      );
    }
  }

  return operation;
}

function applyContactApiContract(
  method: OpenApiMethod,
  path: string,
  operation: OpenApiOperation,
): OpenApiOperation {
  const collectionPath = "/api/projects/:projectId/contacts";
  const activityPath =
    "/api/projects/:projectId/contacts/:contactId/activities";

  if (path === collectionPath && method === "get") {
    operation.summary = "List and filter contacts";
    operation.parameters = [
      ...(operation.parameters ?? []),
      {
        name: "search",
        in: "query",
        required: false,
        schema: { type: "string" },
      },
      {
        name: "tagId",
        in: "query",
        required: false,
        schema: { type: "string" },
        description: "Legacy single-tag filter.",
      },
      {
        name: "tagIds",
        in: "query",
        required: false,
        schema: { type: "array", items: { type: "string" } },
        style: "form",
        explode: true,
        description: "Repeat the query parameter to filter by multiple tags.",
      },
      {
        name: "matchAllTags",
        in: "query",
        required: false,
        schema: { type: "boolean", default: false },
      },
      {
        name: "stageTagId",
        in: "query",
        required: false,
        schema: { type: "string" },
      },
      {
        name: "excludeStageTagIds",
        in: "query",
        required: false,
        schema: { type: "array", items: { type: "string" } },
        style: "form",
        explode: true,
      },
      {
        name: "activityType",
        in: "query",
        required: false,
        schema: {
          type: "string",
          enum: [
            "form_submitted",
            "booked",
            "cancelled",
            "tag_added",
            "tag_removed",
            "workflow_researched",
          ],
        },
      },
      {
        name: "activitySinceDays",
        in: "query",
        required: false,
        schema: { type: "number", minimum: 0 },
      },
      {
        name: "noActivitySinceDays",
        in: "query",
        required: false,
        schema: { type: "number", minimum: 0 },
      },
      {
        name: "bookingStatus",
        in: "query",
        required: false,
        schema: {
          type: "string",
          enum: ["confirmed", "cancelled", "rescheduled", "pending", "declined"],
        },
      },
      {
        name: "limit",
        in: "query",
        required: false,
        schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      },
      {
        name: "offset",
        in: "query",
        required: false,
        schema: { type: "integer", minimum: 0, default: 0 },
      },
    ];
    setExplicitSuccess(operation, "200", "Contact page", "ContactListResponse");
  }

  if (path === activityPath && method === "get") {
    operation.summary = "List contact activity";
    operation.parameters = [
      ...(operation.parameters ?? []),
      {
        name: "category",
        in: "query",
        required: false,
        schema: {
          type: "string",
          enum: ["all", "bookings", "form_responses", "workflows"],
          default: "all",
        },
      },
      {
        name: "limit",
        in: "query",
        required: false,
        schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      },
      {
        name: "cursor",
        in: "query",
        required: false,
        schema: { type: "string" },
        description: "Opaque nextCursor value from the previous page.",
      },
    ];
    setExplicitSuccess(
      operation,
      "200",
      "Contact activity page",
      "ContactActivityPage",
    );
    addNotFound(operation);
  }

  return operation;
}

function createOperation(
  method: OpenApiMethod,
  path: string,
  metadata: OperationMetadata,
): OpenApiOperation {
  const openApiPath = toOpenApiPath(path);
  const parameters = [
    ...pathParameters(openApiPath).map(function enrichProviderParameter(
      parameter,
    ) {
      if (
        parameter.name === "provider" &&
        path.includes("/analytics/integrations/")
      ) {
        return {
          ...parameter,
          schema: {
            type: "string",
            enum: ["ga4", "meta_pixel", "posthog"],
          },
        };
      }
      return parameter;
    }),
    ...(metadata.queryParameters ?? []).map(function toQueryParameter(
      parameter,
    ) {
      return {
        name: parameter.name,
        in: "query",
        required: parameter.required ?? false,
        description: parameter.description,
        schema: parameter.schema,
      };
    }),
  ];
  const body = metadata.requestSchema
    ? jsonRequestBody(metadata.requestSchema)
    : requestBody(method, path);

  const operation: OpenApiOperation = {
    operationId: operationId(method, path),
    summary: metadata.summary,
    ...(metadata.notes ? { description: metadata.notes } : {}),
    tags: [metadata.tag],
    security:
      metadata.auth === "apiKey"
        ? [{ bearerAuth: [] }]
        : metadata.auth === "oauth"
          ? [{ mcpOAuth: ["read", "write"] }]
          : [],
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(body ? { requestBody: body } : {}),
    responses: responsesFor(metadata.auth),
  };
  if (metadata.successStatus) {
    delete operation.responses["2XX"];
    operation.responses[metadata.successStatus] = metadata.responseSchema
      ? jsonResponse(
          metadata.successDescription ?? "Successful response",
          metadata.responseSchema,
        )
      : {
          description:
            metadata.successDescription ?? "Successful response",
        };
  }
  return applyFormFieldContract(
    method,
    path,
    applySlugResourceContract(
      method,
      path,
      applyContactApiContract(
        method,
        path,
        applyTagApiContract(method, path, operation),
      ),
    ),
  );
}

function applySlugResourceContract(
  method: OpenApiMethod,
  path: string,
  operation: OpenApiOperation,
): OpenApiOperation {
  const formsPath = "/api/projects/:projectId/forms";
  const formPaths = new Set([
    "/api/projects/:projectId/forms/:formId",
    "/api/projects/:projectId/forms/:id",
  ]);
  const eventTypesPath = "/api/projects/:projectId/event-types";
  const eventTypePath = "/api/projects/:projectId/event-types/:id";
  const projectPath = "/api/projects/:projectId";

  if (path === formsPath && method === "get") {
    setExplicitSuccess(operation, "200", "Forms", "FormList");
  }
  if (path === formsPath && method === "post") {
    setExplicitSuccess(operation, "201", "Form created", "Form");
  }
  if (formPaths.has(path) && (method === "get" || method === "put")) {
    setExplicitSuccess(operation, "200", "Form", "Form");
    addNotFound(operation);
  }

  if (path === eventTypesPath && method === "get") {
    setExplicitSuccess(operation, "200", "Event types", "EventTypeList");
  }
  if (path === eventTypesPath && method === "post") {
    setExplicitSuccess(operation, "201", "Event type created", "EventType");
  }
  if (path === eventTypePath && (method === "get" || method === "put")) {
    setExplicitSuccess(operation, "200", "Event type", "EventType");
    addNotFound(operation);
  }

  if (path === projectPath && (method === "get" || method === "put")) {
    setExplicitSuccess(operation, "200", "Project", "Project");
  }

  return operation;
}

function applyFormFieldContract(
  method: OpenApiMethod,
  path: string,
  operation: OpenApiOperation,
): OpenApiOperation {
  const fieldsPath = "/api/projects/:projectId/forms/:formId/fields";
  const fieldPath = "/api/projects/:projectId/forms/:formId/fields/:id";

  if (path === fieldsPath && method === "get") {
    setExplicitSuccess(operation, "200", "Form fields", "FormFieldList");
  }
  if (path === fieldsPath && method === "post") {
    operation.requestBody = jsonRequestBody("CreateFormField");
    setExplicitSuccess(operation, "201", "Form field created", "FormFieldResponse");
  }
  if (path === fieldPath && method === "put") {
    operation.requestBody = jsonRequestBody("UpdateFormField");
    setExplicitSuccess(operation, "200", "Form field", "FormFieldResponse");
    addNotFound(operation);
  }

  return operation;
}

function addOperation(
  paths: OpenApiDocument["paths"],
  method: OpenApiMethod,
  path: string,
  metadata: OperationMetadata,
): void {
  const openApiPath = toOpenApiPath(path);
  const pathItem = paths[openApiPath] ?? {};
  if (pathItem[method]) {
    throw new Error(`Duplicate OpenAPI operation: ${method.toUpperCase()} ${openApiPath}`);
  }
  pathItem[method] = createOperation(method, path, metadata);
  paths[openApiPath] = pathItem;
}

function buildOpenApi(routes: RegisteredRoute[]): OpenApiDocument {
  const routeKeys = new Set(routes.map((route) => routeKey(route.method, route.path)));
  const paths: OpenApiDocument["paths"] = {};
  const operationMetadata = metadataByRoute();

  for (const route of PROJECT_API_KEY_ROUTES) {
    if (!routeKeys.has(routeKey(route.method, route.path))) {
      throw new Error(`Documented project route is not registered: ${route.method} ${route.path}`);
    }
    const method = route.method.toLowerCase() as OpenApiMethod;
    addOperation(
      paths,
      method,
      route.path,
      operationMetadata.get(routeKey(route.method, route.path)) ?? {
        summary: projectSummary(method, route.path),
        tag: tagForProjectPath(route.path),
        auth: "apiKey",
      },
    );
  }

  for (const operation of PUBLIC_API_OPERATIONS) {
    if (operation.path.startsWith("/api/projects/")) continue;
    const registeredMethod = operation.method;
    if (!routeKeys.has(routeKey(registeredMethod, operation.path))) {
      throw new Error(
        `Documented public route is not registered: ${operation.method} ${operation.path}`,
      );
    }
    addOperation(
      paths,
      operation.method.toLowerCase() as OpenApiMethod,
      operation.path,
      operation,
    );
  }

  const tags = [
    ...new Set(
      Object.values(paths).flatMap((pathItem) =>
        Object.values(pathItem).flatMap((operation) => operation?.tags ?? []),
      ),
    ),
  ]
    .sort()
    .map((name) => ({ name }));

  return {
    openapi: "3.1.0",
    info: {
      title: "LinkyCal API",
      version: "1.0.0",
      description:
        "Project-scoped LinkyCal REST API, anonymous visitor endpoints, and the OAuth-authenticated MCP transport. Send REST API keys as Authorization: Bearer lc_live_.... MCP clients complete OAuth 2.1 in the browser. Dashboard session cookies are not part of this public contract.",
    },
    servers: [
      { url: "https://linkycal.com", description: "Production" },
    ],
    tags,
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "lc_live_...",
        },
        mcpOAuth: {
          type: "oauth2",
          flows: {
            authorizationCode: {
              authorizationUrl: "https://linkycal.com/oauth/authorize",
              tokenUrl: "https://linkycal.com/oauth/token",
              scopes: {
                read: "Read project data through MCP tools.",
                write: "Create and update project data through MCP tools.",
                offline_access:
                  "Refresh MCP access without another sign-in.",
              },
            },
          },
        },
      },
      schemas: {
        FunnelStageReport: {
          type: "object",
          additionalProperties: false,
          required: [
            "key",
            "label",
            "kind",
            "order",
            "visitors",
            "continued",
            "continuationRate",
            "dropOffs",
            "dropOffRate",
          ],
          properties: {
            key: { type: "string" },
            label: {
              type: "string",
              description:
                "Dashboard-only stage label. It is not sent to external analytics providers.",
            },
            kind: {
              type: "string",
              enum: [
                "page",
                "date",
                "availability",
                "time",
                "details",
                "statement",
                "question",
                "group",
                "step",
                "submit",
                "completion",
              ],
            },
            order: { type: "integer", minimum: 0 },
            visitors: { type: "integer", minimum: 0 },
            continued: { type: "integer", minimum: 0 },
            continuationRate: { type: "number", minimum: 0, maximum: 100 },
            dropOffs: { type: "integer", minimum: 0 },
            dropOffRate: { type: "number", minimum: 0, maximum: 100 },
            skipped: { type: "integer", minimum: 0 },
          },
        },
        DetailedFunnelReport: {
          type: "object",
          additionalProperties: false,
          required: [
            "availableSince",
            "stages",
            "bySource",
            "byDevice",
          ],
          properties: {
            availableSince: {
              anyOf: [
                { type: "string", format: "date-time" },
                { type: "null" },
              ],
              description:
                "First detailed event in the selected report. Earlier high-level history may exist.",
            },
            stages: {
              type: "array",
              items: { $ref: "#/components/schemas/FunnelStageReport" },
            },
            bySource: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["source", "visitors"],
                properties: {
                  source: {
                    type: "string",
                    enum: ["direct", "widget"],
                  },
                  visitors: { type: "integer", minimum: 0 },
                },
              },
            },
            byDevice: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["deviceType", "visitors"],
                properties: {
                  deviceType: {
                    type: "string",
                    enum: ["mobile", "tablet", "desktop"],
                  },
                  visitors: { type: "integer", minimum: 0 },
                },
              },
            },
          },
        },
        AnalyticsOverviewResponse: {
          type: "object",
          required: ["totals", "timeSeries", "topSources", "topCountries"],
          properties: {
            totals: {
              type: "object",
              required: [
                "views",
                "conversions",
                "conversionRate",
                "uniqueSources",
              ],
              properties: {
                views: { type: "integer", minimum: 0 },
                conversions: { type: "integer", minimum: 0 },
                conversionRate: {
                  type: "number",
                  minimum: 0,
                  maximum: 100,
                },
                uniqueSources: { type: "integer", minimum: 0 },
              },
            },
            timeSeries: { type: "array", items: { type: "object" } },
            topSources: { type: "array", items: { type: "object" } },
            topCountries: { type: "array", items: { type: "object" } },
          },
        },
        BookingAnalyticsResponse: {
          allOf: [
            { $ref: "#/components/schemas/DetailedFunnelReport" },
            {
              type: "object",
              required: [
                "funnel",
                "byEventType",
                "timeSeries",
                "clickedWeekdays",
                "selectedDateAvailability",
                "bookedWeekdays",
                "bookedTimes",
              ],
              properties: {
                funnel: {
                  type: "object",
                  required: [
                    "pageViews",
                    "bookingsCreated",
                    "conversionRate",
                  ],
                  properties: {
                    pageViews: { type: "integer", minimum: 0 },
                    bookingsCreated: { type: "integer", minimum: 0 },
                    conversionRate: {
                      type: "number",
                      minimum: 0,
                      maximum: 100,
                    },
                  },
                },
                byEventType: { type: "array", items: { type: "object" } },
                timeSeries: { type: "array", items: { type: "object" } },
                clickedWeekdays: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["weekday", "clicks"],
                    properties: {
                      weekday: { type: "string" },
                      clicks: { type: "integer", minimum: 0 },
                    },
                  },
                },
                selectedDateAvailability: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: [
                      "date",
                      "checks",
                      "minimumSlots",
                      "maximumSlots",
                    ],
                    properties: {
                      date: { type: "string", format: "date" },
                      checks: { type: "integer", minimum: 0 },
                      minimumSlots: { type: "integer", minimum: 0 },
                      maximumSlots: { type: "integer", minimum: 0 },
                    },
                  },
                },
                bookedWeekdays: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["weekday", "bookings"],
                    properties: {
                      weekday: { type: "string" },
                      bookings: { type: "integer", minimum: 0 },
                    },
                  },
                },
                bookedTimes: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["time", "bookings"],
                    properties: {
                      time: {
                        type: "string",
                        pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$",
                      },
                      bookings: { type: "integer", minimum: 0 },
                    },
                  },
                },
              },
            },
          ],
        },
        FormAnalyticsResponse: {
          allOf: [
            { $ref: "#/components/schemas/DetailedFunnelReport" },
            {
              type: "object",
              required: ["funnel", "byForm", "timeSeries"],
              properties: {
                funnel: {
                  type: "object",
                  required: [
                    "views",
                    "started",
                    "completed",
                    "startRate",
                    "completionRate",
                  ],
                  properties: {
                    views: { type: "integer", minimum: 0 },
                    started: { type: "integer", minimum: 0 },
                    completed: { type: "integer", minimum: 0 },
                    startRate: {
                      type: "number",
                      minimum: 0,
                      maximum: 100,
                    },
                    completionRate: {
                      type: "number",
                      minimum: 0,
                      maximum: 100,
                    },
                  },
                },
                byForm: { type: "array", items: { type: "object" } },
                timeSeries: { type: "array", items: { type: "object" } },
              },
            },
          ],
        },
        AnalyticsFiltersResponse: {
          type: "object",
          additionalProperties: false,
          required: [
            "utmSources",
            "utmMediums",
            "utmCampaigns",
            "sources",
            "deviceTypes",
            "eventTypes",
            "forms",
          ],
          properties: {
            utmSources: { type: "array", items: { type: "string" } },
            utmMediums: { type: "array", items: { type: "string" } },
            utmCampaigns: { type: "array", items: { type: "string" } },
            sources: {
              type: "array",
              items: { type: "string", enum: ["direct", "widget"] },
            },
            deviceTypes: {
              type: "array",
              items: {
                type: "string",
                enum: ["mobile", "tablet", "desktop"],
              },
            },
            eventTypes: {
              type: "array",
              items: { $ref: "#/components/schemas/AnalyticsResource" },
            },
            forms: {
              type: "array",
              items: { $ref: "#/components/schemas/AnalyticsResource" },
            },
          },
        },
        AnalyticsResource: {
          type: "object",
          additionalProperties: false,
          required: ["id", "slug", "name"],
          properties: {
            id: { type: "string" },
            slug: { type: "string" },
            name: { type: "string" },
          },
        },
        Ga4AnalyticsIntegration: {
          type: "object",
          additionalProperties: false,
          required: ["provider", "enabled"],
          properties: {
            provider: { type: "string", const: "ga4" },
            enabled: { type: "boolean" },
            measurementId: {
              type: "string",
              pattern: "^G-[A-Z0-9]{4,20}$",
            },
          },
        },
        MetaPixelAnalyticsIntegration: {
          type: "object",
          additionalProperties: false,
          required: ["provider", "enabled"],
          properties: {
            provider: { type: "string", const: "meta_pixel" },
            enabled: { type: "boolean" },
            pixelId: { type: "string", pattern: "^\\d{5,30}$" },
          },
        },
        PostHogAnalyticsIntegration: {
          type: "object",
          additionalProperties: false,
          required: ["provider", "enabled", "host"],
          properties: {
            provider: { type: "string", const: "posthog" },
            enabled: { type: "boolean" },
            projectKey: {
              type: "string",
              pattern: "^phc_[A-Za-z0-9_-]{10,200}$",
            },
            host: { type: "string", enum: ["us", "eu"] },
          },
        },
        AnalyticsIntegration: {
          oneOf: [
            { $ref: "#/components/schemas/Ga4AnalyticsIntegration" },
            { $ref: "#/components/schemas/MetaPixelAnalyticsIntegration" },
            { $ref: "#/components/schemas/PostHogAnalyticsIntegration" },
          ],
        },
        AnalyticsIntegrationsResponse: {
          type: "object",
          additionalProperties: false,
          required: ["integrations"],
          properties: {
            integrations: {
              type: "array",
              items: { $ref: "#/components/schemas/AnalyticsIntegration" },
            },
          },
        },
        ConfigureAnalyticsIntegrationRequest: {
          oneOf: [
            {
              type: "object",
              additionalProperties: false,
              required: ["enabled"],
              properties: {
                enabled: { type: "boolean" },
                measurementId: {
                  type: "string",
                  pattern: "^G-[A-Z0-9]{4,20}$",
                },
              },
            },
            {
              type: "object",
              additionalProperties: false,
              required: ["enabled"],
              properties: {
                enabled: { type: "boolean" },
                pixelId: { type: "string", pattern: "^\\d{5,30}$" },
              },
            },
            {
              type: "object",
              additionalProperties: false,
              required: ["enabled"],
              properties: {
                enabled: { type: "boolean" },
                projectKey: {
                  type: "string",
                  pattern: "^phc_[A-Za-z0-9_-]{10,200}$",
                },
                host: { type: "string", enum: ["us", "eu"] },
              },
            },
          ],
        },
        AnalyticsIntegrationResponse: {
          type: "object",
          additionalProperties: false,
          required: ["integration"],
          properties: {
            integration: {
              $ref: "#/components/schemas/AnalyticsIntegration",
            },
          },
        },
        AnonymousAnalyticsEventContext: {
          type: "object",
          additionalProperties: false,
          properties: {
            selectedDateUtc: { type: "string", format: "date-time" },
            fieldType: { type: "string" },
            required: { type: "boolean" },
            stageOutcome: {
              type: "string",
              enum: [
                "viewed",
                "completed",
                "skipped",
                "validation_failed",
              ],
            },
          },
        },
        AnonymousAnalyticsEvent: {
          type: "object",
          additionalProperties: false,
          description:
            "PII-free funnel event. Names, emails, answers, notes, filenames, raw errors, and IP addresses are not accepted.",
          required: ["event", "projectSlug"],
          properties: {
            event: {
              type: "string",
              enum: [
                "page_view",
                "booking_created",
                "form_view",
                "form_started",
                "form_completed",
                "booking_date_selected",
                "booking_availability_shown",
                "booking_time_selected",
                "booking_details_viewed",
                "booking_submit_attempted",
                "booking_submit_failed",
                "form_stage_viewed",
                "form_stage_completed",
                "form_stage_skipped",
                "form_stage_validation_failed",
                "form_submit_attempted",
                "form_submit_failed",
              ],
            },
            projectSlug: { type: "string" },
            resourceSlug: { type: "string" },
            journeyId: { type: "string", format: "uuid" },
            funnelType: { type: "string", enum: ["booking", "form"] },
            stageKey: { type: "string" },
            stageLabel: { type: "string" },
            stageKind: { type: "string" },
            stageOrder: { type: "integer", minimum: 0 },
            primaryValue: { type: "string" },
            deviceType: {
              type: "string",
              enum: ["mobile", "tablet", "desktop"],
            },
            source: { type: "string", enum: ["direct", "widget"] },
            slotCount: { type: "integer", minimum: 0 },
            daysAhead: { type: "integer" },
            durationMinutes: { type: "integer", minimum: 1 },
            context: {
              $ref: "#/components/schemas/AnonymousAnalyticsEventContext",
            },
            utmSource: { type: "string" },
            utmMedium: { type: "string" },
            utmCampaign: { type: "string" },
            utmTerm: { type: "string" },
            utmContent: { type: "string" },
            referrer: { type: "string" },
          },
        },
        AnonymousAnalyticsEventsRequest: {
          oneOf: [
            { $ref: "#/components/schemas/AnonymousAnalyticsEvent" },
            {
              type: "array",
              minItems: 1,
              maxItems: 20,
              items: {
                $ref: "#/components/schemas/AnonymousAnalyticsEvent",
              },
            },
          ],
        },
        ContactTag: {
          type: "object",
          required: ["id", "name", "color"],
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            color: {
              anyOf: [
                { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
                { type: "null" },
              ],
            },
          },
        },
        ContactNextAction: {
          type: "object",
          required: ["text", "deadline"],
          properties: {
            text: { type: "string" },
            deadline: {
              anyOf: [
                { type: "string", format: "date-time" },
                { type: "null" },
              ],
            },
          },
        },
        Contact: {
          type: "object",
          required: [
            "id",
            "projectId",
            "name",
            "tags",
            "lastActivityAt",
            "enteredAtByTagId",
            "nextAction",
            "createdAt",
            "updatedAt",
          ],
          properties: {
            id: { type: "string" },
            projectId: { type: "string" },
            name: { type: "string" },
            email: { anyOf: [{ type: "string", format: "email" }, { type: "null" }] },
            phone: { anyOf: [{ type: "string" }, { type: "null" }] },
            notes: { anyOf: [{ type: "string" }, { type: "null" }] },
            company: { anyOf: [{ type: "string" }, { type: "null" }] },
            companyWebsite: { anyOf: [{ type: "string" }, { type: "null" }] },
            position: { anyOf: [{ type: "string" }, { type: "null" }] },
            companySize: { anyOf: [{ type: "string" }, { type: "null" }] },
            estimatedRevenue: { anyOf: [{ type: "string" }, { type: "null" }] },
            linkedinUrl: { anyOf: [{ type: "string" }, { type: "null" }] },
            metadata: {
              anyOf: [
                { type: "object", additionalProperties: true },
                { type: "null" },
              ],
            },
            tags: {
              type: "array",
              items: { $ref: "#/components/schemas/ContactTag" },
            },
            lastActivityAt: {
              anyOf: [
                { type: "string", format: "date-time" },
                { type: "null" },
              ],
            },
            enteredAtByTagId: {
              type: "object",
              additionalProperties: { type: "string", format: "date-time" },
            },
            nextAction: {
              anyOf: [
                { $ref: "#/components/schemas/ContactNextAction" },
                { type: "null" },
              ],
            },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        ContactListResponse: {
          type: "object",
          required: ["contacts", "total"],
          properties: {
            contacts: {
              type: "array",
              items: { $ref: "#/components/schemas/Contact" },
            },
            total: { type: "integer", minimum: 0 },
          },
        },
        ContactActivityCounts: {
          type: "object",
          required: ["all", "bookings", "formResponses", "workflows"],
          properties: {
            all: { type: "integer", minimum: 0 },
            bookings: { type: "integer", minimum: 0 },
            formResponses: { type: "integer", minimum: 0 },
            workflows: { type: "integer", minimum: 0 },
          },
        },
        ContactActivityItem: {
          type: "object",
          additionalProperties: true,
          required: [
            "id",
            "kind",
            "category",
            "occurredAt",
            "title",
            "description",
            "status",
          ],
          properties: {
            id: { type: "string" },
            kind: {
              type: "string",
              enum: ["booking", "form_response", "workflow_run", "research", "generic"],
            },
            category: {
              type: "string",
              enum: ["all", "bookings", "form_responses", "workflows"],
            },
            occurredAt: { type: "string", format: "date-time" },
            title: { type: "string" },
            description: { type: "string" },
            status: { anyOf: [{ type: "string" }, { type: "null" }] },
          },
        },
        ContactActivityPage: {
          type: "object",
          required: ["activities", "counts", "nextCursor"],
          properties: {
            activities: {
              type: "array",
              items: { $ref: "#/components/schemas/ContactActivityItem" },
            },
            counts: { $ref: "#/components/schemas/ContactActivityCounts" },
            nextCursor: {
              anyOf: [{ type: "string" }, { type: "null" }],
            },
          },
        },
        Tag: {
          type: "object",
          required: ["id", "projectId", "name", "color", "createdAt"],
          properties: {
            id: { type: "string" },
            projectId: { type: "string" },
            name: { type: "string", minLength: 1, maxLength: 50 },
            color: {
              anyOf: [
                { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
                { type: "null" },
              ],
            },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        TagResponse: {
          type: "object",
          required: ["tag"],
          properties: {
            tag: { $ref: "#/components/schemas/Tag" },
          },
        },
        TagListResponse: {
          type: "object",
          required: ["tags", "nextCursor"],
          properties: {
            tags: {
              type: "array",
              items: { $ref: "#/components/schemas/Tag" },
            },
            nextCursor: {
              anyOf: [{ type: "string" }, { type: "null" }],
            },
          },
        },
        CreateTagRequest: {
          type: "object",
          additionalProperties: false,
          required: ["name"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 50 },
            color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
          },
        },
        UpdateTagRequest: {
          type: "object",
          additionalProperties: false,
          minProperties: 1,
          properties: {
            name: { type: "string", minLength: 1, maxLength: 50 },
            color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
          },
        },
        AssignTagRequest: {
          type: "object",
          additionalProperties: false,
          required: ["tagId"],
          properties: {
            tagId: { type: "string", minLength: 1 },
          },
        },
        TagAssignmentResponse: {
          type: "object",
          required: ["tag", "assigned"],
          properties: {
            success: { type: "boolean" },
            tag: { $ref: "#/components/schemas/Tag" },
            assigned: { type: "boolean" },
          },
        },
        TagRemovalResponse: {
          type: "object",
          required: ["success", "tag", "removed"],
          properties: {
            success: { type: "boolean" },
            tag: { $ref: "#/components/schemas/Tag" },
            removed: { type: "boolean" },
          },
        },
        TagInUseError: {
          type: "object",
          required: ["error", "code", "workflows"],
          properties: {
            error: { type: "string" },
            code: { type: "string", const: "TAG_IN_USE" },
            workflows: {
              type: "array",
              items: {
                type: "object",
                required: ["id", "name"],
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                },
              },
            },
          },
        },
        SuccessResponse: {
          type: "object",
          required: ["success"],
          properties: {
            success: { type: "boolean" },
          },
        },
        Form: {
          type: "object",
          additionalProperties: true,
          required: ["id", "slug", "name"],
          properties: {
            id: { type: "string" },
            slug: { type: "string" },
            name: { type: "string" },
          },
        },
        FormList: {
          type: "array",
          items: { $ref: "#/components/schemas/Form" },
        },
        FormField: {
          type: "object",
          additionalProperties: true,
          required: ["id", "type", "label", "hidden"],
          properties: {
            id: { type: "string" },
            type: { type: "string" },
            label: { type: "string" },
            hidden: {
              type: "boolean",
              description:
                "Never shown to respondents. Still accepts query/embed prefill, validation.defaultValue, and conditions.",
            },
            required: { type: "boolean" },
          },
        },
        FormFieldList: {
          type: "object",
          additionalProperties: false,
          required: ["fields"],
          properties: {
            fields: {
              type: "array",
              items: { $ref: "#/components/schemas/FormField" },
            },
          },
        },
        FormFieldResponse: {
          type: "object",
          additionalProperties: false,
          required: ["field"],
          properties: {
            field: { $ref: "#/components/schemas/FormField" },
          },
        },
        CreateFormField: {
          type: "object",
          additionalProperties: true,
          required: ["stepId", "type", "label"],
          properties: {
            stepId: { type: "string" },
            type: { type: "string" },
            label: { type: "string" },
            hidden: {
              type: "boolean",
              description:
                "Never shown to respondents. Cannot be required, have visibility rules, or be type file or completion.",
            },
            required: { type: "boolean" },
          },
        },
        UpdateFormField: {
          type: "object",
          additionalProperties: true,
          properties: {
            hidden: {
              type: "boolean",
              description:
                "Never shown to respondents. Cannot be required, have visibility rules, or be type file or completion.",
            },
            required: { type: "boolean" },
          },
        },
        EventType: {
          type: "object",
          additionalProperties: true,
          required: ["id", "slug", "name"],
          properties: {
            id: { type: "string" },
            slug: { type: "string" },
            name: { type: "string" },
          },
        },
        EventTypeList: {
          type: "array",
          items: { $ref: "#/components/schemas/EventType" },
        },
        Project: {
          type: "object",
          additionalProperties: true,
          required: ["id", "slug", "name"],
          properties: {
            id: { type: "string" },
            slug: { type: "string" },
            name: { type: "string" },
          },
        },
        JsonObject: {
          type: "object",
          additionalProperties: true,
        },
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: { type: "string" },
            code: { type: "string" },
          },
        },
      },
    },
  };
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function countByAuth(rows: AuditRow[]): string {
  const counts = new Map<AuditAuth, number>();
  for (const row of rows) {
    counts.set(row.auth, (counts.get(row.auth) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([auth, count]) => `- ${auth}: ${count}`)
    .join("\n");
}

function buildAuditMarkdown(rows: AuditRow[]): string {
  const documentedCount = rows.filter((row) => row.documented).length;
  const apiKeyCount = rows.filter(
    (row) => row.apiKeySupport === "Supported" || row.apiKeySupport === "Required",
  ).length;
  const anonymousCount = rows.filter((row) => row.auth === "Anonymous").length;
  const sessionOnlyCount = rows.filter((row) => row.auth === "Session").length;

  const tableRows = rows
    .map(
      (row) =>
        `| ${row.method} | \`${escapeTableCell(row.path)}\` | ${row.auth} | ${row.apiKeySupport} | ${row.sessionSupport} | ${row.documented ? "Yes" : "No"} | ${escapeTableCell(row.notes)} |`,
    )
    .join("\n");

  return `# API endpoint authentication audit

> Generated from \`worker/index.ts\`, \`worker/lib/api-route-policy.ts\`, and \`scripts/api-docs-catalog.ts\`. Do not edit this file by hand; run \`bun run docs:generate\`.

## Result

- Registered route/method pairs: ${rows.length}
- API-key-supported or API-key-required routes: ${apiKeyCount}
- Anonymous visitor routes: ${anonymousCount}
- Session-only routes: ${sessionOnlyCount}
- Operations in the public OpenAPI contract: ${documentedCount}

All project resource routes approved for external REST automation use the canonical \`/api/projects/:projectId/*\` contract and accept either a dashboard session or a project-scoped API key. The provider-owned \`POST /api/mcp\` transport requires OAuth and rejects API keys. Account, team, billing, onboarding, connection administration, API-key management, member administration, and project deletion routes remain session-only. Visitor form, booking, widget, availability, and public-file routes remain anonymous.

Credential resolution is deliberately unambiguous: a request with both a valid dashboard session and any \`Authorization\` header is rejected with HTTP 400. A malformed or invalid bearer credential is rejected and is never allowed to fall back to a session. Credentialed cross-origin requests are limited to trusted dashboard origins; anonymous and bearer-authenticated routes use non-credentialed CORS.

## Authentication totals

${countByAuth(rows)}

## Endpoint inventory

| Method | Path | Authentication | API key | Session | Public docs | Notes |
| --- | --- | --- | --- | --- | --- | --- |
${tableRows}
`;
}

export function generateApiArtifacts(source: string): GeneratedApiArtifacts {
  const extractedRoutes = extractApiRoutes(source);
  const providerOwnedRoutes = PUBLIC_API_OPERATIONS.filter(
    function isProviderOwnedOperation(operation) {
      return operation.auth === "oauth";
    },
  ).map(function toRegisteredRoute(operation): RegisteredRoute {
    return { method: operation.method, path: operation.path };
  });
  const routes = [
    ...new Map(
      [...extractedRoutes, ...providerOwnedRoutes].map((route) => [
        routeKey(route.method, route.path),
        route,
      ]),
    ).values(),
  ].sort(compareRoutes);
  const apiKeyProjectRoutes = projectRouteKeySet(PROJECT_API_KEY_ROUTES);
  const sessionProjectRoutes = projectRouteKeySet(PROJECT_SESSION_ONLY_ROUTES);
  const publicMetadata = metadataByRoute();
  const auditRows = routes.map((route) =>
    classifyRoute(
      route,
      apiKeyProjectRoutes,
      sessionProjectRoutes,
      publicMetadata,
    ),
  );
  const openApi = buildOpenApi(routes);
  const openApiJson = `${JSON.stringify(openApi, null, 2)}\n`;
  const auditMarkdown = buildAuditMarkdown(auditRows);
  const llmsText = buildLlmsText();

  return {
    openApi,
    openApiJson,
    auditMarkdown,
    llmsText,
    auditRows,
    routes,
  };
}

export function generatedArtifactFiles(
  artifacts: GeneratedApiArtifacts,
): Record<string, string> {
  return {
    "public/openapi.json": artifacts.openApiJson,
    "docs/api-endpoint-audit.md": artifacts.auditMarkdown,
    "public/llms.txt": artifacts.llmsText,
  };
}

export async function findStaleGeneratedArtifacts(
  artifacts: GeneratedApiArtifacts,
  readFile: (path: string) => Promise<string | null> = async function readFile(
    path,
  ) {
    const file = Bun.file(path);
    return (await file.exists()) ? file.text() : null;
  },
): Promise<string[]> {
  const stale: string[] = [];
  for (const [path, expected] of Object.entries(
    generatedArtifactFiles(artifacts),
  )) {
    if ((await readFile(path)) !== expected) stale.push(path);
  }
  return stale;
}

async function main(): Promise<void> {
  const source = await Bun.file("worker/index.ts").text();
  const artifacts = generateApiArtifacts(source);
  const files = generatedArtifactFiles(artifacts);

  if (process.argv.includes("--check")) {
    const stale = await findStaleGeneratedArtifacts(artifacts);
    for (const path of stale) {
      console.error(`${path} is stale or missing. Run bun run docs:generate.`);
    }
    if (stale.length > 0) process.exitCode = 1;
    return;
  }

  await Promise.all(
    Object.entries(files).map(function writeArtifact([path, contents]) {
      return Bun.write(path, contents);
    }),
  );
  console.log(
    "Generated public/openapi.json, docs/api-endpoint-audit.md, and public/llms.txt",
  );
}

if (import.meta.main) {
  await main();
}

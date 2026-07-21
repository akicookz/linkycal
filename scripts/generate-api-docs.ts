import {
  PROJECT_API_KEY_ROUTES,
  PROJECT_SESSION_ONLY_ROUTES,
} from "../worker/lib/api-route-policy";
import {
  PUBLIC_API_OPERATIONS,
  type PublicApiOperationDefinition,
} from "./api-docs-catalog";

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
  bearerAuth: never[];
}

export interface OpenApiOperation {
  operationId: string;
  summary: string;
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
    };
    schemas: Record<string, unknown>;
  };
}

export interface GeneratedApiArtifacts {
  openApi: OpenApiDocument;
  openApiJson: string;
  auditMarkdown: string;
  auditRows: AuditRow[];
  routes: RegisteredRoute[];
}

interface OperationMetadata {
  summary: string;
  tag: string;
  auth: "anonymous" | "apiKey";
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
      auth: "API key",
      apiKeySupport: "Required",
      sessionSupport: "No",
      documented: true,
      notes: "Streamable HTTP MCP transport; project-scoped API key required.",
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
    ["/tags", "Contacts"],
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

  if (auth === "apiKey") {
    responses["401"] = {
      description: "Missing or invalid API key",
      content: {
        "application/json": { schema: { $ref: "#/components/schemas/Error" } },
      },
    };
    responses["403"] = {
      description: "The credential cannot access this project or operation",
      content: {
        "application/json": { schema: { $ref: "#/components/schemas/Error" } },
      },
    };
  }

  return responses;
}

function createOperation(
  method: OpenApiMethod,
  path: string,
  metadata: OperationMetadata,
): OpenApiOperation {
  const openApiPath = toOpenApiPath(path);
  const parameters = pathParameters(openApiPath);
  const body = requestBody(method, path);

  return {
    operationId: operationId(method, path),
    summary: metadata.summary,
    tags: [metadata.tag],
    security: metadata.auth === "apiKey" ? [{ bearerAuth: [] }] : [],
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(body ? { requestBody: body } : {}),
    responses: responsesFor(metadata.auth),
  };
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

  for (const route of PROJECT_API_KEY_ROUTES) {
    if (!routeKeys.has(routeKey(route.method, route.path))) {
      throw new Error(`Documented project route is not registered: ${route.method} ${route.path}`);
    }
    const method = route.method.toLowerCase() as OpenApiMethod;
    addOperation(paths, method, route.path, {
      summary: projectSummary(method, route.path),
      tag: tagForProjectPath(route.path),
      auth: "apiKey",
    });
  }

  for (const operation of PUBLIC_API_OPERATIONS) {
    const registeredMethod = operation.path === "/api/mcp" ? "ALL" : operation.method;
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
        "Project-scoped LinkyCal REST API plus anonymous visitor endpoints. Send API keys as Authorization: Bearer lc_live_.... Dashboard session cookies are not part of this public contract.",
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
      },
      schemas: {
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

All project resource routes approved for external automation use the canonical \`/api/projects/:projectId/*\` contract and accept either a dashboard session or a project-scoped API key. Account, team, billing, onboarding, OAuth lifecycle, API-key management, member administration, and project deletion routes remain session-only. Visitor form, booking, widget, availability, and public-file routes remain anonymous.

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
  const routes = extractApiRoutes(source);
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

  return { openApi, openApiJson, auditMarkdown, auditRows, routes };
}

async function checkArtifact(path: string, expected: string): Promise<boolean> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    console.error(`${path} is missing. Run bun run docs:generate.`);
    return false;
  }
  if ((await file.text()) !== expected) {
    console.error(`${path} is stale. Run bun run docs:generate.`);
    return false;
  }
  return true;
}

async function main(): Promise<void> {
  const source = await Bun.file("worker/index.ts").text();
  const { openApiJson, auditMarkdown } = generateApiArtifacts(source);

  if (process.argv.includes("--check")) {
    const results = await Promise.all([
      checkArtifact("public/openapi.json", openApiJson),
      checkArtifact("docs/api-endpoint-audit.md", auditMarkdown),
    ]);
    if (results.some((result) => !result)) process.exitCode = 1;
    return;
  }

  await Promise.all([
    Bun.write("public/openapi.json", openApiJson),
    Bun.write("docs/api-endpoint-audit.md", auditMarkdown),
  ]);
  console.log("Generated public/openapi.json and docs/api-endpoint-audit.md");
}

if (import.meta.main) {
  await main();
}

# API Authentication and Documentation Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the canonical project REST endpoints accept project-scoped API keys while preserving dashboard sessions, anonymous visitor integrations, and accurate generated API documentation.

**Architecture:** Keep `/api/projects/:projectId/*` as the sole project-management contract. Resolve credentials once into a typed session-or-API-key context, apply exact method/path policy before shared handlers, and derive project scope without fabricating a user. Generate the endpoint audit and OpenAPI document from the same route metadata used by authorization.

**Tech Stack:** Bun test/runtime, TypeScript strict mode, Hono, Better Auth, Drizzle/D1, Zod 4, OpenAPI 3.1, React 19.

## Global Constraints

- Bun is the only package manager and command runner.
- Existing `/api/projects/:projectId/*` request and response contracts remain canonical.
- Visitor booking, form, widget, public-upload, and availability routes remain anonymous and rate-limited.
- Dashboard requests use sessions; programmatic project requests use `Authorization: Bearer lc_live_...`.
- A valid session plus any Bearer credential returns `400 ambiguous_credentials`.
- An invalid Bearer credential never falls back to a valid session.
- API keys cannot manage projects, members, teams, API keys, billing, onboarding, accounts, or Google OAuth connection lifecycle.
- All new named functions use function declarations; type-only imports use `import type`.
- Production code is written only after its focused test has failed for the expected reason.

---

## File Structure

- Create `worker/lib/request-auth.ts`: pure credential parsing/resolution and stable auth failures.
- Create `worker/lib/api-route-policy.ts`: exact project route catalog, auth categories, and matcher.
- Create `worker/lib/project-api-access.ts`: pure project/key/policy/entitlement authorization decision.
- Create `worker/lib/cors-policy.ts`: trusted-origin and session-origin decisions.
- Create `tests/worker/api-key-service.test.ts`: API-key identity and usage timestamp behavior.
- Create `tests/worker/request-auth.test.ts`: credential precedence matrix.
- Create `tests/worker/api-route-policy.test.ts`: allowlist, denylist, overlap, and source coverage.
- Create `tests/worker/project-api-auth.test.ts`: project/key/policy/entitlement authorization matrix.
- Create `tests/worker/cors-policy.test.ts`: trusted/untrusted origin behavior.
- Create `scripts/api-docs-catalog.ts`: public API operation metadata.
- Create `scripts/generate-api-docs.ts`: deterministic OpenAPI and endpoint-audit generator/checker.
- Create `tests/worker/api-docs.test.ts`: generated artifact and security parity checks.
- Create `public/openapi.json`: generated OpenAPI 3.1 artifact.
- Create `docs/api-endpoint-audit.md`: generated complete route/auth audit.
- Modify `worker/services/api-key-service.ts`: return key identity as well as project identity.
- Modify `worker/types.ts`: add request-auth and project-scope context variables.
- Modify `worker/index.ts`: integrate dual auth, route policy, project scope, CORS, and shared key parsing.
- Modify `worker/mcp/agent.ts`: no behavior change; consume the shared validated project identity flow.
- Modify `package.json`: add deterministic docs generation/check commands.
- Modify `src/pages/Docs.tsx`: replace cookie examples and document the complete public surface.
- Modify `public/llms.txt`: align agent-readable guidance with the implemented surface.
- Modify `src/pages/ApiKeys.tsx`, `src/pages/FeaturePage.tsx`, `src/components/marketing/MarketingSections.tsx`, and `src/lib/prompts.ts`: remove stale API claims/examples.

---

### Task 1: Return API-key identity from the validation service

**Files:**
- Create: `tests/worker/api-key-service.test.ts`
- Modify: `worker/services/api-key-service.ts`
- Modify: `worker/index.ts`

**Interfaces:**
- Produces: `ApiKeyIdentity { apiKeyId: string; projectId: string }`
- Produces: `ApiKeyService.validate(key: string): Promise<ApiKeyIdentity | null>`
- Consumed later by: `resolveRequestAuth()` and the MCP/private-file handlers.

- [ ] **Step 1: Write the failing service test**

```ts
import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import * as dbSchema from "../../worker/db/schema";
import { ApiKeyService } from "../../worker/services/api-key-service";
import { createTestDb } from "./mcp-test-db";

describe("API key service", () => {
  test("validation returns key and project identity and records usage", async () => {
    const db = createTestDb();
    await db.insert(dbSchema.schema.users).values({
      id: "owner",
      name: "Owner",
      email: "owner@example.com",
    });
    await db.insert(dbSchema.projects).values({
      id: "project-a",
      userId: "owner",
      name: "Project A",
      slug: "project-a",
    });

    const service = new ApiKeyService(db);
    const created = await service.create("project-a", "CI");

    await expect(service.validate(created.key)).resolves.toEqual({
      apiKeyId: created.id,
      projectId: "project-a",
    });

    const [row] = await db
      .select({ lastUsedAt: dbSchema.apiKeys.lastUsedAt })
      .from(dbSchema.apiKeys)
      .where(eq(dbSchema.apiKeys.id, created.id));
    expect(row?.lastUsedAt).toBeInstanceOf(Date);
  });

  test("validation rejects an unknown secret", async () => {
    const service = new ApiKeyService(createTestDb());
    await expect(service.validate("lc_live_unknown")).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and verify the identity assertion fails**

Run: `bun test tests/worker/api-key-service.test.ts`

Expected: FAIL because `validate()` returns only the project ID string.

- [ ] **Step 3: Implement the richer result**

Add to `worker/services/api-key-service.ts`:

```ts
export interface ApiKeyIdentity {
  apiKeyId: string;
  projectId: string;
}
```

Change the method signature and return:

```ts
async validate(key: string): Promise<ApiKeyIdentity | null> {
  const keyHash = await hashKey(key);
  const [row] = await this.db
    .select({
      id: dbSchema.apiKeys.id,
      projectId: dbSchema.apiKeys.projectId,
    })
    .from(dbSchema.apiKeys)
    .where(eq(dbSchema.apiKeys.keyHash, keyHash))
    .limit(1);

  if (!row) return null;

  await this.db
    .update(dbSchema.apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(dbSchema.apiKeys.id, row.id));

  return { apiKeyId: row.id, projectId: row.projectId };
}
```

Update the existing MCP and private-file call sites to read `.projectId` and
keep their behavior unchanged.

- [ ] **Step 4: Run the focused test and MCP tests**

Run: `bun test tests/worker/api-key-service.test.ts tests/worker/mcp-tools.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/services/api-key-service.ts worker/index.ts tests/worker/api-key-service.test.ts
git commit -m "refactor: return API key identity"
```

---

### Task 2: Resolve credentials once with deterministic precedence

**Files:**
- Create: `worker/lib/request-auth.ts`
- Create: `tests/worker/request-auth.test.ts`
- Modify: `worker/types.ts`

**Interfaces:**
- Consumes: `ApiKeyIdentity` from Task 1.
- Produces: `RequestAuth`, `AuthFailure`, and `resolveRequestAuth(options)`.
- Produces: Hono variable `requestAuth: RequestAuth`.

- [ ] **Step 1: Write the credential-matrix tests**

```ts
import { describe, expect, test } from "bun:test";

import { resolveRequestAuth } from "../../worker/lib/request-auth";

const session = {
  user: { id: "user-a", name: "Alice", email: "alice@example.com", image: null },
  session: {
    id: "session-a",
    userId: "user-a",
    token: "secret",
    expiresAt: new Date("2030-01-01T00:00:00Z"),
  },
};

describe("request authentication", () => {
  test("uses a session when no Bearer credential exists", async () => {
    const result = await resolveRequestAuth({
      authorization: undefined,
      cookie: "better-auth.session_token=value",
      loadSession: async () => session,
      validateApiKey: async () => null,
    });
    expect(result).toEqual({ ok: true, auth: { kind: "session", ...session } });
  });

  test("uses a valid API key when no valid session exists", async () => {
    const result = await resolveRequestAuth({
      authorization: "Bearer lc_live_valid",
      cookie: undefined,
      loadSession: async () => null,
      validateApiKey: async () => ({ apiKeyId: "key-a", projectId: "project-a" }),
    });
    expect(result).toEqual({
      ok: true,
      auth: { kind: "apiKey", apiKeyId: "key-a", projectId: "project-a" },
    });
  });

  test("rejects a valid session plus any Bearer credential", async () => {
    const result = await resolveRequestAuth({
      authorization: "Bearer lc_live_valid",
      cookie: "better-auth.session_token=value",
      loadSession: async () => session,
      validateApiKey: async () => ({ apiKeyId: "key-a", projectId: "project-a" }),
    });
    expect(result).toMatchObject({ ok: false, status: 400, code: "ambiguous_credentials" });
  });

  test("does not fall back when the Bearer credential is invalid", async () => {
    const result = await resolveRequestAuth({
      authorization: "Bearer invalid",
      cookie: undefined,
      loadSession: async () => null,
      validateApiKey: async () => null,
    });
    expect(result).toMatchObject({ ok: false, status: 401, code: "invalid_api_key" });
  });

  test("uses a valid key when an unrelated or expired cookie has no session", async () => {
    const result = await resolveRequestAuth({
      authorization: "Bearer lc_live_valid",
      cookie: "theme=light",
      loadSession: async () => null,
      validateApiKey: async () => ({ apiKeyId: "key-a", projectId: "project-a" }),
    });
    expect(result).toMatchObject({ ok: true, auth: { kind: "apiKey" } });
  });

  test("rejects a protected request without either credential", async () => {
    const result = await resolveRequestAuth({
      authorization: undefined,
      cookie: undefined,
      loadSession: async () => null,
      validateApiKey: async () => null,
    });
    expect(result).toMatchObject({ ok: false, status: 401, code: "unauthorized" });
  });
});
```

- [ ] **Step 2: Run the test and verify the module-not-found failure**

Run: `bun test tests/worker/request-auth.test.ts`

Expected: FAIL because `worker/lib/request-auth.ts` does not exist.

- [ ] **Step 3: Implement the pure resolver**

Create `worker/lib/request-auth.ts` with these exported shapes and algorithm:

```ts
import type { ApiKeyIdentity } from "../services/api-key-service";

export interface DashboardSession {
  user: { id: string; name: string; email: string; image: string | null };
  session: { id: string; userId: string; token: string; expiresAt: Date };
}

export type RequestAuth =
  | ({ kind: "session" } & DashboardSession)
  | ({ kind: "apiKey" } & ApiKeyIdentity);

export interface AuthFailure {
  ok: false;
  status: 400 | 401;
  code: "ambiguous_credentials" | "invalid_api_key" | "unauthorized";
  error: string;
}

interface ResolveRequestAuthOptions {
  authorization?: string;
  cookie?: string;
  loadSession: () => Promise<DashboardSession | null>;
  validateApiKey: (key: string) => Promise<ApiKeyIdentity | null>;
}

export type RequestAuthResult =
  | { ok: true; auth: RequestAuth }
  | AuthFailure;

function parseBearer(authorization: string): string | null {
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}

export async function resolveRequestAuth(
  options: ResolveRequestAuthOptions,
): Promise<RequestAuthResult> {
  const hasAuthorization = options.authorization !== undefined;
  const session = options.cookie ? await options.loadSession() : null;

  if (session && hasAuthorization) {
    return {
      ok: false,
      status: 400,
      code: "ambiguous_credentials",
      error: "Send either a dashboard session or an API key, not both",
    };
  }

  if (hasAuthorization) {
    const key = parseBearer(options.authorization ?? "");
    const identity = key ? await options.validateApiKey(key) : null;
    if (!identity) {
      return {
        ok: false,
        status: 401,
        code: "invalid_api_key",
        error: "Missing or invalid API key",
      };
    }
    return { ok: true, auth: { kind: "apiKey", ...identity } };
  }

  if (session) return { ok: true, auth: { kind: "session", ...session } };
  return { ok: false, status: 401, code: "unauthorized", error: "Unauthorized" };
}
```

Add `requestAuth: RequestAuth` and the type import to `HonoAppContext.Variables`.

- [ ] **Step 4: Run the focused test and TypeScript check**

Run: `bun test tests/worker/request-auth.test.ts && bunx tsc -p tsconfig.worker.json --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/lib/request-auth.ts worker/types.ts tests/worker/request-auth.test.ts
git commit -m "feat: resolve session and API key credentials"
```

---

### Task 3: Define and verify the exact API-key route policy

**Files:**
- Create: `worker/lib/api-route-policy.ts`
- Create: `tests/worker/api-route-policy.test.ts`
- Modify: none.

**Interfaces:**
- Produces: `PROJECT_API_KEY_ROUTES`, `PROJECT_SESSION_ONLY_ROUTES`.
- Produces: `projectRouteAccess(method, path): "apiKey" | "sessionOnly" | "unclassified"`.
- Consumed later by project access middleware and docs generation.

- [ ] **Step 1: Write policy behavior and coverage tests**

The test must assert all of the following exact behaviors:

```ts
expect(projectRouteAccess("GET", "/api/projects/project-a/contacts")).toBe("apiKey");
expect(projectRouteAccess("PATCH", "/api/projects/project-a/bookings/book-a/cancel")).toBe("apiKey");
expect(projectRouteAccess("PUT", "/api/projects/project-a/event-types/event-a/calendars")).toBe("apiKey");
expect(projectRouteAccess("DELETE", "/api/projects/project-a")).toBe("sessionOnly");
expect(projectRouteAccess("GET", "/api/projects/project-a/api-keys")).toBe("sessionOnly");
expect(projectRouteAccess("POST", "/api/projects/project-a/calendar/connect")).toBe("sessionOnly");
expect(projectRouteAccess("GET", "/api/projects/project-a/unknown")).toBe("unclassified");
```

It must also read `worker/index.ts`, extract every literal project route with:

```ts
const routePattern = /\.(get|post|put|patch|delete|all)\(\s*"(\/api\/projects\/[^"\n]+)"/gs;
```

For every extracted method/path, replace Hono parameters with sample values and
assert the result is not `unclassified`. Assert there are no duplicate
method/path entries across the two policy arrays.

- [ ] **Step 2: Run the test and verify the module-not-found failure**

Run: `bun test tests/worker/api-route-policy.test.ts`

Expected: FAIL because the route-policy module does not exist.

- [ ] **Step 3: Implement exact route definitions and matching**

Define `ApiRoutePolicyEntry` as:

```ts
export interface ApiRoutePolicyEntry {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
}
```

Populate `PROJECT_API_KEY_ROUTES` with this complete method/path set:

```ts
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
  { method: "DELETE", path: "/api/projects/:projectId/schedules/:id/overrides/:overrideId" },
  { method: "GET", path: "/api/projects/:projectId/bookings" },
  { method: "GET", path: "/api/projects/:projectId/bookings/:id" },
  { method: "PATCH", path: "/api/projects/:projectId/bookings/:id/cancel" },
  { method: "GET", path: "/api/projects/:projectId/bookings/:id/form-response" },
  { method: "PATCH", path: "/api/projects/:projectId/bookings/:id/confirm" },
  { method: "PATCH", path: "/api/projects/:projectId/bookings/:id/decline" },
  { method: "GET", path: "/api/projects/:projectId/forms" },
  { method: "GET", path: "/api/projects/:projectId/forms/:formId" },
  { method: "POST", path: "/api/projects/:projectId/forms" },
  { method: "PUT", path: "/api/projects/:projectId/forms/:id" },
  { method: "DELETE", path: "/api/projects/:projectId/forms/:id" },
  { method: "GET", path: "/api/projects/:projectId/forms/:formId/steps" },
  { method: "POST", path: "/api/projects/:projectId/forms/:formId/steps" },
  { method: "PUT", path: "/api/projects/:projectId/forms/:formId/steps/:id" },
  { method: "DELETE", path: "/api/projects/:projectId/forms/:formId/steps/:id" },
  { method: "PUT", path: "/api/projects/:projectId/forms/:formId/steps/reorder" },
  { method: "GET", path: "/api/projects/:projectId/forms/:formId/fields" },
  { method: "POST", path: "/api/projects/:projectId/forms/:formId/fields" },
  { method: "PUT", path: "/api/projects/:projectId/forms/:formId/fields/reorder" },
  { method: "PUT", path: "/api/projects/:projectId/forms/:formId/fields/:id" },
  { method: "DELETE", path: "/api/projects/:projectId/forms/:formId/fields/:id" },
  { method: "GET", path: "/api/projects/:projectId/forms/:formId/responses" },
  { method: "GET", path: "/api/projects/:projectId/forms/:formId/responses/:responseId/files/:valueId" },
  { method: "GET", path: "/api/projects/:projectId/forms/:formId/responses/:responseId" },
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
  { method: "PUT", path: "/api/projects/:projectId/contacts/:contactId/next-action" },
  { method: "DELETE", path: "/api/projects/:projectId/contacts/:id" },
  { method: "GET", path: "/api/projects/:projectId/tags" },
  { method: "POST", path: "/api/projects/:projectId/tags" },
  { method: "DELETE", path: "/api/projects/:projectId/tags/:id" },
  { method: "PATCH", path: "/api/projects/:projectId/tags/:id" },
  { method: "POST", path: "/api/projects/:projectId/contacts/:contactId/tags" },
  { method: "DELETE", path: "/api/projects/:projectId/contacts/:contactId/tags/:tagId" },
  { method: "POST", path: "/api/projects/:projectId/contacts/:contactId/stage" },
  { method: "POST", path: "/api/projects/:projectId/contacts/:contactId/enrich" },
  { method: "POST", path: "/api/projects/:projectId/pipeline/seed" },
  { method: "GET", path: "/api/projects/:projectId/workflows" },
  { method: "POST", path: "/api/projects/:projectId/workflows" },
  { method: "PUT", path: "/api/projects/:projectId/workflows/:id" },
  { method: "DELETE", path: "/api/projects/:projectId/workflows/:id" },
  { method: "GET", path: "/api/projects/:projectId/workflows/:workflowId" },
  { method: "GET", path: "/api/projects/:projectId/workflows/:workflowId/steps" },
  { method: "POST", path: "/api/projects/:projectId/workflows/:workflowId/steps" },
  { method: "PUT", path: "/api/projects/:projectId/workflows/:workflowId/steps/reorder" },
  { method: "PUT", path: "/api/projects/:projectId/workflows/:workflowId/steps/:id" },
  { method: "DELETE", path: "/api/projects/:projectId/workflows/:workflowId/steps/:id" },
  { method: "GET", path: "/api/projects/:projectId/workflows/:workflowId/runs" },
  { method: "POST", path: "/api/projects/:projectId/workflows/:workflowId/trigger" },
  { method: "POST", path: "/api/projects/:projectId/workflows/:workflowId/test" },
  { method: "GET", path: "/api/projects/:projectId/calendar/calendars" },
  { method: "GET", path: "/api/projects/:projectId/event-types/:eventTypeId/calendars" },
  { method: "PUT", path: "/api/projects/:projectId/event-types/:eventTypeId/calendars" },
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
  { method: "DELETE", path: "/api/projects/:projectId/calendar/connections/:id" },
];
```

Compile Hono parameters into anchored regexes with a named function:

```ts
function compileRoutePath(path: string): RegExp {
  const escaped = path
    .split("/")
    .map((segment) => {
      const constrained = /^:[^{]+\{(.+)\}$/.exec(segment);
      if (constrained) return `(?:${constrained[1]})`;
      if (segment.startsWith(":")) return "[^/]+";
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return new RegExp(`^${escaped}$`);
}
```

`projectRouteAccess()` checks exact method plus the compiled path. If a route
matches both arrays, throw during module initialization so ambiguous policy can
never deploy.

Export the matcher return type with the same values used by Task 4:

```ts
export type ProjectRouteAccess = "apiKey" | "sessionOnly" | "unclassified";
```

- [ ] **Step 4: Run policy tests and worker type checking**

Run: `bun test tests/worker/api-route-policy.test.ts && bunx tsc -p tsconfig.worker.json --noEmit`

Expected: PASS, including complete coverage of every registered
`/api/projects/:projectId...` route.

- [ ] **Step 5: Commit**

```bash
git add worker/lib/api-route-policy.ts tests/worker/api-route-policy.test.ts worker/index.ts
git commit -m "feat: classify project API key routes"
```

---

### Task 4: Integrate dual authentication and project authorization

**Files:**
- Create: `worker/lib/project-api-access.ts`
- Create: `tests/worker/project-api-auth.test.ts`
- Modify: `worker/index.ts`
- Modify: `worker/types.ts`

**Interfaces:**
- Consumes: `resolveRequestAuth()`, `projectRouteAccess()`, and `resolveProjectEntitlements()`.
- Produces: `ProjectScope { projectId; ownerUserId; teamId }` in Hono context.

Add this exact type to `worker/types.ts` and add `projectScope: ProjectScope` to
`HonoAppContext.Variables`:

```ts
export interface ProjectScope {
  projectId: string;
  ownerUserId: string;
  teamId: string | null;
}
```

- [ ] **Step 1: Write focused project API authorization tests**

```ts
import { describe, expect, test } from "bun:test";

import { authorizeApiKeyProjectRequest } from "../../worker/lib/project-api-access";

describe("project API key authorization", () => {
  test("allows a matching entitled key on an API-key route", () => {
    expect(authorizeApiKeyProjectRequest({
      apiKeyProjectId: "project-a",
      routeProjectId: "project-a",
      routeAccess: "apiKey",
      apiAccess: true,
    })).toBeNull();
  });

  test("rejects a key for another project", () => {
    expect(authorizeApiKeyProjectRequest({
      apiKeyProjectId: "project-b",
      routeProjectId: "project-a",
      routeAccess: "apiKey",
      apiAccess: true,
    })).toMatchObject({ status: 403, code: "api_key_project_mismatch" });
  });

  test("rejects a session-only route", () => {
    expect(authorizeApiKeyProjectRequest({
      apiKeyProjectId: "project-a",
      routeProjectId: "project-a",
      routeAccess: "sessionOnly",
      apiAccess: true,
    })).toMatchObject({ status: 403, code: "api_key_route_forbidden" });
  });

  test("rejects a project without current API entitlement", () => {
    expect(authorizeApiKeyProjectRequest({
      apiKeyProjectId: "project-a",
      routeProjectId: "project-a",
      routeAccess: "apiKey",
      apiAccess: false,
    })).toMatchObject({ status: 403, code: "api_access_unavailable" });
  });
});
```

- [ ] **Step 2: Run the test and verify API-key project access fails**

Run: `bun test tests/worker/project-api-auth.test.ts`

Expected: FAIL because `worker/lib/project-api-access.ts` does not exist.

- [ ] **Step 3: Implement the pure project API authorization decision**

Create `worker/lib/project-api-access.ts`:

```ts
import type { ProjectRouteAccess } from "./api-route-policy";

interface ProjectApiAccessInput {
  apiKeyProjectId: string;
  routeProjectId: string;
  routeAccess: ProjectRouteAccess;
  apiAccess: boolean;
}

interface ProjectApiAccessFailure {
  status: 403;
  code:
    | "api_key_project_mismatch"
    | "api_key_route_forbidden"
    | "api_access_unavailable";
  error: string;
}

export function authorizeApiKeyProjectRequest(
  input: ProjectApiAccessInput,
): ProjectApiAccessFailure | null {
  if (input.apiKeyProjectId !== input.routeProjectId) {
    return {
      status: 403,
      code: "api_key_project_mismatch",
      error: "API key does not belong to this project",
    };
  }
  if (input.routeAccess !== "apiKey") {
    return {
      status: 403,
      code: "api_key_route_forbidden",
      error: "API keys cannot access this route",
    };
  }
  if (!input.apiAccess) {
    return {
      status: 403,
      code: "api_access_unavailable",
      error: "API access requires a Pro or Business plan",
    };
  }
  return null;
}
```

- [ ] **Step 4: Integrate the resolver into global protected-route middleware**

For routes not in the existing anonymous/system skip set:

1. Resolve a Better Auth session only when a Cookie header exists.
2. Validate API keys through `ApiKeyService` only when Authorization exists.
3. Return the resolver failure body and add `WWW-Authenticate: Bearer` for
   `invalid_api_key`.
4. Store `requestAuth` and `db`.
5. For session auth, preserve current user/session/account subscription setup.
6. For API-key auth on a non-project route, return
   `403 api_key_route_forbidden`.

Do not populate `user`, `session`, `effectiveUserId`, or `accountTeamId` for an
API-key request.

- [ ] **Step 5: Branch project access middleware by `requestAuth.kind`**

For API-key auth:

```ts
const routeAccess = projectRouteAccess(c.req.method, c.req.path);
if (routeAccess !== "apiKey") {
  return c.json({
    error: "API keys cannot access this route",
    code: "api_key_route_forbidden",
  }, 403);
}
if (requestAuth.projectId !== projectId) {
  return c.json({
    error: "API key does not belong to this project",
    code: "api_key_project_mismatch",
  }, 403);
}
```

Resolve project entitlements with `ensureSubscription: true`, require
`planLimits.apiAccess`, set subscription/plan-limit variables, and set:

```ts
c.set("projectScope", {
  projectId,
  ownerUserId: entitlements.ownerUserId,
  teamId: entitlements.teamId,
});
```

For session auth, preserve RBAC and additionally derive the same `projectScope`
from `ProjectAccessContext`.

- [ ] **Step 6: Run focused and existing RBAC/IDOR tests**

Run: `bun test tests/worker/project-api-auth.test.ts tests/worker/team-access.test.ts tests/worker/contact-actions.test.ts tests/worker/booking-actions.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add worker/index.ts worker/types.ts worker/lib/project-api-access.ts tests/worker/project-api-auth.test.ts
git commit -m "feat: authenticate project routes with API keys"
```

---

### Task 5: Remove user assumptions from API-key-enabled calendar configuration

**Files:**
- Create: `tests/worker/project-calendar-scope.test.ts`
- Modify: `worker/index.ts`
- Modify: `worker/types.ts`

**Interfaces:**
- Consumes: `ProjectScope` from Task 4.
- Produces: project/team-owned calendar connection checks with no fabricated user.

- [ ] **Step 1: Write project calendar-scope tests**

Seed a legacy project, a team project, their calendar connections, and an
unrelated connection. Assert:

- A legacy project scope can use its owner's connection.
- A team project scope can use a connection linked through
  `teamCalendarConnections`.
- Neither scope can use the unrelated connection.
- An empty connection list is allowed.

- [ ] **Step 2: Run the test and verify the helper is not project-scope based**

Run: `bun test tests/worker/project-calendar-scope.test.ts`

Expected: FAIL because the current helper requires session access and a user ID.

- [ ] **Step 3: Refactor calendar connection authorization**

Change `projectCanUseCalendarConnections()` to accept only:

```ts
async function projectCanUseCalendarConnections(
  db: AppDatabase,
  scope: ProjectScope,
  connectionIds: string[],
): Promise<boolean>
```

Use `scope.teamId` for team-linked connections, otherwise query
`calendarConnections.userId === scope.ownerUserId`. Update the project calendar
enumeration and event-type calendar update routes to read `projectScope`.
Leave OAuth connect/callback/connection lifecycle routes on their existing
session-only user access.

- [ ] **Step 4: Run calendar and event-type tests**

Run: `bun test tests/worker/project-calendar-scope.test.ts tests/worker/calendar-service.test.ts tests/worker/event-type-service.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/index.ts worker/types.ts tests/worker/project-calendar-scope.test.ts
git commit -m "fix: scope calendar configuration to projects"
```

---

### Task 6: Replace permissive credentialed CORS with route-aware origin checks

**Files:**
- Create: `worker/lib/cors-policy.ts`
- Create: `tests/worker/cors-policy.test.ts`
- Modify: `worker/index.ts`

**Interfaces:**
- Produces: `isTrustedOrigin(origin, configuredBaseUrl)`.
- Produces: `sessionOriginAllowed(method, origin, configuredBaseUrl)`.

- [ ] **Step 1: Write origin-policy tests**

```ts
expect(isTrustedOrigin("https://linkycal.com", "https://linkycal.com")).toBe(true);
expect(isTrustedOrigin("https://evil.example", "https://linkycal.com")).toBe(false);
expect(sessionOriginAllowed("POST", undefined, "https://linkycal.com")).toBe(true);
expect(sessionOriginAllowed("POST", "https://linkycal.com", "https://linkycal.com")).toBe(true);
expect(sessionOriginAllowed("POST", "https://evil.example", "https://linkycal.com")).toBe(false);
```

Also test malformed origin/base URL values fail closed when Origin is present.

- [ ] **Step 2: Run the test and verify the module-not-found failure**

Run: `bun test tests/worker/cors-policy.test.ts`

Expected: FAIL because the CORS policy module does not exist.

- [ ] **Step 3: Implement trusted-origin helpers and middleware policy**

Create pure helpers that compare normalized URL origins. Replace global CORS
credentials with uncredentialed public CORS:

```ts
app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: false,
  maxAge: 86400,
}));
```

The Better Auth CORS callback may return the exact Origin only when
`isTrustedOrigin(origin, c.env.BETTER_AUTH_URL)` is true and keeps credentials
enabled for that narrow route.

After session resolution and before `next()`, reject any session-authenticated
request with an untrusted Origin using `403 origin_forbidden`. Requests without
Origin remain valid for same-origin/server behavior. API-key requests do not use
session cookies and are unaffected by this server-side session-origin check.

- [ ] **Step 4: Run focused auth/CORS tests**

Run: `bun test tests/worker/cors-policy.test.ts tests/worker/project-api-auth.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/lib/cors-policy.ts worker/index.ts tests/worker/cors-policy.test.ts
git commit -m "fix: restrict credentialed API origins"
```

---

### Task 7: Generate the complete route audit and OpenAPI document

**Files:**
- Create: `scripts/api-docs-catalog.ts`
- Create: `scripts/generate-api-docs.ts`
- Create: `tests/worker/api-docs.test.ts`
- Create: `public/openapi.json`
- Create: `docs/api-endpoint-audit.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: project policy arrays from Task 3.
- Produces: deterministic `public/openapi.json` and `docs/api-endpoint-audit.md`.
- Produces commands: `bun run docs:generate` and `bun run docs:check`.

- [ ] **Step 1: Write generated-artifact tests**

Tests must assert:

```ts
const document = JSON.parse(await Bun.file("public/openapi.json").text());
expect(document.openapi).toBe("3.1.0");
expect(document.components.securitySchemes.bearerAuth).toEqual({
  type: "http",
  scheme: "bearer",
  bearerFormat: "lc_live_...",
});
expect(document.paths["/api/projects/{projectId}/contacts"].get.security)
  .toEqual([{ bearerAuth: [] }]);
expect(document.paths["/api/v1/availability/{projectSlug}"].get.security)
  .toEqual([]);
expect(JSON.stringify(document)).not.toContain("session_cookie");
```

For every `PROJECT_API_KEY_ROUTES` entry, convert `:param` to `{param}` and
assert the OpenAPI method exists with Bearer security. Parse the generated audit
and assert every source-extracted API route appears exactly once.

- [ ] **Step 2: Run the tests and verify artifacts are missing**

Run: `bun test tests/worker/api-docs.test.ts`

Expected: FAIL because `/openapi.json` and the endpoint audit do not exist.

- [ ] **Step 3: Implement operation metadata and deterministic generation**

`scripts/api-docs-catalog.ts` exports metadata for:

- Every anonymous visitor operation.
- Every API-key-enabled project operation from `PROJECT_API_KEY_ROUTES`.
- MCP as an API-key-only protocol endpoint.

Each operation contains method, Hono path, tag, summary, auth category, path and
query parameters, request content type, validation-schema name when available,
success status, and response description. Use Zod 4's JSON-schema conversion
for centralized request schemas and explicit schemas for non-Zod bodies.

`scripts/generate-api-docs.ts` must:

1. Read the literal routes in `worker/index.ts`.
2. Combine them with public operation metadata and route policy.
3. Fail if a route is missing classification, metadata refers to a nonexistent
   route, or an API-key route lacks OpenAPI metadata.
4. Generate sorted OpenAPI 3.1 paths with Bearer security only for protected
   operations and `security: []` for anonymous operations.
5. Generate an audit table with method, path, authentication category, API-key
   support, session support, public-doc status, and notes.
6. In `--check` mode compare generated strings to checked-in files and exit 1
   without writing when they differ.

Add package scripts:

```json
"docs:generate": "bun scripts/generate-api-docs.ts",
"docs:check": "bun scripts/generate-api-docs.ts --check"
```

- [ ] **Step 4: Generate artifacts and run parity tests**

Run: `bun run docs:generate && bun test tests/worker/api-docs.test.ts && bun run docs:check`

Expected: PASS with no diff after `docs:check`.

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/api-docs-catalog.ts scripts/generate-api-docs.ts tests/worker/api-docs.test.ts public/openapi.json docs/api-endpoint-audit.md
git commit -m "docs: generate API audit and OpenAPI spec"
```

---

### Task 8: Refresh human, agent, dashboard, and marketing API documentation

**Files:**
- Modify: `src/pages/Docs.tsx`
- Modify: `public/llms.txt`
- Modify: `src/pages/ApiKeys.tsx`
- Modify: `src/pages/FeaturePage.tsx`
- Modify: `src/components/marketing/MarketingSections.tsx`
- Modify: `src/lib/prompts.ts`
- Modify: `tests/worker/api-docs.test.ts`

**Interfaces:**
- Consumes: generated endpoint audit and OpenAPI paths.
- Produces: one consistent public authentication narrative and examples.

- [ ] **Step 1: Add failing documentation assertions**

Add tests that read all documentation/copy files and assert:

- No API integration example contains `Cookie: session=`.
- Management examples contain `Authorization: Bearer`.
- Docs link to `/openapi.json` and `/llms.txt`.
- Docs explain visitor endpoints are anonymous and API keys must never be put in
  visitor-side code.
- Docs list project settings, event types, schedules, bookings, forms,
  responses, contacts/tags, workflows, activity, analytics, and calendar
  configuration.
- Docs state that project creation/deletion, members, key management, billing,
  and OAuth connections are dashboard-only.
- Examples use current route names and 2026 dates.

- [ ] **Step 2: Run the test and verify stale cookie examples fail**

Run: `bun test tests/worker/api-docs.test.ts`

Expected: FAIL on existing `Cookie: session=your_session_cookie` samples and
missing domain coverage.

- [ ] **Step 3: Update the documentation surfaces**

Replace cookie-authenticated cancellation/contact examples with Bearer headers.
Add a compact endpoint catalog sourced from the generated audit, grouped by
project domain. Clearly label:

- Anonymous visitor endpoints.
- API-key-enabled management endpoints.
- Dashboard-only operations.
- MCP API-key behavior.
- Stable authentication error codes.

Update `llms.txt` to give agents the same route/auth rules. Update API-key page,
marketing, feature copy, and generated prompts so none claim a nonexistent or
session-only public capability. Keep all button icon/text conventions and avoid
new separator borders in `Docs.tsx`.

- [ ] **Step 4: Run docs tests and frontend type/build checks**

Run: `bun test tests/worker/api-docs.test.ts && bunx tsc -p tsconfig.app.json --noEmit && bun run docs:check`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Docs.tsx public/llms.txt src/pages/ApiKeys.tsx src/pages/FeaturePage.tsx src/components/marketing/MarketingSections.tsx src/lib/prompts.ts tests/worker/api-docs.test.ts
git commit -m "docs: refresh API reference and examples"
```

---

### Task 9: Final security and regression verification

**Files:**
- Modify only files required by failures discovered in this task, with a new
  failing regression test before any production correction.

**Interfaces:**
- Verifies all interfaces from Tasks 1–8.

- [ ] **Step 1: Run focused security tests**

Run:

```bash
bun test tests/worker/api-key-service.test.ts \
  tests/worker/request-auth.test.ts \
  tests/worker/api-route-policy.test.ts \
  tests/worker/project-api-auth.test.ts \
  tests/worker/project-calendar-scope.test.ts \
  tests/worker/cors-policy.test.ts \
  tests/worker/api-docs.test.ts
```

Expected: PASS with zero failures.

- [ ] **Step 2: Run the full test suite**

Run: `bun test`

Expected: PASS with zero failures.

- [ ] **Step 3: Verify generated documentation is current**

Run: `bun run docs:check && git diff --exit-code -- public/openapi.json docs/api-endpoint-audit.md`

Expected: PASS and no generated artifact diff.

- [ ] **Step 4: Run lint and production build**

Run: `bun run lint && bun run build`

Expected: both commands exit 0.

- [ ] **Step 5: Inspect the final diff and route matrix**

Run:

```bash
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors; only planned files changed; generated audit
reports every endpoint exactly once.

- [ ] **Step 6: Commit any test-led verification corrections**

```bash
git add worker src public docs scripts tests package.json
git commit -m "test: verify API authentication matrix"
```

Skip this commit when Step 1–5 require no corrections.

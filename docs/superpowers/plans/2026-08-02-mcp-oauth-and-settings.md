# MCP OAuth and Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace API-key authentication on `/api/mcp` with project-scoped OAuth 2.1, enforce real read/write MCP scopes, and redesign the `MCP & APIs` page around connected OAuth clients while preserving REST API keys unchanged.

**Architecture:** Wrap the existing Hono Worker and `LinkyCalMcp` Durable Object with `@cloudflare/workers-oauth-provider`. Better Auth authenticates the resource owner; the provider owns client discovery/registration, PKCE, grants, access tokens, refresh tokens, and protocol revocation. Every provider grant carries one user, one project, one LinkyCal connection ID, and effective scopes. D1 stores only a non-secret project-level connection index. A shared tool catalog maps all 40 MCP tools to `read` or `write`, and the shared tool wrapper rejects insufficient scope before a handler can produce a side effect.

**Tech Stack:** Bun, TypeScript, React 19, Hono, Better Auth, Cloudflare Workers, Cloudflare KV, Cloudflare D1, Drizzle ORM, Durable Objects, MCP SDK, `@cloudflare/workers-oauth-provider` 0.8.2, Zod, TanStack Query, Testing Library, Bun test.

## Global Constraints

- Implement the approved design in `docs/superpowers/specs/2026-08-02-mcp-oauth-and-settings-design.md`.
- OAuth replaces API-key authentication only on `/api/mcp`. Existing REST API-key routes, key format, create/list/delete behavior, and copy-once behavior remain unchanged.
- Make a hard cutover: never fall back to `ApiKeyService.validate()` after OAuth fails on `/api/mcp`.
- One OAuth grant selects exactly one project. Never accept a tool-level or caller-supplied `projectId`.
- Authorization and runtime use require both current `project:api_keys` permission and a current Pro/Business `apiAccess` entitlement. Listing and revocation require `project:api_keys` but remain available after a downgrade so an administrator can inspect and terminate old grants.
- Recheck access, permission, entitlement, active connection state, and Origin on every authorized MCP HTTP request.
- Configure `revokeExistingGrants: false`; otherwise a second project connection for the same user/client would revoke the first one.
- Use separate scope resolvers: initial authorization may default a missing read/write request to both, while token exchange copies the provider's effective `requestedScope` exactly and never reapplies that default.
- Grant `offline_access` only when requested. If no `read` or `write` scope is requested, default to both for compatible MCP clients; otherwise honor the requested subset.
- Never store or log access tokens, refresh tokens, authorization codes, PKCE verifiers, session cookies, or raw OAuth query strings in D1 or application logs.
- Never render client-provided remote image URLs. Known clients use local icons; unknown clients use a local generic icon.
- Preserve all unrelated user changes, especially the untracked `docs/superpowers/specs/2026-08-02-entitlement-enforcement-and-pricing-design.md` file. Stage only the files named by each task.
- Follow strict TDD for each behavior: write the regression, run it against the current code and record the expected failure, make the minimum production change, and rerun it green.
- Tests assert protocol output, authorization boundaries, persisted state, absence of side effects, and rendered user outcomes. Do not assert Tailwind classes, source text, DOM ancestry, or Cloudflare provider internals already covered upstream.
- Use Bun, function declarations for named functions/components, `import type` for type-only imports, and `apply_patch` for source edits.
- Do not provision production KV, run a production D1 migration, deploy, upload widgets, or reconnect external clients without a separate explicit approval.

## Canonical Contracts

Create `shared/mcp-tools.ts` as the single source of truth for tool scope classification:

```ts
export type McpToolScope = "read" | "write";
export type McpOAuthScope = McpToolScope | "offline_access";

export const MCP_TOOL_SCOPES = {
  list_bookings: "read",
  get_booking: "read",
  get_available_slots: "read",
  create_booking: "write",
  cancel_booking: "write",
  confirm_booking: "write",
  decline_booking: "write",
  list_event_types: "read",
  get_event_type: "read",
  create_event_type: "write",
  update_event_type: "write",
  list_schedules: "read",
  get_schedule: "read",
  list_contacts: "read",
  get_contact: "read",
  create_contact: "write",
  update_contact: "write",
  set_contact_next_action: "write",
  complete_contact_next_action: "write",
  delete_contact: "write",
  list_contact_tags: "read",
  get_contact_tag: "read",
  create_contact_tag: "write",
  update_contact_tag: "write",
  delete_contact_tag: "write",
  add_tag_to_contact: "write",
  remove_tag_from_contact: "write",
  get_contact_activity: "read",
  list_forms: "read",
  get_form: "read",
  create_form: "write",
  update_form: "write",
  list_form_responses: "read",
  list_workflows: "read",
  get_workflow: "read",
  get_analytics_overview: "read",
  get_booking_funnel_analytics: "read",
  get_form_funnel_analytics: "read",
  list_analytics_integrations: "read",
  configure_analytics_integration: "write",
} as const satisfies Record<string, McpToolScope>;

export type McpToolName = keyof typeof MCP_TOOL_SCOPES;
```

The OAuth token application props are:

```ts
export interface McpOAuthProps extends Record<string, unknown> {
  connectionId: string;
  userId: string;
  projectId: string;
  scopes: McpOAuthScope[];
}
```

The browser-facing DTOs are:

```ts
export interface McpConnectionDto {
  id: string;
  clientName: string;
  scopes: McpOAuthScope[];
  createdAt: string;
  authorizedBy: {
    name: string;
    email: string;
  };
}

export interface McpAuthorizationContextDto {
  clientName: string;
  scopes: McpOAuthScope[];
  projects: Array<{
    id: string;
    name: string;
  }>;
}
```

---

### Task 1: Add the non-secret OAuth connection registry

**Files:**

- Create: `tests/mcp-oauth-grants.test.ts`
- Modify: `worker/db/schema.ts`
- Create: `worker/services/mcp-oauth-grant-service.ts`
- Create: `worker/db/drizzle/0035_mcp_oauth_grants.sql`
- Modify: `worker/db/drizzle/meta/_journal.json`
- Create: `worker/db/drizzle/meta/0035_snapshot.json`

**Interfaces:**

```ts
export class McpOAuthGrantService {
  constructor(db: DrizzleD1Database<Record<string, unknown>>);
  create(input: NewMcpOAuthGrant): Promise<McpOAuthGrantRow>;
  getActive(connectionId: string): Promise<McpOAuthGrantRow | null>;
  listActiveForProject(projectId: string): Promise<McpConnectionDto[]>;
  markRevoked(connectionId: string, projectId: string): Promise<boolean>;
}
```

- [ ] **Step 1: Write the registry regression against the real migration stack.**

In `tests/mcp-oauth-grants.test.ts`, use `createTestDb()`. Insert two users, two projects, and three grants: two active grants in project A and one grant already revoked in project B. Require `listActiveForProject("project-a")` to return only project A's active grants in descending `createdAt` order, with authorizer name/email and parsed scope arrays. Require `getActive()` to return `null` for the revoked grant. Require `markRevoked(connectionId, "project-b")` to return `false` for a project-A connection and leave it active. Require a correct-project revoke to set `revokedAt` and remain idempotently successful when repeated through the route-facing service contract.

- [ ] **Step 2: Run the focused test and confirm the missing schema/service failure.**

Run:

```bash
bun test tests/mcp-oauth-grants.test.ts
```

Expected failure: the service module and `mcp_oauth_grants` table do not exist.

- [ ] **Step 3: Add the Drizzle table and service.**

Add this table to `worker/db/schema.ts` near the API credential tables:

```ts
export const mcpOAuthGrants = sqliteTable(
  "mcp_oauth_grants",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => authSchema.users.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    clientName: text("client_name").notNull(),
    scopes: text("scopes").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    revokedAt: integer("revoked_at", { mode: "timestamp" }),
  },
  (t) => [
    index("mcp_oauth_grants_project_id_idx").on(t.projectId),
    index("mcp_oauth_grants_user_id_idx").on(t.userId),
    index("mcp_oauth_grants_client_id_idx").on(t.clientId),
  ],
);

export type McpOAuthGrantRow = typeof mcpOAuthGrants.$inferSelect;
export type NewMcpOAuthGrantRow = typeof mcpOAuthGrants.$inferInsert;
```

In the service, serialize scopes with `JSON.stringify`, parse them through a bounded Zod schema, join `authSchema.users`, filter by `projectId` and `isNull(revokedAt)`, and order by `desc(createdAt)`. Scope parsing must discard no unexpected value silently; invalid stored JSON is a service error.

- [ ] **Step 4: Generate and inspect migration 0035.**

Run:

```bash
bunx drizzle-kit generate --name mcp_oauth_grants
```

Confirm the generated SQL creates exactly `mcp_oauth_grants`, cascades both foreign keys, leaves `revoked_at` nullable, and creates project/user/client indexes. If Drizzle chooses a filename other than `0035_mcp_oauth_grants.sql`, use the generated filename consistently rather than renaming migration history by hand.

- [ ] **Step 5: Run the registry test and local migration.**

Run:

```bash
bun test tests/mcp-oauth-grants.test.ts
bun run db:migrate:dev
```

Expected: the focused test passes and the local D1 database accepts migration 0035.

- [ ] **Step 6: Commit the registry.**

Run:

```bash
git add worker/db/schema.ts worker/db/drizzle/0035_mcp_oauth_grants.sql worker/db/drizzle/meta/_journal.json worker/db/drizzle/meta/0035_snapshot.json worker/services/mcp-oauth-grant-service.ts tests/mcp-oauth-grants.test.ts
git diff --cached --check
git commit -m "feat: add MCP OAuth connection registry"
```

If the generated migration filename differs, stage that generated SQL and snapshot instead of the literal 0035 paths above.

---

### Task 2: Make read/write scope enforcement canonical and side-effect safe

**Files:**

- Create: `shared/mcp-tools.ts`
- Create: `tests/mcp-tool-scopes.test.ts`
- Modify: `worker/mcp/agent.ts`
- Modify: `worker/mcp/helpers.ts`
- Modify: `worker/mcp/tools/bookings.ts`
- Modify: `worker/mcp/tools/contacts.ts`
- Modify: `worker/mcp/tools/event-types.ts`
- Modify: `worker/mcp/tools/schedules.ts`
- Modify: `worker/mcp/tools/forms.ts`
- Modify: `worker/mcp/tools/workflows.ts`
- Modify: `worker/mcp/tools/analytics.ts`
- Modify: `tests/analytics-mcp.test.ts`
- Modify: every existing test fixture that constructs `ToolContext`

- [ ] **Step 1: Add the catalog-completeness and no-side-effect scope regressions.**

In `tests/mcp-tool-scopes.test.ts`, assert that `Object.keys(MCP_TOOL_SCOPES)` has 40 unique tool names and matches the actual MCP documentation catalog names. Add one table for representative calls:

```ts
const cases = [
  { tool: "get_booking", granted: ["write"], required: "read" },
  { tool: "create_booking", granted: ["read"], required: "write" },
] as const;
```

For each case, call the shared wrapper with a handler that increments `sideEffects`. Require an MCP error result containing `Authorization required: <scope> scope` and `sideEffects === 0`. Add the matching allowed-scope cases and require the handler to run once.

- [ ] **Step 2: Run the focused test and confirm the missing catalog/guard failure.**

Run:

```bash
bun test tests/mcp-tool-scopes.test.ts
```

Expected failure: there is no shared scope catalog and `withToolErrors` does not inspect scopes.

- [ ] **Step 3: Add the catalog, context accessor, and pre-handler guard.**

Create the exact `MCP_TOOL_SCOPES` contract from this plan. Change `ToolContext` to include:

```ts
scopes: () => McpOAuthScope[];
```

Change the wrapper signature to:

```ts
export function withToolErrors<Input>(
  name: McpToolName,
  ctx: ToolContext,
  fn: (input: Input) => Promise<ToolResult>,
): (input: Input) => Promise<ToolResult> {
  return async function guardedTool(input: Input): Promise<ToolResult> {
    const requiredScope = MCP_TOOL_SCOPES[name];
    if (!ctx.scopes().includes(requiredScope)) {
      return err(`Authorization required: ${requiredScope} scope`);
    }
    try {
      return await fn(input);
    } catch (error) {
      if (error instanceof Error && error.name === "ZodError") {
        return err(`Invalid input: ${error.message}`);
      }
      console.error(`MCP tool ${name} failed:`, error);
      return err("Internal error");
    }
  };
}
```

Update all 40 registrations from `withToolErrors("tool_name", handler)` to `withToolErrors("tool_name", ctx, handler)`. Give existing non-OAuth test contexts both `read` and `write` scopes unless that test specifically owns scope behavior.

- [ ] **Step 4: Run every MCP test and fix type-level catalog drift.**

Run:

```bash
bun test tests/mcp-tool-scopes.test.ts tests/analytics-mcp.test.ts
rg -n 'withToolErrors\(' worker/mcp tests
```

Expected: every production registration supplies `ctx`; every literal tool name is accepted by `McpToolName`; focused tests pass.

- [ ] **Step 5: Commit scope enforcement.**

Run:

```bash
git add shared/mcp-tools.ts worker/mcp/agent.ts worker/mcp/helpers.ts worker/mcp/tools tests/mcp-tool-scopes.test.ts tests/analytics-mcp.test.ts
git diff --cached --check
git commit -m "feat: enforce MCP OAuth tool scopes"
```

Add any other modified MCP test fixture explicitly to the `git add` command; do not use `git add .`.

---

### Task 3: Build the authorization and revocation domain

**Files:**

- Modify: `package.json`
- Modify: `bun.lock`
- Create: `worker/mcp/oauth-authorization.ts`
- Create: `tests/mcp-oauth-authorization.test.ts`
- Modify: `worker/validation.ts`

**Provider port:**

```ts
export type McpOAuthHelpers = Pick<
  OAuthHelpers,
  | "parseAuthRequest"
  | "lookupClient"
  | "completeAuthorization"
  | "listUserGrants"
  | "revokeGrant"
>;
```

- [ ] **Step 1: Install the pinned Cloudflare provider.**

Run:

```bash
bun add --exact @cloudflare/workers-oauth-provider@0.8.2
```

Inspect `package.json` and `bun.lock` to confirm the direct dependency is exactly 0.8.2.

- [ ] **Step 2: Write authorization-domain tests with a strict provider double.**

In `tests/mcp-oauth-authorization.test.ts`, create a fake implementing only `McpOAuthHelpers` and real D1 state. Protect these independent outcomes:

- `loadMcpAuthorizationContext` returns only projects where the signed-in user currently has `project:api_keys` and `planLimits.apiAccess`; it sanitizes a long/control-character client name and defaults to `MCP client` when empty.
- Requested `read` only remains `read`; no read/write request defaults to both; `offline_access` is included only when requested; unsupported scopes fail before consent.
- Effective token scope copies the provider array exactly: `['offline_access']` never gains `read` or `write`, and a read-only downscope never regains `write`.
- Approval reparses the request, rechecks the selected project, calls `completeAuthorization` with one random `connectionId`, `revokeExistingGrants: false`, exact project/user/client props, and persists the D1 connection before returning `redirectTo`.
- If the D1 insert fails, the code paginates `listUserGrants`, finds `metadata.connectionId`, revokes that provider grant, and does not return the authorization redirect.
- Denial validates the client and redirect URI first, then returns `error=access_denied` and preserves `state`. An unregistered redirect URI never receives a redirect.
- Project revocation finds the provider grant by `metadata.connectionId`, revokes it before setting D1 `revokedAt`, and leaves D1 active when provider revocation fails.
- Project connection listing groups active D1 rows by authorizer, paginates each user's provider grants, marks D1-only rows revoked, and omits them so expired provider grants never appear connected.

- [ ] **Step 3: Run the domain test and confirm it is red.**

Run:

```bash
bun test tests/mcp-oauth-authorization.test.ts
```

Expected failure: the authorization domain and decision schema do not exist.

- [ ] **Step 4: Add strict decision validation and the authorization functions.**

Add to `worker/validation.ts`:

```ts
export const mcpOAuthDecisionSchema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("approve"),
    projectId: z.string().min(1).max(128),
  }).strict(),
  z.object({
    decision: z.literal("deny"),
  }).strict(),
]);
```

Implement these named functions in `worker/mcp/oauth-authorization.ts`:

```ts
export function resolveAuthorizationMcpScopes(scope: string[]): McpOAuthScope[];
export function resolveEffectiveMcpTokenScopes(scope: string[]): McpOAuthScope[];
export function sanitizeMcpClientName(value: string | undefined): string;
export async function loadMcpAuthorizationContext(input: AuthorizationContextInput): Promise<McpAuthorizationContextDto>;
export async function decideMcpAuthorization(input: AuthorizationDecisionInput): Promise<string>;
export async function findProviderGrantByConnectionId(input: FindGrantInput): Promise<GrantSummary | null>;
export async function listMcpConnections(input: ListConnectionsInput): Promise<McpConnectionDto[]>;
export async function revokeMcpConnection(input: RevokeConnectionInput): Promise<void>;
```

Use `resolveProjectAccess`, `hasProjectPermission(access, "project:api_keys")`, and `resolveProjectEntitlements`. Page through provider grants with a bounded page size of 100 until the matching `metadata.connectionId` is found or the cursor ends. `resolveAuthorizationMcpScopes` owns the compatibility default; `resolveEffectiveMcpTokenScopes` validates and copies only the provider-supplied token scopes. Compare the parsed client's registered redirect URIs before either approval or denial redirects. Do not accept a browser-supplied `userId`, `clientId`, scopes, client name, or redirect URI.

- [ ] **Step 5: Run the domain tests green.**

Run:

```bash
bun test tests/mcp-oauth-authorization.test.ts tests/mcp-oauth-grants.test.ts
```

Expected: all authorization, compensation, denial, and revocation ordering outcomes pass.

- [ ] **Step 6: Commit the domain.**

Run:

```bash
git add package.json bun.lock worker/mcp/oauth-authorization.ts worker/validation.ts tests/mcp-oauth-authorization.test.ts
git diff --cached --check
git commit -m "feat: add MCP OAuth authorization domain"
```

---

### Task 4: Wire the OAuth provider, runtime access checks, and session-only APIs

**Files:**

- Create: `worker/mcp/oauth-provider.ts`
- Create: `worker/mcp/access.ts`
- Create: `tests/mcp-oauth-access.test.ts`
- Modify: `worker/index.ts`
- Modify: `worker/types.ts`
- Modify: `worker/lib/api-route-policy.ts`
- Modify: `tests/api-route-policy.test.ts`
- Modify: `wrangler.jsonc`
- Modify: `worker-configuration.d.ts`

- [ ] **Step 1: Write runtime-access and route-policy regressions.**

In `tests/mcp-oauth-access.test.ts`, use real D1 data and call a focused `authorizeMcpRequest` function with trusted `McpOAuthProps`. Require success only when the connection is active, the grant owner still has `project:api_keys`, and the project still has API access. Add a labeled table requiring `403` for revoked connection, removed user, demoted editor/viewer, Free downgrade, mismatched connection project, and untrusted browser Origin. Require a server-to-server request without `Origin` to pass. Assert no MCP handler callback runs in every denied case.

Extend `tests/api-route-policy.test.ts` so both MCP connection routes are `sessionOnly`, never `apiKey`, and the public OAuth context API is not misclassified as a project API-key route.

- [ ] **Step 2: Run the focused tests and confirm current behavior is red.**

Run:

```bash
bun test tests/mcp-oauth-access.test.ts tests/api-route-policy.test.ts
```

Expected failure: runtime grant checks and MCP connection route policies do not exist.

- [ ] **Step 3: Implement the focused runtime guard.**

In `worker/mcp/access.ts`, return a discriminated result so the HTTP wrapper owns response formatting:

```ts
export type McpAccessResult =
  | { allowed: true; props: McpOAuthProps }
  | { allowed: false; status: 403; error: string };

export async function authorizeMcpRequest(
  db: DrizzleD1Database<Record<string, unknown>>,
  props: McpOAuthProps,
  origin: string | null,
  trustedOrigins: Set<string>,
): Promise<McpAccessResult>;
```

Use the D1 registry, `resolveProjectAccess`, `hasProjectPermission`, and `resolveProjectEntitlements`. Return stable messages `MCP connection is no longer active`, `MCP project access is no longer authorized`, and `MCP API access is not available on this plan`. Validate an Origin only when it is present.

- [ ] **Step 4: Add session-only authorization and connection routes.**

Add these Hono routes before the project API-key routes:

```text
GET    /api/oauth/mcp/authorization?<original OAuth query>
POST   /api/oauth/mcp/authorization?<original OAuth query>
GET    /api/projects/:projectId/mcp-connections
DELETE /api/projects/:projectId/mcp-connections/:connectionId
```

The GET authorization route derives the Better Auth user from `c.get("user")`, reconstructs the canonical `/oauth/authorize` request from the request query, and returns `{ authorization }`. The POST route validates `mcpOAuthDecisionSchema`, derives the user from the session, and returns `{ redirectTo }`; it does not follow the redirect server-side. The connection-list route calls `listMcpConnections` so provider-expired rows are reconciled before returning `{ connections }`. The project routes use the middleware's project and permission context. Add both project routes to `PROJECT_SESSION_ONLY_ROUTES`, and map `/mcp-connections` to `project:api_keys` in `permissionForProjectRequest`.

- [ ] **Step 5: Add the provider-owned `/api/mcp` boundary and delete API-key MCP auth.**

In `worker/mcp/oauth-provider.ts`, export a `createMcpOAuthProvider(defaultHandler)` factory. Build the existing Durable Object handler inside that module and wrap it with the fresh runtime guard. Instantiate the provider in `worker/index.ts` only after all Hono routes and asset fallbacks are registered; passing `{ fetch: app.fetch }` into the factory avoids a circular import between the provider module and `worker/index.ts`. Configure the factory with these explicit values:

```ts
export function createMcpOAuthProvider(
  defaultHandler: ExportedHandler<AppEnv>,
): OAuthProvider<AppEnv> {
  return new OAuthProvider<AppEnv>({
  apiRoute: "/api/mcp",
  apiHandler: mcpOAuthApiHandler,
  defaultHandler,
  authorizeEndpoint: "/oauth/authorize",
  tokenEndpoint: "/oauth/token",
  clientRegistrationEndpoint: "/oauth/register",
  scopesSupported: ["read", "write", "offline_access"],
  resourceMetadata: {
    resource: "https://linkycal.com/api/mcp",
    authorization_servers: ["https://linkycal.com"],
    scopes_supported: ["read", "write", "offline_access"],
    bearer_methods_supported: ["header"],
    resource_name: "LinkyCal MCP",
  },
  clientIdMetadataDocumentEnabled: true,
  allowPlainPKCE: false,
  allowImplicitFlow: false,
  accessTokenTTL: 3_600,
  refreshTokenTTL: 2_592_000,
  clientRegistrationTTL: 7_776_000,
  onError: function logOAuthError({ code, status }) {
    console.warn(`OAuth error response: ${status} ${code}`);
  },
  tokenExchangeCallback: async function tokenExchange(options) {
    const effectiveScopes = resolveEffectiveMcpTokenScopes(
      options.requestedScope,
    );
    return {
      accessTokenProps: {
        ...options.props,
        scopes: effectiveScopes,
      },
      accessTokenScope: effectiveScopes,
    };
  },
  });
}
```

Delete the old `app.all("/api/mcp")` route and its `lc_live_` parsing/`ApiKeyService.validate()` branch. Keep `ApiKeyService` imported for REST API-key routes. After the Hono app is complete, create `const mcpOAuthProvider = createMcpOAuthProvider({ fetch: app.fetch })`. Export an object whose `fetch` delegates to `mcpOAuthProvider.fetch`, while `queue` keeps the current workflow behavior. In `scheduled`, run provider cleanup in its own `try/catch` using `mcpOAuthProvider.purgeExpiredData(env, { batchSize: 100 })`, then run existing booking/workflow jobs even if cleanup fails. The provider error callback logs only status and OAuth error code, never the description or request query.

Set MCP Durable Object props to `McpOAuthProps`. Its `ToolContext.scopes()` reads the current props and throws a safe configuration error if missing.

- [ ] **Step 6: Provision the dedicated OAuth KV only after explicit infrastructure approval.**

This command creates remote Cloudflare state and edits Wrangler configuration, so pause and obtain explicit approval before running it:

```bash
bunx wrangler kv namespace create linkycal-oauth --binding OAUTH_KV --use-remote --update-config
```

After approval and success, ensure `wrangler.jsonc` contains a distinct `OAUTH_KV` binding and preserves the existing `CACHE` binding. Add `global_fetch_strictly_public` alongside `nodejs_compat` in `compatibility_flags`. Add `OAUTH_KV: KVNamespace` and the provider-injected OAuth helper binding to `AppEnv`, then run:

```bash
bun run cf-typegen
```

Do not invent or commit a placeholder namespace ID. If infrastructure approval is deferred, stop this task before claiming the Worker integration builds.

- [ ] **Step 7: Run integration-focused tests and typechecking.**

Run:

```bash
bun test tests/mcp-oauth-access.test.ts tests/mcp-oauth-authorization.test.ts tests/mcp-tool-scopes.test.ts tests/api-route-policy.test.ts
bun run build
```

Expected: runtime access checks, authorization, scope enforcement, route policy, Worker types, and SPA build pass. A project API key is no longer referenced by the MCP route.

- [ ] **Step 8: Commit provider integration.**

Run:

```bash
git add worker/mcp/oauth-provider.ts worker/mcp/access.ts worker/mcp/agent.ts worker/index.ts worker/types.ts worker/lib/api-route-policy.ts worker/validation.ts wrangler.jsonc worker-configuration.d.ts tests/mcp-oauth-access.test.ts tests/api-route-policy.test.ts
git diff --cached --check
git commit -m "feat: serve MCP through project-scoped OAuth"
```

---

### Task 5: Add the authenticated OAuth consent screen

**Files:**

- Create: `src/pages/OAuthAuthorize.tsx`
- Create: `src/components/mcp/McpClientIcon.tsx`
- Modify: `src/components/AuthGuard.tsx`
- Modify: `src/App.tsx`
- Create: `tests/mcp-oauth-consent.test.tsx`

- [ ] **Step 1: Write the consent journey tests.**

In `tests/mcp-oauth-consent.test.tsx`, render `/oauth/authorize` with a realistic `client_id`, `redirect_uri`, `response_type=code`, S256 challenge, `resource=https://linkycal.com/api/mcp`, `scope=read%20write%20offline_access`, and state. Mock the authorization context API and protect these outcomes:

- Client name, only eligible projects, Read and Write permission descriptions, `Cancel`, and `Allow access` render.
- Selecting project B and approving POSTs only `{ decision: "approve", projectId: "project-b" }` to the same authorization query, swaps `ShieldCheck` for the `Allowing...` loader label, and assigns `window.location` only to the server-returned `redirectTo`.
- Cancel POSTs only `{ decision: "deny" }` and follows the validated server redirect.
- A failed/expired authorization context renders a safe message without raw provider details or a client-controlled link.
- A signed-out route redirects to `/?show_auth=true&redirect=<encoded path and full query>` so OAuth state, resource, redirect URI, and PKCE challenge survive login.

- [ ] **Step 2: Run the consent tests and confirm they fail.**

Run:

```bash
bun test tests/mcp-oauth-consent.test.tsx
```

Expected failure: the consent route/page and current-location auth redirect do not exist.

- [ ] **Step 3: Preserve the current route through authentication.**

Change `AuthGuard` to accept `redirectToCurrent?: boolean`. When true, use `useLocation()` and build the landing URL through `URLSearchParams`:

```ts
const params = new URLSearchParams({
  show_auth: "true",
  redirect: `${location.pathname}${location.search}`,
});
return <Navigate to={`/?${params.toString()}`} replace />;
```

Existing dashboard guards retain the current `/?show_auth=true` behavior. Add `/oauth/authorize` outside the dashboard shell and wrap it with `ErrorBoundary` and `<AuthGuard redirectToCurrent>`.

- [ ] **Step 4: Build the focused consent page and safe local client icons.**

`OAuthAuthorize.tsx` must use the LinkyCal logo, one centered `rounded-[20px]` structural card, a labeled project select, muted card-style permission rows, text-only `Cancel`, and an icon-plus-text `Allow access` button. The primary loading state replaces `ShieldCheck` with `Loader`; it does not render both. Use visible error text and disable approval when no eligible project exists.

`McpClientIcon.tsx` maps sanitized names containing Claude, ChatGPT, Cursor, and Lovable to local Lucide or checked-in local assets; all other names receive `PlugZap`. It never accepts or renders a URL.

- [ ] **Step 5: Run the consent journey and lint.**

Run:

```bash
bun test tests/mcp-oauth-consent.test.tsx
bun run lint
```

Expected: approval, denial, error, and signed-out redirect outcomes pass; no lint errors.

- [ ] **Step 6: Commit the consent UI.**

Run:

```bash
git add src/pages/OAuthAuthorize.tsx src/components/mcp/McpClientIcon.tsx src/components/AuthGuard.tsx src/App.tsx tests/mcp-oauth-consent.test.tsx
git diff --cached --check
git commit -m "feat: add MCP OAuth consent screen"
```

---

### Task 6: Redesign `MCP & APIs` around connected OAuth clients

**Files:**

- Create: `src/components/mcp/ConnectedMcpClients.tsx`
- Create: `src/components/mcp/McpConnectInstructions.tsx`
- Create: `src/components/api-keys/RestApiKeys.tsx`
- Modify: `src/pages/ApiKeys.tsx`
- Create: `tests/mcp-settings.test.tsx`

**Page composition:**

```tsx
export default function ApiKeys() {
  const { projectId = "" } = useParams<{ projectId: string }>();
  return (
    <div>
      <PageHeader
        title="MCP & APIs"
        description="Connect AI clients with OAuth and manage server-side REST API keys."
      />
      <div className="space-y-6">
        <ConnectedMcpClients projectId={projectId} />
        <McpConnectInstructions />
        <RestApiKeys projectId={projectId} />
      </div>
    </div>
  );
}
```

- [ ] **Step 1: Write the settings-page journey tests before extracting components.**

In `tests/mcp-settings.test.tsx`, use `installHttpCapture` for both `/mcp-connections` and `/api-keys`. Protect these outcomes:

- Connected rows display client name, `read, write`, connected date, authorizer name/email, and an icon-plus-text `Revoke` action.
- Confirmed revoke sends DELETE for exactly that project/connection and keeps the row until the server succeeds. A 500 leaves the row visible and shows the server-safe error.
- Empty connections show `No MCP clients connected` and point to the instructions below.
- Tabs Claude, ChatGPT, Cursor, and Lovable reveal their current OAuth-only instructions.
- Claude shows and copies `claude mcp add --transport http linkycal <origin>/api/mcp`; every tab uses `<origin>/api/mcp`; rendered setup copy contains neither `YOUR_API_KEY` nor an MCP `Authorization` header.
- The `REST API keys` card retains create, copy-once, list, and delete journeys, and its curl example still contains `Authorization: Bearer YOUR_API_KEY` for a project REST route.

- [ ] **Step 2: Run the page tests and confirm the current API-key MCP UI fails them.**

Run:

```bash
bun test tests/mcp-settings.test.tsx
```

Expected failure: there is no connected-client query/revoke flow, no client tabs, and the current MCP block instructs users to add an API-key header.

- [ ] **Step 3: Extract the unchanged REST API-key workflow.**

Move the current API-key query, create dialog, copy-once state, key list, delete confirmation, relative time helpers, and REST curl example into `RestApiKeys.tsx`. Title the structural card `REST API keys`; place the icon-plus-text `Create API key` action in its card header. State explicitly: `These keys authenticate server-side REST API requests. MCP connections use OAuth.` Preserve existing endpoints and request bodies exactly.

- [ ] **Step 4: Build connected-client rows and revocation.**

`ConnectedMcpClients.tsx` queries:

```text
GET /api/projects/:projectId/mcp-connections
```

It renders one muted rounded row per connection with `McpClientIcon`, client name, comma-separated scopes, stable connected date, authorizer, and `Revoke`. Confirmation explains immediate loss of both access and refresh capability. DELETE uses:

```text
DELETE /api/projects/:projectId/mcp-connections/:connectionId
```

Invalidate the connection query only after success. On failure, keep the row and surface the response error. The loading button swaps `Unplug` for `Loader` while retaining `Revoking...`.

- [ ] **Step 5: Build horizontally scrollable client tabs and copy controls.**

`McpConnectInstructions.tsx` derives:

```ts
const mcpUrl = `${window.location.origin}/api/mcp`;
const claudeCommand = `claude mcp add --transport http linkycal ${mcpUrl}`;
```

Use the existing Tabs primitives. The tab list is horizontally scrollable on narrow screens. Implement these exact user flows:

- Claude: Settings → Connectors → Add custom connector → paste the MCP URL → sign in/select project; plus the Claude Code command and `/mcp` sign-in instruction.
- ChatGPT: Settings → Apps & Connectors → Advanced settings → Developer mode → Create app → paste the MCP URL → complete LinkyCal OAuth. Note that availability depends on the user's current ChatGPT workspace/plan.
- Cursor: Settings → Tools & MCP → New MCP server → choose Streamable HTTP → paste the MCP URL → complete OAuth in the browser.
- Lovable: Settings → Connectors → Personal connectors → New MCP server → paste the MCP URL → keep OAuth selected → sign in/select project.

Every copy action has icon plus text, uses an interruptible targeted transition and `active:scale-[0.96]`, and announces `Copied` visibly.

- [ ] **Step 6: Compose the page and run rendered tests.**

Run:

```bash
bun test tests/mcp-settings.test.tsx
bun run lint
```

Expected: connected, revoke success/failure, empty state, all client instructions, OAuth-only MCP copy, and unchanged REST-key journeys pass.

- [ ] **Step 7: Visually inspect desktop and narrow layouts.**

Run:

```bash
bun run dev
```

Open `/app/projects/<a paid admin project id>/api-keys` in the in-app browser. Verify the approved order, card radii, muted rows, concentric inset radii, no content-divider borders, client-tab overflow at 375px, minimum 40px targets, balanced headings, readable long commands, and correct loading/press states. Capture desktop and narrow screenshots for comparison; fix visual defects without weakening behavioral tests.

- [ ] **Step 8: Commit the page redesign.**

Run:

```bash
git add src/pages/ApiKeys.tsx src/components/mcp/ConnectedMcpClients.tsx src/components/mcp/McpConnectInstructions.tsx src/components/api-keys/RestApiKeys.tsx tests/mcp-settings.test.tsx
git diff --cached --check
git commit -m "feat: redesign MCP and REST API settings"
```

---

### Task 7: Publish the OAuth contract everywhere MCP is documented

**Files:**

- Modify: `README.md`
- Modify: `scripts/api-docs-catalog.ts`
- Modify: `scripts/generate-api-docs.ts`
- Modify: `scripts/llms-template.ts`
- Modify: `tests/api-docs-analytics.test.ts`
- Modify: `src/pages/Docs.tsx`
- Modify: `src/pages/FeaturePage.tsx`
- Modify: `src/pages/AlternativePage.tsx` when MCP authentication copy is present
- Modify: `src/lib/api-reference.ts`
- Modify: `src/lib/prompts.ts`
- Modify: matching files under `src/components/marketing/`
- Regenerate: `public/openapi.json`
- Regenerate: `public/api-endpoint-audit.json`
- Regenerate: `public/llms.txt`

- [ ] **Step 1: Turn the generated-contract test red.**

Extend `tests/api-docs-analytics.test.ts` to require:

- `PublicApiAuth` accepts `oauth`, and `/api/mcp` is cataloged as OAuth rather than API key.
- The 40 MCP tool names are sourced from `MCP_TOOL_SCOPES`, so docs cannot omit or invent a tool.
- OpenAPI defines an OAuth 2 authorization-code scheme with `/oauth/authorize`, `/oauth/token`, and `read`, `write`, `offline_access` scopes.
- `/api/mcp` uses the OAuth scheme and does not use `bearerAuth`/the REST API-key scheme.
- The endpoint audit labels MCP `OAuth`, API key `No`, session `No`.
- Generated `llms.txt` tells clients to connect to the URL and complete browser OAuth, with no MCP API-key header.
- A representative REST project route still documents `Authorization: Bearer lc_live_...`.

- [ ] **Step 2: Run the contract test and confirm stale API-key claims.**

Run:

```bash
bun test tests/api-docs-analytics.test.ts
```

Expected failure: `/api/mcp` and generated documentation still advertise API-key authentication.

- [ ] **Step 3: Make the catalog and generator model OAuth explicitly.**

Change:

```ts
export type PublicApiAuth = "anonymous" | "apiKey" | "oauth";
```

Type MCP catalog tool lists with `McpToolName` imported from `shared/mcp-tools.ts`. Mark the MCP operation `auth: "oauth"`. In the generator, add a dedicated `mcpOAuth` OpenAPI security scheme with authorization-code URLs and the three scopes. Because the OAuth provider owns `/api/mcp`, include that route from the explicit catalog rather than requiring a dead `app.all("/api/mcp")` Hono registration to satisfy source-route inventory.

- [ ] **Step 4: Update human-facing MCP copy without changing REST API-key claims.**

Run this inventory first:

```bash
rg -n -i 'mcp.{0,120}(api key|authorization)|api key.{0,120}mcp|YOUR_API_KEY|lc_live_' README.md scripts src public tests
```

Update every MCP-specific claim to the OAuth connection journey and hard cutover. Keep REST-key examples for project REST routes. Use the canonical endpoint `https://linkycal.com/api/mcp` in public docs and the current client instructions from the settings page. Do not claim that OAuth tokens authenticate general REST routes.

- [ ] **Step 5: Regenerate checked-in public artifacts and run checks.**

Run:

```bash
bun scripts/generate-api-docs.ts
bun test tests/api-docs-analytics.test.ts
bun scripts/generate-api-docs.ts --check
```

Then rerun the inventory. Any remaining match must be an intentional REST API-key claim or a test asserting the absence of API-key MCP instructions.

- [ ] **Step 6: Commit documentation and generated contracts.**

Run:

```bash
git add README.md scripts/api-docs-catalog.ts scripts/generate-api-docs.ts scripts/llms-template.ts tests/api-docs-analytics.test.ts src/pages/Docs.tsx src/pages/FeaturePage.tsx src/pages/AlternativePage.tsx src/lib/api-reference.ts src/lib/prompts.ts src/components/marketing public/openapi.json public/api-endpoint-audit.json public/llms.txt
git diff --cached --check
git commit -m "docs: publish MCP OAuth connection contract"
```

Do not stage an unchanged optional path merely because it appears in the command; review `git diff --cached --name-only` before committing.

---

### Task 8: Verify the protocol, security boundaries, migration, and UI together

**Files:**

- Modify only files required by failures discovered during verification

- [ ] **Step 1: Run the focused security suite once more.**

Run:

```bash
bun test tests/mcp-oauth-grants.test.ts tests/mcp-oauth-authorization.test.ts tests/mcp-oauth-access.test.ts tests/mcp-tool-scopes.test.ts tests/mcp-oauth-consent.test.tsx tests/mcp-settings.test.tsx tests/api-route-policy.test.ts tests/api-docs-analytics.test.ts tests/analytics-mcp.test.ts
```

Expected: all focused outcomes pass together without order dependence.

- [ ] **Step 2: Run the full repository admission checks.**

Run:

```bash
bun run db:migrate:dev
bun run cf-typegen
bun run test
bun run lint
bun run docs:check
bun run build
git diff --check
```

If the managed Bun package-script launcher reports `CouldntReadCurrentDirectory`, rerun the equivalent direct command to distinguish the known sandbox launcher issue from a repository failure, then rerun the official package script outside that restriction before claiming completion. Do not waive a real test, lint, docs, migration, or build failure.

- [ ] **Step 3: Inspect the generated migration and hard-cutover diff.**

Run:

```bash
sed -n '1,240p' worker/db/drizzle/0035_mcp_oauth_grants.sql
rg -n 'app\.all\("/api/mcp"|lc_live_|YOUR_API_KEY|Authorization' worker/mcp worker/index.ts src/components/mcp src/pages/ApiKeys.tsx public/llms.txt
git diff --stat
git status --short
```

Require cascading project/user foreign keys, nullable `revoked_at`, all three indexes, no API-key fallback at the MCP boundary, no MCP setup header, and no accidental staging/modification of the user's unrelated entitlement design file.

- [ ] **Step 4: Smoke-test discovery and the 401 challenge against the local Worker.**

Start the development Worker in one terminal:

```bash
bun run dev
```

From another terminal, request the protected resource and metadata:

```bash
curl -i http://localhost:5173/api/mcp
curl -i http://localhost:5173/.well-known/oauth-protected-resource/api/mcp
curl -i http://localhost:5173/.well-known/oauth-authorization-server
curl -i -H 'Authorization: Bearer lc_live_not_an_oauth_token' http://localhost:5173/api/mcp
```

Require both unauthenticated and API-key requests to return the same OAuth `401` Bearer challenge. Require protected-resource metadata to identify the exact MCP resource and authorization server. Require authorization-server metadata to advertise S256 PKCE, authorization/token endpoints, supported scopes, Client ID Metadata Documents, and the DCR fallback. Stop the local server after the checks.

- [ ] **Step 5: Complete a browser authorization journey locally.**

Use a paid admin test project and a locally registered OAuth test client that calls the local authorization and token endpoints directly while requesting the canonical MCP resource. Confirm sign-out returns to the full consent query after Better Auth, consent lists only eligible projects, allowing one project creates one connected-client row, read and write representative tools stay in that project, and revoke makes the next access/refresh attempt fail before the UI removes the connection. Also confirm a current project REST API key still authenticates a representative project REST route.

- [ ] **Step 6: Request a final code review and address only evidence-backed findings.**

Use `superpowers:requesting-code-review` against the approved design and this plan. Reproduce each reported issue before editing. For any test failure or unexpected protocol behavior, switch to `superpowers:systematic-debugging` before proposing a fix.

- [ ] **Step 7: Commit verification fixes, if any.**

Stage only the named files changed to resolve verified failures, then run:

```bash
git diff --cached --check
git commit -m "fix: complete MCP OAuth verification"
```

Skip this commit when verification required no source changes.

## Completion Criteria

The implementation is complete only when:

- `/api/mcp` accepts provider-issued OAuth access tokens and rejects valid LinkyCal API keys with the OAuth discovery challenge.
- Authorization uses Better Auth, validates the registered redirect, presents only eligible projects, creates one non-secret D1 connection record, and preserves separate grants for the same client/user across projects.
- Effective access-token scopes reach `ToolContext`; all 40 tools are classified; a missing required scope prevents the handler and every side effect.
- Every MCP request rechecks active connection, project administration, paid API entitlement, and present Origin before entering the Durable Object.
- Project admins can list and revoke every active connection in their project; provider invalidation precedes the D1 revoked marker.
- The consent and settings pages pass rendered behavior tests and match the approved information hierarchy at desktop and narrow widths.
- REST API keys retain their previous route behavior and are clearly separated from OAuth MCP setup.
- OpenAPI, endpoint audit, `llms.txt`, README, docs, prompts, and marketing copy agree on OAuth for MCP and API keys for REST.
- The full migration, test, lint, docs, build, protocol smoke, and diff checks pass with recorded output.
- Production KV provisioning, migration, deployment, and client reconnection remain explicitly authorized operational steps rather than hidden implementation side effects.

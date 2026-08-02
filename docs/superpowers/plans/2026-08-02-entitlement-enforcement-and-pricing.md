# Entitlement Enforcement and Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one workspace-scoped entitlement system, exact Free/Pro/Business limits, structured upgrade enforcement, team-plan inheritance, project Custom CSS, and a dedicated pricing page.

**Architecture:** A client-safe shared catalog defines every plan value. A worker `EntitlementService` resolves the project workspace, evaluates resource and feature decisions, and composes dashboard snapshots; a separate `UsageService` owns atomic period counters and idempotent reservations. Domain services remain responsible for their database writes, but every creation, integration, upload, and background path consumes the same decisions and transport-neutral errors.

**Tech Stack:** Bun, TypeScript, React 19, Hono, Cloudflare Workers, D1/Drizzle, R2, Stripe, MCP SDK, TanStack Query, Tailwind CSS v4, shadcn/ui, `css-tree`, Testing Library, Bun test.

## Global Constraints

- Implement the approved design in `docs/superpowers/specs/2026-08-02-entitlement-enforcement-and-pricing-design.md`.
- Free/Pro/Business monthly prices are `$0`/`$29`/`$99`; annual equivalents are `$0`/`$24`/`$82`, charged as `$0`/`$288`/`$984` per year.
- Projects are `1/5/20`; forms per project `3/20/unlimited`; event types per project `3/20/unlimited`; contacts per project `500/5,000/10,000`; workflows per project `1/10/unlimited`.
- Form responses per workspace period are `500/10,000/50,000`; workflow executions `250/5,000/25,000`; transactional emails `500/10,000/50,000`; combined API/MCP requests `10,000/100,000/1,000,000`; enrichments `5/50/100`.
- Storage is `500,000,000/10,000,000,000/50,000,000,000` bytes. Monthly usage and storage warn at `ceil(limit * 0.80)`, enter grace at the published limit, and block further operations at `ceil(limit * 1.10)`.
- Bookings, standard widgets, theme overrides, REST API, and MCP remain available on all plans. Bookings never fail because a downstream contact, workflow, or email quota is exhausted.
- Custom CSS and branding removal are Pro/Business. Analytics is Pro/Business with 12-/36-month access windows.
- A team workspace subscription is authoritative for every member and project API key in that workspace. Personal plan state must never override the active team plan.
- No downgrade or enforcement deletes customer data. Existing invited members retain project access; Free blocks only new invitations and member additions.
- Preserve current Stripe dunning behavior in `resolveSubscriptionPlan()`.
- Do not deploy, run remote migrations, upload widgets, change Stripe products/prices, or mutate production data.
- Use strict TDD: add one behavior test, run it red for the expected missing/broken behavior, implement the minimum production change, and run it green before refactoring.
- Tests assert returned decisions, HTTP/MCP contracts, persisted rows, authorization boundaries, and rendered user outcomes. Never assert Tailwind classes, DOM ancestry, source text, or internal call counts when a stronger observable assertion exists.
- Use Bun, function declarations for named functions/components, `import type` for type-only imports, and `apply_patch` for source edits.
- Follow LinkyCal UI rules: icon plus text on non-close buttons, squircle radii, no divider borders, explicit transition properties, tabular prices, and `prefers-reduced-motion` support.
- Stage only files named by the current task. Preserve unrelated user changes.

## Canonical interfaces

`shared/plan-catalog.ts` owns these public types and values:

```ts
export type Plan = "free" | "pro" | "business";
export type EntitlementScope = "project" | "workspace";
export type EntitlementKind = "feature" | "resource" | "metered";
export type EntitlementStatus =
  | "available"
  | "warning"
  | "grace"
  | "blocked"
  | "unavailable";

export type EntitlementKey =
  | "projects"
  | "forms"
  | "eventTypes"
  | "contacts"
  | "workflows"
  | "calendarConnections"
  | "teamMembers"
  | "formResponses"
  | "bookings"
  | "workflowExecutions"
  | "transactionalEmails"
  | "integrationRequests"
  | "enrichments"
  | "storageBytes"
  | "analytics"
  | "analyticsRetentionMonths"
  | "widgets"
  | "themeOverrides"
  | "apiAccess"
  | "mcpAccess"
  | "customCss"
  | "removeBranding";

export interface EntitlementDecision {
  key: EntitlementKey;
  kind: EntitlementKind;
  scope: EntitlementScope;
  enabled: boolean;
  allowed: boolean;
  status: EntitlementStatus;
  used: number | null;
  limit: number | null;
  hardLimit: number | null;
  periodStart: string | null;
  resetAt: string | null;
  recommendedPlan: "pro" | "business" | null;
}
```

Worker services use:

```ts
export interface WorkspaceRef {
  type: "personal" | "team";
  id: string;
  ownerUserId: string;
  teamId: string | null;
}

export interface MeteredReservationInput {
  workspace: WorkspaceRef;
  subscription: SubscriptionRow | null;
  plan: Plan;
  key:
    | "formResponses"
    | "bookings"
    | "workflowExecutions"
    | "transactionalEmails"
    | "integrationRequests"
    | "enrichments";
  amount: number;
  operationId?: string;
  allowExistingOverage?: boolean;
  now: Date;
}

export interface EntitlementErrorBody {
  error: string;
  code:
    | "plan_feature_unavailable"
    | "plan_resource_limit_reached"
    | "plan_usage_limit_reached";
  entitlement: EntitlementKey;
  scope: EntitlementScope;
  used: number | null;
  limit: number | null;
  hardLimit: number | null;
  resetAt: string | null;
  recommendedPlan: "pro" | "business" | null;
}
```

---

### Task 1: Create the shared plan catalog and pure decision evaluator

**Files:**

- Create: `shared/plan-catalog.ts`
- Create: `shared/entitlement-decision.ts`
- Create: `tests/plan-entitlement-decisions.test.ts`
- Modify: `worker/types.ts`
- Modify: `worker/lib/plan-limits.ts`

**Interfaces:**

- Produces: `PLAN_CATALOG`, `PLAN_ORDER`, `getPlanDefinition(plan)`, `evaluateEntitlement(input)`, `toLegacyPlanLimits(plan)`.
- `evaluateEntitlement()` accepts a literal plan, key, current usage, requested amount, and optional period timestamps; it performs no I/O.

- [ ] **Step 1: Write the catalog-behavior regression.**

Create a table-driven test whose literal expected decisions prove the customer contract rather than merely re-exporting constants:

```ts
test("Free allows the 500th contact and blocks the 501st", function () {
  expect(evaluateEntitlement({
    plan: "free",
    key: "contacts",
    used: 499,
    amount: 1,
  })).toMatchObject({ allowed: true, limit: 500, hardLimit: 500 });

  expect(evaluateEntitlement({
    plan: "free",
    key: "contacts",
    used: 500,
    amount: 1,
  })).toMatchObject({
    allowed: false,
    status: "blocked",
    limit: 500,
    recommendedPlan: "pro",
  });
});

test("all plans enable API, MCP, widgets, and theme overrides", function () {
  for (const plan of ["free", "pro", "business"] as const) {
    for (const key of ["apiAccess", "mcpAccess", "widgets", "themeOverrides"] as const) {
      expect(evaluateEntitlement({ plan, key })).toMatchObject({
        enabled: true,
        allowed: true,
        status: "available",
      });
    }
  }
});
```

Add cases for every finite plan limit, `null` unlimited values, 80% warnings, 100% grace, 110% blocking, Pro/Business Custom CSS, branding, analytics, and a recommendation that skips Pro when Pro would still be too small.

- [ ] **Step 2: Run the focused test and confirm RED.**

Run:

```bash
bun test tests/plan-entitlement-decisions.test.ts
```

Expected: failure because the shared modules and evaluator do not exist.

- [ ] **Step 3: Implement the catalog and evaluator.**

Use `null` for unlimited and `0` for unavailable numeric features. Put display copy, prices, feature groups, scopes, and kinds in `PLAN_CATALOG`. Implement thresholds exactly:

```ts
const warningAt = Math.ceil(limit * 0.8);
const hardLimit = definition.grace ? Math.ceil(limit * 1.1) : limit;
const allowed = used + amount <= hardLimit;
```

Status precedence is `blocked` when the next operation is denied, then `grace` when `used >= limit`, then `warning` when `used >= warningAt`, otherwise `available`. `recommendedPlan` is the first higher plan whose decision for the same `used` and `amount` is allowed.

Update `worker/types.ts` to import and re-export `Plan`; expand `PlanLimits` with the approved legacy adapter fields and replace `customWidgets` with `customCss`, `removeBranding`, retention, monthly, and storage fields. Make `worker/lib/plan-limits.ts` derive all values through `toLegacyPlanLimits()` so old routes cannot retain independent limits.

- [ ] **Step 4: Run focused and existing entitlement-dependent tests GREEN.**

Run:

```bash
bun test tests/plan-entitlement-decisions.test.ts tests/analytics-rest-api.test.ts tests/analytics-mcp.test.ts
```

Expected: all pass with the new adapter.

- [ ] **Step 5: Commit the catalog.**

```bash
git add shared/plan-catalog.ts shared/entitlement-decision.ts worker/types.ts worker/lib/plan-limits.ts tests/plan-entitlement-decisions.test.ts
git diff --cached --check
git commit -m "feat: centralize plan entitlement catalog"
```

---

### Task 2: Make workspace plan inheritance and team reads authoritative

**Files:**

- Create: `tests/team-entitlement-access.test.ts`
- Modify: `worker/lib/entitlements.ts`
- Modify: `worker/lib/team-access.ts`
- Modify: `worker/index.ts:2568-2770`
- Modify: `worker/index.ts:3300-3640`
- Modify: `src/components/Layout.tsx`
- Modify: `src/pages/Billing.tsx`

**Interfaces:**

- Produces: `resolveProjectWorkspace(db, projectId)`, `requiredProjectPermission(method, path)`, and `getTeamBillingReadContext(db, teamId, userId)`.
- `getTeamBillingReadContext()` returns `{ team, member, canManageBilling }` for every current member and `null` for outsiders.

- [ ] **Step 1: Write regressions for the two reported team failures.**

Seed a paid team, owner, regular invited member with a project viewer grant, project, and Business subscription. Assert:

```ts
expect(requiredProjectPermission("GET", "/api/projects/p1/members"))
  .toBe("project:read");
expect(requiredProjectPermission("POST", "/api/projects/p1/members"))
  .toBe("project:members");

const entitlements = await resolveProjectEntitlements(db, "p1");
expect(entitlements?.subscription.plan).toBe("business");
expect(entitlements?.workspace).toEqual({
  type: "team",
  id: "team-paid",
  ownerUserId: "owner",
  teamId: "team-paid",
});

expect(await getTeamBillingReadContext(db, "team-paid", "member"))
  .toMatchObject({ canManageBilling: false });
```

Also assert that an outsider gets `null`, owner/admin get `canManageBilling: true`, and an existing member is not denied project access after a downgrade to Free.

- [ ] **Step 2: Run the regression and confirm RED.**

```bash
bun test tests/team-entitlement-access.test.ts
```

Expected: GET members resolves to `project:members`, the billing reader helper is missing, and the workspace DTO is absent.

- [ ] **Step 3: Implement workspace resolution and method-aware permissions.**

Move `permissionForProjectRequest()` to an exported `requiredProjectPermission()` in `worker/lib/team-access.ts`. Resolve `/members` as `project:read` only for GET/HEAD; POST/PATCH/DELETE remain `project:members`.

Extend `ProjectEntitlements` with `workspace: WorkspaceRef` and the full subscription row needed for period boundaries. For a team project, always read `subscriptions.teamId`; for a legacy personal project, use `{ type: "personal", id: ownerUserId }`. Remove the middleware block that denies all non-owner access when `maxTeamMembers === 0`; the create/invite routes remain responsible for the Free creation gate.

- [ ] **Step 4: Make team billing readable and role-aware.**

Change `GET /api/teams/:teamId/billing/subscription` to use `getTeamBillingReadContext()`. Return the team plan and `canManageBilling: false` for ordinary members. Keep checkout and portal on `getTeamAdminContext()`.

In `Layout.tsx`, build the Billing link from the current project’s `teamId`. In `Billing.tsx`, hide checkout/portal mutations when `canManageBilling !== true` and render “Ask a team owner or admin to change this plan.” The page still renders plan details for an ordinary member.

- [ ] **Step 5: Run team and billing tests GREEN.**

```bash
bun test tests/team-entitlement-access.test.ts
bun run build
```

Expected: focused tests pass and TypeScript accepts the workspace-aware DTO.

- [ ] **Step 6: Commit the team fix.**

```bash
git add worker/lib/entitlements.ts worker/lib/team-access.ts worker/index.ts src/components/Layout.tsx src/pages/Billing.tsx tests/team-entitlement-access.test.ts
git diff --cached --check
git commit -m "fix: inherit paid plans across team members"
```

---

### Task 3: Add workspace usage, storage, Custom CSS, and outcome persistence

**Files:**

- Create: `tests/entitlement-persistence.test.ts`
- Modify: `worker/db/schema.ts`
- Create: `worker/db/drizzle/0035_entitlement_usage_and_css.sql`
- Modify: `worker/db/drizzle/meta/_journal.json`
- Create: `worker/db/drizzle/meta/0035_snapshot.json`

**Interfaces:**

- Produces Drizzle tables `workspaceUsagePeriods`, `workspaceUsageEvents`, `workspaceStorageTotals`, `storedObjects`, `projectCustomCss`, and `entitlementOutcomes` with row/insert types.

- [ ] **Step 1: Write migration-backed persistence regressions.**

Using `createTestDb()`, insert a team/project, one period, one event, a storage total/object, Custom CSS, and one skipped-outcome row. Assert workspace+period uniqueness, event operation-id uniqueness, object-key uniqueness, and cascade deletion from project to stored objects/CSS/outcomes. Assert `updatedAt` columns exist and byte/counter defaults are zero.

- [ ] **Step 2: Run the test and confirm RED.**

```bash
bun test tests/entitlement-persistence.test.ts
```

Expected: table exports and SQL tables do not exist.

- [ ] **Step 3: Add the six Drizzle tables.**

Use UUID text primary keys, timestamp-mode integers, `$onUpdate(() => new Date())`, cascade project and period FKs, the unique/index contracts from the design, and enum text columns for workspace type, usage state, and object category. `workspaceUsagePeriods` columns are `formResponses`, `bookings`, `workflowExecutions`, `transactionalEmails`, `integrationRequests`, and `enrichments`.

`entitlementOutcomes` contains workspace type/id, nullable project id, source type/id, entitlement key, outcome (`blocked` or `skipped`), channel, and timestamp. It never stores contact details, answers, CSS, API keys, tokens, or arbitrary request bodies. It records durable customer-visible side-effect outcomes, not every denied API/MCP request.

- [ ] **Step 4: Generate and inspect the migration.**

```bash
bun run db:generate --name entitlement_usage_and_css
```

If Drizzle selects a different next migration number because another migration landed, keep the generated number and update this task’s staged paths. Confirm SQL creates only the six intended tables/indexes and does not rebuild unrelated domain tables.

- [ ] **Step 5: Run persistence tests and local migration GREEN.**

```bash
bun test tests/entitlement-persistence.test.ts
bun run db:migrate:dev
```

- [ ] **Step 6: Commit persistence.**

```bash
git add worker/db/schema.ts worker/db/drizzle/0035_entitlement_usage_and_css.sql worker/db/drizzle/meta/_journal.json worker/db/drizzle/meta/0035_snapshot.json tests/entitlement-persistence.test.ts
git diff --cached --check
git commit -m "feat: add workspace entitlement persistence"
```

---

### Task 4: Implement atomic usage reservations and structured errors

**Files:**

- Create: `worker/services/usage-service.ts`
- Create: `worker/lib/entitlement-errors.ts`
- Create: `tests/usage-entitlements.test.ts`
- Create: `tests/legacy-usage-migration.test.ts`
- Create: `scripts/backfill-workspace-usage.ts`
- Modify: `worker/lib/usage.ts`

**Interfaces:**

```ts
export class UsageService {
  constructor(db: DrizzleD1Database<Record<string, unknown>>);
  getOrCreatePeriod(input: {
    workspace: WorkspaceRef;
    subscription: SubscriptionRow | null;
    now: Date;
  }): Promise<WorkspaceUsagePeriodRow>;
  getDecision(input: MeteredReservationInput): Promise<EntitlementDecision>;
  reserve(input: MeteredReservationInput): Promise<EntitlementDecision>;
  consume(input: MeteredReservationInput): Promise<void>;
  release(input: MeteredReservationInput): Promise<void>;
}

export function entitlementError(
  decision: EntitlementDecision,
  actionLabel: string,
): {
  status: 403 | 429;
  body: EntitlementErrorBody;
  headers: Record<string, string>;
};
```

- [ ] **Step 1: Write usage behavior regressions.**

Cover UTC Free periods, Stripe paid periods, warning/grace/hard thresholds, unlimited bookings, exactly-one atomic remaining slot, idempotent `operationId`, consume without increment, release followed by re-reserve, and form `allowExistingOverage`. Assert the concrete structured body for an exhausted workflow quota.

In `tests/legacy-usage-migration.test.ts`, seed the legacy `usage` table for a personal user and the owner of a paid team. Require the backfill to copy only the personal current-period enrichment value into `{ type: "personal", id: userId }`, never attach an owner’s personal usage to a team workspace, and remain idempotent on a second run.

- [ ] **Step 2: Run focused tests RED.**

```bash
bun test tests/usage-entitlements.test.ts
```

Expected: services do not exist.

- [ ] **Step 3: Implement period and reservation SQL.**

Use the Stripe `currentPeriodStart/currentPeriodEnd` only when both exist; otherwise use the UTC calendar month. For direct counters, use conditional `UPDATE ... WHERE current + amount <= hardLimit`. For operation IDs, perform counter mutation and event state mutation in one D1 batch/transaction so duplicate reserved/consumed events cannot increment twice. A released event may be re-reserved against the current period. Never write per-request rows for `integrationRequests`.

Keep `worker/lib/usage.ts` as a delegating compatibility adapter for enrichment until all callers move, then remove its user-scoped authority.

Implement `backfillWorkspaceUsage(db, now)` in `scripts/backfill-workspace-usage.ts` as an importable function plus a CLI entry point. It reads only the UTC current-period legacy rows, upserts the personal workspace period, copies `enrichmentsCount`, and never changes team periods. Do not run the production backfill in this task.

- [ ] **Step 4: Implement transport-neutral errors.**

Feature and resource errors return 403; metered/storage errors return 429. Preserve `error` and add `code`, `entitlement`, `scope`, `used`, `limit`, `hardLimit`, `resetAt`, and `recommendedPlan`. A metered 429 with `resetAt` returns `Retry-After` as non-negative whole seconds; storage has no reset header. Export an MCP serializer that places the same object at `structuredContent.entitlementError` with `isError: true`.

- [ ] **Step 5: Run usage tests GREEN.**

```bash
bun test tests/usage-entitlements.test.ts tests/legacy-usage-migration.test.ts
```

- [ ] **Step 6: Commit usage services.**

```bash
git add worker/services/usage-service.ts worker/lib/entitlement-errors.ts worker/lib/usage.ts scripts/backfill-workspace-usage.ts tests/usage-entitlements.test.ts tests/legacy-usage-migration.test.ts
git diff --cached --check
git commit -m "feat: add atomic workspace usage reservations"
```

---

### Task 5: Build entitlement snapshots and the reusable client hook

**Files:**

- Create: `worker/services/entitlement-service.ts`
- Create: `src/hooks/use-entitlements.ts`
- Create: `tests/project-entitlement-snapshot.test.ts`
- Modify: `worker/index.ts:3806-3831`
- Modify: `worker/types.ts`

**Interfaces:**

```ts
export class EntitlementService {
  constructor(db: DrizzleD1Database<Record<string, unknown>>);
  resolveProject(projectId: string): Promise<ResolvedEntitlements | null>;
  feature(projectId: string, key: FeatureEntitlementKey): Promise<EntitlementDecision>;
  resource(projectId: string, key: ResourceEntitlementKey, amount?: number): Promise<EntitlementDecision>;
  snapshot(projectId: string, actorUserId?: string): Promise<ProjectEntitlementSnapshot | null>;
}

export function useEntitlements(projectId: string): UseQueryResult<ProjectEntitlementSnapshot>;
```

- [ ] **Step 1: Write a snapshot regression.**

Seed a Pro team with two projects, project-level rows, and one skipped entitlement outcome. Require the snapshot to report the team workspace, Pro plan, workspace project count, project form/contact counts, enabled API/MCP/theme/widgets, enabled Custom CSS/branding/analytics, period usage, reset time, recent side-effect outcomes, and `canManageBilling: false` for a regular member. Require `null` for a missing project.

- [ ] **Step 2: Run RED.**

```bash
bun test tests/project-entitlement-snapshot.test.ts
```

- [ ] **Step 3: Implement the service and endpoint.**

Count projects/calendar connections/team members at workspace scope and forms/event types/contacts/workflows at project scope. Read period counters via `UsageService`; read storage from `workspaceStorageTotals`; include the ten newest `entitlementOutcomes` for the project without customer content. Replace the old `/entitlements` body with `{ workspace, plan, billing, access, entitlements, recentOutcomes }`, while retaining `subscription` and `planLimits` aliases for one compatibility release.

- [ ] **Step 4: Add the typed query hook.**

The hook uses query key `["projects", projectId, "entitlements"]`, throws the server `error` on failure, and is the only new UI fetcher for plan decisions.

- [ ] **Step 5: Run focused tests and build GREEN.**

```bash
bun test tests/project-entitlement-snapshot.test.ts tests/analytics-settings.test.tsx
bun run build
```

- [ ] **Step 6: Commit snapshots.**

```bash
git add worker/services/entitlement-service.ts worker/index.ts worker/types.ts src/hooks/use-entitlements.ts tests/project-entitlement-snapshot.test.ts
git diff --cached --check
git commit -m "feat: expose project entitlement snapshots"
```

---

### Task 6: Centralize static creation enforcement across dashboard, onboarding, REST, and MCP

**Files:**

- Create: `worker/lib/resource-creation.ts`
- Create: `tests/static-entitlement-enforcement.test.ts`
- Modify: `worker/index.ts`
- Modify: `worker/services/contact-service.ts`
- Modify: `worker/lib/contact-actions.ts`
- Modify: `worker/mcp/tools/contacts.ts`
- Modify: `worker/mcp/tools/event-types.ts`
- Modify: `worker/mcp/tools/forms.ts`
- Modify: `worker/mcp/tools/workflows.ts`
- Modify: `worker/lib/api-route-policy.ts`

**Interfaces:**

```ts
export async function requireResourceCapacity(input: {
  db: AppDatabase;
  projectId: string;
  key: "forms" | "eventTypes" | "contacts" | "workflows";
  amount?: number;
}): Promise<{ ok: true } | { ok: false; status: 403; body: EntitlementErrorBody }>;
```

- [ ] **Step 1: Write bypass regressions.**

Require the same structured decision at the final slot for:

- `POST /api/projects` and team-scoped project count;
- normal and onboarding default-form creation;
- REST and MCP form/event-type/contact/workflow creation;
- bulk contact import with all-or-nothing capacity;
- Free team invitations/member additions;
- calendar connection initiation and callback recheck.

Use action/service tests against the real D1 schema. For each resource, mutate the tested implementation mentally by removing the guard; the test must then create an observable extra row or return the wrong protocol result.

- [ ] **Step 2: Run RED.**

```bash
bun test tests/static-entitlement-enforcement.test.ts
```

Expected: old values, unstructured errors, onboarding/import partial behavior, and MCP-local checks fail the new contract.

- [ ] **Step 3: Implement guarded creation helpers.**

Replace direct `PLAN_LIMITS` counts with `EntitlementService.resource()`. The final insert uses a transaction or conditional `INSERT ... SELECT ... WHERE count < limit`; a separate frontend/preflight count is not authoritative. A duplicate contact update does not consume capacity.

Bulk import first validates rows, deduplicates input/existing contacts, calculates required new rows, and rejects the complete import when `required > remaining`; no contacts are written on rejection.

- [ ] **Step 4: Apply the guard to every named path.**

Update project, form, event-type, contact/import, workflow, team invite/member, and calendar connect/callback handlers. Replace MCP-specific limit text with `mcpEntitlementError()`. Add Custom CSS routes to the route catalog in Task 10, not here.

Public booking/form automatic contact creation is deliberately excluded from hard failure here and is handled in Task 8.

- [ ] **Step 5: Run static and existing journey tests GREEN.**

```bash
bun test tests/static-entitlement-enforcement.test.ts tests/critical/contact-pipeline.test.ts tests/critical/workflow-journeys.test.ts
```

- [ ] **Step 6: Commit static enforcement.**

```bash
git add worker/lib/resource-creation.ts worker/index.ts worker/services/contact-service.ts worker/lib/contact-actions.ts worker/mcp/tools/contacts.ts worker/mcp/tools/event-types.ts worker/mcp/tools/forms.ts worker/mcp/tools/workflows.ts worker/lib/api-route-policy.ts tests/static-entitlement-enforcement.test.ts
git diff --cached --check
git commit -m "feat: enforce static plan capacity everywhere"
```

---

### Task 7: Enforce API/MCP, enrichment, workflow, and email usage

**Files:**

- Create: `tests/metered-channel-enforcement.test.ts`
- Modify: `worker/index.ts`
- Modify: `worker/mcp/agent.ts`
- Modify: `worker/mcp/helpers.ts`
- Modify: `worker/lib/workflow-dispatch.ts`
- Modify: `worker/services/workflow-execution-service.ts`
- Modify: `worker/services/email-service.ts`
- Modify: `worker/lib/booking-actions.ts`
- Modify: `worker/lib/form-response-notification.ts`

**Interfaces:**

- API-key middleware reserves `integrationRequests` once after authentication and route resolution.
- MCP `ToolContext` exposes `reserveToolUsage(toolName): Promise<ToolResult | null>` and every registered tool invokes it through one wrapper.
- `dispatchWorkflowTrigger()` records `workflow_execution_skipped` rather than queueing when exhausted.
- `EmailService` receives an optional `meteredSend` dependency that reserves one message per recipient using a stable source/recipient operation id.
- Skipped workflow/email side effects insert a content-free `entitlementOutcomes` row linked to the source id.

- [ ] **Step 1: Write channel regressions.**

Assert Free API and MCP both work below 10,000, share one counter, return HTTP 429/MCP structured errors at 11,000, and exclude dashboard auth, public traffic, CORS, health, MCP initialize, and `tools/list`. A known MCP tool with invalid arguments counts; an unknown tool does not.

Assert a duplicate workflow run id consumes once, an exhausted trigger creates a visible skipped outcome without queueing, an email provider rejection releases its reservation, provider acceptance consumes it, and a retry with the same operation id does not double count.

- [ ] **Step 2: Run RED.**

```bash
bun test tests/metered-channel-enforcement.test.ts
```

- [ ] **Step 3: Add one API and one MCP reservation boundary.**

Reserve REST quota in API-key middleware, never inside each domain route. Wrap MCP tool handlers centrally in `worker/mcp/helpers.ts` so the upcoming OAuth transport can keep the same quota behavior. Do not count protocol initialization/discovery.

- [ ] **Step 4: Gate workflow dispatch and transactional email.**

Generate the workflow run id before reserving, reserve with that operation id, then create/queue the run. Release only if queue acceptance fails. Add deterministic email operation ids (`bookingId:template:recipient`, `formResponseId:notification:recipient`, or `workflowRunId:stepId:recipient`) and reserve immediately before Resend.

When email is exhausted, persist the source operation and a durable `entitlementOutcomes` row. Never roll back a booking/form response because email was skipped.

- [ ] **Step 5: Replace enrichment’s user counter.**

Resolve the project workspace, reserve `enrichments` with an enrichment-job UUID, and release if no result is persisted. Delete direct authority from `getEnrichmentUsage()`/`incrementEnrichmentUsage()` callers.

- [ ] **Step 6: Run metered and delivery tests GREEN.**

```bash
bun test tests/metered-channel-enforcement.test.ts tests/critical/booking-delivery.test.ts tests/critical/workflow-journeys.test.ts tests/analytics-mcp.test.ts
```

- [ ] **Step 7: Commit metered channels.**

```bash
git add worker/index.ts worker/mcp/agent.ts worker/mcp/helpers.ts worker/lib/workflow-dispatch.ts worker/services/workflow-execution-service.ts worker/services/email-service.ts worker/lib/booking-actions.ts worker/lib/form-response-notification.ts tests/metered-channel-enforcement.test.ts
git diff --cached --check
git commit -m "feat: enforce metered integration and automation usage"
```

---

### Task 8: Protect public conversions and meter completed form responses/bookings

**Files:**

- Create: `tests/critical/entitlement-conversion-safety.test.ts`
- Modify: `worker/lib/public-form-actions.ts`
- Modify: `worker/lib/booking-actions.ts`
- Modify: `worker/lib/contact-actions.ts`
- Modify: `worker/services/form-service.ts`
- Modify: `worker/services/booking-service.ts`
- Modify: `worker/index.ts:1322-2030`

**Interfaces:**

- Public form start returns a neutral 429 only when `formResponses` is at the grace ceiling.
- Form completion reserves with `operationId: responseId` and `allowExistingOverage: true`.
- Booking persistence increments observational usage exactly once with `operationId: bookingId` and has no limit decision.
- Automatic contact creation returns `{ contact, skippedReason }` so source actions can preserve responses/bookings.

- [ ] **Step 1: Write conversion-safety regressions.**

Assert:

- a new form cannot start at 550/11,000/55,000 completed responses;
- an existing in-progress response completes beyond the ceiling and counts once;
- abandoned/in-progress responses do not count;
- deleting a completed response does not reduce monthly usage;
- a booking always persists when contact, workflow, or email is exhausted;
- a form response always persists when only contact/workflow/email is exhausted;
- a matched existing contact still updates at the contact cap;
- a new automatic contact is skipped at cap and the booking/response retains name/email;
- booking form answers do not increment form-response usage.

- [ ] **Step 2: Run RED.**

```bash
bun test tests/critical/entitlement-conversion-safety.test.ts
```

- [ ] **Step 3: Gate response starts and complete idempotently.**

Resolve the form’s project before creating an in-progress response. At the hard ceiling return `{ error: "This form is temporarily unavailable", code: "plan_usage_limit_reached" }` without billing details. On the first `in_progress -> completed` transition, reserve/count with the response id; a repeated completion returns the existing row without another counter mutation.

- [ ] **Step 4: Make automatic side effects non-fatal.**

Change `ensureContact()` to accept an enforcement mode. Manual/API/MCP stays hard; `public_form` and `booking` skip only new contact creation. Persist content-free `entitlementOutcomes` rows for `contact_creation_skipped`, `workflow_execution_skipped`, and `transactional_email_skipped` with the source id and entitlement key, excluding person fields from records and logs.

- [ ] **Step 5: Count bookings on first persistence.**

Increment `bookings` in the same D1 batch that first inserts the unique booking id. Never read a booking limit because the catalog value is unlimited.

- [ ] **Step 6: Run critical journeys GREEN.**

```bash
bun test tests/critical/entitlement-conversion-safety.test.ts tests/critical/booking-delivery.test.ts tests/critical/form-experience.test.tsx
```

- [ ] **Step 7: Commit public conversion safety.**

```bash
git add worker/lib/public-form-actions.ts worker/lib/booking-actions.ts worker/lib/contact-actions.ts worker/services/form-service.ts worker/services/booking-service.ts worker/index.ts tests/critical/entitlement-conversion-safety.test.ts
git diff --cached --check
git commit -m "feat: preserve conversions under plan limits"
```

---

### Task 9: Track and enforce R2 storage bytes

**Files:**

- Create: `worker/services/storage-usage-service.ts`
- Create: `worker/lib/storage-reconciliation.ts`
- Create: `tests/storage-entitlements.test.ts`
- Modify: `worker/index.ts:3940-4065`

**Interfaces:**

```ts
export class StorageUsageService {
  constructor(db: AppDatabase);
  reserve(input: { workspace: WorkspaceRef; plan: Plan; objectKey: string; sizeBytes: number }): Promise<EntitlementDecision>;
  commit(input: { workspace: WorkspaceRef; projectId: string; objectKey: string; category: StoredObjectCategory; sizeBytes: number }): Promise<void>;
  releaseFailed(workspace: WorkspaceRef, objectKey: string): Promise<void>;
  remove(workspace: WorkspaceRef, objectKey: string): Promise<void>;
  reconcile(workspace: WorkspaceRef, objects: Array<{ key: string; size: number }>): Promise<StorageReconciliation>;
}
```

- [ ] **Step 1: Write storage regressions.**

Assert exact decimal plan bytes, +10% ceiling, atomic final-byte behavior, overwrite positive/negative deltas, failed put release, deletion release, avatar exclusion, and reconciliation of missing/stale/mismatched metadata. Use a fake R2 bucket with `projects/{projectId}/...` and `form-responses/{projectId}/...` keys and require the backfill to exclude avatars/widgets and end with the exact object sum.

- [ ] **Step 2: Run RED.**

```bash
bun test tests/storage-entitlements.test.ts
```

- [ ] **Step 3: Implement storage reservations.**

Use `workspaceStorageTotals` for conditional positive-delta reservations. On a smaller overwrite, release only after R2 and metadata succeed. If R2 succeeds but metadata fails, keep the reservation for reconciliation. Categories are `project_asset`, `form_asset`, and `response_upload`; account avatars and widget bundles are not inserted.

- [ ] **Step 4: Integrate project upload/delete paths.**

Buffer/inspect `File.size` before `R2.put`, resolve the project workspace, reserve, put, and commit. Serialize structured storage errors. Keep account avatar behavior unchanged.

Implement `reconcileProjectStorage(db, bucket, projectId)` in `worker/lib/storage-reconciliation.ts`. It resolves the workspace, fully paginates both customer-owned project prefixes, upserts their metadata, deletes stale metadata for that project only after both listings complete, and sets the workspace total to the sum of all its stored-object rows. Expose `POST /api/internal/entitlements/storage/reconcile/:projectId`, require `Authorization: Bearer ${CRON_SECRET}`, and return `{ objectCount, sizeBytes, matched }`. Do not call this route against production in this task. Keep `storageBytes` in per-key observe mode until each production project reports `matched: true`.

- [ ] **Step 5: Run GREEN.**

```bash
bun test tests/storage-entitlements.test.ts
```

- [ ] **Step 6: Commit storage enforcement.**

```bash
git add worker/services/storage-usage-service.ts worker/lib/storage-reconciliation.ts worker/index.ts tests/storage-entitlements.test.ts
git diff --cached --check
git commit -m "feat: enforce workspace storage capacity"
```

---

### Task 10: Replace Custom widgets with validated project Custom CSS

**Files:**

- Modify: `package.json`
- Modify: `bun.lock`
- Create: `worker/services/custom-css-service.ts`
- Create: `tests/custom-css-entitlements.test.ts`
- Modify: `worker/validation.ts`
- Modify: `worker/index.ts`
- Modify: `worker/lib/api-route-policy.ts`
- Modify: `worker/lib/public-form-actions.ts`
- Modify: `worker/lib/public-event-type-actions.ts`
- Modify: `src/pages/Settings.tsx`
- Modify: `src/pages/PublicForm.tsx`
- Modify: `src/pages/PublicBooking.tsx`

**Interfaces:**

```ts
export class CustomCssService {
  constructor(db: AppDatabase);
  compile(projectId: string, sourceCss: string): { compiledCss: string; sourceBytes: number };
  getForSettings(projectId: string): Promise<ProjectCustomCssRow | null>;
  getPublished(projectId: string, plan: Plan): Promise<string | null>;
  save(projectId: string, sourceCss: string, updatedByUserId: string): Promise<ProjectCustomCssRow>;
  remove(projectId: string): Promise<boolean>;
}
```

- [ ] **Step 1: Write parser, entitlement, and downgrade regressions.**

Use real `css-tree` parsing. Require rejection of malformed CSS, UTF-8 source over 20 KB, every `url()`, and every at-rule except media/supports/container/layer/keyframes. Assert `html`, `body`, `:root`, normal selectors, and animation names compile under `[data-linkycal-public]`. Assert Free cannot save or publish; Pro/Business can; downgrade retains source but `getPublished()` returns null and branding returns.

Add a Settings component test that Free renders a locked Custom CSS card without a PUT, while Pro saves valid CSS and surfaces a server validation message.

- [ ] **Step 2: Run RED.**

```bash
bun test tests/custom-css-entitlements.test.ts
```

- [ ] **Step 3: Add and use the parser dependency.**

```bash
bun add css-tree
bun add --dev @types/css-tree
```

Walk the AST rather than using regular expressions. Reject all `Url` nodes and unknown at-rules, prefix selectors, rewrite document roots, namespace keyframes with a stable project-id prefix, and generate compiled CSS.

- [ ] **Step 4: Add settings routes and UI.**

Add GET/PUT/DELETE `/api/projects/:projectId/custom-css`, project settings permissions, API route classification, a 20 KB Zod input bound, and structured Free feature errors. Settings uses `useEntitlements()`, a card-style editor, save/reset buttons with icons, validation feedback, and form/booking previews.

- [ ] **Step 5: Publish only compiled entitled CSS.**

Add `data-linkycal-public` to both public roots. Public load actions include `compiledCss` only when `customCss` is enabled. Inject a style element from server-compiled text; never expose `sourceCss`. Compute `canHideBranding` from `removeBranding`, not direct plan-name comparisons.

- [ ] **Step 6: Run focused UI/server tests and build GREEN.**

```bash
bun test tests/custom-css-entitlements.test.ts tests/analytics-settings.test.tsx
bun run build
```

- [ ] **Step 7: Commit Custom CSS.**

```bash
git add package.json bun.lock worker/services/custom-css-service.ts worker/validation.ts worker/index.ts worker/lib/api-route-policy.ts worker/lib/public-form-actions.ts worker/lib/public-event-type-actions.ts src/pages/Settings.tsx src/pages/PublicForm.tsx src/pages/PublicBooking.tsx tests/custom-css-entitlements.test.ts
git diff --cached --check
git commit -m "feat: add paid project custom CSS"
```

---

### Task 11: Build the dedicated pricing page and structured upgrade UI

**Files:**

- Create: `src/pages/Pricing.tsx`
- Create: `src/components/PlanComparison.tsx`
- Create: `src/components/UsageMeter.tsx`
- Create: `src/lib/entitlement-errors.ts`
- Create: `src/hooks/use-plan-limit-dialog.ts`
- Create: `tests/pricing-page.test.tsx`
- Create: `tests/upgrade-dialog.test.tsx`
- Create: `tests/plan-limit-ui.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/PricingCards.tsx`
- Modify: `src/components/UpgradeDialog.tsx`
- Modify: `src/components/marketing/MarketingSections.tsx`
- Modify: `src/components/marketing/MarketingNav.tsx`
- Modify: `src/components/marketing/MarketingFooter.tsx`
- Modify: `src/lib/constants.ts`
- Modify: `src/pages/Onboarding.tsx`
- Modify: `src/pages/Billing.tsx`
- Modify: `src/pages/Forms.tsx`
- Modify: `src/pages/EventTypes.tsx`
- Modify: `src/pages/EventTypeForm.tsx`
- Modify: `src/pages/Contacts.tsx`
- Modify: `src/pages/ContactDetail.tsx`
- Modify: `src/pages/Workflows.tsx`
- Modify: `src/pages/Settings.tsx`
- Modify: `src/pages/Team.tsx`
- Modify: `src/index.css`

**Interfaces:**

- All plan UI consumes `PLAN_CATALOG`; `src/lib/constants.ts` may re-export catalog-derived view models for one compatibility release but defines no values.
- `UpgradeDialog` accepts `{ decision: EntitlementDecision; actionLabel: string; projectId: string }` instead of a free-form description.
- `parseEntitlementError(response)` returns a typed `EntitlementErrorBody | null`; `usePlanLimitDialog(projectId)` owns the current decision and exposes `handleError(error, actionLabel)` plus dialog props.

- [ ] **Step 1: Write rendered customer-contract tests.**

Render `/pricing` monthly and annual modes. Assert visible prices/annual totals, exact approved limits, unlimited bookings, API/MCP/theme/widgets on all plans, Custom CSS/branding on Pro/Business, and no “custom widgets”, “unlimited contacts”, or invented priority/dedicated support. Switch to a mobile viewport and require each plan’s feature group to remain independently labeled rather than a squeezed unlabeled grid.

Render `UpgradeDialog` for warning, grace, blocked, non-admin, and Business-no-higher-plan decisions. Assert usage/limit/reset guidance and that checkout is available only to owner/admin.

In `tests/plan-limit-ui.test.tsx`, submit one representative static mutation (create form), one metered mutation (enrich contact), and one feature mutation (save Custom CSS on Free). Return structured server denials and require the visible dialog to name the stopped action, usage/limit/reset or required plan, and member-role guidance. Assert ordinary validation errors remain inline and do not open a plan dialog.

- [ ] **Step 2: Run RED.**

```bash
bun test tests/pricing-page.test.tsx tests/upgrade-dialog.test.tsx tests/plan-limit-ui.test.tsx
```

- [ ] **Step 3: Create `/pricing` from the catalog.**

Build plan cards, monthly/annual toggle, grouped Capacity/Automation/Integrations/Customization/Collaboration & analytics comparison, and FAQs from catalog data. Use a desktop comparison grid and stacked mobile groups, soft section surfaces instead of divider borders, tabular prices, the existing forest-green glow, explicit transitions, and reduced-motion handling. Every CTA has a Lucide icon plus text.

Use `SEOHead` for title, description, and canonical `/pricing`. Signed-out CTAs route to auth/onboarding. Signed-in billing behavior remains in `Billing.tsx` and is role-aware.

- [ ] **Step 4: Remove duplicated marketing/onboarding/billing values.**

Replace local plan arrays in PricingCards, marketing, onboarding, billing, and constants with catalog selectors. Homepage pricing becomes compact and links to `/pricing`. Navigation/footer receive a Pricing link.

- [ ] **Step 5: Upgrade the dialog and usage surfaces.**

Render current usage, published limit, grace ceiling, and reset. At 80% show warning copy; at 100% state that grace is active, not blocked; at hard ceiling state the action stopped. If `recommendedPlan` is null, offer reset/reduce-usage guidance. Non-admin members see owner/admin guidance and no enabled checkout action.

Implement one response parser and dialog hook, then use it in create/project onboarding, Forms, Event Types/Event Type calendar connection, Contacts/import/enrichment, Workflows, Settings uploads/calendar/analytics/Custom CSS, and Team invitation/member mutations. The hook opens only for the three stable plan error codes. Keep each page’s existing non-plan error rendering unchanged. Replace current free-form `UpgradeDialog` call sites in Analytics, EventTypeForm, and Settings with catalog decisions from `useEntitlements()`.

- [ ] **Step 6: Run UI tests and build GREEN.**

```bash
bun test tests/pricing-page.test.tsx tests/upgrade-dialog.test.tsx tests/plan-limit-ui.test.tsx tests/analytics-settings.test.tsx
bun run build
```

- [ ] **Step 7: Commit pricing and upgrade UX.**

```bash
git add src/App.tsx src/pages/Pricing.tsx src/components/PlanComparison.tsx src/components/UsageMeter.tsx src/components/PricingCards.tsx src/components/UpgradeDialog.tsx src/components/marketing/MarketingSections.tsx src/components/marketing/MarketingNav.tsx src/components/marketing/MarketingFooter.tsx src/lib/constants.ts src/lib/entitlement-errors.ts src/hooks/use-plan-limit-dialog.ts src/pages/Onboarding.tsx src/pages/Billing.tsx src/pages/Forms.tsx src/pages/EventTypes.tsx src/pages/EventTypeForm.tsx src/pages/Contacts.tsx src/pages/ContactDetail.tsx src/pages/Workflows.tsx src/pages/Settings.tsx src/pages/Team.tsx src/index.css tests/pricing-page.test.tsx tests/upgrade-dialog.test.tsx tests/plan-limit-ui.test.tsx
git diff --cached --check
git commit -m "feat: add pricing and plan limit experience"
```

---

### Task 12: Enforce analytics retention, expose usage, and finish rollout/docs

**Files:**

- Create: `tests/analytics-retention-entitlements.test.ts`
- Create: `tests/entitlement-rollout.test.ts`
- Create: `worker/lib/entitlement-mode.ts`
- Modify: `worker/lib/analytics-actions.ts`
- Modify: `worker/services/analytics-service.ts`
- Modify: `src/pages/Analytics.tsx`
- Modify: `src/pages/Billing.tsx`
- Modify: `worker/types.ts`
- Modify: `wrangler.jsonc`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `scripts/api-docs-catalog.ts`
- Modify: `scripts/llms-template.ts`
- Modify: `public/openapi.json` through `bun run docs:generate`
- Modify: `docs/api-endpoint-audit.md` through `bun run docs:generate`
- Modify: `public/llms.txt` through `bun run docs:generate`

**Interfaces:**

- `ENTITLEMENT_ENFORCEMENT_MODE` accepts `observe` or `enforce`; tests pass it explicitly and local default is `enforce`.
- `ENTITLEMENT_OBSERVE_KEYS` is an optional comma-separated `EntitlementKey` list that overrides individual keys to observe-only while the global mode remains `enforce`.
- Analytics action helpers clamp start dates to `now - retentionMonths` for Pro/Business and return `plan_feature_unavailable` on Free.

- [ ] **Step 1: Write analytics and usage-display regressions.**

Assert Free analytics actions return the structured feature error, Pro cannot query older than 12 months, Business cannot query older than 36 months, and neither path deletes source records. Render Billing as owner and ordinary member; both see effective workspace plan/usage/reset, while only owner sees billing controls.

In `tests/entitlement-rollout.test.ts`, require global observe to allow/log a denied key, global enforce to block it, and `ENTITLEMENT_OBSERVE_KEYS=storageBytes,transactionalEmails` to allow only those two while contacts/workflow executions remain enforced. Reject unknown override keys at configuration parsing.

- [ ] **Step 2: Run RED.**

```bash
bun test tests/analytics-retention-entitlements.test.ts tests/entitlement-rollout.test.ts
```

- [ ] **Step 3: Enforce retention and add usage cards.**

Apply retention in shared analytics action/service boundaries so REST, MCP, and dashboard queries agree. Use `UsageMeter` groups on Billing for Capacity, Automation, Integrations, and Storage. The member view is read-only.

- [ ] **Step 4: Add rollout mode and structured logging.**

Implement `resolveEnforcementMode(env, key)` in `worker/lib/entitlement-mode.ts`. In global `observe`, services compute/log the exact decision but allow the operation. In `enforce`, they return the denial unless the key appears in the validated observe-key set. Logs contain workspace type/id, project id, plan, key, status, used/limit/hard limit, channel, and request/run id; never answers, contact fields, CSS, API keys, or tokens. Bookings remain exempt in both modes. Configure local/global mode as `enforce` and `storageBytes` as observe-only until the production R2 reconciliation described in Task 9 is run and verified.

- [ ] **Step 5: Update contributor and customer documentation.**

Replace the old AGENTS/README plan table with the exact approved catalog. Update API/MCP docs to state all-plan access and shared monthly quotas, document structured 403/429/MCP errors, and describe Custom CSS instead of Custom widgets. Run:

```bash
bun run docs:generate
bun run docs:check
```

- [ ] **Step 6: Run the full admission suite.**

```bash
bun test
bun run lint
bun run build
bun run widget:build
git diff --check
```

Expected: zero test failures, zero lint errors, successful TypeScript/Vite/Worker/widget builds, and no whitespace errors.

- [ ] **Step 7: Commit rollout and documentation.**

```bash
git add worker/lib/analytics-actions.ts worker/lib/entitlement-mode.ts worker/services/analytics-service.ts src/pages/Analytics.tsx src/pages/Billing.tsx worker/types.ts wrangler.jsonc README.md AGENTS.md scripts/api-docs-catalog.ts scripts/llms-template.ts public/openapi.json docs/api-endpoint-audit.md public/llms.txt tests/analytics-retention-entitlements.test.ts tests/entitlement-rollout.test.ts
git diff --cached --check
git commit -m "feat: complete entitlement enforcement rollout"
```

---

## Final verification and review

- [ ] Confirm `git status --short` contains no unexpected staged files and preserves unrelated user changes.
- [ ] Re-run `bun test`, `bun run lint`, `bun run build`, `bun run widget:build`, `bun run docs:check`, and `git diff --check` with fresh output.
- [ ] Exercise the mutation checklist: wrong plan, wrong workspace, off-by-one at published/hard limits, duplicate operation id, missing backend guard, non-admin billing mutation, contact-cap public conversion, CSS URL escape, and stale storage metadata must each be caught by a named test.
- [ ] Use `superpowers:requesting-code-review` for the complete diff.
- [ ] Address review feedback with `superpowers:receiving-code-review` and rerun the relevant red/green regression plus the full verification suite.
- [ ] Use `superpowers:finishing-a-development-branch` to offer merge/push/cleanup choices. Do not deploy without explicit approval.

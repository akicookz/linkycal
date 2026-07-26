# PostHog Product Activity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a project connect PostHog securely, preview an exact contact match, and run a verifiable Get Product Activity workflow step whose normalized output is available to conditions, AI Research, and later actions.

**Architecture:** Store project-scoped external connections with AES-GCM encrypted credentials. Keep PostHog HTTP/query logic in a provider service, reuse that service from preview and queued execution, and expose normalized source-step results through `context.data.<resultKey>`. UI verification shows the identifier, period, exact metrics, and a PostHog deep link without persisting raw event properties.

**Tech Stack:** Bun, TypeScript, React 19, TanStack Query, Hono, Cloudflare Workers/Queues, D1/Drizzle, Web Crypto, PostHog REST/query API, Zod, bun:test.

## Dependencies

Complete `docs/superpowers/plans/2026-07-26-ai-research-background-foundation.md` first. This plan consumes hydrated contact context, queued phase/retry metadata, and the enhanced Runs UI.

## Global Constraints

- Use Bun commands only.
- Generate Drizzle migrations with `bun run db:generate`; never hand-write migration SQL.
- Use one service class per backend domain.
- Keep all request Zod schemas in `worker/validation.ts`.
- Use function declarations for named functions and React components.
- Use `import type` for type-only imports.
- External credential routes are session-only and project-scoped.
- Credentials are never returned, logged, copied into step config, or stored in run context.
- PostHog matching is exact email or exact distinct ID only.
- No match completes with `found: false`; multiple matches fail.
- Raw event properties, URLs, autocapture payloads, and replays are never stored.
- Lookback is limited to 7, 30, or 90 days.
- Recent activity and event aggregates are bounded to ten items.
- All buttons use icon plus text, except allowed dialog Cancel/Close actions.
- Toggles use the required card-style row.
- Do not add content-divider borders.

---

## File Structure

### New files

- `worker/lib/credential-crypto.ts` — versioned AES-GCM credential envelopes.
- `worker/lib/product-activity.ts` — PostHog step config, normalized result, evidence, and key helpers.
- `worker/services/external-connection-service.ts` — connection CRUD, project scoping, encrypted credential access, and reference checks.
- `worker/services/posthog-activity-service.ts` — PostHog verification, event definitions, exact matching, bounded queries, and normalization.
- `worker/services/workflow-step-preview-service.ts` — mutation-free sample-context previews.
- `src/lib/external-data.ts` — frontend connection, product-activity, evidence, and preview types.
- `src/components/ExternalConnectionsSettings.tsx` — Settings list and PostHog connection drawer.
- `src/components/GetProductActivityStepEditor.tsx` — step configuration and preview controls.
- `src/components/StepPreviewPanel.tsx` — reusable matched/not-found/error/JSON preview presentation.
- `tests/worker/credential-crypto.test.ts`
- `tests/worker/external-connection-service.test.ts`
- `tests/worker/posthog-activity-service.test.ts`
- `tests/worker/workflow-product-activity.test.ts`
- `tests/worker/workflow-step-preview.test.ts`
- `tests/external-connections-settings.test.tsx`
- `tests/product-activity-step-editor.test.tsx`

### Modified files

- `worker/db/schema.ts` and generated migration files under `worker/db/drizzle`
- `worker/validation.ts`
- `worker/lib/api-route-policy.ts`
- `worker/lib/workflow-runtime.ts`
- `worker/services/workflow-service.ts`
- `worker/services/workflow-execution-service.ts`
- `worker/index.ts`
- `src/pages/Settings.tsx`
- `src/pages/WorkflowBuilder.tsx`
- `src/components/WorkflowInputsEditor.tsx`
- `src/components/WorkflowStepLog.tsx`
- `src/lib/workflow-variables.ts`
- `src/lib/workflow-templates.ts`
- `tests/worker/api-route-policy.test.ts`

---

### Task 1: Add encrypted external-connection storage

**Files:**

- Modify: `worker/db/schema.ts`
- Generate: `worker/db/drizzle/0033_*.sql` and metadata
- Create: `worker/lib/credential-crypto.ts`
- Create: `tests/worker/credential-crypto.test.ts`

**Interfaces:**

- Produces table/type: `externalConnections`, `ExternalConnectionRow`, `NewExternalConnectionRow`
- Produces: `encryptCredentialJson(value, encryptionKey): Promise<string>`
- Produces: `decryptCredentialJson<T>(envelope, encryptionKey): Promise<T>`

- [ ] **Step 1: Write failing credential-crypto tests**

```ts
import { describe, expect, test } from "bun:test";
import {
  decryptCredentialJson,
  encryptCredentialJson,
} from "../../worker/lib/credential-crypto";

describe("credential crypto", () => {
  test("round trips a versioned AES-GCM envelope", async () => {
    const encrypted = await encryptCredentialJson(
      { apiKey: "phx_secret" },
      "test-encryption-key",
    );
    expect(encrypted).not.toContain("phx_secret");
    expect(JSON.parse(encrypted)).toMatchObject({ version: 1 });
    await expect(
      decryptCredentialJson(encrypted, "test-encryption-key"),
    ).resolves.toEqual({ apiKey: "phx_secret" });
  });

  test("rejects a wrong key and malformed envelope", async () => {
    const encrypted = await encryptCredentialJson(
      { apiKey: "secret" },
      "right-key",
    );
    await expect(
      decryptCredentialJson(encrypted, "wrong-key"),
    ).rejects.toThrow("Unable to decrypt external connection credentials");
    await expect(
      decryptCredentialJson("{}", "right-key"),
    ).rejects.toThrow("Invalid credential envelope");
  });
});
```

- [ ] **Step 2: Run the test and verify the module is missing**

```bash
bun test tests/worker/credential-crypto.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the versioned envelope**

Use Web Crypto only:

```ts
interface CredentialEnvelopeV1 {
  version: 1;
  iv: string;
  ciphertext: string;
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
```

Use a random 12-byte IV. Encode bytes with local base64 helpers that work in a
Worker (`btoa`/`atob` over byte chunks). Parse/decrypt errors must return the
fixed messages asserted above and must not include ciphertext or plaintext.

- [ ] **Step 4: Add the Drizzle table**

Place the table near calendar connections:

```ts
export const externalConnections = sqliteTable(
  "external_connections",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    provider: text("provider", { enum: ["posthog", "http"] }).notNull(),
    baseUrl: text("base_url").notNull(),
    publicConfig: text("public_config", { mode: "json" }).notNull(),
    encryptedCredentials: text("encrypted_credentials").notNull(),
    lastVerifiedAt: integer("last_verified_at", { mode: "timestamp" }),
    lastVerificationError: text("last_verification_error"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`)
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("external_connections_project_id_idx").on(t.projectId),
    uniqueIndex("external_connections_project_name_idx").on(
      t.projectId,
      t.name,
    ),
  ],
);
```

Export row types and add the table to the exported `schema` object.

- [ ] **Step 5: Generate and apply the migration**

```bash
bun run db:generate
bun run db:migrate:dev
```

Expected: a generated migration creates `external_connections` and both
indexes.

- [ ] **Step 6: Run tests/build and commit**

```bash
bun test tests/worker/credential-crypto.test.ts
bun run build
git add worker/db/schema.ts worker/db/drizzle worker/lib/credential-crypto.ts tests/worker/credential-crypto.test.ts
git commit -m "feat(integrations): add encrypted external connections"
```

---

### Task 2: Implement project-scoped connection CRUD

**Files:**

- Create: `worker/services/external-connection-service.ts`
- Create: `tests/worker/external-connection-service.test.ts`
- Modify: `worker/validation.ts`
- Modify: `worker/lib/api-route-policy.ts`
- Modify: `worker/index.ts`
- Modify: `tests/worker/api-route-policy.test.ts`

**Interfaces:**

- Produces: `ExternalConnectionService`
- Produces: `ExternalConnectionView` with no credential field
- Produces routes under `/api/projects/:projectId/external-connections`

- [ ] **Step 1: Add validation schemas**

```ts
const posthogHostSchema = z.string().url().max(2048).superRefine(
  (value, ctx) => {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      ctx.addIssue({
        code: "custom",
        message: "PostHog host must be an HTTPS origin",
      });
    }
  },
);

export const createPostHogConnectionSchema = z.object({
  provider: z.literal("posthog"),
  name: z.string().trim().min(1).max(100),
  baseUrl: posthogHostSchema,
  projectId: z.string().trim().min(1).max(100),
  apiKey: z.string().trim().min(1).max(1000),
});

export const updatePostHogConnectionSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  baseUrl: posthogHostSchema.optional(),
  projectId: z.string().trim().min(1).max(100).optional(),
  apiKey: z.string().trim().min(1).max(1000).optional(),
});

export type CreatePostHogConnectionInput = z.infer<
  typeof createPostHogConnectionSchema
>;
export type UpdatePostHogConnectionInput = z.infer<
  typeof updatePostHogConnectionSchema
>;
```

- [ ] **Step 2: Write failing service tests**

Cover:

```ts
test("lists only safe metadata in the owning project", async () => {
  const service = new ExternalConnectionService(db, "encryption");
  const created = await service.createPostHog("proj-a", input);
  expect(created).toEqual(expect.objectContaining({
    projectId: "proj-a",
    provider: "posthog",
    credentialLabel: "••••" + input.apiKey.slice(-4),
  }));
  expect(JSON.stringify(created)).not.toContain(input.apiKey);
  expect(await service.list("proj-b")).toEqual([]);
});

test("returns reference count and requires force to delete", async () => {
  await expect(service.delete("proj-a", connectionId, false)).rejects.toMatchObject({
    code: "connection_in_use",
    referenceCount: 1,
  });
  await service.delete("proj-a", connectionId, true);
});
```

Seed a workflow step whose JSON config references `connectionId`.

- [ ] **Step 3: Run the service tests and verify they fail**

```bash
bun test tests/worker/external-connection-service.test.ts
```

Expected: FAIL because the service is missing.

- [ ] **Step 4: Implement the service**

Use constructor dependencies:

```ts
export interface ExternalConnectionView {
  id: string;
  projectId: string;
  name: string;
  provider: "posthog" | "http";
  baseUrl: string;
  publicConfig: Record<string, unknown>;
  credentialLabel: string;
  lastVerifiedAt: string | null;
  lastVerificationError: string | null;
  createdAt: string;
  updatedAt: string;
}

export class ExternalConnectionService {
  constructor(
    private db: DrizzleD1Database<Record<string, unknown>>,
    private encryptionKey: string,
  ) {}

  list(projectId: string): Promise<ExternalConnectionView[]>;
  getView(projectId: string, id: string): Promise<ExternalConnectionView | null>;
  getDecrypted<T>(
    projectId: string,
    id: string,
  ): Promise<{ row: ExternalConnectionRow; credentials: T } | null>;
  createPostHog(
    projectId: string,
    input: CreatePostHogConnectionInput,
  ): Promise<ExternalConnectionView>;
  updatePostHog(
    projectId: string,
    id: string,
    input: UpdatePostHogConnectionInput,
  ): Promise<ExternalConnectionView | null>;
  countWorkflowReferences(projectId: string, id: string): Promise<number>;
  delete(projectId: string, id: string, force: boolean): Promise<void>;
}
```

Reference counting joins workflows to steps for the project, then parses each
config and compares `config.connectionId`. Do not use string matching on JSON.
Both create methods assign `id: crypto.randomUUID()` before insert, matching
the repository's ID convention.

- [ ] **Step 5: Add session-only CRUD routes**

Register:

```text
GET    /api/projects/:projectId/external-connections
POST   /api/projects/:projectId/external-connections
PUT    /api/projects/:projectId/external-connections/:connectionId
DELETE /api/projects/:projectId/external-connections/:connectionId
```

Parse `force` only as `"true"`. Return `409`:

```json
{
  "error": "Connection is used by workflows",
  "code": "connection_in_use",
  "referenceCount": 2
}
```

Add all four routes to `PROJECT_SESSION_ONLY_ROUTES`. The existing project
permission middleware gives GET to viewers and write operations to editors or
admins; the API-key middleware rejects session-only routes.

- [ ] **Step 6: Run route/service tests and commit**

```bash
bun test tests/worker/external-connection-service.test.ts tests/worker/api-route-policy.test.ts
bun run build
git add worker/services/external-connection-service.ts worker/validation.ts worker/lib/api-route-policy.ts worker/index.ts tests/worker/external-connection-service.test.ts tests/worker/api-route-policy.test.ts
git commit -m "feat(integrations): manage project external connections"
```

---

### Task 3: Build the PostHog activity provider

**Files:**

- Create: `worker/lib/product-activity.ts`
- Create: `worker/services/posthog-activity-service.ts`
- Create: `tests/worker/posthog-activity-service.test.ts`

**Interfaces:**

- Produces: `ProductActivityResult`
- Produces: `ExternalDataEvidence`
- Produces: `PostHogActivityService.verify`, `.listEventDefinitions`, and `.getActivity`

- [ ] **Step 1: Define provider contracts**

```ts
export interface ProductActivityEventMetric {
  event: string;
  count: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
}

export interface ProductActivityResult {
  provider: "posthog";
  found: boolean;
  reason?: "not_found";
  personId?: string;
  distinctIds?: string[];
  firstSeenAt?: string;
  lastSeenAt?: string;
  activeDays: number;
  totalEvents: number;
  keyEvents: Record<string, ProductActivityEventMetric>;
  recentActivity: Array<{ event: string; timestamp: string }>;
}

export interface PostHogConnection {
  id: string;
  name: string;
  baseUrl: string;
  projectId: string;
  apiKey: string;
}

export interface ProductActivityRequest {
  identifierType: "email" | "distinct_id";
  identifier: string;
  lookbackDays: 7 | 30 | 90;
  eventNames: string[];
  includeRecentActivity: boolean;
  now: Date;
}

export interface PostHogEventDefinition {
  name: string;
  system: boolean;
}

export interface PostHogVerificationResult {
  ok: boolean;
  project: { id: string; name: string | null } | null;
  checks: Array<{
    key: "authentication" | "project" | "persons" | "events" | "query";
    ok: boolean;
    message: string;
  }>;
}

export interface ExternalDataEvidence {
  provider: "posthog";
  connectionId: string;
  connectionName: string;
  retrievedAt: string;
  matchedBy: "email" | "distinct_id";
  matchedValue: string;
  projectId: string;
  period: { from: string; to: string; lookbackDays: 7 | 30 | 90 };
  sourceUrl: string | null;
  result: ProductActivityResult;
}
```

Add `productActivityEventKey(name)` using `slugifyWorkflowKey`, with stable
numeric suffixes when selected names collide.

A no-match response is fully normalized and safe for later conditions:

```ts
{
  provider: "posthog",
  found: false,
  reason: "not_found",
  activeDays: 0,
  totalEvents: 0,
  keyEvents: {},
  recentActivity: [],
}
```

- [ ] **Step 2: Write PostHog request/normalization tests**

Use a constructor-injected fetcher and queued JSON fixtures. Cover:

- exact case-insensitive `properties.email`;
- trimmed exact case-insensitive `properties.$email`;
- exact distinct ID;
- no match;
- two exact email matches -> `PostHogIdentityError("ambiguous_identity")`;
- summary, selected-event aggregates, and ten most recent events;
- system events excluded when no explicit event list is supplied;
- raw properties absent from the result;
- HTTP 429 throws `{ transient: true, statusCode: 429 }`;
- 401 is permanent and contains no API key.

Example assertion:

```ts
expect(result).toEqual({
  provider: "posthog",
  found: true,
  personId: "person-1",
  distinctIds: ["user-1", "anon-1"],
  firstSeenAt: "2026-07-01T00:00:00Z",
  lastSeenAt: "2026-07-25T12:00:00Z",
  activeDays: 8,
  totalEvents: 74,
  keyEvents: {
    invited_teammate: {
      event: "invited_teammate",
      count: 2,
      firstSeenAt: "2026-07-20T09:00:00Z",
      lastSeenAt: "2026-07-25T12:00:00Z",
    },
  },
  recentActivity: [
    { event: "invited_teammate", timestamp: "2026-07-25T12:00:00Z" },
  ],
});
```

- [ ] **Step 3: Run the test and verify the service is missing**

```bash
bun test tests/worker/posthog-activity-service.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement authenticated PostHog requests**

```ts
export class PostHogActivityService {
  constructor(private fetcher: typeof fetch = fetch) {}

  verify(connection: PostHogConnection): Promise<PostHogVerificationResult>;
  listEventDefinitions(
    connection: PostHogConnection,
  ): Promise<PostHogEventDefinition[]>;
  getActivity(
    connection: PostHogConnection,
    request: ProductActivityRequest,
  ): Promise<ProductActivityResult>;
}
```

Build URLs from:

```ts
new URL(
  `/api/projects/${encodeURIComponent(connection.projectId)}/query/`,
  connection.baseUrl,
);
```

Send:

```ts
{
  Authorization: `Bearer ${connection.apiKey}`,
  "Content-Type": "application/json",
}
```

Person matching uses
`GET /api/projects/{projectId}/persons/?search={encodedIdentifier}&limit=20`,
then filters returned results locally using exact rules. Email matching checks
both `properties.email` and `properties.$email`. It never accepts the search
endpoint's ranking as identity proof.

Activity uses `POST /api/projects/{projectId}/query/` with
`{ query: { kind: "HogQLQuery", query, values } }`. Put identifier arrays,
timestamps, and selected event names in `values`; never concatenate user data
into the HogQL string.

By default, exclude these noisy system events:

```ts
export const DEFAULT_EXCLUDED_POSTHOG_EVENTS = new Set([
  "$autocapture",
  "$identify",
  "$pageleave",
  "$pageview",
  "$set",
  "$snapshot",
  "$web_vitals",
]);
```

An explicitly selected system event is allowed; the default exclusion applies
only when `eventNames` is empty.

Use three bounded queries:

1. overall min/max timestamp, distinct active dates, and count;
2. per-event count/min/max, ordered by count, limit ten;
3. recent event/timestamp ordered descending, limit ten.

If PostHog returns an asynchronous `query_status`, poll its documented query
status URL with the same ten-second total deadline; timeout is transient.
Reject a status URL whose origin differs from the configured PostHog origin.

Event-definition listing follows PostHog pagination until `next` is null or
500 definitions have been collected. It never follows a `next` URL whose
origin differs from the configured PostHog origin.

When a person is matched, construct the evidence deep link only from trusted
connection data and the returned person ID:

```ts
const sourceUrl = new URL(
  `/project/${encodeURIComponent(connection.projectId)}/person/${encodeURIComponent(personId)}`,
  connection.baseUrl,
).toString();
```

- [ ] **Step 5: Implement capability verification**

Verification returns the `PostHogVerificationResult` contract defined in Step
1.

Probe the project, one-person list, event definitions, and a bounded
`SELECT 1` HogQL query. Stop only when authentication/project access makes
later checks impossible; still return a row for every check.

- [ ] **Step 6: Run tests and commit**

```bash
bun test tests/worker/posthog-activity-service.test.ts
git add worker/lib/product-activity.ts worker/services/posthog-activity-service.ts tests/worker/posthog-activity-service.test.ts
git commit -m "feat(integrations): fetch normalized PostHog activity"
```

---

### Task 4: Add verification and event-definition APIs

**Files:**

- Modify: `worker/services/external-connection-service.ts`
- Modify: `worker/validation.ts`
- Modify: `worker/lib/api-route-policy.ts`
- Modify: `worker/index.ts`
- Modify: `tests/worker/external-connection-service.test.ts`
- Modify: `tests/worker/api-route-policy.test.ts`

**Interfaces:**

- Produces routes:
  - `POST /api/projects/:projectId/external-connections/:connectionId/verify`
  - `GET /api/projects/:projectId/external-connections/:connectionId/event-definitions`

- [ ] **Step 1: Write failing verification persistence tests**

Assert a successful provider result sets `lastVerifiedAt` and clears the last
error. Assert a failed result sets `lastVerificationError` without changing
the encrypted credential:

```ts
expect(afterFailure.encryptedCredentials).toBe(before.encryptedCredentials);
expect(afterFailure.lastVerificationError).toBe("Permission denied");
```

- [ ] **Step 2: Add provider dispatch to the connection service**

Inject `PostHogActivityService`. Add:

```ts
verifyPostHog(
  projectId: string,
  connectionId: string,
): Promise<PostHogVerificationResult>;

listPostHogEventDefinitions(
  projectId: string,
  connectionId: string,
): Promise<PostHogEventDefinition[]>;
```

Both decrypt credentials only for the duration of the provider call.

- [ ] **Step 3: Register session-only routes**

Return:

```json
{ "verification": { "ok": true, "checks": [] } }
```

and:

```json
{ "events": [{ "name": "invited_teammate", "system": false }] }
```

The event list endpoint caps at 500 definitions and sorts custom events before
system events.

- [ ] **Step 4: Run tests/build and commit**

```bash
bun test tests/worker/external-connection-service.test.ts tests/worker/api-route-policy.test.ts
bun run build
git add worker/services/external-connection-service.ts worker/validation.ts worker/lib/api-route-policy.ts worker/index.ts tests/worker/external-connection-service.test.ts tests/worker/api-route-policy.test.ts
git commit -m "feat(integrations): verify PostHog connections"
```

---

### Task 5: Add generic workflow data outputs and the product-activity step

**Files:**

- Modify: `worker/db/schema.ts`
- Modify: `worker/validation.ts`
- Modify: `worker/lib/workflow-runtime.ts`
- Modify: `worker/services/workflow-service.ts`
- Modify: `worker/services/workflow-execution-service.ts`
- Modify: `worker/index.ts`
- Modify: `src/lib/workflow-variables.ts`
- Modify: `src/components/WorkflowInputsEditor.tsx`
- Create: `tests/worker/workflow-product-activity.test.ts`
- Modify: `tests/worker/workflow-runtime.test.ts`

**Interfaces:**

- Adds step type: `"get_product_activity"`
- Adds context: `data?: Record<string, unknown>`
- Produces variable namespace: `data.<resultKey>.*`
- Produces executor: `executeGetProductActivity`
- Produces: `getProductActivityConfigSchema` and inferred
  `GetProductActivityConfig`

- [ ] **Step 1: Add failing runtime data-output tests**

```ts
const context: WorkflowTriggerContext = {
  projectId: "p",
  data: {
    product_activity: {
      lastSeenAt: "2026-07-25T12:00:00Z",
      activeDays: 8,
    },
  },
};

expect(resolveWorkflowValue(
  context,
  "data.product_activity.activeDays",
)).toBe(8);
expect(interpolateWorkflowTemplate(
  "{{data.product_activity.lastSeenAt}}",
  context,
)).toBe("2026-07-25T12:00:00Z");
```

- [ ] **Step 2: Extend types and context view**

Add `data?: Record<string, unknown>` to `WorkflowTriggerContext` and:

```ts
data: isRecord(context.data) ? context.data : {},
```

to `buildWorkflowContextView`.

- [ ] **Step 3: Add the centralized config schema and step type**

In `worker/validation.ts`:

```ts
export const getProductActivityConfigSchema = z.object({
  provider: z.literal("posthog"),
  connectionId: z.string().min(1),
  identifierType: z.enum(["email", "distinct_id"]),
  identifier: z.string().min(1).max(2000),
  lookbackDays: z.union([z.literal(7), z.literal(30), z.literal(90)]),
  eventNames: z.array(z.string().min(1).max(200)).max(10),
  includeRecentActivity: z.boolean(),
  resultKey: z.string().min(1).max(64),
});

export type GetProductActivityConfig = z.infer<
  typeof getProductActivityConfigSchema
>;
```

Add `"get_product_activity"` to:

- the Drizzle text enum;
- validation enum;
- `WorkflowService` create/update unions;
- queue step labels;
- frontend `StepType`, `STEP_TYPES`, summaries, and templates type.

No migration is expected because SQLite text enums are TypeScript metadata; run
`bun run db:generate` and confirm it reports no schema change before proceeding.

- [ ] **Step 4: Write a failing queued-composition test**

Seed:

```text
Get Product Activity(resultKey=product_activity)
-> Update Contact(notes={{data.product_activity.lastSeenAt}})
```

Inject fake connection and PostHog services returning the normalized fixture.
Execute both queue steps and assert:

- step 1 output contains the evidence envelope;
- saved run context has `data.product_activity`;
- step 2 resolves the timestamp;
- no raw event property or API key exists in serialized run/context/logs.

Add a second composition:

```text
Get Product Activity(resultKey=product_activity)
-> AI Research(input activity=data.product_activity)
```

Inject a fake AI service and assert its resolved `activity` input is the compact
JSON serialization of the normalized object. This proves external data is
explicitly wired to AI rather than silently included.

- [ ] **Step 5: Implement queued execution**

Extend the `WorkflowExecutionDependencies` interface created by the foundation
plan:

```ts
export interface WorkflowExecutionDependencies {
  workflowAiResearchService?: WorkflowAiResearchService;
  externalConnectionService?: ExternalConnectionService;
  postHogActivityService?: PostHogActivityService;
}
```

Validate config with `getProductActivityConfigSchema` from
`worker/validation.ts`. The executor:

1. reports connecting;
2. loads/decrypts the project-scoped connection;
3. interpolates the identifier;
4. reports matching/fetching/normalizing;
5. calls `PostHogActivityService.getActivity`;
6. writes `context.data[slugifyWorkflowKey(resultKey)] = result`;
7. stores the safe evidence in `snap.output`.

Use `found: false` as a completed output. Let `ambiguous_identity` throw a
permanent provider error. For no match, evidence records the attempted
identifier/method and uses `sourceUrl: null`; it never invents a PostHog person
link.

The workflow create/update routes parse this config before saving it. For an
update that omits `type`, load the existing step to determine which config
schema applies. Return `400` for an invalid provider config rather than storing
it for a later runtime failure.

- [ ] **Step 6: Reject duplicate source result keys**

Add to `WorkflowService`:

```ts
async assertUniqueDataResultKey(
  workflowId: string,
  resultKey: string,
  exceptStepId?: string,
): Promise<void>;
```

Check other `get_product_activity` and future `api_request` configs after
slugification. Call it from the create/update route before persistence. Return
`409` with:

```json
{ "error": "Result key is already used", "code": "duplicate_result_key" }
```

- [ ] **Step 7: Expose known prior-step variables**

Extend `PriorStepSource` with optional `eventNames`. For a prior product step,
add fixed variables:

```text
data.<key>.found
data.<key>.firstSeenAt
data.<key>.lastSeenAt
data.<key>.activeDays
data.<key>.totalEvents
data.<key>.recentActivity
data.<key>.keyEvents
```

For selected events, also expose:

```text
data.<key>.keyEvents.<eventSlug>.count
data.<key>.keyEvents.<eventSlug>.lastSeenAt
```

- [ ] **Step 8: Run tests/build and commit**

```bash
bun test tests/worker/workflow-runtime.test.ts tests/worker/workflow-product-activity.test.ts
bun run build
git add worker/db/schema.ts worker/validation.ts worker/lib/workflow-runtime.ts worker/services/workflow-service.ts worker/services/workflow-execution-service.ts worker/index.ts src/lib/workflow-variables.ts src/components/WorkflowInputsEditor.tsx tests/worker/workflow-runtime.test.ts tests/worker/workflow-product-activity.test.ts
git commit -m "feat(workflows): add product activity data step"
```

---

### Task 6: Add mutation-free workflow step previews

**Files:**

- Create: `worker/services/workflow-step-preview-service.ts`
- Create: `tests/worker/workflow-step-preview.test.ts`
- Modify: `worker/validation.ts`
- Modify: `worker/lib/api-route-policy.ts`
- Modify: `worker/index.ts`

**Interfaces:**

- Produces: `WorkflowStepPreviewService.previewProductActivity`
- Produces: `POST /api/projects/:projectId/workflow-step-previews`

- [ ] **Step 1: Add preview validation**

```ts
export const workflowStepPreviewSchema = z.object({
  type: z.literal("get_product_activity"),
  contactId: z.string().min(1),
  config: z.record(z.string(), z.unknown()),
});
```

- [ ] **Step 2: Write a failing no-mutation preview test**

Seed a project, contact, and connection. Preview with a fake PostHog service.
Assert:

```ts
expect(preview.evidence.matchedValue).toBe("jane@example.com");
expect(await db.select().from(dbSchema.workflowRuns)).toHaveLength(0);
expect((await contactService.getById("contact"))?.metadata).toBeNull();
```

Add foreign contact/connection cases and expect not-found responses.

- [ ] **Step 3: Implement preview with runtime-equivalent context**

```ts
export class WorkflowStepPreviewService {
  async previewProductActivity(
    projectId: string,
    contactId: string,
    config: GetProductActivityConfig,
    onProgress?: (progress: WorkflowStepProgress) => Promise<void>,
  ): Promise<ExternalDataEvidence>;
}
```

Load the current contact, build the same hydrated `WorkflowTriggerContext`,
resolve the identifier through `interpolateWorkflowTemplate`, and call the same
connection/PostHog services as the queue executor. Do not instantiate
`WorkflowService` or call contact update/activity methods.

- [ ] **Step 4: Register the session-only endpoint**

Return `{ evidence }`. Map:

- no match -> 200 evidence with `found: false`;
- ambiguous identity -> 409 `ambiguous_identity`;
- missing connection/contact -> 404;
- provider auth -> 401/403 with safe message;
- transient provider failure -> 503.

- [ ] **Step 5: Run tests/build and commit**

```bash
bun test tests/worker/workflow-step-preview.test.ts tests/worker/api-route-policy.test.ts
bun run build
git add worker/services/workflow-step-preview-service.ts worker/validation.ts worker/lib/api-route-policy.ts worker/index.ts tests/worker/workflow-step-preview.test.ts tests/worker/api-route-policy.test.ts
git commit -m "feat(workflows): preview product activity safely"
```

---

### Task 7: Build PostHog connection settings

**Files:**

- Create: `src/lib/external-data.ts`
- Create: `src/components/ExternalConnectionsSettings.tsx`
- Create: `tests/external-connections-settings.test.tsx`
- Modify: `src/pages/Settings.tsx`

**Interfaces:**

- Produces frontend `ExternalConnectionView`, `PostHogVerificationResult`
- Produces `ExternalConnectionsSettings({ projectId })`

- [ ] **Step 1: Write UI tests for safe connection lifecycle**

Mock list/create/verify endpoints and assert:

- empty state includes icon-and-text **Connect PostHog**;
- drawer requires name, host, project ID, and API key;
- pending create/verify uses Loader plus text;
- each capability check is rendered;
- API key is cleared from component state after save;
- list response never renders credential material;
- referenced deletion shows the server-provided count before force delete.

Start with an executable empty-state assertion:

```tsx
globalThis.fetch = mock(async function fetchConnections() {
  return Response.json({ connections: [] });
}) as typeof fetch;

render(
  <QueryClientProvider client={new QueryClient()}>
    <ExternalConnectionsSettings projectId="project-1" />
  </QueryClientProvider>,
);

expect(
  await screen.findByRole("button", { name: "Connect PostHog" }),
).toBeTruthy();
```

- [ ] **Step 2: Run the test and verify the component is missing**

```bash
bun test tests/external-connections-settings.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Add typed API helpers**

In `src/lib/external-data.ts`, define the safe response types and functions:

```ts
export async function listExternalConnections(
  projectId: string,
): Promise<ExternalConnectionView[]>;

export async function verifyExternalConnection(
  projectId: string,
  connectionId: string,
): Promise<PostHogVerificationResult>;
```

Create/update/delete helpers throw the API's safe `error` text.

- [ ] **Step 4: Implement the Settings component**

Use card-style connection rows:

```tsx
const verificationState = connection.lastVerificationError
  ? { label: "Failed", variant: "destructive" as const }
  : connection.lastVerifiedAt
    ? { label: "Verified", variant: "success" as const }
    : { label: "Unverified", variant: "secondary" as const };

<div className="flex items-center justify-between rounded-[16px] bg-muted/50 px-4 py-3">
  <div>
    <p className="text-sm font-medium">{connection.name}</p>
    <p className="text-xs text-muted-foreground">
      {connection.baseUrl} · project {connection.publicConfig.projectId}
    </p>
  </div>
  <Badge variant={verificationState.variant}>
    {verificationState.label}
  </Badge>
</div>
```

Actions use Test connection, Reconnect, and Remove with icons. Capability
checks use spacing, not dividers. After an explicit Save, immediately run
verification and keep the drawer open when any check fails so the user can see
the exact permission/project problem. Clear the API key from React state after
the save response, whether verification passes or fails.

- [ ] **Step 5: Mount it in Settings**

Add a new card before Danger Zone:

```tsx
<ExternalConnectionsSettings projectId={projectId!} />
```

Move all external-data query/mutation state into the extracted component; do
not enlarge `Settings.tsx` with provider logic.

- [ ] **Step 6: Run UI test/build and commit**

```bash
bun test tests/external-connections-settings.test.tsx
bun run build
git add src/lib/external-data.ts src/components/ExternalConnectionsSettings.tsx src/pages/Settings.tsx tests/external-connections-settings.test.tsx
git commit -m "feat(settings): connect and verify PostHog"
```

---

### Task 8: Build the Product Activity editor, preview, and evidence log

**Files:**

- Create: `src/components/GetProductActivityStepEditor.tsx`
- Create: `src/components/StepPreviewPanel.tsx`
- Create: `tests/product-activity-step-editor.test.tsx`
- Modify: `src/pages/WorkflowBuilder.tsx`
- Modify: `src/components/WorkflowStepLog.tsx`
- Modify: `src/lib/workflow-templates.ts`

**Interfaces:**

- Produces `GetProductActivityStepEditor`
- Produces `StepPreviewPanel`
- Consumes connection/event/preview helpers from `src/lib/external-data.ts`

- [ ] **Step 1: Write editor/preview tests**

Cover:

- default email identifier, 30 days, recent activity enabled, and
  `product_activity`;
- connection selector filters to PostHog;
- event selector loads after connection choice and separates custom/system;
- toggle uses required card row;
- Preview Data requires a sample contact;
- matched preview shows identifier, period, metrics, PostHog link, and JSON;
- not found is informative;
- ambiguous identity suggests distinct ID;
- a saved missing connection shows **Connection unavailable — reconnect or
  choose another connection** and blocks save/preview;
- save is blocked without a connection or identifier;
- all actions include icon and text.

The first test fixes the user-visible defaults and evidence affordances:

```tsx
renderEditor();

expect(screen.getByDisplayValue("{{contact.email}}")).toBeTruthy();
expect(screen.getByDisplayValue("product_activity")).toBeTruthy();
expect(screen.getByText("30 days")).toBeTruthy();

fireEvent.click(screen.getByRole("button", { name: "Preview Data" }));

expect(await screen.findByText("Matched by exact email")).toBeTruthy();
expect(screen.getByRole("link", { name: "Open in PostHog" })).toBeTruthy();
```

- [ ] **Step 2: Run the test and verify components are missing**

```bash
bun test tests/product-activity-step-editor.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement the editor**

The editor accepts:

```ts
interface GetProductActivityStepEditorProps {
  projectId: string;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  variables: WorkflowVariableGroup[];
}
```

Use `VariableInput` for the identifier. Load connections and event definitions
with query keys containing project/connection IDs. Limit selected events to
ten. Render Include recent activity in:

```tsx
<div className="flex items-center justify-between rounded-[16px] bg-muted/50 px-4 py-3">
  <div>
    <p className="text-sm font-medium">Include recent activity</p>
    <p className="text-xs text-muted-foreground">
      Add up to ten event names and timestamps.
    </p>
  </div>
  <Switch
    checked={Boolean(config.includeRecentActivity)}
    onCheckedChange={(checked) =>
      onChange({ ...config, includeRecentActivity: checked })
    }
  />
</div>
```

- [ ] **Step 4: Implement the preview panel**

Render evidence fields as clean spaced rows. **Open in PostHog** uses
`ExternalLink`; **View normalized JSON** uses `Braces`; retry uses `RotateCw`.
The JSON section is collapsed by default.

- [ ] **Step 5: Integrate the step and evidence renderer**

Add defaults:

```ts
{
  provider: "posthog",
  connectionId: "",
  identifierType: "email",
  identifier: "{{contact.email}}",
  lookbackDays: 30,
  eventNames: [],
  includeRecentActivity: true,
  resultKey: "product_activity",
}
```

Delegate the `StepConfigForm` case to the extracted editor. Add a
`ProductActivityLog` renderer showing retrieved time, matched identifier,
period, exact metrics, and safe source link.

- [ ] **Step 6: Add one high-utility template**

Add **Demo Briefing with Product Activity**:

```text
booking_created
-> get_product_activity(resultKey=product_activity)
-> ai_research(input activity=data.product_activity)
-> send_email
```

The template must reference only variables produced by preceding steps and use
the canonical AI default prompt plus an explicit `activity` input.

- [ ] **Step 7: Run UI tests/build and commit**

```bash
bun test tests/product-activity-step-editor.test.tsx
bun run build
git add src/components/GetProductActivityStepEditor.tsx src/components/StepPreviewPanel.tsx src/pages/WorkflowBuilder.tsx src/components/WorkflowStepLog.tsx src/lib/workflow-templates.ts tests/product-activity-step-editor.test.tsx
git commit -m "feat(workflows): configure and verify product activity"
```

---

### Task 9: PostHog integration verification

**Files:**

- Modify only files already in this plan if verification exposes defects.

**Interfaces:**

- Consumes all prior PostHog tasks.
- Produces a shippable PostHog product-activity slice.

- [ ] **Step 1: Run focused backend tests**

```bash
bun test \
  tests/worker/credential-crypto.test.ts \
  tests/worker/external-connection-service.test.ts \
  tests/worker/posthog-activity-service.test.ts \
  tests/worker/workflow-product-activity.test.ts \
  tests/worker/workflow-step-preview.test.ts \
  tests/worker/api-route-policy.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run focused frontend tests**

```bash
bun test \
  tests/external-connections-settings.test.tsx \
  tests/product-activity-step-editor.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run full suite and build**

```bash
bun test
bun run build
```

Expected: PASS.

- [ ] **Step 4: Run local migrations from a clean test database**

```bash
bun run db:migrate:dev
```

Expected: all migrations apply, including the new external-connections table.

- [ ] **Step 5: Audit credential boundaries**

```bash
rg -n "encryptedCredentials|apiKey|Authorization" worker src tests
git diff --check
git status --short
```

Manually confirm:

- API serializers omit `encryptedCredentials`;
- step config stores only `connectionId`;
- run context/log snapshots contain no token;
- provider errors never include request headers;
- preview creates no workflow run/contact mutation.

- [ ] **Step 6: Manual fixture verification**

Against a non-production PostHog project:

1. connect and verify a read-only key;
2. preview an exact email match;
3. open the returned PostHog person link;
4. run Product Activity -> AI Research;
5. verify the source step metrics are exact and AI interpretation is separate;
6. preview a missing email and confirm `found: false`;
7. simulate two exact email persons and confirm ambiguity fails.

- [ ] **Step 7: Commit verification-only fixes if needed**

```bash
git add \
  worker/db/schema.ts \
  worker/db/drizzle \
  worker/lib/credential-crypto.ts \
  worker/lib/product-activity.ts \
  worker/lib/api-route-policy.ts \
  worker/lib/workflow-runtime.ts \
  worker/services/external-connection-service.ts \
  worker/services/posthog-activity-service.ts \
  worker/services/workflow-step-preview-service.ts \
  worker/services/workflow-service.ts \
  worker/services/workflow-execution-service.ts \
  worker/validation.ts \
  worker/index.ts \
  src/lib/external-data.ts \
  src/lib/workflow-variables.ts \
  src/lib/workflow-templates.ts \
  src/components/ExternalConnectionsSettings.tsx \
  src/components/GetProductActivityStepEditor.tsx \
  src/components/StepPreviewPanel.tsx \
  src/components/WorkflowInputsEditor.tsx \
  src/components/WorkflowStepLog.tsx \
  src/pages/Settings.tsx \
  src/pages/WorkflowBuilder.tsx \
  tests/worker/credential-crypto.test.ts \
  tests/worker/external-connection-service.test.ts \
  tests/worker/posthog-activity-service.test.ts \
  tests/worker/workflow-product-activity.test.ts \
  tests/worker/workflow-step-preview.test.ts \
  tests/worker/api-route-policy.test.ts \
  tests/external-connections-settings.test.tsx \
  tests/product-activity-step-editor.test.tsx
git commit -m "fix(integrations): resolve PostHog verification regressions"
```

Skip the commit when verification produces no changes.

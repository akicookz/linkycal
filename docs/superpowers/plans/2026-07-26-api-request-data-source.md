# Read-Only API Request Data Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let workflows safely pull selected JSON fields from custom HTTPS APIs and expose them as verifiable `data.<resultKey>.*` values without turning the existing Webhook action into a hidden data source.

**Architecture:** Extend encrypted external connections with HTTP credentials, then add a GET-only API Request service with fixed-origin URL resolution, bounded JSON reads, same-origin redirect enforcement, secret redaction, and explicit dot-path response mappings. Preview and queued execution share the same request/mapping service; only mapped fields persist.

**Tech Stack:** Bun, TypeScript, React 19, TanStack Query, Hono, Cloudflare Workers/Queues, D1/Drizzle, Web Crypto, Zod, bun:test.

## Dependencies

Complete these plans in order:

1. `docs/superpowers/plans/2026-07-26-ai-research-background-foundation.md`
2. `docs/superpowers/plans/2026-07-26-posthog-product-activity.md`

This plan consumes encrypted external connections, `context.data`, duplicate
result-key validation, the shared preview endpoint, and queued progress/retry
behavior.

## Global Constraints

- Use Bun commands only.
- API Request is GET-only; Webhook retains mutating HTTP methods.
- Authenticated requests use an external connection; step configuration never stores secret headers.
- Unauthenticated requests may use a fixed HTTPS URL.
- Scheme, host, port, username, password, and connection credentials cannot contain workflow variables.
- Timeout is ten seconds including redirects and body reading.
- Preview/execution response cap is 256 KiB.
- Each mapped value is capped at 16 KiB; combined mapped output is capped at 64 KiB.
- Accept JSON and `+json` content types only.
- Reject localhost, literal private/reserved IPs, credential-bearing URLs, and cross-origin redirects.
- Follow at most three same-origin redirects.
- Persist only mapped fields, not the raw response.
- Use function declarations for named functions and React components.
- Use `import type` for type-only imports.
- All buttons use icon plus text except dialog Cancel/Close.
- Do not add content-divider borders.

---

## File Structure

### New files

- `worker/lib/safe-http.ts` — URL/origin validation, bounded response reading, redaction, and JSON dot-path mapping.
- `worker/services/api-request-service.ts` — fixed-origin GET execution and evidence construction.
- `src/components/ApiRequestStepEditor.tsx` — request config, preview, JSON path selection, and mappings.
- `tests/worker/safe-http.test.ts`
- `tests/worker/api-request-service.test.ts`
- `tests/worker/workflow-api-request.test.ts`
- `tests/api-request-step-editor.test.tsx`

### Modified files

- `worker/services/external-connection-service.ts`
- `worker/validation.ts`
- `worker/db/schema.ts` TypeScript enum metadata only
- `worker/services/workflow-service.ts`
- `worker/services/workflow-execution-service.ts`
- `worker/services/workflow-step-preview-service.ts`
- `worker/index.ts`
- `src/lib/external-data.ts`
- `src/components/ExternalConnectionsSettings.tsx`
- `src/components/StepPreviewPanel.tsx`
- `src/pages/WorkflowBuilder.tsx`
- `src/components/WorkflowInputsEditor.tsx`
- `src/components/WorkflowStepLog.tsx`
- `src/lib/workflow-variables.ts`
- `tests/worker/external-connection-service.test.ts`
- `tests/worker/workflow-step-preview.test.ts`
- `tests/external-connections-settings.test.tsx`

---

### Task 1: Add HTTP external connections

**Files:**

- Modify: `worker/validation.ts`
- Modify: `worker/services/external-connection-service.ts`
- Modify: `worker/index.ts`
- Modify: `src/lib/external-data.ts`
- Modify: `src/components/ExternalConnectionsSettings.tsx`
- Modify: `tests/worker/external-connection-service.test.ts`
- Modify: `tests/external-connections-settings.test.tsx`

**Interfaces:**

- Produces: `createHttpConnectionSchema`, `updateHttpConnectionSchema`
- Produces: `ExternalConnectionService.createHttp`, `.updateHttp`
- Produces encrypted `HttpConnectionCredentials`

- [ ] **Step 1: Define the HTTP connection input**

```ts
const httpHeaderNameSchema = z
  .string()
  .trim()
  .regex(/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/)
  .refine((name) => !["host", "content-length", "cookie"].includes(
    name.toLowerCase(),
  ));

const secretHeaderSchema = z.object({
  name: httpHeaderNameSchema,
  value: z.string().min(1).max(4000),
});

const httpBaseOriginSchema = z.string().url().max(2048).superRefine(
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
        message: "Base URL must be an HTTPS origin",
      });
    }
  },
);

export const createHttpConnectionSchema = z.object({
  provider: z.literal("http"),
  name: z.string().trim().min(1).max(100),
  baseUrl: httpBaseOriginSchema,
  healthPath: z.string().max(1000).default("/"),
  secretHeaders: z.array(secretHeaderSchema).max(10).default([]),
});

export const updateHttpConnectionSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  baseUrl: httpBaseOriginSchema.optional(),
  healthPath: z.string().max(1000).optional(),
  secretHeaders: z.array(secretHeaderSchema).max(10).optional(),
});
```

Duplicate case-insensitive header names are rejected in `superRefine`.

- [ ] **Step 2: Write failing storage/redaction tests**

```ts
const created = await service.createHttp("proj-a", {
  provider: "http",
  name: "Billing API",
  baseUrl: "https://billing.example.com",
  healthPath: "/health",
  secretHeaders: [{ name: "Authorization", value: "Bearer secret" }],
});

expect(created.publicConfig).toEqual({ healthPath: "/health" });
expect(created.credentialLabel).toBe("1 secret header");
expect(JSON.stringify(created)).not.toContain("Bearer secret");
```

Decrypt through the internal `getDecrypted` method and assert the Worker can
recover the header.

- [ ] **Step 3: Run the test and verify HTTP creation is unsupported**

```bash
bun test tests/worker/external-connection-service.test.ts
```

Expected: FAIL on missing `createHttp`.

- [ ] **Step 4: Implement HTTP create/update dispatch**

Store:

```ts
publicConfig: { healthPath }
encryptedCredentials: {
  secretHeaders: Array<{ name: string; value: string }>;
}
```

Update the POST/PUT route provider dispatch:

```ts
switch (body.provider) {
  case "posthog":
    return service.createPostHog(projectId, body);
  case "http":
    return service.createHttp(projectId, body);
}
```

Replacing secret headers is all-or-nothing; omitting them preserves the
encrypted credential.

- [ ] **Step 5: Add the HTTP connection drawer**

The Settings component lets the user choose **PostHog** or **HTTP API**. HTTP
fields are connection name, base URL, health path, and repeatable secret header
rows. Every remove-row control uses Trash2 plus **Remove header**, not an
icon-only button.

After save, clear all secret values from React state.
Immediately call the shared verify endpoint, keep the drawer open on failure,
and render the URL, authentication, and JSON checks independently.

- [ ] **Step 6: Run tests/build and commit**

```bash
bun test tests/worker/external-connection-service.test.ts tests/external-connections-settings.test.tsx
bun run build
git add worker/validation.ts worker/services/external-connection-service.ts worker/index.ts src/lib/external-data.ts src/components/ExternalConnectionsSettings.tsx tests/worker/external-connection-service.test.ts tests/external-connections-settings.test.tsx
git commit -m "feat(integrations): add encrypted HTTP connections"
```

---

### Task 2: Implement safe bounded JSON retrieval

**Files:**

- Create: `worker/lib/safe-http.ts`
- Create: `tests/worker/safe-http.test.ts`
- Modify: `worker/services/external-connection-service.ts`
- Modify: `tests/worker/external-connection-service.test.ts`

**Interfaces:**

- Produces: `validatePublicHttpsUrl`
- Produces: `resolveConnectionRequestUrl`
- Produces: `readBoundedJsonResponse`
- Produces: `getJsonPath`
- Produces: `mapJsonResponse`
- Produces: `redactSensitiveJson`

- [ ] **Step 1: Write URL safety tests**

```ts
test.each([
  "http://api.example.com",
  "https://user:pass@api.example.com",
  "https://localhost/data",
  "https://127.0.0.1/data",
  "https://10.0.0.1/data",
  "https://169.254.169.254/latest/meta-data",
  "https://[::1]/data",
])("rejects unsafe URL %s", (value) => {
  expect(() => validatePublicHttpsUrl(value)).toThrow();
});

test("keeps a connected request on the configured origin", () => {
  expect(resolveConnectionRequestUrl(
    "https://api.example.com",
    "/customers/123",
    [{ key: "email", value: "jane+test@example.com" }],
  ).toString()).toBe(
    "https://api.example.com/customers/123?email=jane%2Btest%40example.com",
  );
  expect(() => resolveConnectionRequestUrl(
    "https://api.example.com",
    "//evil.example/data",
    [],
  )).toThrow("Request URL must stay on the connection origin");
});
```

- [ ] **Step 2: Write bounded JSON/mapping tests**

Cover:

- missing/invalid JSON content type;
- body larger than 256 KiB even without Content-Length;
- JSON parse failure;
- dot paths with object keys and numeric array indices;
- absent mapping -> `null` plus warning;
- `__proto__`, `prototype`, and `constructor` path segments rejected;
- 16 KiB value and 64 KiB aggregate mapping limits;
- recursive redaction of keys matching token, secret, password,
  authorization, api key, and cookie.

Example:

```ts
expect(mapJsonResponse(
  { customer: { plan: "pro", cards: [{ last4: "4242" }] } },
  [
    { key: "plan", path: "customer.plan" },
    { key: "last4", path: "customer.cards.0.last4" },
    { key: "missing", path: "customer.mrr" },
  ],
)).toEqual({
  values: { plan: "pro", last4: "4242", missing: null },
  warnings: ["customer.mrr was not present"],
});
```

- [ ] **Step 3: Run tests and verify the module is missing**

```bash
bun test tests/worker/safe-http.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement URL and IP validation**

`validatePublicHttpsUrl`:

- parses with `new URL`;
- requires `https:`;
- requires empty username/password;
- lowercases hostname;
- rejects `localhost`, `.localhost`, `.local`, and literal private/reserved
  IPv4/IPv6 ranges;
- strips a trailing slash only when returning a normalized origin/base URL.

Do not attempt DNS resolution in this helper. Same-origin redirect enforcement
and Cloudflare's outbound network boundary remain additional controls.

Call it from `ExternalConnectionService.createHttp` and `updateHttp` as well as
from request execution. Extend the connection-service test to reject literal
private/reserved origins during create and update, so an unsafe connection
cannot be stored and merely fail later.

- [ ] **Step 5: Implement bounded streaming JSON**

```ts
export async function readBoundedJsonResponse(
  response: Response,
  maxBytes = 256 * 1024,
): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!/^(application\/json|[^;]+\+json)(?:;|$)/i.test(contentType)) {
    throw new SafeHttpError("response_not_json", "Response must be JSON");
  }

  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new SafeHttpError(
      "response_too_large",
      `Response exceeds ${maxBytes} bytes`,
    );
  }

  if (!response.body) {
    throw new SafeHttpError("invalid_json", "Response body is empty");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new SafeHttpError(
        "response_too_large",
        `Response exceeds ${maxBytes} bytes`,
      );
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new SafeHttpError("invalid_json", "Response contains invalid JSON");
  }
}
```

Return typed `SafeHttpError` values with codes:

```ts
export type SafeHttpErrorCode =
  | "unsafe_url"
  | "timeout"
  | "response_too_large"
  | "response_not_json"
  | "invalid_json"
  | "mapping_too_large";

export class SafeHttpError extends Error {
  constructor(
    public readonly code: SafeHttpErrorCode,
    message: string,
    public readonly transient = false,
  ) {
    super(message);
    this.name = "SafeHttpError";
  }
}
```

- [ ] **Step 6: Implement path mapping and redaction**

`getJsonPath` traverses own properties only. `mapJsonResponse` slugifies output
keys with the workflow key helper, rejects duplicate mapped keys, emits null
for missing paths, and enforces byte limits using UTF-8 encoded
`JSON.stringify` output.

- [ ] **Step 7: Run tests and commit**

```bash
bun test tests/worker/safe-http.test.ts tests/worker/external-connection-service.test.ts
git add worker/lib/safe-http.ts worker/services/external-connection-service.ts tests/worker/safe-http.test.ts tests/worker/external-connection-service.test.ts
git commit -m "feat(integrations): validate and bound external JSON"
```

---

### Task 3: Build the API Request service and HTTP verification

**Files:**

- Create: `worker/services/api-request-service.ts`
- Create: `tests/worker/api-request-service.test.ts`
- Modify: `worker/services/external-connection-service.ts`
- Modify: `worker/index.ts`

**Interfaces:**

- Produces: `ApiRequestConfig`
- Produces: `ApiRequestEvidence`
- Produces: `ApiRequestService.execute`
- Produces: `ExternalConnectionService.verifyHttp`

- [ ] **Step 1: Define request/evidence contracts**

```ts
export interface ApiRequestMapping {
  key: string;
  path: string;
}

export interface ApiRequestConfig {
  connectionId?: string;
  url?: string;
  path: string;
  query: Array<{ key: string; value: string }>;
  mappings: ApiRequestMapping[];
  resultKey: string;
}

export interface ApiRequestEvidence {
  provider: "http";
  connectionId: string | null;
  connectionName: string | null;
  retrievedAt: string;
  request: {
    url: string;
    headerNames: string[];
  };
  response: {
    status: number;
    contentType: string;
    sizeBytes: number;
    durationMs: number;
  };
  result: Record<string, unknown>;
  warnings: string[];
}

export interface DecryptedHttpConnection {
  id: string;
  name: string;
  baseUrl: string;
  healthPath: string;
  secretHeaders: Array<{ name: string; value: string }>;
}
```

- [ ] **Step 2: Write request service tests**

With a fake fetcher, cover:

- connection base + interpolated relative path/query;
- unauthenticated fixed URL;
- secret headers sent but absent from evidence;
- same-origin 301/302/307/308 followed up to three times;
- cross-origin redirect rejected before second request;
- ten-second AbortSignal;
- 408/429/5xx errors marked transient;
- 401/403 permanent;
- mapped-only result and redacted preview JSON;
- no raw response in execution evidence.

Include this concrete credential-safety assertion:

```ts
const { evidence } = await service.execute({
  config,
  context,
  connection: {
    id: "connection-1",
    name: "Billing API",
    baseUrl: "https://api.example.com",
    healthPath: "/health",
    secretHeaders: [
      { name: "Authorization", value: "Bearer private-token" },
    ],
  },
  includePreviewJson: false,
});

expect(seenHeaders.get("Authorization")).toBe("Bearer private-token");
expect(JSON.stringify(evidence)).not.toContain("private-token");
expect(evidence.result).toEqual({ plan: "pro" });
```

- [ ] **Step 3: Run the tests and verify the service is missing**

```bash
bun test tests/worker/api-request-service.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement GET execution**

```ts
export class ApiRequestService {
  constructor(private fetcher: typeof fetch = fetch) {}

  async execute(input: {
    config: ApiRequestConfig;
    context: WorkflowTriggerContext;
    connection: DecryptedHttpConnection | null;
    includePreviewJson: boolean;
  }): Promise<{
    evidence: ApiRequestEvidence;
    previewJson?: unknown;
  }>;
}
```

Use one `AbortController` and one deadline for all redirects and reading. Send
`Accept: application/json`, then merge decrypted connection headers. Set
`redirect: "manual"`. Evidence lists header names only.

Before calling `resolveConnectionRequestUrl`, render the relative path and each
query value with `interpolateWorkflowTemplate(configValue, context)`. The safe
URL helper receives rendered strings and is responsible only for encoding and
origin validation.

For unauthenticated requests, require `config.url`, reject
`config.connectionId`, require `config.path === "/"`, require empty secret
headers, validate the fixed URL as the complete endpoint, and append only the
rendered query. For connected requests, ignore `config.url` and resolve the
rendered `config.path` against the connection base.

- [ ] **Step 5: Implement HTTP connection verification**

`verifyHttp` runs the service against the connection `healthPath` with no
mappings and preview JSON disabled. It stores last verified/error state and
returns checks:

```ts
[
  { key: "url", ok: true, message: "HTTPS origin accepted" },
  { key: "authentication", ok: true, message: "Request accepted" },
  { key: "json", ok: true, message: "JSON response received" },
]
```

Wire
`POST /api/projects/:projectId/external-connections/:connectionId/verify` to
dispatch by provider.

- [ ] **Step 6: Run tests/build and commit**

```bash
bun test tests/worker/api-request-service.test.ts tests/worker/external-connection-service.test.ts
bun run build
git add worker/services/api-request-service.ts worker/services/external-connection-service.ts worker/index.ts tests/worker/api-request-service.test.ts tests/worker/external-connection-service.test.ts
git commit -m "feat(integrations): execute read-only API requests"
```

---

### Task 4: Add queued API Request execution

**Files:**

- Modify: `worker/db/schema.ts`
- Modify: `worker/validation.ts`
- Modify: `worker/lib/workflow-runtime.ts`
- Modify: `worker/services/workflow-service.ts`
- Modify: `worker/services/workflow-execution-service.ts`
- Modify: `worker/index.ts`
- Create: `tests/worker/workflow-api-request.test.ts`

**Interfaces:**

- Adds step type: `"api_request"`
- Produces executor: `executeApiRequest`
- Writes: `context.data[slugifyWorkflowKey(config.resultKey)]`

- [ ] **Step 1: Add API Request config validation**

```ts
const apiRequestMappingSchema = z.object({
  key: z.string().min(1).max(64),
  path: z.string().min(1).max(512),
});

export const apiRequestConfigSchema = z
  .object({
    connectionId: z.string().min(1).optional(),
    url: z.string().url().max(2048).optional(),
    path: z.string().max(1000).default("/"),
    query: z.array(z.object({
      key: z.string().min(1).max(200),
      value: z.string().max(4000),
    })).max(20).default([]),
    mappings: z.array(apiRequestMappingSchema).min(1).max(30),
    resultKey: z.string().min(1).max(64).default("api_response"),
  })
  .refine((value) => Boolean(value.connectionId) !== Boolean(value.url), {
    message: "Choose either a connection or an unauthenticated URL",
  })
  .refine((value) => !value.url || value.path === "/", {
    message: "Unauthenticated URLs include their path in the fixed URL",
  });
```

- [ ] **Step 2: Add the step type everywhere**

Add `"api_request"` to Drizzle TypeScript enum metadata, validation step enum,
WorkflowService unions, execution labels/switch, and queue/frontend types. Run:

```bash
bun run db:generate
```

Expected: no SQL migration because the database column remains text.

- [ ] **Step 3: Write a failing workflow composition test**

Seed:

```text
API Request(resultKey=billing, mapping plan=customer.plan)
-> Update Contact(notes={{data.billing.plan}})
```

Inject the request service and assert:

- first step stores `{ billing: { plan: "pro" } }` in run context;
- second step writes `pro`;
- serialized config/log/context contains no secret header;
- serialized context does not contain unmapped raw fields;
- a 429 moves the step to retrying through the foundation retry path.

Make the data-boundary assertion against the stored run:

```ts
await service.executeStep("run-1", 0, env);
await service.executeStep("run-1", 1, env);

const [run] = await db
  .select()
  .from(dbSchema.workflowRuns)
  .where(eq(dbSchema.workflowRuns.id, "run-1"));
const storedContext = JSON.parse(run.context ?? "{}");

expect(storedContext.data.billing).toEqual({ plan: "pro" });
expect(run.context).not.toContain("unmapped_private_field");
```

- [ ] **Step 4: Implement executor orchestration**

Extend the foundation dependency interface again:

```ts
export interface WorkflowExecutionDependencies {
  workflowAiResearchService?: WorkflowAiResearchService;
  externalConnectionService?: ExternalConnectionService;
  postHogActivityService?: PostHogActivityService;
  apiRequestService?: ApiRequestService;
}
```

The executor:

1. parses `apiRequestConfigSchema`;
2. reports connecting/fetching;
3. loads/decrypts the connection if configured and checks project ownership;
4. calls `ApiRequestService.execute` with `includePreviewJson: false`;
5. reports normalizing;
6. writes mapped result under the slugified result key;
7. stores safe evidence in `snap.output`.

Use the existing `assertUniqueDataResultKey` for create/update. Extend its
source-step filter to include `api_request`.

The workflow create/update routes parse `apiRequestConfigSchema` before saving.
When an update omits `type`, load the existing step first. Invalid API Request
configuration returns `400` immediately.

- [ ] **Step 5: Run tests/build and commit**

```bash
bun test tests/worker/workflow-api-request.test.ts tests/worker/workflow-runtime.test.ts
bun run build
git add worker/db/schema.ts worker/validation.ts worker/lib/workflow-runtime.ts worker/services/workflow-service.ts worker/services/workflow-execution-service.ts worker/index.ts tests/worker/workflow-api-request.test.ts
git commit -m "feat(workflows): add read-only API request step"
```

---

### Task 5: Extend preview for API Request

**Files:**

- Modify: `worker/services/workflow-step-preview-service.ts`
- Modify: `worker/validation.ts`
- Modify: `worker/index.ts`
- Modify: `tests/worker/workflow-step-preview.test.ts`

**Interfaces:**

- Extends preview type union with `"api_request"`
- Produces preview response with `evidence` and ephemeral `previewJson`

- [ ] **Step 1: Extend the preview schema**

```ts
export const workflowStepPreviewSchema = z.discriminatedUnion("type", [
  productActivityPreviewSchema,
  z.object({
    type: z.literal("api_request"),
    contactId: z.string().min(1),
    config: z.record(z.string(), z.unknown()),
  }),
]);
```

- [ ] **Step 2: Write failing preview tests**

Assert:

```ts
expect(response.previewJson).toEqual({
  customer: { plan: "pro", token: "[REDACTED]" },
});
expect(response.evidence.result).toEqual({ plan: "pro" });
expect(await db.select().from(dbSchema.workflowRuns)).toHaveLength(0);
```

Also assert unsafe URL, cross-project connection, oversized response, and
non-JSON errors map to safe status/code pairs.

- [ ] **Step 3: Implement preview dispatch**

Hydrate the sample contact using the existing preview context helper. Call:

```ts
apiRequestService.execute({
  config,
  context,
  connection,
  includePreviewJson: true,
});
```

Return redacted `previewJson` only to the initiating response. Do not store it
in D1, KV, run logs, or contact metadata.

- [ ] **Step 4: Run tests/build and commit**

```bash
bun test tests/worker/workflow-step-preview.test.ts
bun run build
git add worker/services/workflow-step-preview-service.ts worker/validation.ts worker/index.ts tests/worker/workflow-step-preview.test.ts
git commit -m "feat(workflows): preview external API data"
```

---

### Task 6: Build API Request workflow UI

**Files:**

- Create: `src/components/ApiRequestStepEditor.tsx`
- Create: `tests/api-request-step-editor.test.tsx`
- Modify: `src/lib/external-data.ts`
- Modify: `src/components/StepPreviewPanel.tsx`
- Modify: `src/pages/WorkflowBuilder.tsx`
- Modify: `src/components/WorkflowInputsEditor.tsx`
- Modify: `src/components/WorkflowStepLog.tsx`
- Modify: `src/lib/workflow-variables.ts`

**Interfaces:**

- Produces: `ApiRequestStepEditor`
- Extends: `PriorStepSource` with API mapping definitions
- Exposes known variables: `data.<resultKey>.<mappingKey>`

- [ ] **Step 1: Write editor tests**

Cover:

- default result key `api_response`;
- connection or unauthenticated URL mode, never both;
- GET shown as fixed method;
- variables allowed only in path/query values;
- at least one response mapping required to save;
- Preview Data requires a sample contact;
- preview shows redacted request, status, content type, duration, size, JSON,
  warnings, and normalized output;
- selecting a JSON leaf creates a mapping row;
- missing paths show warning/null;
- mapping remove actions include Trash2 and text;
- all loading states replace normal icon with Loader and keep text.

Pin the mapping interaction to an accessible action:

```tsx
renderApiRequestEditor();

fireEvent.click(screen.getByRole("button", { name: "Preview Data" }));
expect(await screen.findByText("customer.plan")).toBeTruthy();

fireEvent.click(
  screen.getByRole("button", { name: "Map field customer.plan" }),
);

expect(screen.getByDisplayValue("plan")).toBeTruthy();
expect(screen.getByDisplayValue("customer.plan")).toBeTruthy();
```

- [ ] **Step 2: Run the test and verify the editor is missing**

```bash
bun test tests/api-request-step-editor.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement typed preview helpers**

Extend `src/lib/external-data.ts`:

```ts
export type WorkflowStepPreviewRequest =
  | {
      type: "get_product_activity";
      contactId: string;
      config: Record<string, unknown>;
    }
  | {
      type: "api_request";
      contactId: string;
      config: Record<string, unknown>;
    };

export interface WorkflowStepPreviewResponse {
  evidence: ExternalDataEvidence | ApiRequestEvidence;
  previewJson?: unknown;
}

export interface ApiRequestPreview {
  evidence: ApiRequestEvidence;
  previewJson: unknown;
}

export async function previewWorkflowStep(
  projectId: string,
  body: WorkflowStepPreviewRequest,
): Promise<WorkflowStepPreviewResponse>;
```

- [ ] **Step 4: Implement the editor**

Props match the product-activity editor. Configuration sections:

1. Data source: HTTP connection or unauthenticated URL.
2. Request: fixed GET, relative path, query rows.
3. Response fields: output key and JSON dot path.
4. Result key.
5. Preview Data with sample contact.

Use `VariableInput` for the relative path only in connection mode, and for
query values in either mode. Base URL and unauthenticated URL use plain
`Input`, and unauthenticated mode hides the separate relative-path field, so
interpolation cannot change the origin.

- [ ] **Step 5: Add JSON mapping selection**

`StepPreviewPanel` recursively displays object/array leaves up to depth eight.
Each leaf has an icon-and-text **Map field** action. Mapping a leaf proposes
`slugifyWorkflowKey(lastPathSegment)` and sends the path/key through
`onAddMapping`.

Sensitive/redacted paths cannot be mapped.

- [ ] **Step 6: Integrate step defaults and variables**

Add:

```ts
case "api_request":
  return {
    connectionId: "",
    path: "/",
    query: [],
    mappings: [],
    resultKey: "api_response",
  };
```

Extend prior-step variable generation:

```text
data.<resultKey>.<mapping.key>
```

Delegate the config form to `ApiRequestStepEditor`.

- [ ] **Step 7: Add evidence log renderer**

`ApiRequestLog` shows:

- GET and safe resolved URL;
- header names only;
- status, content type, bytes, and duration;
- retrieved timestamp;
- mapped output and warnings.

Do not display a raw response because real runs never persist it.

- [ ] **Step 8: Run tests/build and commit**

```bash
bun test tests/api-request-step-editor.test.tsx
bun run build
git add src/components/ApiRequestStepEditor.tsx src/lib/external-data.ts src/components/StepPreviewPanel.tsx src/pages/WorkflowBuilder.tsx src/components/WorkflowInputsEditor.tsx src/components/WorkflowStepLog.tsx src/lib/workflow-variables.ts tests/api-request-step-editor.test.tsx
git commit -m "feat(workflows): configure and verify API data requests"
```

---

### Task 7: API Request security and regression verification

**Files:**

- Modify only files already in this plan if verification exposes defects.

**Interfaces:**

- Consumes all API Request tasks.
- Produces a shippable read-only external API source.

- [ ] **Step 1: Run focused backend tests**

```bash
bun test \
  tests/worker/safe-http.test.ts \
  tests/worker/api-request-service.test.ts \
  tests/worker/workflow-api-request.test.ts \
  tests/worker/workflow-step-preview.test.ts \
  tests/worker/external-connection-service.test.ts \
  tests/worker/api-route-policy.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run focused frontend tests**

```bash
bun test \
  tests/api-request-step-editor.test.tsx \
  tests/external-connections-settings.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run full suite and build**

```bash
bun test
bun run build
```

Expected: PASS.

- [ ] **Step 4: Exercise every network boundary with fixtures**

Verify:

1. public unauthenticated JSON GET succeeds;
2. connected GET sends encrypted headers but does not log them;
3. HTTP, localhost, private literal IP, credential URL, and cross-origin
   redirects fail;
4. a streaming response crossing 256 KiB is cancelled;
5. same-origin redirect chain stops after three;
6. non-JSON and malformed JSON fail;
7. sensitive preview keys are redacted and cannot be mapped;
8. real run stores only mapped fields;
9. 429 retries and 401 fails immediately;
10. existing Webhook POST behavior is unchanged.

- [ ] **Step 5: Audit persisted/logged state**

```bash
rg -n "secretHeaders|Authorization|encryptedCredentials|previewJson" worker src tests
git diff --check
git status --short
```

Inspect a real test run's `context` and `stepLogs` JSON. Confirm there is no
secret header and no unmapped response field.

- [ ] **Step 6: Commit verification-only fixes if needed**

```bash
git add \
  worker/lib/safe-http.ts \
  worker/services/api-request-service.ts \
  worker/services/external-connection-service.ts \
  worker/services/workflow-execution-service.ts \
  worker/services/workflow-step-preview-service.ts \
  worker/services/workflow-service.ts \
  worker/validation.ts \
  worker/db/schema.ts \
  worker/index.ts \
  src/lib/external-data.ts \
  src/components/ExternalConnectionsSettings.tsx \
  src/components/StepPreviewPanel.tsx \
  src/components/ApiRequestStepEditor.tsx \
  src/components/WorkflowInputsEditor.tsx \
  src/components/WorkflowStepLog.tsx \
  src/lib/workflow-variables.ts \
  src/pages/WorkflowBuilder.tsx \
  tests/worker/safe-http.test.ts \
  tests/worker/api-request-service.test.ts \
  tests/worker/workflow-api-request.test.ts \
  tests/worker/workflow-step-preview.test.ts \
  tests/worker/external-connection-service.test.ts \
  tests/api-request-step-editor.test.tsx \
  tests/external-connections-settings.test.tsx
git commit -m "fix(integrations): resolve API request security regressions"
```

Skip the commit if verification produces no changes.

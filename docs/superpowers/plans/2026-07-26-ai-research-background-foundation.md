# AI Research Background Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every new AI Research step a complete editable prompt and reliable contact inputs, then make queued AI work observable, retryable, and safe from ordinary duplicate delivery.

**Architecture:** Keep `WORKFLOW_QUEUE` as the execution boundary. Add frontend-only AI defaults, refresh the current contact before resolving inputs, add optional phase metadata to existing JSON step logs, and centralize retry classification/backoff in a small runtime helper. No database migration is needed in this phase.

**Tech Stack:** Bun, TypeScript, React 19, TanStack Query, Hono, Cloudflare Queues, D1/Drizzle, Vercel AI SDK, bun:test.

## Global Constraints

- Use Bun commands only.
- Use function declarations for named functions and React components.
- Use `import type` for type-only imports.
- Preserve existing `research.*` workflow variables and saved non-empty prompts.
- New AI Research inputs are exactly name, email, phone, and notes.
- Form response ID remains selectable but is labeled as identifier-only.
- Loading buttons replace their normal icon with `Loader`; they retain text.
- Do not add separator borders.
- Retry delays are 15 seconds before attempt 2 and 60 seconds before attempt 3.
- A running-step lease is considered stale after 15 minutes.
- Do not change the AI model IDs.

---

## File Structure

### New files

- `src/lib/ai-research-defaults.ts` — canonical frontend prompt and AI-specific input seeding.
- `worker/lib/workflow-retry.ts` — retry classification, delays, and lease helpers.
- `tests/ai-research-defaults.test.ts` — pure tests for the prompt and input contract.
- `tests/workflow-run-dialog.test.tsx` — test-run callback and auto-open behavior.
- `tests/worker/workflow-ai-research-progress.test.ts` — AI phase reporting and persisted progress tests.
- `tests/worker/workflow-retry.test.ts` — pure retry classification/backoff tests.

### Modified files

- `src/pages/WorkflowBuilder.tsx` — use AI-specific defaults, display run progress, and auto-expand a new test run.
- `src/components/WorkflowRunDialog.tsx` — return the created run ID to the builder.
- `src/components/WorkflowStepLog.tsx` — distinguish supplied inputs, public research, and AI output.
- `src/lib/workflow-variables.ts` — clarify Response ID copy.
- `worker/lib/workflow-runtime.ts` — expose hydrated contact fields in the context view.
- `worker/services/workflow-execution-service.ts` — hydrate the contact, persist phases, retry transient failures, and guard duplicate delivery.
- `worker/services/workflow-ai-research-service.ts` — report coarse research phases and preserve AI SDK retryability.
- `worker/services/workflow-service.ts` — extend JSON step logs with progress/lease data and focused update helpers.
- `worker/index.ts` — pass queue attempt metadata through the consumer.
- `tests/worker/workflow-operational-facts.test.ts` — prove current contact fields are refreshed before input resolution.

---

### Task 1: Canonical AI Research defaults

**Files:**

- Create: `src/lib/ai-research-defaults.ts`
- Create: `tests/ai-research-defaults.test.ts`
- Modify: `src/pages/WorkflowBuilder.tsx`
- Modify: `src/lib/workflow-variables.ts`

**Interfaces:**

- Produces: `DEFAULT_AI_RESEARCH_PROMPT: string`
- Produces: `seedAiResearchInputs(): WorkflowStepInput[]`
- Produces: `applyAiResearchDefaults(config): Record<string, unknown>`
- Consumes: `WorkflowStepInput` from `src/components/WorkflowInputsEditor.tsx`

- [ ] **Step 1: Write the failing defaults test**

```ts
// tests/ai-research-defaults.test.ts
import { describe, expect, test } from "bun:test";

import {
  applyAiResearchDefaults,
  DEFAULT_AI_RESEARCH_PROMPT,
  seedAiResearchInputs,
} from "../src/lib/ai-research-defaults";

describe("AI Research defaults", () => {
  test("spells out the supplied contact fields and research targets", () => {
    expect(DEFAULT_AI_RESEARCH_PROMPT).toContain("{{input.name}}");
    expect(DEFAULT_AI_RESEARCH_PROMPT).toContain("{{input.email}}");
    expect(DEFAULT_AI_RESEARCH_PROMPT).toContain("{{input.phone}}");
    expect(DEFAULT_AI_RESEARCH_PROMPT).toContain("{{input.notes}}");
    expect(DEFAULT_AI_RESEARCH_PROMPT).toContain("Company size");
    expect(DEFAULT_AI_RESEARCH_PROMPT).toContain("estimated revenue");
    expect(DEFAULT_AI_RESEARCH_PROMPT).toContain("LinkedIn");
    expect(DEFAULT_AI_RESEARCH_PROMPT).toContain("Do not infer unsupported facts");
  });

  test("seeds only contact fields and not a form response identifier", () => {
    expect(seedAiResearchInputs()).toEqual([
      { key: "name", source: { kind: "path", path: "contact.name" } },
      { key: "email", source: { kind: "path", path: "contact.email" } },
      { key: "phone", source: { kind: "path", path: "contact.phone" } },
      { key: "notes", source: { kind: "path", path: "contact.notes" } },
    ]);
  });

  test("fills an empty saved prompt but preserves an edited prompt", () => {
    expect(applyAiResearchDefaults({ prompt: "" }).prompt).toBe(
      DEFAULT_AI_RESEARCH_PROMPT,
    );
    expect(applyAiResearchDefaults({ prompt: "Use my rubric" }).prompt).toBe(
      "Use my rubric",
    );
  });
});
```

- [ ] **Step 2: Run the test and verify the module is missing**

Run:

```bash
bun test tests/ai-research-defaults.test.ts
```

Expected: FAIL because `src/lib/ai-research-defaults.ts` does not exist.

- [ ] **Step 3: Add the prompt and seeding function**

```ts
// src/lib/ai-research-defaults.ts
import type { WorkflowStepInput } from "@/components/WorkflowInputsEditor";

export const DEFAULT_AI_RESEARCH_PROMPT = `Research this contact using the supplied contact information and reliable
public web sources.

Contact information:
- Name: {{input.name}}
- Email: {{input.email}}
- Phone: {{input.phone}}
- Existing notes: {{input.notes}}

Identify and verify, where available:
- Full name and current role
- Company name, website, industry, and description
- Company size and estimated revenue range
- Professional profile or LinkedIn URL
- Location
- Recent company or professional signals relevant to follow-up
- Evidence of fit, buying intent, risks, or missing information

Use product activity or other supplied context when present, but distinguish it
from public-web findings. Do not infer unsupported facts. Return null for
unknown structured fields. Produce a concise summary, actionable insights,
recommended tags, and supporting source URLs.`;

export function seedAiResearchInputs(): WorkflowStepInput[] {
  return [
    { key: "name", source: { kind: "path", path: "contact.name" } },
    { key: "email", source: { kind: "path", path: "contact.email" } },
    { key: "phone", source: { kind: "path", path: "contact.phone" } },
    { key: "notes", source: { kind: "path", path: "contact.notes" } },
  ];
}

export function applyAiResearchDefaults(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const prompt = String(config.prompt ?? "").trim();
  return {
    provider: "chatgpt",
    resultKey: "research",
    ...config,
    prompt: prompt || DEFAULT_AI_RESEARCH_PROMPT,
  };
}
```

- [ ] **Step 4: Wire defaults into create and edit paths**

In `WorkflowBuilder.tsx`:

```ts
import {
  applyAiResearchDefaults,
  DEFAULT_AI_RESEARCH_PROMPT,
  seedAiResearchInputs,
} from "@/lib/ai-research-defaults";
```

Change the default config:

```ts
case "ai_research":
  return {
    provider: "chatgpt",
    resultKey: "research",
    prompt: DEFAULT_AI_RESEARCH_PROMPT,
  };
```

When a type is selected or an existing step without `inputs` is opened, choose
inputs with a named helper instead of calling `seedAllInputs` directly:

```ts
function seedInputsForStep(
  type: StepType,
  options: {
    trigger?: TriggerType;
    formFields?: FormFieldSource[];
    priorSteps?: PriorStepSource[];
  },
): WorkflowStepInput[] {
  return type === "ai_research"
    ? seedAiResearchInputs()
    : seedAllInputs(options);
}
```

Use `applyAiResearchDefaults` when creating editor state. Saved non-empty
prompts win. Existing empty strings are replaced only in editor state:

```ts
const merged =
  step.type === "ai_research"
    ? applyAiResearchDefaults(existing)
    : { ...getDefaultConfig(step.type), ...existing };
```

The ordinary save path persists the edited prompt. Opening an existing empty
prompt does not write anything until the user presses the icon-and-text save
action.

- [ ] **Step 5: Clarify the form-response variable label**

Change the Form group item in `src/lib/workflow-variables.ts`:

```ts
{ key: "form.responseId", label: "Form response ID (identifier only)" },
```

- [ ] **Step 6: Run focused tests and build**

Run:

```bash
bun test tests/ai-research-defaults.test.ts
bun run build
```

Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ai-research-defaults.ts src/lib/workflow-variables.ts src/pages/WorkflowBuilder.tsx tests/ai-research-defaults.test.ts
git commit -m "feat(workflows): add complete AI research defaults"
```

---

### Task 2: Refresh complete contact context before step inputs resolve

**Files:**

- Modify: `worker/lib/workflow-runtime.ts`
- Modify: `worker/services/workflow-execution-service.ts`
- Modify: `tests/worker/workflow-runtime.test.ts`
- Modify: `tests/worker/workflow-operational-facts.test.ts`

**Interfaces:**

- Produces: hydrated `WorkflowTriggerContext` fields `contactPhone`, `contactNotes`, `contactCompany`, `contactWebsite`, `contactPosition`, `contactCompanySize`, `contactEstimatedRevenue`, and `contactLinkedinUrl`
- Produces: `WorkflowExecutionService.refreshContactContext(context): Promise<void>`

- [ ] **Step 1: Add failing context-view assertions**

Extend the context fixture in `tests/worker/workflow-runtime.test.ts`:

```ts
const context: WorkflowTriggerContext = {
  projectId: "proj_123",
  contactId: "ct_123",
  contactName: "Ava",
  contactEmail: "ava@example.com",
  contactPhone: "+82 10-1234-5678",
  contactNotes: "Requested enterprise pricing.",
  contactCompany: "Acme",
};

expect(resolveWorkflowValue(context, "contact.phone")).toBe("+82 10-1234-5678");
expect(resolveWorkflowValue(context, "contact.notes")).toBe(
  "Requested enterprise pricing.",
);
expect(resolveWorkflowValue(context, "contact.company")).toBe("Acme");
```

- [ ] **Step 2: Run the runtime test and verify it fails**

Run:

```bash
bun test tests/worker/workflow-runtime.test.ts
```

Expected: FAIL because the context type/view does not expose those fields.

- [ ] **Step 3: Extend the workflow context and contact view**

Add optional scalar fields to `WorkflowTriggerContext` and expose them from
`buildWorkflowContextView`:

```ts
contact: {
  id: context.contactId ?? "",
  name: context.contactName ?? "",
  email: context.contactEmail ?? "",
  phone: context.contactPhone ?? "",
  notes: context.contactNotes ?? "",
  company: context.contactCompany ?? "",
  website: context.contactWebsite ?? "",
  position: context.contactPosition ?? "",
  companySize: context.contactCompanySize ?? "",
  estimatedRevenue: context.contactEstimatedRevenue ?? "",
  linkedinUrl: context.contactLinkedinUrl ?? "",
  ...(context.contactOperational ?? {}),
},
```

- [ ] **Step 4: Add a failing queued-hydration test**

Seed the test contact in `workflow-operational-facts.test.ts` with current
values and make the update step copy a resolved input:

```ts
await db.insert(dbSchema.contacts).values({
  id: "c",
  projectId: "p",
  name: "Current Name",
  email: "current@example.com",
  phone: "+1 555 0100",
  notes: "Current notes",
  company: "Current Company",
});

await db.insert(dbSchema.workflowSteps).values({
  id: "step",
  workflowId: "workflow",
  sortOrder: 0,
  type: "update_contact",
  config: {
    inputs: [
      { key: "phone", source: { kind: "path", path: "contact.phone" } },
    ],
    field: "notes",
    value: "{{input.phone}}",
  },
});
```

Keep stale name/email values in the stored run context, execute the step, and
assert that the saved context and contact notes use current database values.

- [ ] **Step 5: Run the hydration test and verify it fails**

Run:

```bash
bun test tests/worker/workflow-operational-facts.test.ts
```

Expected: FAIL because only operational facts are refreshed.

- [ ] **Step 6: Replace the narrow refresh with complete hydration**

Rename `refreshContactOperationalContext` to `refreshContactContext`. Load the
contact and operational facts before resolving `config.inputs`:

```ts
private async refreshContactContext(context: TriggerContext): Promise<void> {
  if (!context.contactId) {
    delete context.contactOperational;
    return;
  }

  const [contact, factsByContact] = await Promise.all([
    this.contactService.getById(context.contactId),
    this.contactService.getOperationalFacts([context.contactId]),
  ]);
  if (!contact || contact.projectId !== context.projectId) {
    throw new Error("workflow: contact is unavailable in this project");
  }

  context.contactName = contact.name;
  context.contactEmail = contact.email ?? undefined;
  context.contactPhone = contact.phone ?? undefined;
  context.contactNotes = contact.notes ?? undefined;
  context.contactCompany = contact.company ?? undefined;
  context.contactWebsite = contact.companyWebsite ?? undefined;
  context.contactPosition = contact.position ?? undefined;
  context.contactCompanySize = contact.companySize ?? undefined;
  context.contactEstimatedRevenue = contact.estimatedRevenue ?? undefined;
  context.contactLinkedinUrl = contact.linkedinUrl ?? undefined;

  const facts = factsByContact[context.contactId];
  context.contactOperational = facts
    ? buildWorkflowContactOperationalContext(facts, new Date())
    : { stage: { byTag: {} } };
}
```

- [ ] **Step 7: Run focused tests and commit**

```bash
bun test tests/worker/workflow-runtime.test.ts tests/worker/workflow-operational-facts.test.ts
git add worker/lib/workflow-runtime.ts worker/services/workflow-execution-service.ts tests/worker/workflow-runtime.test.ts tests/worker/workflow-operational-facts.test.ts
git commit -m "fix(workflows): hydrate current contact inputs before steps"
```

---

### Task 3: Add persistent step progress metadata

**Files:**

- Modify: `worker/services/workflow-service.ts`
- Modify: `worker/services/workflow-execution-service.ts`
- Modify: `src/pages/WorkflowBuilder.tsx`
- Test: `tests/worker/workflow-run-detail.test.ts`

**Interfaces:**

- Produces: `WorkflowStepProgress`
- Produces: `WorkflowService.updateStepProgress(runId, stepIndex, progress)`
- Extends: `StepLog.status` with `"retrying"`

- [ ] **Step 1: Define the progress contract in the service test**

Add a step log with progress, save it, fetch it through
`WorkflowService.getRunInProject`, and expect:

```ts
expect(run?.stepLogs?.[0]).toMatchObject({
  status: "running",
  progress: {
    phase: "researching",
    message: "Researching public sources",
    attempt: 1,
    maxAttempts: 3,
  },
});
```

- [ ] **Step 2: Run the test and verify the type/helper is missing**

Run:

```bash
bun test tests/worker/workflow-run-detail.test.ts
```

Expected: FAIL until the new progress shape is supported.

- [ ] **Step 3: Extend `StepLog` and add a focused update helper**

```ts
export type WorkflowStepPhase =
  | "queued"
  | "preparing"
  | "connecting"
  | "matching"
  | "fetching"
  | "researching"
  | "normalizing"
  | "saving"
  | "retrying";

export interface WorkflowStepProgress {
  phase: WorkflowStepPhase;
  message: string;
  attempt: number;
  maxAttempts: number;
  leaseStartedAt?: string;
  nextRetryAt?: string;
}

export interface StepLog {
  stepIndex: number;
  stepType: string;
  stepLabel: string;
  status: "pending" | "running" | "retrying" | "completed" | "failed" | "skipped";
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  progress?: WorkflowStepProgress;
}
```

Add:

```ts
async updateStepProgress(
  runId: string,
  stepIndex: number,
  progress: WorkflowStepProgress,
): Promise<StepLog[]> {
  const logs = await this.getStepLogs(runId);
  if (!logs[stepIndex]) return logs;
  logs[stepIndex].progress = progress;
  await this.updateStepLogs(runId, logs);
  return logs;
}
```

The execution service should initialize pending logs with `phase: "queued"` and
mark a started step with `phase: "preparing"` plus `leaseStartedAt`.

- [ ] **Step 4: Render progress in the Runs timeline**

Extend the frontend `StepLogEntry` type with the same optional progress shape.
Under a running or retrying step label, render:

```tsx
{sl.progress?.message && (
  <span className="text-[11px] text-muted-foreground">
    {sl.progress.message}
    {sl.status === "retrying" && sl.progress.nextRetryAt
      ? ` · attempt ${sl.progress.attempt}/${sl.progress.maxAttempts}`
      : ""}
  </span>
)}
```

Use `RotateCw` for retrying and `Loader` for running. Do not add a separator.

- [ ] **Step 5: Run focused test and build**

```bash
bun test tests/worker/workflow-run-detail.test.ts
bun run build
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add worker/services/workflow-service.ts worker/services/workflow-execution-service.ts src/pages/WorkflowBuilder.tsx tests/worker/workflow-run-detail.test.ts
git commit -m "feat(workflows): persist queued step progress"
```

---

### Task 4: Report honest AI Research phases

**Files:**

- Modify: `worker/services/workflow-ai-research-service.ts`
- Modify: `worker/services/workflow-execution-service.ts`
- Modify: `src/components/WorkflowStepLog.tsx`
- Test: `tests/worker/workflow-ai-research-progress.test.ts`

**Interfaces:**

- Produces: `WorkflowResearchPhase = "researching" | "normalizing"`
- Extends: `WorkflowAiResearchService.execute(config, env, onPhase?)`

- [ ] **Step 1: Write a failing phase-callback test**

Create a fakeable callback contract without calling a live model:

```ts
const phases: string[] = [];
await service.execute(
  config,
  env,
  async (phase) => {
    phases.push(phase);
  },
);
expect(phases[0]).toBe("researching");
```

Mock `generateText` through a constructor-injected runner:

```ts
type GenerateTextRunner = typeof generateText;

constructor(private generate: GenerateTextRunner = generateText) {}
```

Use a fake runner returning the existing structured result fixture.

- [ ] **Step 2: Run the test and verify the callback is unsupported**

```bash
bun test tests/worker/workflow-ai-research-progress.test.ts
```

Expected: FAIL on the missing constructor/callback contract.

- [ ] **Step 3: Report only provider-supported boundaries**

Add:

```ts
export type WorkflowResearchPhase = "researching" | "normalizing";
export type WorkflowResearchPhaseReporter = (
  phase: WorkflowResearchPhase,
) => Promise<void>;
```

Call `await onPhase?.("researching")` immediately before the grounded provider
request. Call `await onPhase?.("normalizing")` before Gemini's second pass and
before converting the OpenAI structured result into a record.

Do not emit token-level or percentage progress.

- [ ] **Step 4: Persist phases from the executor**

Pass a callback from `executeAiResearch` that calls `updateStepProgress` with:

```ts
{
  phase,
  message:
    phase === "researching"
      ? "Researching public sources"
      : "Structuring findings",
  attempt,
  maxAttempts: 3,
  leaseStartedAt,
}
```

After the provider returns, report `saving: "Updating the contact"` before
`applyResearchToContact`.

- [ ] **Step 5: Separate evidence and interpretation in the log**

Keep `ResolvedInputs` first. Rename the current Request section to **Research
request**, public URLs to **Public sources**, and the summary/insight result to
**AI findings**. Do not duplicate raw upstream product data inside the AI
result; it remains visible in the source step log.

- [ ] **Step 6: Run tests/build and commit**

```bash
bun test tests/worker/workflow-ai-research-progress.test.ts
bun run build
git add worker/services/workflow-ai-research-service.ts worker/services/workflow-execution-service.ts src/components/WorkflowStepLog.tsx tests/worker/workflow-ai-research-progress.test.ts
git commit -m "feat(workflows): show AI research phases"
```

---

### Task 5: Centralize transient retry and lease rules

**Files:**

- Create: `worker/lib/workflow-retry.ts`
- Create: `tests/worker/workflow-retry.test.ts`
- Modify: `worker/services/workflow-service.ts`
- Modify: `worker/services/workflow-execution-service.ts`
- Modify: `worker/index.ts`

**Interfaces:**

- Produces: `MAX_WORKFLOW_ATTEMPTS = 3`
- Produces: `retryDelaySeconds(attempt: number): number | null`
- Produces: `isTransientWorkflowError(error: unknown): boolean`
- Produces: `isLeaseStale(leaseStartedAt: string | undefined, now: Date): boolean`
- Produces: `safeWorkflowErrorMessage(error: unknown): string`
- Produces: `WorkflowService.claimStepLease(runId, stepIndex, attempt, now)`
- Extends queue body with `attempt?: number`

- [ ] **Step 1: Write retry-policy tests**

```ts
import { APICallError } from "ai";
import { describe, expect, test } from "bun:test";
import {
  isLeaseStale,
  isTransientWorkflowError,
  retryDelaySeconds,
  safeWorkflowErrorMessage,
} from "../../worker/lib/workflow-retry";

test("uses the exact bounded backoff", () => {
  expect(retryDelaySeconds(1)).toBe(15);
  expect(retryDelaySeconds(2)).toBe(60);
  expect(retryDelaySeconds(3)).toBeNull();
});

test("trusts AI SDK retryability", () => {
  const error = new APICallError({
    message: "rate limited",
    url: "https://api.openai.com",
    requestBodyValues: {},
    statusCode: 429,
    isRetryable: true,
  });
  expect(isTransientWorkflowError(error)).toBe(true);
});

test("does not retry validation or authentication failures", () => {
  expect(isTransientWorkflowError(new Error("invalid configuration"))).toBe(false);
  expect(isTransientWorkflowError({ status: 401 })).toBe(false);
});

test("scrubs credential-shaped error details", () => {
  const message = safeWorkflowErrorMessage(
    new Error("Authorization: Bearer sk-private-token"),
  );
  expect(message).toBe("Provider request failed");
  expect(message).not.toContain("sk-private-token");
});

test("expires a running lease after fifteen minutes", () => {
  const now = new Date("2026-07-26T12:20:00Z");
  expect(isLeaseStale("2026-07-26T12:04:59Z", now)).toBe(true);
  expect(isLeaseStale("2026-07-26T12:05:01Z", now)).toBe(false);
});
```

- [ ] **Step 2: Run the test and verify the module is missing**

```bash
bun test tests/worker/workflow-retry.test.ts
```

Expected: FAIL because `workflow-retry.ts` does not exist.

- [ ] **Step 3: Implement retry classification**

Use `APICallError.isInstance(error) && error.isRetryable`. Also accept:

- `DOMException` named `TimeoutError`;
- `TypeError` from a failed `fetch`;
- record-like errors with status/statusCode 408, 429, or 500–599;
- an explicit `{ transient: true }` provider error.

All other errors are permanent. Never infer retryability from user-visible
message text.

- [ ] **Step 4: Guard completed and active duplicate deliveries**

First make service dependencies injectable without changing production
construction:

```ts
export interface WorkflowExecutionDependencies {
  workflowAiResearchService?: WorkflowAiResearchService;
}

constructor(
  private db: DrizzleD1Database<Record<string, unknown>>,
  dependencies: WorkflowExecutionDependencies = {},
) {
  this.workflowService = new WorkflowService(db);
  this.contactService = new ContactService(db);
  this.tagService = new TagService(db);
  this.workflowAiResearchService =
    dependencies.workflowAiResearchService ?? new WorkflowAiResearchService();
}
```

Merge the optional dependency into the existing constructor; keep the existing
`WorkflowService`, `ContactService`, and `TagService` initialization exactly as
it is in the implementation.

After loading the step log, completed/skipped duplicates may repair the
continuation but may not re-run the step:

```ts
const attempt = options?.attempt ?? 1;
const existingLog = stepLogs[stepIndex];
if (existingLog?.status === "completed" || existingLog?.status === "skipped") {
  await this.enqueueNextOrComplete(run, full.steps, stepIndex, env, existingLog);
  return;
}
```

Evaluate the per-step condition, then atomically claim the execution lease
before invoking any step action:

```ts
const claimedLogs = await this.workflowService.claimStepLease(
  workflowRunId,
  stepIndex,
  attempt,
  new Date(),
);
if (!claimedLogs) {
  return;
}
const stepLogs = claimedLogs;
```

Implement `claimStepLease` as one conditional D1 `UPDATE ... RETURNING`, not a
read-then-write:

```ts
async claimStepLease(
  runId: string,
  stepIndex: number,
  attempt: number,
  now: Date,
): Promise<StepLog[] | null> {
  const statusPath = `$[${stepIndex}].status`;
  const startedPath = `$[${stepIndex}].startedAt`;
  const progressPath = `$[${stepIndex}].progress`;
  const nextRetryPath = `$[${stepIndex}].progress.nextRetryAt`;
  const leasePath = `$[${stepIndex}].progress.leaseStartedAt`;
  const nowIso = now.toISOString();
  const staleBefore = new Date(now.getTime() - 15 * 60_000).toISOString();
  const progress: WorkflowStepProgress = {
    phase: "preparing",
    message: "Preparing step inputs",
    attempt,
    maxAttempts: MAX_WORKFLOW_ATTEMPTS,
    leaseStartedAt: nowIso,
  };

  const rows = await this.db
    .update(dbSchema.workflowRuns)
    .set({
      stepLogs: sql`json_set(
        ${dbSchema.workflowRuns.stepLogs},
        ${statusPath}, 'running',
        ${startedPath}, ${nowIso},
        ${progressPath}, json(${JSON.stringify(progress)})
      )` as unknown as null,
    })
    .where(and(
      eq(dbSchema.workflowRuns.id, runId),
      eq(dbSchema.workflowRuns.status, "running"),
      sql`(
        json_extract(${dbSchema.workflowRuns.stepLogs}, ${statusPath}) = 'pending'
        OR (
          json_extract(${dbSchema.workflowRuns.stepLogs}, ${statusPath}) = 'retrying'
          AND json_extract(${dbSchema.workflowRuns.stepLogs}, ${nextRetryPath}) <= ${nowIso}
        )
        OR (
          json_extract(${dbSchema.workflowRuns.stepLogs}, ${statusPath}) = 'running'
          AND json_extract(${dbSchema.workflowRuns.stepLogs}, ${leasePath}) <= ${staleBefore}
        )
      )`,
    ))
    .returning({ stepLogs: dbSchema.workflowRuns.stepLogs });

  return rows[0]?.stepLogs
    ? rows[0].stepLogs as StepLog[]
    : null;
}
```

Import `sql` and `and` from Drizzle. Use JSON paths built only from the
server-controlled numeric `stepIndex`.

Extract `enqueueNextOrComplete` so the duplicate and normal completion paths
use the same continuation rules. It must:

- complete the run without enqueueing when `log.output.continued === false`;
- preserve a Wait step's original not-before time using `completedAt` plus
  `output.waitSeconds`;
- enqueue the next index otherwise;
- tolerate duplicate continuation messages because the next step also requires
  the atomic lease.

- [ ] **Step 5: Re-enqueue transient failures**

In the catch block, before marking the run failed:

```ts
const delaySeconds =
  isTransientWorkflowError(error) ? retryDelaySeconds(attempt) : null;
if (delaySeconds !== null) {
  const nextRetryAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
  stepLogs[stepIndex].status = "retrying";
  stepLogs[stepIndex].progress = {
    phase: "retrying",
    message: `Retrying after a temporary provider error`,
    attempt: attempt + 1,
    maxAttempts: MAX_WORKFLOW_ATTEMPTS,
    nextRetryAt,
  };
  await this.workflowService.updateStepLogs(workflowRunId, stepLogs);
  await env.WORKFLOW_QUEUE.send(
    { workflowRunId, stepIndex, attempt: attempt + 1 },
    { delaySeconds },
  );
  return;
}
```

Scrub secrets through `safeWorkflowErrorMessage(error)` before a permanent
message is written. Return stable corrective messages for known status/code
values and a generic `Provider request failed` for strings containing bearer,
authorization, API-key, token, secret, password, or cookie-shaped material.
Log only the scrubbed message plus run/step/type identifiers; do not pass the
raw provider error to `console.error`.

- [ ] **Step 6: Pass queue attempts through the consumer**

Extend the body type in `worker/index.ts`:

```ts
{
  workflowRunId: string;
  stepIndex: number;
  remainingDelay?: number;
  attempt?: number;
}
```

Call:

```ts
await executionService.executeStep(
  workflowRunId,
  stepIndex,
  env,
  { attempt: attempt ?? 1 },
);
```

- [ ] **Step 7: Add execution-level retry tests**

In `tests/worker/workflow-retry.test.ts`, seed a run with an AI step, inject an
AI service that throws `{ statusCode: 429 }`, and use a queue fake:

```ts
const sent: Array<{ body: unknown; options?: QueueSendOptions }> = [];
const queue = {
  send: async (body: unknown, options?: QueueSendOptions) => {
    sent.push({ body, options });
  },
} as Queue;
```

Assert status `retrying`, attempt `2`, delay `15`, and run status still
`running`. Add a permanent 401 case and assert the run fails without enqueue.
Run two `executeStep` calls concurrently against a deferred fake AI service and
assert the fake is invoked exactly once. Add a retrying log whose
`nextRetryAt` is still in the future and assert an early delivery cannot claim
the lease.

- [ ] **Step 8: Run focused tests and commit**

```bash
bun test tests/worker/workflow-retry.test.ts tests/worker/workflow-operational-facts.test.ts
bun run build
git add worker/lib/workflow-retry.ts worker/services/workflow-service.ts worker/services/workflow-execution-service.ts worker/index.ts tests/worker/workflow-retry.test.ts
git commit -m "feat(workflows): retry transient background steps safely"
```

---

### Task 6: Auto-open and follow a newly started test run

**Files:**

- Modify: `src/components/WorkflowRunDialog.tsx`
- Modify: `src/pages/WorkflowBuilder.tsx`
- Test: `tests/workflow-run-dialog.test.tsx`

**Interfaces:**

- Changes: `WorkflowRunDialogProps.onSuccess?: (runId: string | null) => void`
- Produces: builder state `expandedRunId` set from the returned test run ID

- [ ] **Step 1: Write a failing dialog callback test**

Mock the test endpoint to return `{ success: true, runId: "run-123" }`, submit
the dialog, and assert:

```ts
expect(onSuccess).toHaveBeenCalledWith("run-123");
```

For audience mode, return `{ success: true, started: 4 }` and assert
`onSuccess(null)`.

- [ ] **Step 2: Run the test and verify the callback receives no ID**

```bash
bun test tests/workflow-run-dialog.test.tsx
```

Expected: FAIL because `onSuccess` currently has no parameter.

- [ ] **Step 3: Return the run ID and expand it**

Type the mutation response:

```ts
interface RunResponse {
  runId?: string;
  started?: number;
}
```

In `onSuccess(data)` call `onSuccess?.(data.runId ?? null)`. In
`WorkflowBuilder.tsx`:

```tsx
onSuccess={(runId) => {
  queryClient.invalidateQueries({ queryKey: runsQueryKey });
  setActiveTab("runs");
  if (runId) setExpandedRunId(runId);
}}
```

The existing three-second polling follows the persisted phases.

- [ ] **Step 4: Run test/build and commit**

```bash
bun test tests/workflow-run-dialog.test.tsx
bun run build
git add src/components/WorkflowRunDialog.tsx src/pages/WorkflowBuilder.tsx tests/workflow-run-dialog.test.tsx
git commit -m "feat(workflows): follow queued test runs"
```

---

### Task 7: Foundation regression verification

**Files:**

- Modify only if verification exposes a defect in files already touched by this plan.

**Interfaces:**

- Consumes all prior tasks.
- Produces a shippable AI/background foundation for the PostHog plan.

- [ ] **Step 1: Run all focused tests**

```bash
bun test \
  tests/ai-research-defaults.test.ts \
  tests/workflow-run-dialog.test.tsx \
  tests/worker/workflow-runtime.test.ts \
  tests/worker/workflow-operational-facts.test.ts \
  tests/worker/workflow-ai-research-progress.test.ts \
  tests/worker/workflow-retry.test.ts \
  tests/worker/workflow-run-detail.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the full suite**

```bash
bun test
```

Expected: PASS.

- [ ] **Step 3: Run typecheck and production build**

```bash
bun run build
```

Expected: `cf-typegen`, all TypeScript projects, and Vite build pass.

- [ ] **Step 4: Inspect the diff for secrets and unrelated changes**

```bash
git diff --check
git status --short
rg -n "api[_-]?key|authorization|bearer" worker/services/workflow-execution-service.ts worker/lib/workflow-retry.ts
```

Expected: no credentials, no whitespace errors, and only planned files.

- [ ] **Step 5: Commit verification-only fixes if needed**

If verification required a code change:

```bash
git add \
  src/lib/ai-research-defaults.ts \
  src/lib/workflow-variables.ts \
  src/pages/WorkflowBuilder.tsx \
  src/components/WorkflowRunDialog.tsx \
  src/components/WorkflowStepLog.tsx \
  worker/lib/workflow-runtime.ts \
  worker/lib/workflow-retry.ts \
  worker/services/workflow-service.ts \
  worker/services/workflow-execution-service.ts \
  worker/services/workflow-ai-research-service.ts \
  worker/index.ts \
  tests/ai-research-defaults.test.ts \
  tests/workflow-run-dialog.test.tsx \
  tests/worker/workflow-runtime.test.ts \
  tests/worker/workflow-operational-facts.test.ts \
  tests/worker/workflow-ai-research-progress.test.ts \
  tests/worker/workflow-retry.test.ts \
  tests/worker/workflow-run-detail.test.ts
git commit -m "fix(workflows): resolve AI background regressions"
```

If no code changed, do not create an empty commit.

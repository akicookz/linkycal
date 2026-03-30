# Workflow Execution Engine — Implementation Plan

## Overview
The CRUD layer and UI are fully built. This plan adds the runtime: trigger dispatch, step execution via Cloudflare Queue, and loop prevention.

---

## Task 1: Create `WorkflowExecutionService` (`worker/services/workflow-execution-service.ts`)

New service with two main methods:

### `dispatchTrigger(projectId, trigger, context, env)`
1. Query `workflows` where `projectId` matches, `trigger` matches, `status = "active"`
2. For each matching workflow:
   - Call `WorkflowService.createRun(workflowId, triggerId, JSON.stringify(context))`
   - Call `env.WORKFLOW_QUEUE.send({ workflowRunId: run.id, stepIndex: 0 })`

### `executeStep(workflowRunId, stepIndex, env)`
1. Load run from DB, parse `context` JSON
2. Load workflow + steps (via `WorkflowService.getFullWorkflow`)
3. Get step at `stepIndex` from sorted steps
4. If no step at index → `completeRun()`
5. Switch on `step.type`:
   - **`send_email`**: `fetch(RESEND_API_URL, ...)` with config `{ to, subject, html }`. Use `env.RESEND_API_KEY`. Support template variables like `{{contact_name}}`, `{{contact_email}}` replaced from context.
   - **`add_tag`**: `ContactService.addTag(context.contactId, config.tagId)` — skip if no contactId
   - **`remove_tag`**: `ContactService.removeTag(context.contactId, config.tagId)` — skip if no contactId
   - **`wait`**: Re-enqueue with `delaySeconds` calculated from `config.duration` + `config.unit` (minutes/hours/days). CF Queues supports `{ delaySeconds }` option.
   - **`condition`**: Evaluate `config.field` against `config.value` using `config.operator`. If false, skip remaining steps → `completeRun()`. If true, continue.
   - **`webhook`**: `fetch(config.url, { method: config.method, headers: JSON.parse(config.headers), body: config.body })` with 10s timeout via `AbortSignal.timeout(10000)`.
   - **`update_contact`**: `ContactService.update(context.contactId, { [config.field]: config.value })` — need to check if `update()` method exists, may need to add it.
6. Call `WorkflowService.updateRunProgress(runId, stepIndex)`
7. Enqueue next: `env.WORKFLOW_QUEUE.send({ workflowRunId, stepIndex: stepIndex + 1 })`
8. On error: `WorkflowService.failRun(runId, error.message)`

### TriggerContext interface
```typescript
interface TriggerContext {
  projectId: string;
  contactId?: string;
  contactEmail?: string;
  contactName?: string;
  formResponseId?: string;
  bookingId?: string;
  tagId?: string;
  metadata?: Record<string, unknown>;
}
```

---

## Task 2: Add `context` column to `workflowRuns`

**File: `worker/db/schema.ts`** line 606, add before `currentStepIndex`:
```typescript
context: text("context"),
```

**Then run:** `bun run db:generate` to create migration.

**Update `WorkflowService.createRun()`** to accept context:
```typescript
async createRun(workflowId: string, triggerId?: string, context?: string) {
  // ... add context to .values({...})
}
```

---

## Task 3: Wire trigger dispatch into existing endpoints

Add a helper function near `notifyFormResponseCompleted` (~line 399):

```typescript
async function dispatchWorkflowTrigger(
  db: DrizzleD1Database<Record<string, unknown>>,
  env: AppEnv,
  projectId: string,
  trigger: string,
  context: TriggerContext,
) {
  const executionService = new WorkflowExecutionService(db);
  await executionService.dispatchTrigger(projectId, trigger, context, env);
}
```

### Dispatch points (all wrapped in `c.executionCtx.waitUntil()`):

| Trigger | File:Line | Context |
|---|---|---|
| `form_submitted` | `worker/index.ts:~1102` (after completion check) | `{ projectId: form.projectId, formResponseId: response.id, contactEmail: respondentEmail }` |
| `form_submitted` | `worker/index.ts:~1363` (public shareable link) | Same as above |
| `form_submitted` | `worker/index.ts:~1494` (native HTML form) | Same as above |
| `booking_created` | `worker/index.ts:~854` (after bookingService.create) | `{ projectId: eventType.projectId, bookingId: booking.id, contactEmail: data.email, contactName: data.name }` |
| `booking_pending` | Same location, when `isPending` is true | Same context |
| `booking_confirmed` | `worker/index.ts:~2483` (after bookingService.confirm) | `{ projectId, bookingId: booking.id }` — need to load booking to get contact info |
| `booking_cancelled` | `worker/index.ts:~2315` (after bookingService.cancel) | `{ projectId, bookingId: id }` |
| `tag_added` | `worker/index.ts:~3162` (after service.addTag) | `{ projectId, contactId, tagId }` |

For form_submitted: need to resolve `projectId` from the form. The form object is already loaded in scope at all 3 locations.

---

## Task 4: Implement queue consumer

**File: `worker/index.ts`** lines 4100-4121. Replace stub:

```typescript
async queue(
  batch: MessageBatch<{ workflowRunId: string; stepIndex: number }>,
  env: import("./types").AppEnv,
) {
  const db = drizzle(env.DB, { schema });
  const executionService = new WorkflowExecutionService(db);

  for (const message of batch.messages) {
    try {
      const { workflowRunId, stepIndex } = message.body;
      await executionService.executeStep(workflowRunId, stepIndex, env);
      message.ack();
    } catch (err) {
      console.error("Workflow step failed:", err);
      message.retry();
    }
  }
},
```

---

## Task 5: Fix validation drift

**File: `worker/validation.ts`** lines 318-355:

1. Add `"booking_pending"` and `"booking_confirmed"` to trigger enums in both `createWorkflowSchema` and `updateWorkflowSchema`
2. Extract step type enum to a shared const: `const workflowStepTypeEnum = z.enum([...])`
3. Add `updateWorkflowStepSchema`:
```typescript
export const updateWorkflowStepSchema = z.object({
  sortOrder: z.number().int().min(0).optional(),
  type: workflowStepTypeEnum.optional(),
  config: z.record(z.string(), z.unknown()).nullable().optional(),
});
```
4. Wire `updateWorkflowStepSchema` into the PUT step endpoint at `worker/index.ts:~3357`

**Also update `WorkflowService.create()` and `update()`** trigger type to include `"booking_pending" | "booking_confirmed"`.

---

## Task 6: Add manual trigger endpoint

**File: `worker/index.ts`**, add after the runs endpoint (~line 3412):

```typescript
// POST /api/projects/:projectId/workflows/:workflowId/trigger
```

1. Load workflow, verify `trigger === "manual"` and `status === "active"`
2. Accept optional `{ contactId?: string }` body
3. Build context: `{ projectId, contactId }`
4. Create run + enqueue step 0
5. Return `{ run }` with 201

---

## Task 7: Loop prevention

**Approach:** The `dispatchWorkflowTrigger` helper is only called from HTTP request handlers. The queue consumer calls `executeStep` which calls `ContactService.addTag()` etc. directly — it does NOT call `dispatchWorkflowTrigger`. So by design, actions taken by workflow steps won't trigger other workflows.

**However**, we need to ensure that if we later add dispatch calls inside step executors (e.g., tag steps), we have a guard. Two-part approach:

1. **Queue message flag:** Add `_fromWorkflow: true` to the context stored on `workflowRuns`. This is informational/auditable.
2. **No dispatch from queue consumer:** The queue consumer ONLY calls `executeStep()`, never `dispatchTrigger()`. Step executors call services directly (e.g., `ContactService.addTag()`) without going through HTTP routes, so no trigger dispatch happens. Document this contract clearly in code comments.

This is inherently safe because the queue consumer doesn't share code paths with the HTTP handlers that call `dispatchWorkflowTrigger`.

---

## Files Changed Summary

| File | Change |
|---|---|
| `worker/services/workflow-execution-service.ts` | **NEW** — ~200 lines |
| `worker/db/schema.ts` | Add `context` column to `workflowRuns` (1 line) |
| `worker/services/workflow-service.ts` | Update `createRun` signature, update trigger type unions |
| `worker/index.ts` | Wire 7 trigger dispatch points, implement queue consumer, add manual trigger endpoint, import new service |
| `worker/validation.ts` | Add missing triggers, add `updateWorkflowStepSchema` |
| `worker/db/drizzle/XXXX_*.sql` | Auto-generated migration |

## Execution Order
1. Task 2 (schema) → generate migration
2. Task 5 (validation fixes)
3. Task 1 (execution service)
4. Task 4 (queue consumer)
5. Task 3 (wire triggers)
6. Task 6 (manual trigger endpoint)
7. Task 7 (loop prevention comments/guards)
8. `bun run build` to verify

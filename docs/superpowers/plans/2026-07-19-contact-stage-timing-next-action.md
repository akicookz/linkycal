# Contact Stage Timing and Next Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add activity-derived time in stage and a single deadline-bearing Next Action to contacts, expose both in REST/MCP and workflow conditions, and render them in the Kanban and contact-detail interfaces.

**Architecture:** `ContactService` remains the source for contact operational facts: current tag assignments are joined to the newest matching `tag_added` activity, while Next Action is stored on the contact row. Workflow execution refreshes those facts before resolving each step, and the frontend computes live labels from server timestamps using a shared minute clock. The workflow editor uses a condition-only typed catalog so stage facts do not leak into ordinary template inputs.

**Tech Stack:** Bun, TypeScript, Drizzle ORM with Cloudflare D1/SQLite, Hono, React 19, TanStack Query, Tailwind CSS v4, MCP SDK, Zod, Bun test.

## Global Constraints

- Use Bun commands only.
- Use function declarations for named functions and React components.
- Preserve existing workflow condition data and legacy field aliases.
- Keep stage timing tag-specific; do not add a stage column or stage-history table.
- Store one Next Action directly on `contacts` as nullable text plus nullable timestamp.
- Set and clear the two Next Action fields together.
- Store deadlines in UTC and display them in the browser's local timezone.
- Return stage-entry timestamps from the backend and derive elapsed time at display/evaluation time.
- Do not display time in stage for the Untagged column.
- Use icon-and-text buttons, including loading states that replace the original icon with a spinner.
- Do not add a dependency.
- Do not stage unrelated pre-existing changes in `worker/index.ts`, `src/pages/Landing.tsx`, or unrelated files.

---

### Task 1: Persist and mutate Next Action data

**Files:**
- Modify: `worker/db/schema.ts`
- Modify: `worker/validation.ts`
- Modify: `worker/services/contact-service.ts`
- Create: `tests/worker/contact-next-action.test.ts`
- Generate: `worker/db/drizzle/0032_*.sql`
- Generate: `worker/db/drizzle/meta/0032_snapshot.json`
- Modify: `worker/db/drizzle/meta/_journal.json`

**Interfaces:**
- Produces: `setNextActionSchema`
- Produces: `ContactService.setNextAction(contactId, action)`
- Produces: contact fields `nextActionText: string | null` and `nextActionDeadline: Date | null`
- Produces: activity types `next_action_set` and `next_action_completed`

- [ ] **Step 1: Write failing validation and service tests**

```ts
import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import * as dbSchema from "../../worker/db/schema";
import { setNextActionSchema } from "../../worker/validation";
import { ContactService } from "../../worker/services/contact-service";
import { createTestDb } from "./mcp-test-db";

async function seedContact() {
  const db = createTestDb();
  await db.insert(dbSchema.schema.users).values({ id: "u", name: "U", email: "u@example.com" });
  await db.insert(dbSchema.projects).values({ id: "p", userId: "u", name: "P", slug: "p" });
  await db.insert(dbSchema.contacts).values({ id: "c", projectId: "p", name: "Contact" });
  return db;
}

test("accepts a complete action or a complete clear", () => {
  expect(setNextActionSchema.safeParse({
    text: " Send proposal ",
    deadline: "2026-07-25T14:30:00.000Z",
  }).success).toBe(true);
  expect(setNextActionSchema.safeParse({ text: null, deadline: null }).success).toBe(true);
});

test("rejects partial and malformed actions", () => {
  expect(setNextActionSchema.safeParse({ text: "Send proposal", deadline: null }).success).toBe(false);
  expect(setNextActionSchema.safeParse({ text: null, deadline: "2026-07-25T14:30:00.000Z" }).success).toBe(false);
  expect(setNextActionSchema.safeParse({ text: "Send proposal", deadline: "not-a-date" }).success).toBe(false);
});

test("sets, replaces, and completes a next action with audit metadata", async () => {
  const db = await seedContact();
  const service = new ContactService(db);
  const firstDeadline = new Date("2026-07-25T14:30:00.000Z");
  await service.setNextAction("c", { text: "Send proposal", deadline: firstDeadline });
  const set = await service.getById("c");
  expect(set?.nextActionText).toBe("Send proposal");
  expect(set?.nextActionDeadline?.toISOString()).toBe(firstDeadline.toISOString());

  await service.setNextAction("c", null);
  const cleared = await service.getById("c");
  expect(cleared?.nextActionText).toBeNull();
  expect(cleared?.nextActionDeadline).toBeNull();

  const activity = await db.select().from(dbSchema.contactActivity)
    .where(eq(dbSchema.contactActivity.contactId, "c"));
  expect(activity.map((entry) => entry.type)).toContain("next_action_set");
  expect(activity.map((entry) => entry.type)).toContain("next_action_completed");
});

test("completing an empty next action is idempotent", async () => {
  const db = await seedContact();
  const service = new ContactService(db);
  await service.setNextAction("c", null);
  const activity = await service.getActivity("c");
  expect(activity.filter((entry) => entry.type === "next_action_completed")).toHaveLength(0);
});
```

- [ ] **Step 2: Run the focused test and confirm the missing schema/API failure**

Run: `bun test tests/worker/contact-next-action.test.ts`

Expected: FAIL because `setNextActionSchema`, the new columns, activity types, and `setNextAction` do not exist.

- [ ] **Step 3: Add the schema, validation union, and service mutation**

```ts
// worker/db/schema.ts contacts
nextActionText: text("next_action_text"),
nextActionDeadline: integer("next_action_deadline", { mode: "timestamp" }),

// worker/db/schema.ts contact activity enum
"next_action_set",
"next_action_completed",

// worker/db/schema.ts contact_activity indexes
index("contact_activity_stage_entry_idx").on(
  t.contactId,
  t.type,
  t.referenceId,
  t.createdAt,
),

// worker/validation.ts
const nextActionValueSchema = z.object({
  text: z.string().trim().min(1).max(500),
  deadline: z.iso.datetime(),
});

const clearedNextActionSchema = z.object({
  text: z.null(),
  deadline: z.null(),
});

export const setNextActionSchema = z.union([
  nextActionValueSchema,
  clearedNextActionSchema,
]);

// worker/services/contact-service.ts
async setNextAction(
  contactId: string,
  action: { text: string; deadline: Date } | null,
) {
  const previous = await this.getById(contactId);
  if (!previous) return null;

  if (action) {
    await this.db.update(dbSchema.contacts).set({
      nextActionText: action.text.trim(),
      nextActionDeadline: action.deadline,
    }).where(eq(dbSchema.contacts.id, contactId));
    await this.logActivity(contactId, "next_action_set", undefined, {
      text: action.text.trim(),
      deadline: action.deadline.toISOString(),
    });
  } else {
    await this.db.update(dbSchema.contacts).set({
      nextActionText: null,
      nextActionDeadline: null,
    }).where(eq(dbSchema.contacts.id, contactId));
    if (previous.nextActionText && previous.nextActionDeadline) {
      await this.logActivity(contactId, "next_action_completed", undefined, {
        text: previous.nextActionText,
        deadline: previous.nextActionDeadline.toISOString(),
      });
    }
  }
  return this.getById(contactId);
}
```

- [ ] **Step 4: Generate the Drizzle migration**

Run: `bun run db:generate`

Expected: a new migration adding `contacts.next_action_text`, `contacts.next_action_deadline`, and `contact_activity_stage_entry_idx`.

- [ ] **Step 5: Run the focused test**

Run: `bun test tests/worker/contact-next-action.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the persistence slice**

```bash
git add worker/db/schema.ts worker/validation.ts worker/services/contact-service.ts tests/worker/contact-next-action.test.ts worker/db/drizzle
git commit -m "feat: persist contact next actions"
```

---

### Task 2: Derive current stage-entry timestamps in batched contact facts

**Files:**
- Modify: `worker/services/contact-service.ts`
- Modify: `tests/worker/contact-pipeline.test.ts`

**Interfaces:**
- Produces: `ContactOperationalFacts`
- Produces: `ContactService.getOperationalFacts(contactIds: string[])`
- Produces: `enteredAtByTagId: Record<string, string>` on decorated contacts
- Consumes: `contacts.nextActionText` and `contacts.nextActionDeadline` from Task 1

- [ ] **Step 1: Write failing stage-fact tests**

```ts
test("uses the latest matching tag-added activity and resets after re-entry", async () => {
  const db = await seed();
  const service = new ContactService(db);
  await db.insert(dbSchema.contactTags).values({ contactId: "c", tagId: "lead" });
  await db.insert(dbSchema.contactActivity).values([
    { id: "old", contactId: "c", type: "tag_added", referenceId: "lead", createdAt: new Date("2026-07-01T00:00:00Z") },
    { id: "new", contactId: "c", type: "tag_added", referenceId: "lead", createdAt: new Date("2026-07-10T12:00:00Z") },
  ]);
  const facts = await service.getOperationalFacts(["c"]);
  expect(facts.c.enteredAtByTagId.lead).toBe("2026-07-10T12:00:00.000Z");
});

test("falls back to contact creation only for a currently assigned tag", async () => {
  const db = await seed();
  const service = new ContactService(db);
  await db.insert(dbSchema.contactTags).values({ contactId: "c", tagId: "lead" });
  const facts = await service.getOperationalFacts(["c"]);
  expect(facts.c.enteredAtByTagId.lead).toBeDefined();
  expect(facts.c.enteredAtByTagId.prospect).toBeUndefined();
});

test("decorates contacts beyond the first D1 chunk", async () => {
  const db = await seed();
  const service = new ContactService(db);
  const rows = Array.from({ length: 150 }, (_, index) => ({
    id: `timed-${index}`,
    projectId: "p",
    name: `Timed ${index}`,
  }));
  await db.insert(dbSchema.contacts).values(rows);
  await db.insert(dbSchema.contactTags).values(
    rows.map((contact) => ({ contactId: contact.id, tagId: "lead" })),
  );
  await db.insert(dbSchema.contactActivity).values(
    rows.map((contact, index) => ({
      id: `timed-activity-${index}`,
      contactId: contact.id,
      type: "tag_added" as const,
      referenceId: "lead",
      createdAt: new Date("2026-07-10T12:00:00.000Z"),
    })),
  );
  const decorated = await service.listWithTags("p");
  for (const contact of decorated.filter((row) => row.id.startsWith("timed-"))) {
    expect(contact.enteredAtByTagId.lead).toBeDefined();
  }
});
```

- [ ] **Step 2: Run the pipeline test and confirm the missing facts failure**

Run: `bun test tests/worker/contact-pipeline.test.ts`

Expected: FAIL because `getOperationalFacts` and `enteredAtByTagId` do not exist.

- [ ] **Step 3: Add the activity lookup index and operational-facts service**

```ts
export interface ContactOperationalFacts {
  enteredAtByTagId: Record<string, string>;
  nextAction: { text: string; deadline: string } | null;
}

async getOperationalFacts(
  contactIds: string[],
): Promise<Record<string, ContactOperationalFacts>> {
  if (contactIds.length === 0) return {};
  const contacts = [] as Array<{
    id: string;
    createdAt: Date;
    nextActionText: string | null;
    nextActionDeadline: Date | null;
  }>;
  const assignments: Array<{ contactId: string; tagId: string }> = [];
  const latestEntries: Array<{
    contactId: string;
    tagId: string | null;
    enteredAt: number;
  }> = [];

  for (const ids of chunk(contactIds, CONTACT_ID_CHUNK)) {
    contacts.push(...await this.db.select({
      id: dbSchema.contacts.id,
      createdAt: dbSchema.contacts.createdAt,
      nextActionText: dbSchema.contacts.nextActionText,
      nextActionDeadline: dbSchema.contacts.nextActionDeadline,
    }).from(dbSchema.contacts).where(inArray(dbSchema.contacts.id, ids)));
    assignments.push(...await this.db.select({
      contactId: dbSchema.contactTags.contactId,
      tagId: dbSchema.contactTags.tagId,
    }).from(dbSchema.contactTags).where(inArray(dbSchema.contactTags.contactId, ids)));
    latestEntries.push(...await this.db.select({
      contactId: dbSchema.contactActivity.contactId,
      tagId: dbSchema.contactActivity.referenceId,
      enteredAt: sql<number>`max(${dbSchema.contactActivity.createdAt})`,
    }).from(dbSchema.contactActivity).where(and(
      inArray(dbSchema.contactActivity.contactId, ids),
      eq(dbSchema.contactActivity.type, "tag_added"),
      isNotNull(dbSchema.contactActivity.referenceId),
    )).groupBy(dbSchema.contactActivity.contactId, dbSchema.contactActivity.referenceId));
  }

  const rowsById = new Map(contacts.map((contact) => [contact.id, contact]));
  const latestByAssignment = new Map(
    latestEntries
      .filter((entry): entry is typeof entry & { tagId: string } => !!entry.tagId)
      .map((entry) => [`${entry.contactId}:${entry.tagId}`, entry.enteredAt]),
  );
  const facts = Object.fromEntries(contacts.map((contact) => [contact.id, {
    enteredAtByTagId: {},
    nextAction: contact.nextActionText && contact.nextActionDeadline
      ? { text: contact.nextActionText, deadline: contact.nextActionDeadline.toISOString() }
      : null,
  }])) as Record<string, ContactOperationalFacts>;

  for (const assignment of assignments) {
    const contact = rowsById.get(assignment.contactId);
    const currentFacts = facts[assignment.contactId];
    if (!contact || !currentFacts) continue;
    const latest = latestByAssignment.get(`${assignment.contactId}:${assignment.tagId}`);
    currentFacts.enteredAtByTagId[assignment.tagId] = latest == null
      ? contact.createdAt.toISOString()
      : new Date(Number(latest) * 1000).toISOString();
  }
  return facts;
}
```

Call `getOperationalFacts(contactIds)` once from `decorateWithTags` and attach `facts[contact.id].enteredAtByTagId` to each result.

- [ ] **Step 4: Run the pipeline and Next Action tests**

Run: `bun test tests/worker/contact-pipeline.test.ts tests/worker/contact-next-action.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit stage facts**

```bash
git add worker/services/contact-service.ts tests/worker/contact-pipeline.test.ts
git commit -m "feat: derive contact time in stage"
```

---

### Task 3: Refresh workflow operational facts before every step

**Files:**
- Modify: `worker/lib/workflow-runtime.ts`
- Modify: `worker/services/workflow-execution-service.ts`
- Modify: `tests/worker/workflow-runtime.test.ts`
- Modify: `tests/worker/workflow-conditions.test.ts`

**Interfaces:**
- Produces: `WorkflowContactOperationalContext`
- Produces: `buildWorkflowContactOperationalContext(facts, now)`
- Adds: `contactOperational?: WorkflowContactOperationalContext` to `WorkflowTriggerContext`
- Consumes: `ContactService.getOperationalFacts([contactId])`

- [ ] **Step 1: Write failing runtime and condition tests**

```ts
test("exposes exact fractional stage ages and deadline distances", () => {
  const context = buildContext();
  context.contactOperational = buildWorkflowContactOperationalContext({
    enteredAtByTagId: { lead: "2026-07-19T09:30:00.000Z" },
    nextAction: { text: "Call", deadline: "2026-07-19T13:00:00.000Z" },
  }, new Date("2026-07-19T12:00:00.000Z"));
  expect(resolveWorkflowValue(context, "contact.stage.byTag.lead.ageHours")).toBe(2.5);
  expect(resolveWorkflowValue(context, "contact.nextAction.hoursUntilDeadline")).toBe(1);
  expect(resolveWorkflowValue(context, "contact.nextAction.overdue")).toBe(false);
});

test("omits next action facts when the action is incomplete", () => {
  const context = buildContext();
  context.contactOperational = buildWorkflowContactOperationalContext({
    enteredAtByTagId: {},
    nextAction: null,
  }, new Date("2026-07-19T12:00:00.000Z"));
  expect(resolveWorkflowValue(context, "contact.nextAction.overdue")).toBeUndefined();
  expect(evaluateWorkflowCondition({
    when: "all",
    rules: [{ source: "contact.nextAction.overdue", operator: "equals", value: "false" }],
  }, context)).toBe(false);
});

test("uses negative deadline distance for overdue actions", () => {
  const context = buildContext();
  context.contactOperational = buildWorkflowContactOperationalContext({
    enteredAtByTagId: {},
    nextAction: { text: "Call", deadline: "2026-07-19T10:00:00.000Z" },
  }, new Date("2026-07-19T12:00:00.000Z"));
  expect(resolveWorkflowValue(context, "contact.nextAction.hoursUntilDeadline")).toBe(-2);
  expect(resolveWorkflowValue(context, "contact.nextAction.overdue")).toBe(true);
});
```

- [ ] **Step 2: Run workflow tests and confirm missing operational context failures**

Run: `bun test tests/worker/workflow-runtime.test.ts tests/worker/workflow-conditions.test.ts`

Expected: FAIL because the operational context type and builder do not exist.

- [ ] **Step 3: Implement the operational context view**

```ts
export interface WorkflowContactOperationalContext {
  stage: {
    byTag: Record<string, {
      enteredAt: string;
      ageHours: number;
      ageDays: number;
    }>;
  };
  nextAction?: {
    text: string;
    deadline: string;
    overdue: boolean;
    hoursUntilDeadline: number;
    daysUntilDeadline: number;
  };
}

export function buildWorkflowContactOperationalContext(
  facts: ContactOperationalFacts,
  now: Date,
): WorkflowContactOperationalContext {
  const nowMs = now.getTime();
  const byTag: WorkflowContactOperationalContext["stage"]["byTag"] = {};
  for (const [tagId, enteredAt] of Object.entries(facts.enteredAtByTagId)) {
    const enteredAtMs = new Date(enteredAt).getTime();
    if (!Number.isFinite(enteredAtMs)) continue;
    byTag[tagId] = {
      enteredAt,
      ageHours: (nowMs - enteredAtMs) / 3_600_000,
      ageDays: (nowMs - enteredAtMs) / 86_400_000,
    };
  }

  const operational: WorkflowContactOperationalContext = { stage: { byTag } };
  if (facts.nextAction) {
    const deadlineMs = new Date(facts.nextAction.deadline).getTime();
    if (Number.isFinite(deadlineMs)) {
      operational.nextAction = {
        text: facts.nextAction.text,
        deadline: facts.nextAction.deadline,
        overdue: deadlineMs < nowMs,
        hoursUntilDeadline: (deadlineMs - nowMs) / 3_600_000,
        daysUntilDeadline: (deadlineMs - nowMs) / 86_400_000,
      };
    }
  }
  return operational;
}
```

Merge the operational structure into `buildWorkflowContextView().contact` after the stable identity fields.

- [ ] **Step 4: Hydrate before input resolution and the step gate**

In `WorkflowExecutionService.executeStep`, immediately before assigning `context.stepInputs`, execute:

```ts
await this.refreshContactOperationalContext(context);
context.stepInputs = resolveStepInputs(config.inputs, context);
```

Add:

```ts
private async refreshContactOperationalContext(context: TriggerContext) {
  if (!context.contactId) {
    delete context.contactOperational;
    return;
  }
  const byContact = await this.contactService.getOperationalFacts([context.contactId]);
  const facts = byContact[context.contactId];
  context.contactOperational = facts
    ? buildWorkflowContactOperationalContext(facts, new Date())
    : { stage: { byTag: {} } };
}
```

- [ ] **Step 5: Run workflow tests**

Run: `bun test tests/worker/workflow-runtime.test.ts tests/worker/workflow-conditions.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit runtime hydration**

```bash
git add worker/lib/workflow-runtime.ts worker/services/workflow-execution-service.ts tests/worker/workflow-runtime.test.ts tests/worker/workflow-conditions.test.ts
git commit -m "feat: hydrate live contact workflow facts"
```

---

### Task 4: Build a typed, condition-only workflow source catalog

**Files:**
- Create: `src/lib/workflow-condition-variables.ts`
- Create: `tests/workflow-condition-variables.test.ts`
- Modify: `src/components/WorkflowConditionEditor.tsx`
- Modify: `src/pages/WorkflowBuilder.tsx`

**Interfaces:**
- Produces: `WorkflowConditionValueType = "text" | "number" | "boolean" | "timestamp"`
- Produces: `buildWorkflowConditionVariableGroups(tags, savedSources)`
- Changes: `WorkflowConditionEditor` accepts `variables: WorkflowConditionVariableGroup[]`
- Consumes: project tags already loaded by `WorkflowBuilder`

- [ ] **Step 1: Write failing catalog tests**

```ts
test("builds hour and day stage sources for every project tag", () => {
  const groups = buildWorkflowConditionVariableGroups([
    { id: "follow-up", name: "Follow Up" },
  ], []);
  const items = groups.flatMap((group) => group.items);
  expect(items).toContainEqual(expect.objectContaining({
    key: "contact.stage.byTag.follow-up.ageHours",
    label: "Follow Up — time in stage (hours)",
    valueType: "number",
  }));
  expect(items).toContainEqual(expect.objectContaining({
    key: "contact.stage.byTag.follow-up.ageDays",
    valueType: "number",
  }));
});

test("includes typed next-action sources", () => {
  const items = buildWorkflowConditionVariableGroups([], []).flatMap((group) => group.items);
  expect(items).toContainEqual(expect.objectContaining({ key: "contact.nextAction.overdue", valueType: "boolean" }));
  expect(items).toContainEqual(expect.objectContaining({ key: "contact.nextAction.deadline", valueType: "timestamp" }));
});

test("retains a deleted saved tag source", () => {
  const key = "contact.stage.byTag.deleted.ageHours";
  const items = buildWorkflowConditionVariableGroups([], [key]).flatMap((group) => group.items);
  expect(items).toContainEqual(expect.objectContaining({ key, label: "Stage tag removed", valueType: "number" }));
});
```

- [ ] **Step 2: Run the catalog test and confirm the missing module failure**

Run: `bun test tests/workflow-condition-variables.test.ts`

Expected: FAIL because the catalog module does not exist.

- [ ] **Step 3: Implement the catalog and operator mapping**

```ts
export const OPERATORS_BY_VALUE_TYPE = {
  text: ["equals", "not_equals", "contains", "not_contains", "exists", "not_exists"],
  number: ["equals", "not_equals", "gt", "lt", "gte", "lte", "exists", "not_exists"],
  boolean: ["equals", "not_equals", "exists", "not_exists"],
  timestamp: ["exists", "not_exists"],
} satisfies Record<WorkflowConditionValueType, WorkflowConditionOperator[]>;
```

Create fixed Next Action items and dynamic stage items keyed by tag ID. Add a synthetic `Stage tag removed` item for every saved stage source absent from the current tag list.

- [ ] **Step 4: Update the editor controls and WorkflowBuilder wiring**

Pass `tags` and the currently saved rule sources to the catalog builder in `WorkflowBuilder`, then pass its result to `WorkflowConditionEditor`.

When a source changes, reset the operator to the source type's first allowed operator and reset `value` to `""`. Render:

```tsx
{valueType === "boolean" ? (
  <Select value={String(rule.value ?? "false")} onValueChange={(value) => updateRule(idx, { value })}>
    <SelectTrigger className="h-7 w-[120px] bg-background text-[11px]"><SelectValue /></SelectTrigger>
    <SelectContent><SelectItem value="true">True</SelectItem><SelectItem value="false">False</SelectItem></SelectContent>
  </Select>
) : valueType === "number" ? (
  <Input type="number" className="h-7 w-[160px] bg-background text-[11px]" value={String(rule.value ?? "")} onChange={(event) => updateRule(idx, { value: event.target.value })} />
) : valueType === "text" ? (
  <Input className="h-7 w-[160px] bg-background text-[11px]" value={String(rule.value ?? "")} onChange={(event) => updateRule(idx, { value: event.target.value })} />
) : null}
```

Use an icon-and-text Remove button for each rule.

- [ ] **Step 5: Run catalog tests and TypeScript through the build**

Run: `bun test tests/workflow-condition-variables.test.ts && bun run build`

Expected: tests PASS and build exits 0.

- [ ] **Step 6: Commit the condition editor slice**

```bash
git add src/lib/workflow-condition-variables.ts tests/workflow-condition-variables.test.ts src/components/WorkflowConditionEditor.tsx src/pages/WorkflowBuilder.tsx
git commit -m "feat: add contact timing workflow conditions"
```

---

### Task 5: Show live time in stage on Kanban cards

**Files:**
- Create: `src/lib/contact-time.ts`
- Create: `src/hooks/use-minute-now.ts`
- Create: `tests/contact-time.test.ts`
- Modify: `src/lib/contacts-view.ts`
- Modify: `src/pages/ContactsKanban.tsx`
- Modify: `tests/contacts-view.test.ts`

**Interfaces:**
- Produces: `formatTimeInStage(enteredAt, now)`
- Produces: `formatNextActionRelative(deadline, now)` for Task 6
- Produces: `toDatetimeLocalValue(iso)` and `datetimeLocalToIso(value)` for Task 6
- Produces: `useMinuteNow()`
- Adds: `enteredAtByTagId: Record<string, string>` to `ViewContact`

- [ ] **Step 1: Write failing formatter tests**

```ts
test("formats stage duration using floored hours and days", () => {
  const now = new Date("2026-07-19T12:00:00.000Z");
  expect(formatTimeInStage("2026-07-19T11:30:00.000Z", now)).toBe("<1h in stage");
  expect(formatTimeInStage("2026-07-19T06:00:00.000Z", now)).toBe("6h in stage");
  expect(formatTimeInStage("2026-07-16T11:00:00.000Z", now)).toBe("3d in stage");
});

test("returns null for an absent or invalid stage timestamp", () => {
  expect(formatTimeInStage(undefined, new Date())).toBeNull();
  expect(formatTimeInStage("invalid", new Date())).toBeNull();
});

test("formats future and overdue Next Action labels", () => {
  const now = new Date("2026-07-19T12:00:00.000Z");
  expect(formatNextActionRelative("2026-07-19T16:00:00.000Z", now)).toBe("Due in 4 hours");
  expect(formatNextActionRelative("2026-07-17T12:00:00.000Z", now)).toBe("Overdue by 2 days");
});
```

- [ ] **Step 2: Run formatter tests and confirm the missing module failure**

Run: `bun test tests/contact-time.test.ts`

Expected: FAIL because `src/lib/contact-time.ts` does not exist.

- [ ] **Step 3: Implement pure time helpers and the shared minute hook**

```ts
export function useMinuteNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}
```

The pure formatters parse ISO timestamps, floor elapsed units, and return `null` for invalid values. The local input helpers use the browser's local date parts for display and `new Date(value).toISOString()` for submission.

- [ ] **Step 4: Extend contact list types and render the real column's timestamp**

Add `enteredAtByTagId: Record<string, string>` to `ViewContact` and the test factory. In `KanbanCard`, call `useMinuteNow()`, select `contact.enteredAtByTagId[columnId]` only when `columnId !== UNTAGGED_COLUMN_ID`, and render the label with a `Clock` icon beneath the contact fields.

- [ ] **Step 5: Run focused tests**

Run: `bun test tests/contact-time.test.ts tests/contacts-view.test.ts tests/worker/contact-pipeline.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the Kanban slice**

```bash
git add src/lib/contact-time.ts src/hooks/use-minute-now.ts tests/contact-time.test.ts src/lib/contacts-view.ts src/pages/ContactsKanban.tsx tests/contacts-view.test.ts
git commit -m "feat: show live time in contact stages"
```

---

### Task 6: Add the Next Action REST endpoint and contact-detail card

**Files:**
- Modify: `worker/index.ts`
- Modify: `src/pages/ContactDetail.tsx`
- Modify: `tests/contact-detail-render.test.tsx`

**Interfaces:**
- Adds: `PUT /api/projects/:projectId/contacts/:contactId/next-action`
- Consumes: `setNextActionSchema` and `ContactService.setNextAction`
- Consumes: time helpers and `useMinuteNow()` from Task 5

- [ ] **Step 1: Add failing render tests for empty and populated states**

```ts
test("renders the Next Action card before Quick Stats", () => {
  const html = renderContactDetail({ nextActionText: null, nextActionDeadline: null });
  expect(html).toMatch(/Next Action[\s\S]*No next action[\s\S]*Add Next Action[\s\S]*Quick Stats/);
});

test("renders action text, local deadline, and completion controls", () => {
  const html = renderContactDetail({
    nextActionText: "Send revised proposal",
    nextActionDeadline: "2026-07-25T14:30:00.000Z",
  });
  expect(html).toContain("Send revised proposal");
  expect(html).toContain("Edit");
  expect(html).toContain("Mark Done");
});
```

- [ ] **Step 2: Run the render test and confirm the missing card failure**

Run: `bun test tests/contact-detail-render.test.tsx`

Expected: FAIL because the Next Action card is absent.

- [ ] **Step 3: Add the project-scoped REST route**

```ts
app.put("/api/projects/:projectId/contacts/:contactId/next-action", async (c) => {
  try {
    const projectId = c.req.param("projectId");
    const contactId = c.req.param("contactId");
    const data = validate(setNextActionSchema, await c.req.json());
    const service = new ContactService(c.get("db"));
    if (!(await service.contactInProject(projectId, contactId))) {
      return c.json({ error: "Contact not found" }, 404);
    }
    const contact = await service.setNextAction(
      contactId,
      data.text === null ? null : { text: data.text, deadline: new Date(data.deadline) },
    );
    return c.json({ contact });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return c.json({ error: "Invalid request" }, 400);
    }
    console.error("Next action update error:", error);
    return c.json({ error: "Failed to update next action" }, 500);
  }
});
```

Import `setNextActionSchema` in the existing validation import block. Preserve all pre-existing `worker/index.ts` changes.

- [ ] **Step 4: Implement the card states and mutation**

Add the nullable fields to `ContactDetail`, local editor state, and one mutation that sends either complete values or `{ text: null, deadline: null }`. On success, write `data.contact` into the detail query cache and invalidate the contact list query.

Render the card above Quick Stats. Use `CalendarClock`, `Pencil`, `Check`, `Save`, and `XIcon` icons with text. Keep a failed mutation in edit mode and show `Failed to update next action.` inline. Disable Save until trimmed text and a parseable local deadline are both present.

- [ ] **Step 5: Run the contact-detail and Next Action tests**

Run: `bun test tests/contact-detail-render.test.tsx tests/contact-time.test.ts tests/worker/contact-next-action.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit only the feature hunks**

Stage `src/pages/ContactDetail.tsx` and its render test together; these files also contain the previously approved inline-tag work and therefore belong in the resulting contact-detail commit. Stage only the new route/import hunks from `worker/index.ts` using interactive patch mode.

```bash
git add src/pages/ContactDetail.tsx tests/contact-detail-render.test.tsx
git add -p worker/index.ts
git commit -m "feat: manage contact next actions"
```

---

### Task 7: Expose Next Action mutations through MCP

**Files:**
- Modify: `worker/mcp/tools/contacts.ts`
- Modify: `tests/worker/mcp-tools.test.ts`

**Interfaces:**
- Produces: `setContactNextAction(ctx, input)`
- Produces: `completeContactNextAction(ctx, input)`
- Registers: `set_contact_next_action`
- Registers: `complete_contact_next_action`

- [ ] **Step 1: Write failing project-scoping and mutation tests**

```ts
test("sets and completes a Next Action only for an owned contact", async () => {
  const { ctxA } = await seedFixture();
  const foreign = await setContactNextAction(ctxA, {
    contactId: "ct-b1",
    text: "Call",
    deadline: "2026-07-25T14:30:00.000Z",
  });
  expect(foreign.isError).toBe(true);

  const set = await setContactNextAction(ctxA, {
    contactId: "ct-a1",
    text: "Call",
    deadline: "2026-07-25T14:30:00.000Z",
  });
  expect((parsed(set) as { nextActionText: string }).nextActionText).toBe("Call");

  const completed = await completeContactNextAction(ctxA, { contactId: "ct-a1" });
  expect((parsed(completed) as { nextActionText: null }).nextActionText).toBeNull();
});
```

- [ ] **Step 2: Run MCP tests and confirm missing handler failures**

Run: `bun test tests/worker/mcp-tools.test.ts`

Expected: FAIL because the two MCP handlers are absent.

- [ ] **Step 3: Implement handlers and registrations**

Both handlers first call `service.getById`, pass the row through `inProject`, return `err("Not found")` for foreign/missing rows, and then call `service.setNextAction`.

Register exact schemas:

```ts
server.registerTool("set_contact_next_action", {
  description: "Set or replace the contact's single Next Action and exact deadline.",
  inputSchema: {
    contactId: z.string().describe("Contact id"),
    text: z.string().trim().min(1).max(500).describe("Next action text"),
    deadline: z.iso.datetime().describe("Exact ISO 8601 deadline"),
  },
}, withToolErrors("set_contact_next_action", (input) => setContactNextAction(ctx, input)));

server.registerTool("complete_contact_next_action", {
  description: "Mark the contact's current Next Action complete and clear it.",
  inputSchema: { contactId: z.string().describe("Contact id") },
}, withToolErrors("complete_contact_next_action", (input) => completeContactNextAction(ctx, input)));
```

- [ ] **Step 4: Run MCP and service tests**

Run: `bun test tests/worker/mcp-tools.test.ts tests/worker/contact-next-action.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit MCP exposure**

```bash
git add worker/mcp/tools/contacts.ts tests/worker/mcp-tools.test.ts
git commit -m "feat: expose next actions through mcp"
```

---

### Task 8: Verify the complete feature and migration

**Files:**
- Review: `docs/superpowers/specs/2026-07-19-contact-stage-timing-next-action-design.md`
- Review: all files modified by Tasks 1–7

**Interfaces:**
- Verifies all prior task outputs together.

- [ ] **Step 1: Run whitespace and conflict checks**

Run: `git diff --check`

Expected: exit 0 with no output.

- [ ] **Step 2: Run all automated tests**

Run: `bun test`

Expected: all tests pass with zero failures.

- [ ] **Step 3: Run lint**

Run: `bun run lint`

Expected: exit 0 with zero lint errors.

- [ ] **Step 4: Run the production build**

Run: `bun run build`

Expected: Cloudflare type generation, TypeScript project build, and Vite production build all exit 0.

- [ ] **Step 5: Inspect the generated migration**

Run: `rg -n "next_action_text|next_action_deadline|contact_activity_stage_entry_idx" worker/db/drizzle/0032_*.sql`

Expected: both new contact columns and the stage-entry index appear exactly once.

- [ ] **Step 6: Review the final diff against the design**

Run: `git status --short && git diff --stat HEAD~7..HEAD`

Expected: no requested subsystem is missing; unrelated `src/pages/Landing.tsx` and pre-existing unrelated changes remain outside the feature commits.

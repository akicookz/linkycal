# Optional Next Action Deadline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users save a Next Action with action text alone while keeping natural-language or manually selected deadlines as optional enrichment in one compact composer.

**Architecture:** Change the persisted contract from paired non-null values to required text plus nullable deadline, then propagate that contract through the contact service, REST route, MCP tool, workflow facts, and contact display. Replace the composer's parsed/manual branches with one sentence field and an embedded Radix popover that owns the optional `datetime-local` value.

**Tech Stack:** Bun test runner, React 19, TypeScript strict mode, Radix Popover, Tailwind CSS v4, Hono, Zod, Drizzle ORM.

## Global Constraints

- Action text is required and limited to 500 stored characters; deadline is optional.
- Missing deadlines never render validation errors.
- The composer has one visible action input with a calendar icon button inside its right edge.
- Selected deadlines use a restrained primary visual state.
- Local-time conversion renders only for a parsed explicit timezone whose offset differs from the browser timezone.
- Keep only essential regression tests; remove any exploratory tests after verification.
- Use Bun for all package and test commands.

---

### Task 1: Nullable persistence and REST contract

**Files:**
- Modify: `tests/worker/contact-next-action.test.ts`
- Modify: `worker/validation.ts`
- Modify: `worker/services/contact-service.ts`
- Modify: `worker/index.ts`

**Interfaces:**
- Produces: `setNextActionSchema` accepting `{ text: string; deadline: string | null } | { text: null; deadline: null }`.
- Produces: `ContactService.setNextAction(contactId, { text, deadline: Date | null } | null)`.

- [ ] **Step 1: Change the existing validation regression to require nullable deadlines**

Update the first schema assertion to:

```ts
expect(
  setNextActionSchema.safeParse({ text: "Send proposal", deadline: null })
    .success,
).toBe(true);
```

Add one service assertion that setting `{ text: "Send proposal", deadline: null }` persists the text and null deadline and logs metadata `{ text: "Send proposal", deadline: null }`.

- [ ] **Step 2: Run the focused test and verify the contract fails**

Run: `bun test tests/worker/contact-next-action.test.ts`

Expected: FAIL because the schema and service still require a non-null deadline.

- [ ] **Step 3: Implement nullable validation and persistence**

Change the active schema to:

```ts
const nextActionValueSchema = z.object({
  text: z.string().trim().min(1).max(500),
  deadline: z.string().datetime({ offset: true }).nullable(),
});
```

Change the service input and activity payload to:

```ts
action: { text: string; deadline: Date | null } | null

deadline: action.deadline?.toISOString() ?? null
```

Completion must log whenever `previous.nextActionText` exists and serialize a
nullable previous deadline. The REST route converts `data.deadline` with:

```ts
deadline: data.deadline ? new Date(data.deadline) : null
```

- [ ] **Step 4: Run the focused worker test**

Run: `bun test tests/worker/contact-next-action.test.ts`

Expected: all tests PASS.

---

### Task 2: Optional MCP and workflow facts

**Files:**
- Modify: `tests/worker/mcp-tools.test.ts`
- Modify: `tests/worker/workflow-operational-facts.test.ts`
- Modify: `worker/mcp/tools/contacts.ts`
- Modify: `worker/services/contact-service.ts`
- Modify: `worker/lib/workflow-runtime.ts`

**Interfaces:**
- Consumes: nullable `ContactService.setNextAction` from Task 1.
- Produces: `setContactNextAction(ctx, { contactId, text, deadline?: string | null })`.
- Produces: workflow `nextAction` with required `text` and optional deadline-derived fields.

- [ ] **Step 1: Add essential regressions to existing MCP and workflow tests**

Extend the MCP task test with:

```ts
const undated = await setContactNextAction(ctxA, {
  contactId: "ct-a1",
  text: "Follow up",
});
expect(parsed(undated)).toEqual(expect.objectContaining({
  nextActionText: "Follow up",
  nextActionDeadline: null,
}));
```

Add a focused workflow-runtime assertion using an undated
`ContactOperationalFacts` value:

```ts
expect(buildWorkflowContactOperationalContext({
  enteredAtByTagId: {},
  nextAction: { text: "Follow up", deadline: null },
}, now).nextAction).toEqual({ text: "Follow up" });
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `bun test tests/worker/mcp-tools.test.ts tests/worker/workflow-operational-facts.test.ts`

Expected: FAIL because MCP and workflow types require a deadline.

- [ ] **Step 3: Implement optional downstream contracts**

Make MCP `deadline` optional and nullable, convert it only when present, and
describe it as an optional ISO deadline. In `ContactOperationalFacts`, return a
next action whenever text exists:

```ts
nextAction: contact.nextActionText
  ? {
      text: contact.nextActionText,
      deadline: contact.nextActionDeadline?.toISOString() ?? null,
    }
  : null
```

Build workflow context with `{ text }` first and append `deadline`, `overdue`,
`hoursUntilDeadline`, and `daysUntilDeadline` only when a valid deadline exists.

- [ ] **Step 4: Run the focused tests**

Run: `bun test tests/worker/mcp-tools.test.ts tests/worker/workflow-operational-facts.test.ts`

Expected: all tests PASS.

---

### Task 3: Single-field Next Action composer

**Files:**
- Modify: `tests/next-action-composer.test.tsx`
- Modify: `src/components/NextActionComposer.tsx`

**Interfaces:**
- Produces: `NextActionValue { text: string; deadline: string | null }`.
- Consumes: existing `parseNextActionSentence`, timezone formatting helpers, UI `Input`, `Button`, `Popover`, and `Label`.

- [ ] **Step 1: Replace the existing composer regression with essential behavior coverage**

Keep the valid parsing/save assertion, then add one undated assertion:

```ts
parseSentence={() => Promise.resolve({ status: "missing_deadline" })}
```

After typing `Follow up`, assert no missing-deadline error or standalone picker
text exists, then press Enter and expect:

```ts
expect(onSave).toHaveBeenCalledWith({
  text: "Follow up",
  deadline: null,
});
```

For the dated case, assert the calendar button has `data-deadline-selected="true"`,
the separate action/deadline previews are absent, and the different-timezone
guidance reads `Deadline in your time:`.

- [ ] **Step 2: Run the component test and verify it fails**

Run: `bun test tests/next-action-composer.test.tsx`

Expected: FAIL because missing deadlines disable Save and parsed rows still render.

- [ ] **Step 3: Implement the unified composer**

Initialize one visible `sentence` from `initialAction?.text`. On parser results:

```ts
if (result.status === "valid") {
  setDraftAction(result.value.actionText);
  setDraftDeadline(toDatetimeLocalValue(result.value.deadlineIso));
} else if (result.status === "missing_deadline") {
  setDraftAction(sentence);
  setDraftDeadline("");
} else {
  // Preserve existing focused errors, but never create a missing-date error.
}
```

Set validity from trimmed action length and optional deadline validity. Save:

```ts
onSave({
  text: draftAction.trim(),
  deadline: draftDeadlineIso,
});
```

Render `Input` with right padding inside a `relative` wrapper. Place a 40px
icon-only `PopoverTrigger` button at the right with
`data-deadline-selected={Boolean(draftDeadlineIso)}` and explicit
`transition-[color,background-color,box-shadow]`. The popover contains the
`datetime-local` input and an icon-and-text **Clear deadline** button when set.
Manual and persisted deadlines remain selected during ordinary action-text edits;
a newly parsed valid deadline replaces them.
Remove preview rows, the standalone picker, **time assumed**, `Pencil`, and the
missing-deadline status copy.

- [ ] **Step 4: Run the focused component test**

Run: `bun test tests/next-action-composer.test.tsx`

Expected: all tests PASS.

---

### Task 4: Contact display integration

**Files:**
- Modify: `tests/contact-detail-next-action.test.tsx`
- Modify: `src/pages/ContactDetail.tsx`

**Interfaces:**
- Consumes: nullable `NextActionValue.deadline` from Task 3.
- Produces: active action rendering based on `nextActionText`, with deadline lines conditional on `nextActionDeadline`.

- [ ] **Step 1: Add one essential undated-display regression**

Seed the existing contact fixture with `nextActionText: "Follow up"` and
`nextActionDeadline: null`, then assert `Follow up` and `Mark Done` render while
no relative due text is present.

- [ ] **Step 2: Run the integration test and verify it fails**

Run: `bun test tests/contact-detail-next-action.test.tsx`

Expected: FAIL because `hasNextAction` currently requires both text and deadline.

- [ ] **Step 3: Implement nullable rendering and mutation types**

Use:

```ts
type NextActionMutationInput =
  | { text: string; deadline: string | null }
  | { text: null; deadline: null };

const hasNextAction = Boolean(contact.nextActionText);
```

Pass an initial composer value whenever text exists, including its nullable
deadline. Keep formatted and relative deadline rows conditional on the deadline.

- [ ] **Step 4: Run the focused integration test**

Run: `bun test tests/contact-detail-next-action.test.tsx`

Expected: all tests PASS.

---

### Task 5: Verify the complete change

**Files:**
- Review: all modified files
- Remove: any exploratory test code not listed as an essential regression above

**Interfaces:**
- Consumes: all previous tasks.
- Produces: verified optional Next Action deadline behavior.

- [ ] **Step 1: Review the diff and interface polish checklist**

Run: `git diff --check && git diff --stat && rg -n "transition-all|time assumed|Choose date manually|Add a deadline" src/components/NextActionComposer.tsx`

Expected: no whitespace errors; no removed UI copy; no `transition-all` in the composer.

- [ ] **Step 2: Run focused tests together**

Run: `bun test tests/next-action-composer.test.tsx tests/contact-detail-next-action.test.tsx tests/worker/contact-next-action.test.ts tests/worker/mcp-tools.test.ts tests/worker/workflow-operational-facts.test.ts`

Expected: all tests PASS with zero failures.

- [ ] **Step 3: Run the full suite**

Run: `bun test`

Expected: all tests PASS with zero failures.

- [ ] **Step 4: Run lint and production build**

Run: `bun run lint`

Expected: exit 0 with no ESLint errors.

Run: `bun run build`

Expected: TypeScript project references and Vite production build exit 0.

- [ ] **Step 5: Inspect final status**

Run: `git status --short && git diff --check`

Expected: only intended source, test, and plan changes; no whitespace errors.

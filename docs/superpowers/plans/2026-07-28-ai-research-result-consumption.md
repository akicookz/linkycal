# AI Research Result Consumption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show every AI Research result and make every raw or formatted value usable by later workflow steps and email through the existing exposed `{{...}}` binding UX.

**Architecture:** Add a framework-free research-field registry shared by the Worker and SPA, derive safe presentation strings from stored research results at context-view time, and render one reusable result component in workflow logs and contact activity. Preserve the existing metadata envelope, interpolation syntax, and database schema.

**Tech Stack:** Bun, TypeScript, Zod, React 19, Hono workflow services, React Testing Library.

## Global Constraints

- Use Bun commands only.
- Keep the current visible `{{...}}` syntax, autocomplete, Inputs selector, and condition selector.
- Preserve existing `research.*` and `research.byKey.*.result.*` paths.
- Do not add a database migration, new provider behavior, automatic tag application, or variable-token UI.
- Add tests only for observable workflow delivery, displayed research, and selectable variable paths.

---

### Task 1: Complete the runtime research contract and email formatting

**Files:**
- Create: `shared/workflow-research-fields.ts`
- Create: `worker/lib/workflow-research-format.ts`
- Modify: `tsconfig.app.json`
- Modify: `tsconfig.worker.json`
- Modify: `worker/lib/workflow-runtime.ts`
- Modify: `worker/services/workflow-ai-research-service.ts`
- Modify: `worker/services/workflow-execution-service.ts`
- Test: `tests/critical/workflow-journeys.test.ts`

**Interfaces:**
- Produces: `WORKFLOW_RESEARCH_FIELD_DEFINITIONS`, `WorkflowResearchFieldKey`, and `normalizeWorkflowResearchResultKey(value)`.
- Produces: `buildWorkflowResearchFormattedValues(result)` returning `recommendedTagsText`, `insightsText`, `sourcesText`, `sourcesHtml`, `reportText`, and `reportHtml`.
- Extends: `buildWorkflowContextView()` with formatted latest and named-result aliases.

- [ ] **Step 1: Strengthen the critical research journey**

Add a Send Email step after AI Research. Its body must use literal individual
fields plus `research.reportText` and `research.reportHtml`. Capture the real
Resend request and assert the delivered body contains description, company
size, revenue, tags, insights, source title, source URL, and snippet. Assert the
AI step output equals the complete result, including `description`.

- [ ] **Step 2: Run the critical journey and verify red**

Run:

```bash
bun test tests/critical/workflow-journeys.test.ts
```

Expected: FAIL because formatted aliases are empty and the AI output omits
`description`.

- [ ] **Step 3: Add the shared field registry and normalized key function**

Define the twelve literal field definitions and derive
`WorkflowResearchFieldKey` from the array. Replace the backend key normalizer
implementation with the shared function while retaining `slugifyWorkflowKey`
as a compatibility wrapper.

- [ ] **Step 4: Add safe formatting helpers**

Implement:

```ts
interface WorkflowResearchFormattedValues {
  recommendedTagsText: string;
  insightsText: string;
  sourcesText: string;
  sourcesHtml: string;
  reportText: string;
  reportHtml: string;
}

export function buildWorkflowResearchFormattedValues(
  result: unknown,
): WorkflowResearchFormattedValues;
```

Trim values, omit empty sections, HTML-escape model text, and create links only
for `http:` and `https:` URLs.

- [ ] **Step 5: Expose complete raw and formatted runtime values**

Build the Zod shape with
`satisfies Record<WorkflowResearchFieldKey, z.ZodTypeAny>`. Spread
`record.result` into AI step output. In `buildWorkflowContextView()`, attach
formatted aliases to the latest result and to every `research.byKey` record
without mutating persisted metadata.

- [ ] **Step 6: Run the critical journey and verify green**

Run:

```bash
bun test tests/critical/workflow-journeys.test.ts
```

Expected: PASS with the exact captured Resend payload.

---

### Task 2: Expose every research variable in existing workflow controls

**Files:**
- Modify: `src/lib/workflow-variables.ts`
- Modify: `src/pages/WorkflowBuilder.tsx`
- Test: `tests/workflow-research-variables.test.ts`

**Interfaces:**
- Consumes: shared field definitions and
  `normalizeWorkflowResearchResultKey()`.
- Produces: complete latest-result and named-result
  `WorkflowVariableGroup[]`.

- [ ] **Step 1: Write the failing variable-selection test**

Exercise `buildWorkflowVariableGroups()` with one and two prior AI Research
steps. Assert literal keys for every missing raw and formatted field, plus a
normalized named path such as:

```text
research.byKey.lead_research.result.companySize
research.byKey.lead_research.reportHtml
```

- [ ] **Step 2: Run the variable test and verify red**

Run:

```bash
bun test tests/workflow-research-variables.test.ts
```

Expected: FAIL because the current catalog exposes seven latest fields and
three named fields.

- [ ] **Step 3: Derive variable groups from the registry**

Generate raw Research items from the shared registry, append the six formatted
aliases with clear Text/HTML labels, and generate the same full set for each
named result. Normalize configured result keys before building paths. Keep the
existing `{{` autocomplete and Inputs editor unchanged.

- [ ] **Step 4: Run the variable test and verify green**

Run:

```bash
bun test tests/workflow-research-variables.test.ts
```

Expected: PASS.

---

### Task 3: Render the complete research result everywhere

**Files:**
- Create: `src/components/WorkflowResearchResult.tsx`
- Modify: `src/components/WorkflowStepLog.tsx`
- Modify: `src/components/ContactActivityDetailsDrawer.tsx`
- Test: `tests/workflow-research-result.test.tsx`

**Interfaces:**
- Produces: `WorkflowResearchResult({ value, fallbackSummary, sourceCount })`.
- Consumes: a flat step output, a stored `WorkflowResearchRecord`, or a
  historical partial record.

- [ ] **Step 1: Write the failing result-visibility test**

Render the production result component with literal values for all twelve
fields. Assert visible description, company size, estimated revenue,
recommended tags, insight, source title, source URL, and source snippet. Add a
historical summary-only case and assert it renders without throwing.

- [ ] **Step 2: Run the component test and verify red**

Run:

```bash
bun test tests/workflow-research-result.test.tsx
```

Expected: FAIL because the shared component does not exist.

- [ ] **Step 3: Implement the reusable result component**

Normalize full records and flat outputs into one result view. Render non-empty
summary, facts, description, company metrics, tag badges, insight list, and
source links with snippets. Preserve the historical reduced-detail fallback.

- [ ] **Step 4: Replace duplicate research rendering**

Use the component in `AiResearchLog` and `ResearchDetails`. Keep each parent’s
request/progress or drawer framing; remove only duplicated research-field
parsing and presentation.

- [ ] **Step 5: Run the component test and verify green**

Run:

```bash
bun test tests/workflow-research-result.test.tsx
```

Expected: PASS.

---

### Task 4: Full verification

**Files:**
- Modify only files required by failures caused by Tasks 1–3.

- [ ] **Step 1: Run focused tests together**

```bash
bun test \
  tests/critical/workflow-journeys.test.ts \
  tests/workflow-research-variables.test.ts \
  tests/workflow-research-result.test.tsx
```

- [ ] **Step 2: Run the complete test suite**

```bash
bun test
```

- [ ] **Step 3: Run lint and production build**

```bash
bun run lint
bun run build
```

- [ ] **Step 4: Review the final diff against the approved spec**

Confirm no variable-token UI, provider changes, migration, automatic tag
application, or unrelated refactor entered the diff.

- [ ] **Step 5: Commit the implementation**

```bash
git add \
  shared/workflow-research-fields.ts \
  worker/lib/workflow-research-format.ts \
  worker/lib/workflow-runtime.ts \
  worker/services/workflow-ai-research-service.ts \
  worker/services/workflow-execution-service.ts \
  src/lib/workflow-variables.ts \
  src/pages/WorkflowBuilder.tsx \
  src/components/WorkflowResearchResult.tsx \
  src/components/WorkflowStepLog.tsx \
  src/components/ContactActivityDetailsDrawer.tsx \
  tsconfig.app.json \
  tsconfig.worker.json \
  tests/critical/workflow-journeys.test.ts \
  tests/workflow-research-variables.test.ts \
  tests/workflow-research-result.test.tsx \
  docs/superpowers/plans/2026-07-28-ai-research-result-consumption.md
git commit -m "feat: expose complete AI research results"
```

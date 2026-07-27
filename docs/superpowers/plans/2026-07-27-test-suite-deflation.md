# Test Suite Deflation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the current 259 runner cases to 178 honest logical tests by deleting four false-confidence cases and collapsing 93 repeated rows into 16 labeled matrices without losing any deterministic branch coverage.

**Architecture:** Keep the 162 existing tests that independently protect observable behavior, persistence, authorization, tenant isolation, or protocol output. Consolidate repeated inputs inside their owning files so the runner reports one test per contract, and delete source-scraping or constant-restatement tests that cannot prove the behavior they claim.

**Tech Stack:** Bun test runner, `bun:test`, TypeScript, React Testing Library, Hono, Drizzle's existing in-memory SQLite test harness.

## Global Constraints

- Never test for vanity; every test must earn its spot.
- Do not add replacement tests merely to preserve the count.
- Do not change production behavior in this cleanup.
- Preserve every meaningful input, expected output, security boundary, and fault-injection scenario currently covered.
- A matrix must include a human-readable `name` for every row and expose that name in the compared result so failures remain diagnosable.
- Async and database-backed matrix rows must receive fresh fixtures and run sequentially when they mutate shared state.
- Do not deliberately break production code to demonstrate red/green cycles; this is a test-structure cleanup, not a feature implementation.
- Run focused files after each task. Run the complete suite once, at the end.
- The expected count of 178 is an audit checksum, not a quality target. If the runner reports a different count, reconcile the exact missing or extra contract instead of manipulating the number.

## File Map

- Modify `tests/ai-research-defaults.test.ts`: remove prompt-copy and seed-array assertions; fold whitespace into the default-application contract.
- Modify `tests/worker/team-access.test.ts`: remove the `PLAN_LIMITS` constant restatement.
- Modify `tests/worker/api-route-policy.test.ts`: remove the incomplete source-regex route inventory.
- Modify `tests/worker/form-conditions.test.ts`: collapse 18 operator rows into three logical matrices.
- Modify `tests/worker/tag-service.test.ts`: collapse ten schema rows into one validation matrix; retain five service/database tests.
- Modify `tests/worker/form-prefill.test.ts`: collapse six prefill examples into one precedence matrix.
- Modify `tests/worker/validation-event-type.test.ts`: collapse six schema rows into one validation matrix.
- Modify `tests/worker/workflow-conditions.test.ts`: collapse six evaluator examples into one behavior matrix.
- Modify `tests/worker/stripe.test.ts`: collapse three customer-selection examples into one precedence matrix.
- Modify `tests/worker/request-auth.test.ts`: collapse seven credential combinations into one authentication-policy matrix.
- Modify `tests/worker/cors-policy.test.ts`: collapse six cases into two contracts: trusted origins and session-request policy.
- Modify `tests/worker/project-api-auth.test.ts`: collapse five API-key authorization combinations into one fail-closed policy matrix.
- Modify `tests/worker/workflow-retry.test.ts`: collapse 25 rows into four matrices while retaining 30 distinct fault-window integration tests.
- Modify `tests/worker/mcp-tools.test.ts`: remove unused mutation-tool imports that do not represent coverage.
- Modify `tests/worker/workflow-schedule.test.ts`: remove the unused trigger-parser import.

---

### Task 1: Delete False Confidence and Merge the Redundant AI Edge Case

**Files:**
- Modify: `tests/ai-research-defaults.test.ts`
- Modify: `tests/worker/team-access.test.ts`
- Modify: `tests/worker/api-route-policy.test.ts`

**Interfaces:**
- Consumes: existing public functions and authorization behavior.
- Produces: three AI-default cases reduced to one, the three real team-access tests unchanged, and the representative fail-closed route-policy test unchanged.

- [ ] **Step 1: Reduce AI defaults to the observable defaulting contract**

Delete:

```ts
test("spells out the supplied contact fields and research targets", ...)
test("seeds only contact fields and not a form response identifier", ...)
```

Remove the now-unused `seedAiResearchInputs` import. Merge the whitespace assertion into the remaining behavior test:

```ts
test("fills a blank prompt and preserves every nonempty edited prompt", () => {
  const whitespacePrompt = "\n  Use my rubric exactly.  \t\n";

  expect(applyAiResearchDefaults({ prompt: "" }).prompt).toBe(
    DEFAULT_AI_RESEARCH_PROMPT,
  );
  expect(applyAiResearchDefaults({ prompt: "Use my rubric" }).prompt).toBe(
    "Use my rubric",
  );
  expect(applyAiResearchDefaults({ prompt: whitespacePrompt }).prompt).toBe(
    whitespacePrompt,
  );
});
```

This removes assertions about whether AI prompt prose is “good” while retaining the completely deterministic empty-versus-edited behavior.

- [ ] **Step 2: Remove the plan-limit constant restatement**

Delete:

```ts
test("free plan allows one calendar connection and no team members", ...)
```

Remove the unused `PLAN_LIMITS` import. Keep the three database-backed ownership, explicit-grant, and revoked-membership tests unchanged. Limit enforcement must be tested where it is enforced, not by repeating the constant value.

- [ ] **Step 3: Remove the incomplete route source scanner**

Delete `extractProjectRoutes`, `materializePath`, `routeKey`, the `node:fs` and `node:path` imports, the `PROJECT_API_KEY_ROUTES` and `PROJECT_SESSION_ONLY_ROUTES` imports, and:

```ts
test("classifies every registered nested project route exactly once", ...)
```

Keep:

```ts
test("classifies representative API-key and session-only routes", ...)
```

The remaining authorization suite already proves that `unclassified` routes fail closed. The deleted regex could silently miss a differently formatted or dynamically registered route and therefore could not prove completeness.

- [ ] **Step 4: Run the focused files**

```bash
bun test tests/ai-research-defaults.test.ts \
  tests/worker/team-access.test.ts \
  tests/worker/api-route-policy.test.ts
```

Expected result: all behavior passes; these files contribute five fewer runner cases.

---

### Task 2: Consolidate Pure Domain Truth Tables

**Files:**
- Modify: `tests/worker/form-conditions.test.ts`
- Modify: `tests/worker/tag-service.test.ts`
- Modify: `tests/worker/form-prefill.test.ts`
- Modify: `tests/worker/validation-event-type.test.ts`
- Modify: `tests/worker/workflow-conditions.test.ts`
- Modify: `tests/worker/stripe.test.ts`

**Interfaces:**
- Consumes: the existing evaluator, schema, prefill, and Stripe selection functions.
- Produces: the same inputs and expected outputs represented by eight logical tests instead of 49 runner cases.

- [ ] **Step 1: Use a labeled result pattern for synchronous matrices**

Inside each owning test, preserve its existing cases and compute a result containing the label:

```ts
const actual = cases.map(({ name, input, expected }) => ({
  name,
  actual: evaluate(input),
  expected,
}));

expect(actual).toEqual(
  cases.map(({ name, expected }) => ({
    name,
    actual: expected,
    expected,
  })),
);
```

Adapt the `input` fields and evaluator call to the existing local types. Do not create a shared test utility: each matrix is small and its input shape belongs to its domain.

- [ ] **Step 2: Collapse form-condition rows into three contracts**

In `tests/worker/form-conditions.test.ts`, replace the three `test.each` clusters with:

1. one test for individual operators and field shapes;
2. one test for `any`/`all` group semantics;
3. one test for SPA/widget parity, including missing fields and unknown operators.

Retain all 18 existing rows and expected values. The file must report three runner cases.

- [ ] **Step 3: Collapse schema-boundary rows**

In `tests/worker/tag-service.test.ts`, convert the ten validation rows into one labeled `safeParse` matrix:

```ts
test("accepts and rejects the complete tag schema boundary matrix", () => {
  const actual = cases.map(({ name, schema, input, success }) => ({
    name,
    actual: schema.safeParse(input).success,
    expected: success,
  }));

  expect(actual.every((row) => row.actual === row.expected)).toBe(true);
});
```

Retain the other five database/service tests unchanged.

Apply the same pattern to all six rows in `tests/worker/validation-event-type.test.ts`, producing one validation test.

- [ ] **Step 4: Collapse prefill precedence into one contract**

In `tests/worker/form-prefill.test.ts`, keep all six scenarios in one labeled matrix covering:

- files never being prefilled;
- field-ID and reserved-guest mappings;
- reserved-ID collisions;
- mapped-field precedence;
- guest seeding;
- blank guest values.

Construct a fresh field collection and query object for each row so one row cannot mutate another.

- [ ] **Step 5: Collapse workflow-condition evaluation**

In `tests/worker/workflow-conditions.test.ts`, express the current six cases as one matrix:

```ts
test("evaluates the supported workflow condition policy", () => {
  const actual = cases.map(({ name, condition, context, expected }) => ({
    name,
    actual: evaluateWorkflowCondition(condition, context),
    expected,
  }));

  expect(actual).toEqual(
    cases.map(({ name, expected }) => ({ name, actual: expected, expected })),
  );
});
```

Preserve the null/empty, equality, numeric comparison, missing deadline, deleted stage, and `when:any` inputs exactly.

- [ ] **Step 6: Collapse Stripe customer selection**

In `tests/worker/stripe.test.ts`, put the metadata match, unique-email fallback, and ambiguous-email rejection into one labeled precedence matrix. Preserve the exact selected customer ID or `null` expectation for every row.

- [ ] **Step 7: Run the focused files**

```bash
bun test tests/worker/form-conditions.test.ts \
  tests/worker/tag-service.test.ts \
  tests/worker/form-prefill.test.ts \
  tests/worker/validation-event-type.test.ts \
  tests/worker/workflow-conditions.test.ts \
  tests/worker/stripe.test.ts
```

Expected result: no input or branch disappears; these files contribute 41 fewer runner cases.

---

### Task 3: Consolidate Authentication and CORS Policy Matrices

**Files:**
- Modify: `tests/worker/request-auth.test.ts`
- Modify: `tests/worker/cors-policy.test.ts`
- Modify: `tests/worker/project-api-auth.test.ts`

**Interfaces:**
- Consumes: existing request authentication, origin checking, session-origin checking, and project API authorization functions.
- Produces: four policy tests replacing 18 separately reported combinations.

- [ ] **Step 1: Collapse request authentication into one sequential matrix**

Keep all seven credential combinations. Each row must define:

```ts
interface RequestAuthCase {
  name: string;
  authorization?: string;
  cookie?: string;
  sessionUserId?: string;
  apiKeyResult?: { keyId: string; projectId: string } | null;
  expected: {
    kind: "session" | "apiKey" | "rejected";
    status?: number;
  };
}
```

Within one async test, create fresh mocked dependencies and a fresh request for every row, execute rows sequentially, and collect:

```ts
results.push({
  name: row.name,
  actual: summarizeAuthResult(await authenticateRequest(request, deps)),
  expected: row.expected,
});
```

Compare the labeled result array once. Do not weaken the existing rejection status or credential-source assertions.

- [ ] **Step 2: Keep exactly two CORS contracts**

In `tests/worker/cors-policy.test.ts`, consolidate:

1. configured, same-origin development, and unrelated origins into one trusted-origin matrix;
2. server/same-origin, untrusted-origin, and malformed-URL session requests into one session-request-policy matrix.

Keep the exact boolean decisions for all six inputs.

- [ ] **Step 3: Collapse project API authorization into one fail-closed matrix**

In `tests/worker/project-api-auth.test.ts`, retain all five combinations in one test:

- matching entitled key succeeds;
- foreign-project key fails;
- session-only route fails;
- unclassified route fails;
- project without current entitlement fails.

Every row gets fresh input objects. Compare the complete labeled outcome, including the current rejection reason or status where asserted.

- [ ] **Step 4: Run the focused files**

```bash
bun test tests/worker/request-auth.test.ts \
  tests/worker/cors-policy.test.ts \
  tests/worker/project-api-auth.test.ts
```

Expected result: all security decisions remain covered; these files contribute 14 fewer runner cases.

---

### Task 4: Deflate Workflow Retry Without Losing Fault Windows

**Files:**
- Modify: `tests/worker/workflow-retry.test.ts`

**Interfaces:**
- Consumes: current retry classifier, credential scrubber, lease-expiration logic, unsafe-action recovery, and existing D1/queue fault harnesses.
- Produces: 34 logical retry tests: 30 distinct integration scenarios plus four matrices.

- [ ] **Step 1: Preserve the 30 distinct integration tests**

Do not combine scenarios covering different durable states or failure windows, including:

- action dispatch versus result persistence;
- D1 commit ambiguity;
- queue rejection and repair;
- retry delivery;
- AI finalization;
- contact disappearance;
- concurrent workers and lease fencing;
- legacy lease recovery;
- scheduled/attempt fencing;
- completed, waiting, and stopped duplicate deliveries.

These fail for different production regressions and therefore earn separate identities.

- [ ] **Step 2: Collapse the transient-error classifier**

Replace the 12-row `test.each` block with one labeled test that retains every error input and transient/permanent expectation:

```ts
test("classifies the complete retryability matrix", () => {
  const actual = retryCases.map(({ name, error, expected }) => ({
    name,
    actual: isTransientWorkflowError(error),
    expected,
  }));

  expect(actual).toEqual(
    retryCases.map(({ name, expected }) => ({
      name,
      actual: expected,
      expected,
    })),
  );
});
```

- [ ] **Step 3: Collapse credential redaction**

Replace the seven-row block with one test that maps every sensitive-key and safe-passthrough example through the existing scrubber. Compare the entire labeled sanitized result so nested-value or case-sensitivity regressions remain visible.

- [ ] **Step 4: Collapse lease timestamp boundaries**

Replace the four-row block with one test covering the exact fresh/expired boundary plus missing and invalid timestamps. Keep the fixed clock and exact expected decision for every row.

- [ ] **Step 5: Collapse unsafe webhook recovery**

Replace the two-row action-state block with one sequential async matrix. Create a fresh migrated database fixture per row, execute the recovery path, and collect the final run status, step status, and dispatch count. Do not share a database between rows.

- [ ] **Step 6: Run the focused retry suite**

```bash
bun test tests/worker/workflow-retry.test.ts
```

Expected result: 34 passing runner cases, with the same 55-case branch and fault input coverage.

---

### Task 5: Verify Coverage Preservation and Final Suite Shape

**Files:**
- Review: the 15 modified test files.

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: a clean, type-safe suite with 178 logical tests and no lost audited input.

- [ ] **Step 1: Remove dead imports and confirm weak tests are gone**

Remove the unused `createContact` and `createEventType` imports from
`tests/worker/mcp-tools.test.ts`, and remove the unused
`parseWorkflowTriggerConfig` import from
`tests/worker/workflow-schedule.test.ts`.

```bash
rg -n "spells out the supplied contact fields|seeds only contact fields|free plan allows one calendar connection|classifies every registered nested project route|readFileSync|matchAll\\(routePattern" \
  tests/ai-research-defaults.test.ts \
  tests/worker/team-access.test.ts \
  tests/worker/api-route-policy.test.ts
```

Expected: no matches.

- [ ] **Step 2: Inspect every consolidation diff**

```bash
git diff -- \
  tests/ai-research-defaults.test.ts \
  tests/worker/team-access.test.ts \
  tests/worker/api-route-policy.test.ts \
  tests/worker/form-conditions.test.ts \
  tests/worker/tag-service.test.ts \
  tests/worker/form-prefill.test.ts \
  tests/worker/validation-event-type.test.ts \
  tests/worker/workflow-conditions.test.ts \
  tests/worker/stripe.test.ts \
  tests/worker/request-auth.test.ts \
  tests/worker/cors-policy.test.ts \
  tests/worker/project-api-auth.test.ts \
  tests/worker/workflow-retry.test.ts
```

For each removed runner case, confirm its original input and expected result either still appear in its matrix or were one of the four explicitly deleted weak cases.

- [ ] **Step 3: Run static verification**

```bash
git diff --check
bun run lint
bun run build
```

Expected: all commands exit successfully with no unused imports introduced by removed tests.

- [ ] **Step 4: Run the complete suite once**

```bash
bun test
```

Expected: 42 test files and 178 passing runner cases. Investigate any count difference by contract name; do not add or split tests to force the number.

- [ ] **Step 5: Review the final suite by value**

Confirm:

1. The 162 independently valuable tests are still present.
2. All 93 meaningful matrix inputs are represented inside 16 logical tests.
3. The four false-confidence cases are absent.
4. No `.only`, `.skip`, snapshot bulk, `toBeTruthy()` placeholder, source-code scraping, or production change entered the diff.

```bash
rg -n "\\.(only|skip)\\(|toBeTruthy\\(\\)|readFileSync.*worker/index|matchAll\\(routePattern" tests
git status --short
```

Review legitimate matches in context. Aside from this plan document, the
expected implementation diff contains only the 15 test files listed above.

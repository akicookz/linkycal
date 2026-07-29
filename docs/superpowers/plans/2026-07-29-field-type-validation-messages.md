# Field-Type Validation Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace generic required-field copy with field-type-specific validation messages across every form experience.

**Architecture:** Keep validation copy in `src/lib/form-experience.ts`, where field type and value are already available. Remove the surface-specific message from `FormExperience` so focused, classic, grouped, and booking-attached forms all consume the same validator contract.

**Tech Stack:** TypeScript, React 19, Bun test, Testing Library.

## Global Constraints

- Use the exact message table in `docs/superpowers/specs/2026-07-29-field-type-validation-messages-design.md`.
- Preserve “Please enter a valid email” for malformed non-empty email values.
- Optional empty fields remain valid.
- Do not change form checkpoint persistence, analytics events, or navigation.
- Tests assert respondent-visible behavior and literal expected messages.

---

### Task 1: Centralize field-type validation messages

**Files:**
- Create: `tests/form-experience-validation.test.ts`
- Modify: `tests/critical/form-experience.test.tsx`
- Modify: `src/lib/form-experience.ts:435-449`
- Modify: `src/components/FormExperience.tsx:188-245`

**Interfaces:**
- Consumes: `FormExperienceField` and its `type`, `required`, and current string value.
- Produces: `validateFormExperienceField(field: FormExperienceField, value: string): string | null`.

- [ ] **Step 1: Write the failing unit test**

Create `tests/form-experience-validation.test.ts` with a table of required
field types and literal messages:

```ts
import { describe, expect, test } from "bun:test";

import {
  validateFormExperienceField,
  type FormExperienceField,
} from "../src/lib/form-experience";

function requiredField(type: string): FormExperienceField {
  return {
    id: `field-${type}`,
    stepId: "step-validation",
    sortOrder: 0,
    type,
    label: type,
    description: null,
    placeholder: null,
    required: true,
    validation: null,
    options: null,
  };
}

describe("form experience validation messages", () => {
  const cases = [
    ["radio", "Please select an option"],
    ["select", "Please select an option"],
    ["multi_select", "Please select at least one option"],
    ["checkbox", "Please check this box"],
    ["rating", "Please choose a rating"],
    ["file", "Please choose a file"],
    ["date", "Please select a date"],
    ["time", "Please select a time"],
    ["email", "Please enter your email"],
    ["phone", "Please enter a phone number"],
    ["url", "Please enter a URL"],
    ["number", "Please enter a number"],
    ["textarea", "Please enter a response"],
    ["text", "Please enter a response"],
    ["custom", "Please enter a response"],
  ] as const;

  for (const [type, expected] of cases) {
    test(`${type} directs the respondent with type-specific required copy`, () => {
      expect(validateFormExperienceField(requiredField(type), "")).toBe(expected);
    });
  }

  test("optional empty values remain valid", () => {
    expect(
      validateFormExperienceField({
        ...requiredField("radio"),
        required: false,
      }, ""),
    ).toBeNull();
  });

  test("malformed non-empty email keeps format-specific copy", () => {
    expect(
      validateFormExperienceField(requiredField("email"), "not-an-email"),
    ).toBe("Please enter a valid email");
  });
});
```

- [ ] **Step 2: Update the focused-form regression expectation**

In `tests/critical/form-experience.test.tsx`, change the empty required radio
expectation in “public form experience > focused form validates…” from:

```ts
expect(screen.getByText("Please fill this in")).toBeTruthy();
```

to:

```ts
expect(screen.getByText("Please select an option")).toBeTruthy();
```

Keep the grouped text/email test for now; it must fail until both fields receive
their distinct messages.

- [ ] **Step 3: Run tests to verify RED**

Run:

```bash
bun test tests/form-experience-validation.test.ts tests/critical/form-experience.test.tsx
```

Expected: required empty-field cases receive `undefined` from the old
caller-supplied message argument, and the focused radio integration assertion
receives “Please fill this in.”

- [ ] **Step 4: Implement the minimal mapping**

In `src/lib/form-experience.ts`, replace the caller-supplied required message
with a private field-type mapping:

```ts
function getRequiredFieldMessage(type: string): string {
  switch (type) {
    case "radio":
    case "select":
      return "Please select an option";
    case "multi_select":
      return "Please select at least one option";
    case "checkbox":
      return "Please check this box";
    case "rating":
      return "Please choose a rating";
    case "file":
      return "Please choose a file";
    case "date":
      return "Please select a date";
    case "time":
      return "Please select a time";
    case "email":
      return "Please enter your email";
    case "phone":
      return "Please enter a phone number";
    case "url":
      return "Please enter a URL";
    case "number":
      return "Please enter a number";
    case "textarea":
    case "text":
    default:
      return "Please enter a response";
  }
}

export function validateFormExperienceField(
  field: FormExperienceField,
  value: string,
): string | null {
  if (field.required && !value.trim()) {
    return getRequiredFieldMessage(field.type);
  }
  if (
    field.type === "email" &&
    value.trim() &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  ) {
    return "Please enter a valid email";
  }
  return null;
}
```

In `src/components/FormExperience.tsx`, delete `requiredMessage` and call:

```ts
const message = validateFormExperienceField(
  field,
  values[field.id] ?? "",
);
```

- [ ] **Step 5: Update grouped-field integration assertions**

In the grouped focused-section test, replace the two identical generic-message
assertion with:

```ts
expect(screen.getByText("Please enter a response")).toBeTruthy();
expect(screen.getByText("Please enter your email")).toBeTruthy();
```

This protects distinct text and email messages in one rendered group.

- [ ] **Step 6: Run focused tests to verify GREEN**

Run:

```bash
bun test tests/form-experience-validation.test.ts tests/critical/form-experience.test.tsx
```

Expected: all tests pass.

- [ ] **Step 7: Verify type safety and lint**

Run:

```bash
/Users/akbar/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/typescript/bin/tsc -b
/Users/akbar/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/eslint/bin/eslint.js src/lib/form-experience.ts src/components/FormExperience.tsx tests/form-experience-validation.test.ts tests/critical/form-experience.test.tsx
```

Expected: both commands exit successfully with no diagnostics in changed files.

- [ ] **Step 8: Run the complete test suite**

Run:

```bash
bun test
```

Expected: all repository tests pass.

- [ ] **Step 9: Verify the observed browser regression**

Reload:

```text
http://127.0.0.1:3001/encited/contact-sales?utm_source=codex-browser-test
```

Advance to “Who will you be using the service for?”, select nothing, and press
OK. Verify the visible error is “Please select an option,” no console error is
emitted, and no form response is submitted.

- [ ] **Step 10: Commit**

```bash
git add src/lib/form-experience.ts src/components/FormExperience.tsx tests/form-experience-validation.test.ts tests/critical/form-experience.test.tsx docs/superpowers/plans/2026-07-29-field-type-validation-messages.md
git commit -m "fix: tailor required messages to field types"
```

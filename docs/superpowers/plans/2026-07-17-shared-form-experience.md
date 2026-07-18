# Shared Form Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render standalone forms and forms attached to bookings through one controlled `FormExperience` component, preserving standalone and classic-booking behavior exactly while enabling focused booking forms one question at a time.

**Architecture:** A pure `src/lib/form-experience.ts` module owns the shared form model: sorting, completion exclusion, condition evaluation, mapped-field display exclusion, focused-screen construction, validation, and a synchronous async-transition lock. A controlled `FormExperience` React component owns only presentation state and renders standalone or booking surfaces. `PublicForm` keeps standalone fetching/persistence/uploads/completion; `PublicBooking` keeps scheduling/basics/final booking submission and mounts the same component afterward.

**Tech Stack:** Bun, React 19, TypeScript strict mode, React Router 7, Tailwind CSS v4, existing `FormFieldRenderer`, existing `FocusedFieldInput`, existing form-condition and form-section helpers, Bun test runner, in-app browser for visual regression.

## Global Constraints

- The approved design is `docs/superpowers/specs/2026-07-17-shared-form-experience-design.md`; every task must preserve its scope and acceptance criteria.
- Standalone classic and focused forms must remain pixel-identical and behavior-identical. Do not redesign, rename copy, reorder DOM, or “clean up” Tailwind classes during extraction.
- Existing classic attached-booking forms must remain visually and behaviorally unchanged.
- Booking order remains date/time -> basic details -> attached form -> one final `/api/v1/bookings` request -> confirmation.
- Do not change the database schema, worker routes, worker validation, or booking action.
- Attached-booking file-upload parity is out of scope. Standalone file upload must continue working exactly as it does now.
- Keep `values` and `files` controlled by the host. The shared component owns only navigation, validation errors, direction, timers, and transition locking.
- `verbatimModuleSyntax: true`: use `import type` for every type-only import.
- Follow repository conventions: function declarations for named functions/components, `@/` imports in frontend source, Bun commands only, icon+text buttons, and no separator borders.
- Do not modify or stage the user-owned formatting-only change in `worker/index.ts`.
- Use `apply_patch` for source edits. Do not use destructive Git commands.
- Test commands use `bun test <path>`; production verification uses `bun run lint` and `bun run build`.

## File Map

- Create `src/lib/form-experience.ts`: shared types and pure derivation/validation/concurrency helpers.
- Create `tests/form-experience.test.ts`: unit tests for the pure form model and transition lock.
- Create `src/components/FormExperience.tsx`: the single controlled form experience used by both public hosts; contains the mechanically moved standalone shells and active form presentation.
- Create `tests/form-experience-render.test.tsx`: server-render contract tests for classic/focused and standalone/booking surfaces.
- Modify `src/pages/PublicForm.tsx`: retain standalone lifecycle; replace local form orchestration/rendering with `FormExperience`.
- Modify `src/pages/PublicBooking.tsx`: retain booking lifecycle; replace custom attached-form orchestration/rendering with `FormExperience`.

## Local Regression Fixtures

The local D1 database is currently empty, so create these fixtures through the running dashboard before changing `PublicForm`. This mutates local development data only:

1. Create project `Shared Form Regression` with slug `shared-form-regression`.
2. Create and activate classic form `Classic Regression` with slug `classic-regression`, type `single`: section `Contact` has required text `Full name` mapped to name, required email `Email` mapped to email, and required text `Company`; section `Context` has textarea `Notes` and a conditional text field `Referral detail` shown when `Notes` contains `friend`.
3. Create and activate focused form `Focused Regression` with slug `focused-regression`, type `multi_step`: section `About you` has description `A short introduction`, uses `public/bg-image.webp` as a left-layout section image, and has required text `Company`; section `Preferences` enables `groupFields` and contains rating `Priority` plus select `Contact method`; section `Follow-up` has required email `Work email` mapped to email and conditional text `Email context` shown when `Work email` contains `@`.
4. Create three active event types with open local availability: `No Form Regression` with no attached form, `Classic Booking Regression` attached to `Classic Regression`, and `Focused Booking Regression` attached to `Focused Regression`.
5. Set `Classic Booking Regression` to confirmed-on-submit and `Focused Booking Regression` to approval-required so both confirmation variants are testable. Duplicate the focused event as `Focused Confirmed Regression` only if the UI cannot switch approval mode without invalidating an already selected slot.

Use these same records for all before/after browser comparisons; do not recreate them between baseline and verification.

---

### Task 1: Shared form model, screen builder, validation, and transition lock

**Files:**
- Create: `src/lib/form-experience.ts`
- Create: `tests/form-experience.test.ts`

**Interfaces:**
- Produces `FormExperienceField`, `FormExperienceStep`, `FormExperienceForm`, `FormExperienceScreen`, `VisibleFormExperienceStep`, and `FormExperienceModel`.
- Produces `getSortedFormSteps(form)`, `getAllFormFields(form)`, and `getCompletionField(form)` for host-only metadata/prefill/completion work.
- Produces `buildFormExperienceModel(input)` for both the component and booking “has questions?” decision.
- Produces `validateFormExperienceField(field, value, requiredMessage)`.
- Produces `createFormTransitionLock()`; its `run()` method admits one async transition at a time and returns `false` immediately for duplicates.

- [ ] **Step 1: Write model-construction tests**

Create `tests/form-experience.test.ts` with these fixtures and assertions:

```ts
import { describe, expect, test } from "bun:test";

import {
  buildFormExperienceModel,
  createFormTransitionLock,
  getAllFormFields,
  getCompletionField,
  validateFormExperienceField,
  type FormExperienceField,
  type FormExperienceForm,
} from "../src/lib/form-experience";

function field(
  id: string,
  overrides: Partial<FormExperienceField> = {},
): FormExperienceField {
  return {
    id,
    stepId: "s1",
    sortOrder: 0,
    type: "text",
    label: id,
    description: null,
    placeholder: null,
    required: false,
    validation: null,
    options: null,
    visibility: null,
    contactMapping: null,
    ...overrides,
  };
}

function form(overrides: Partial<FormExperienceForm> = {}): FormExperienceForm {
  return {
    id: "f1",
    name: "Lead form",
    type: "multi_step",
    status: "active",
    steps: [
      {
        id: "s1",
        sortOrder: 0,
        title: "About you",
        description: null,
        richDescription: null,
        settings: null,
        visibility: null,
        fields: [
          field("first", { sortOrder: 0 }),
          field("second", { sortOrder: 1 }),
        ],
      },
    ],
    ...overrides,
  };
}

describe("buildFormExperienceModel", () => {
  test("focused form creates a statement followed by one screen per field", () => {
    const model = buildFormExperienceModel({
      form: form(),
      values: {},
      surface: "standalone",
    });
    expect(model.screens.map((screen) => screen.kind)).toEqual([
      "statement",
      "question",
      "question",
    ]);
    expect(model.screens.map((screen) => screen.key)).toEqual([
      "statement-s1",
      "field-first",
      "field-second",
    ]);
  });

  test("legacy default section title does not create a statement", () => {
    const input = form();
    input.steps[0].title = "Step 1";
    const model = buildFormExperienceModel({
      form: input,
      values: {},
      surface: "standalone",
    });
    expect(model.screens.map((screen) => screen.kind)).toEqual([
      "question",
      "question",
    ]);
  });

  test("groupFields creates one group screen and advances question numbering", () => {
    const input = form({
      steps: [
        form().steps[0],
        {
          id: "s2",
          sortOrder: 1,
          title: null,
          description: null,
          richDescription: null,
          settings: null,
          visibility: null,
          fields: [field("third", { stepId: "s2" })],
        },
      ],
    });
    input.steps[0].title = null;
    input.steps[0].settings = { groupFields: true };
    const model = buildFormExperienceModel({
      form: input,
      values: {},
      surface: "standalone",
    });
    expect(model.screens).toHaveLength(2);
    expect(model.screens[0]).toMatchObject({
      kind: "group",
      firstQuestionNumber: 1,
    });
    expect(model.screens[1]).toMatchObject({
      kind: "question",
      questionNumber: 3,
    });
  });

  test("sorts steps and fields and excludes completion-only steps", () => {
    const input = form({
      steps: [
        {
          id: "done",
          sortOrder: 9,
          title: null,
          description: null,
          richDescription: null,
          settings: null,
          visibility: null,
          fields: [field("completion", { stepId: "done", type: "completion" })],
        },
        {
          id: "s1",
          sortOrder: 1,
          title: null,
          description: null,
          richDescription: null,
          settings: null,
          visibility: null,
          fields: [
            field("later", { sortOrder: 2 }),
            field("earlier", { sortOrder: 1 }),
          ],
        },
      ],
    });
    const model = buildFormExperienceModel({
      form: input,
      values: {},
      surface: "standalone",
    });
    expect(model.steps.map((step) => step.id)).toEqual(["s1"]);
    expect(model.steps[0].fields.map((item) => item.id)).toEqual([
      "earlier",
      "later",
    ]);
    expect(getCompletionField(input)?.id).toBe("completion");
    expect(getAllFormFields(input).map((item) => item.id)).toContain("completion");
  });

  test("conditions react to values", () => {
    const input = form();
    input.steps[0].title = null;
    input.steps[0].fields[1].visibility = {
      when: "all",
      rules: [{ fieldId: "first", operator: "equals", value: "show" }],
    };
    expect(
      buildFormExperienceModel({
        form: input,
        values: { first: "hide" },
        surface: "standalone",
      }).screens.map((screen) => screen.key),
    ).toEqual(["field-first"]);
    expect(
      buildFormExperienceModel({
        form: input,
        values: { first: "show" },
        surface: "standalone",
      }).screens.map((screen) => screen.key),
    ).toEqual(["field-first", "field-second"]);
  });

  test("step conditions react to values", () => {
    const input = form({
      steps: [
        { ...form().steps[0], title: null },
        {
          id: "s2",
          sortOrder: 1,
          title: null,
          description: null,
          richDescription: null,
          settings: null,
          visibility: {
            when: "all",
            rules: [{ fieldId: "first", operator: "equals", value: "show" }],
          },
          fields: [field("third", { stepId: "s2" })],
        },
      ],
    });
    expect(
      buildFormExperienceModel({
        form: input,
        values: { first: "hide" },
        surface: "standalone",
      }).screens.map((screen) => screen.key),
    ).toEqual(["field-first", "field-second"]);
    expect(
      buildFormExperienceModel({
        form: input,
        values: { first: "show" },
        surface: "standalone",
      }).screens.map((screen) => screen.key),
    ).toEqual(["field-first", "field-second", "field-third"]);
  });

  test("reports populated fields that become hidden", () => {
    const input = form();
    input.steps[0].title = null;
    input.steps[0].fields[1].visibility = {
      when: "all",
      rules: [{ fieldId: "first", operator: "equals", value: "show" }],
    };
    const model = buildFormExperienceModel({
      form: input,
      values: { first: "hide", second: "remove me" },
      surface: "standalone",
    });
    expect(model.hiddenValueFieldIds).toEqual(["second"]);
  });

  test("booking exclusion removes mapped field from display but not conditions", () => {
    const input = form();
    input.steps[0].title = null;
    input.steps[0].fields[0].contactMapping = "name";
    input.steps[0].fields[1].visibility = {
      when: "all",
      rules: [{ fieldId: "first", operator: "equals", value: "Ada" }],
    };
    const model = buildFormExperienceModel({
      form: input,
      values: { first: "Ada" },
      excludedFieldIds: new Set(["first"]),
      surface: "booking",
    });
    expect(model.screens.map((screen) => screen.key)).toEqual(["field-second"]);
    expect(model.fieldsById.first.id).toBe("first");
  });

  test("booking drops a section when all of its fields are excluded", () => {
    const model = buildFormExperienceModel({
      form: form(),
      values: {},
      excludedFieldIds: new Set(["first", "second"]),
      surface: "booking",
    });
    expect(model.steps).toEqual([]);
    expect(model.screens).toEqual([]);
    expect(model.hasDisplayContent).toBe(false);
  });
});

describe("validateFormExperienceField", () => {
  test("uses host-specific required copy", () => {
    const required = field("required", { required: true });
    expect(validateFormExperienceField(required, "", "Please fill this in")).toBe(
      "Please fill this in",
    );
    expect(
      validateFormExperienceField(required, "", "This field is required"),
    ).toBe("This field is required");
  });

  test("validates non-empty email values", () => {
    const email = field("email", { type: "email" });
    expect(validateFormExperienceField(email, "bad", "Required")).toBe(
      "Please enter a valid email",
    );
    expect(validateFormExperienceField(email, "ada@example.com", "Required")).toBeNull();
  });
});

describe("createFormTransitionLock", () => {
  test("admits only one overlapping async transition", async () => {
    let release!: (value: boolean) => void;
    const pending = new Promise<boolean>((resolve) => {
      release = resolve;
    });
    const lock = createFormTransitionLock();
    let calls = 0;
    const first = lock.run(async () => {
      calls += 1;
      return pending;
    });
    expect(lock.isLocked()).toBe(true);
    const duplicate = await lock.run(async () => {
      calls += 1;
      return true;
    });
    expect(duplicate).toBe(false);
    expect(calls).toBe(1);
    release(true);
    expect(await first).toBe(true);
    expect(lock.isLocked()).toBe(false);
  });

  test("releases after failure", async () => {
    const lock = createFormTransitionLock();
    await expect(
      lock.run(async () => {
        throw new Error("failed");
      }),
    ).rejects.toThrow("failed");
    expect(await lock.run(async () => true)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test tests/form-experience.test.ts`
Expected: FAIL because `src/lib/form-experience.ts` does not exist.

- [ ] **Step 3: Create the shared types and accessors**

Create `src/lib/form-experience.ts`. Import existing condition/section helpers and define these public interfaces exactly:

```ts
import {
  isFieldVisible,
  isStepVisible,
  type FormCondition,
  type FormConditionField,
} from "@/lib/form-conditions";
import { sectionShowsFieldsTogether } from "@/lib/form-sections";

export interface FormExperienceField {
  id: string;
  stepId: string;
  sortOrder: number;
  type: string;
  label: string;
  description: string | null;
  placeholder: string | null;
  required: boolean;
  validation: Record<string, unknown> | null;
  options: Array<{ label: string; value: string }> | null;
  visibility?: FormCondition | null;
  contactMapping?: "name" | "email" | null;
}

export interface FormExperienceStep {
  id: string;
  sortOrder: number;
  title: string | null;
  description: string | null;
  richDescription: string | null;
  settings?: unknown;
  visibility?: FormCondition | null;
  fields: FormExperienceField[];
}

export interface FormExperienceForm {
  id: string;
  name: string;
  type: "multi_step" | "single";
  status?: string;
  steps: FormExperienceStep[];
}

export interface VisibleFormExperienceStep extends FormExperienceStep {
  fields: FormExperienceField[];
}

export type FormExperienceScreen = {
  key: string;
  stepId: string;
  stepIndex: number;
} & (
  | {
      kind: "statement";
      title: string | null;
      description: string | null;
      richDescription: string | null;
    }
  | { kind: "question"; field: FormExperienceField; questionNumber: number }
  | {
      kind: "group";
      fields: FormExperienceField[];
      firstQuestionNumber: number;
    }
);

export interface FormExperienceModel {
  allSortedSteps: FormExperienceStep[];
  allFields: FormExperienceField[];
  fieldsById: Record<string, FormConditionField>;
  completionField: FormExperienceField | null;
  steps: VisibleFormExperienceStep[];
  screens: FormExperienceScreen[];
  hiddenValueFieldIds: string[];
  hasDisplayContent: boolean;
}

export interface BuildFormExperienceModelInput {
  form: FormExperienceForm;
  values: Record<string, string>;
  surface: "standalone" | "booking";
  excludedFieldIds?: ReadonlySet<string>;
}

export function getSortedFormSteps(
  form: FormExperienceForm,
): FormExperienceStep[] {
  return [...form.steps].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getAllFormFields(
  form: FormExperienceForm,
): FormExperienceField[] {
  return getSortedFormSteps(form).flatMap((step) => step.fields);
}

export function getCompletionField(
  form: FormExperienceForm,
): FormExperienceField | null {
  return getAllFormFields(form).find((field) => field.type === "completion") ?? null;
}
```

- [ ] **Step 4: Implement model and screen derivation**

Continue in `src/lib/form-experience.ts` with the pure implementation below:

```ts
function hasMeaningfulIntro(step: FormExperienceStep): boolean {
  const title = step.title?.trim() ?? "";
  const isDefaultTitle = /^(step|section) \d+$/i.test(title);
  return !!(
    step.description?.trim() ||
    step.richDescription?.trim() ||
    (title && !isDefaultTitle)
  );
}

function buildFocusedScreens(
  steps: VisibleFormExperienceStep[],
): FormExperienceScreen[] {
  const screens: FormExperienceScreen[] = [];
  let questionNumber = 0;

  steps.forEach((step, stepIndex) => {
    if (hasMeaningfulIntro(step)) {
      screens.push({
        kind: "statement",
        key: `statement-${step.id}`,
        stepId: step.id,
        stepIndex,
        title: step.title,
        description: step.description,
        richDescription: step.richDescription,
      });
    }

    if (sectionShowsFieldsTogether(step.settings)) {
      if (step.fields.length > 0) {
        screens.push({
          kind: "group",
          key: `group-${step.id}`,
          stepId: step.id,
          stepIndex,
          fields: step.fields,
          firstQuestionNumber: questionNumber + 1,
        });
        questionNumber += step.fields.length;
      }
      return;
    }

    for (const currentField of step.fields) {
      questionNumber += 1;
      screens.push({
        kind: "question",
        key: `field-${currentField.id}`,
        stepId: step.id,
        stepIndex,
        field: currentField,
        questionNumber,
      });
    }
  });

  return screens;
}

export function buildFormExperienceModel(
  input: BuildFormExperienceModelInput,
): FormExperienceModel {
  const { form, values, surface } = input;
  const excludedFieldIds = input.excludedFieldIds ?? new Set<string>();
  const allSortedSteps = getSortedFormSteps(form);
  const allFields = allSortedSteps.flatMap((step) => step.fields);
  const completionField =
    allFields.find((currentField) => currentField.type === "completion") ?? null;
  const fieldsById: Record<string, FormConditionField> = {};
  for (const currentField of allFields) {
    fieldsById[currentField.id] = {
      id: currentField.id,
      type: currentField.type,
      options: currentField.options,
      visibility: currentField.visibility ?? null,
    };
  }
  const conditionInputs = { values, fieldsById };
  const withoutCompletionSteps = allSortedSteps.filter(
    (step) =>
      !(
        step.fields.length > 0 &&
        step.fields.every((currentField) => currentField.type === "completion")
      ),
  );

  let steps = withoutCompletionSteps
    .filter((step) =>
      isStepVisible({ visibility: step.visibility ?? null }, conditionInputs),
    )
    .map<VisibleFormExperienceStep>((step) => ({
      ...step,
      fields: [...step.fields]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .filter(
          (currentField) =>
            currentField.type !== "completion" &&
            isFieldVisible(
              {
                id: currentField.id,
                type: currentField.type,
                options: currentField.options,
                visibility: currentField.visibility ?? null,
              },
              conditionInputs,
            ) &&
            !excludedFieldIds.has(currentField.id),
        ),
    }));

  if (surface === "booking") {
    steps = steps.filter((step) => step.fields.length > 0);
  }

  const screens = form.type === "multi_step" ? buildFocusedScreens(steps) : [];
  const hiddenValueFieldIds = allFields
    .filter(
      (currentField) =>
        currentField.type !== "completion" &&
        values[currentField.id] !== undefined &&
        !isFieldVisible(
          {
            id: currentField.id,
            type: currentField.type,
            options: currentField.options,
            visibility: currentField.visibility ?? null,
          },
          conditionInputs,
        ),
    )
    .map((currentField) => currentField.id);

  return {
    allSortedSteps,
    allFields,
    fieldsById,
    completionField,
    steps,
    screens,
    hiddenValueFieldIds,
    hasDisplayContent:
      form.type === "multi_step"
        ? screens.length > 0
        : steps.some((step) => step.fields.length > 0),
  };
}
```

- [ ] **Step 5: Implement validation and the transition lock**

Append:

```ts
export function validateFormExperienceField(
  field: FormExperienceField,
  value: string,
  requiredMessage: string,
): string | null {
  if (field.required && !value.trim()) return requiredMessage;
  if (
    field.type === "email" &&
    value.trim() &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  ) {
    return "Please enter a valid email";
  }
  return null;
}

export interface FormTransitionLock {
  isLocked(): boolean;
  run(action: () => Promise<boolean>): Promise<boolean>;
}

export function createFormTransitionLock(): FormTransitionLock {
  let locked = false;
  return {
    isLocked() {
      return locked;
    },
    async run(action) {
      if (locked) return false;
      locked = true;
      try {
        return await action();
      } finally {
        locked = false;
      }
    },
  };
}
```

- [ ] **Step 6: Run the helper tests**

Run: `bun test tests/form-experience.test.ts`
Expected: PASS (all model, validation, and lock tests).

- [ ] **Step 7: Run existing helper tests to catch parity regressions**

Run: `bun test tests/worker/form-conditions.test.ts tests/form-sections.test.ts`
Expected: PASS (existing condition and section behavior remains unchanged).

- [ ] **Step 8: Commit Task 1**

```bash
git add src/lib/form-experience.ts tests/form-experience.test.ts
git commit -m "refactor(forms): add shared form experience model"
```

---

### Task 2: Controlled `FormExperience` component

**Files:**
- Create: `src/components/FormExperience.tsx`
- Create: `tests/form-experience-render.test.tsx`
- Read without changing: `src/components/FocusedFieldInput.tsx`
- Read without changing: `src/components/FormFieldRenderer.tsx`

**Interfaces:**
- Consumes all Task 1 types/helpers.
- Produces `FormExperienceCheckpoint` and `FormExperienceProps`.
- Produces named `FormExperience`, `FormExperiencePageShell`, and `FocusedFormExperienceShell` exports. The shell exports let `PublicForm` reuse the exact same shell for loading/error/completion without duplicating markup.
- `onCheckpoint` resolves `true` to allow navigation/completion and `false` to remain on the current screen.

- [ ] **Step 1: Write render-contract tests**

Create `tests/form-experience-render.test.tsx`:

```tsx
import { describe, expect, test } from "bun:test";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { FormExperience } from "../src/components/FormExperience";
import type {
  FormExperienceField,
  FormExperienceForm,
} from "../src/lib/form-experience";

function field(id: string, label: string): FormExperienceField {
  return {
    id,
    stepId: "s1",
    sortOrder: id === "first" ? 0 : 1,
    type: "text",
    label,
    description: null,
    placeholder: null,
    required: false,
    validation: null,
    options: null,
    visibility: null,
    contactMapping: null,
  };
}

function form(type: "multi_step" | "single"): FormExperienceForm {
  return {
    id: "f1",
    name: "Lead form",
    type,
    status: "active",
    steps: [
      {
        id: "s1",
        sortOrder: 0,
        title: null,
        description: null,
        richDescription: null,
        settings: null,
        visibility: null,
        fields: [field("first", "First question"), field("second", "Second question")],
      },
    ],
  };
}

function renderExperience(
  currentForm: FormExperienceForm,
  overrides: Partial<ComponentProps<typeof FormExperience>> = {},
): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <FormExperience
        form={currentForm}
        surface="booking"
        values={{}}
        submitting={false}
        error={null}
        onValueChange={() => {}}
        onClearFields={() => {}}
        onCheckpoint={async () => true}
        {...overrides}
      />
    </MemoryRouter>,
  );
}

describe("FormExperience render contract", () => {
  test("focused mode renders only the current question", () => {
    const html = renderExperience(form("multi_step"));
    expect(html).toContain("First question");
    expect(html).not.toContain("Second question");
  });

  test("classic mode renders every field in the current section", () => {
    const html = renderExperience(form("single"));
    expect(html).toContain("First question");
    expect(html).toContain("Second question");
  });

  test("booking exclusion removes the mapped field", () => {
    const html = renderExperience(form("multi_step"), {
      excludedFieldIds: new Set(["first"]),
      values: { first: "Ada" },
    });
    expect(html).not.toContain("First question");
    expect(html).toContain("Second question");
  });

  test("standalone surface retains powered-by branding", () => {
    const html = renderExperience(form("multi_step"), {
      surface: "standalone",
    });
    expect(html).toContain("Powered by");
  });
});
```

- [ ] **Step 2: Run the render tests to verify they fail**

Run: `bun test tests/form-experience-render.test.tsx`
Expected: FAIL because `src/components/FormExperience.tsx` does not exist.

- [ ] **Step 3: Create the controlled component contract**

Create `src/components/FormExperience.tsx` with imports from the existing renderers, UI components, and Task 1 helpers. Define this public contract before moving JSX:

```tsx
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { FocusedFieldInput, isChoiceFieldType } from "@/components/FocusedFieldInput";
import { FormFieldRenderer } from "@/components/FormFieldRenderer";
import { Logo } from "@/components/Logo";
import { RichTextContent } from "@/components/RichTextContent";
import {
  buildFormExperienceModel,
  createFormTransitionLock,
  validateFormExperienceField,
  type FormExperienceField,
  type FormExperienceForm,
  type FormExperienceScreen,
} from "@/lib/form-experience";
import {
  getSectionImage,
  sectionImageStyle,
  type SectionImage,
  type SectionImageLayout,
} from "@/lib/form-sections";
import { cn } from "@/lib/utils";

export interface FormExperienceTheme {
  primaryBg?: string;
  primaryText?: string;
  backgroundColor?: string;
  textColor?: string;
  borderRadius?: number;
  fontFamily?: string;
  backgroundImage?: string;
  bannerImage?: string;
}

export interface FormExperienceCheckpoint {
  stepIndex: number;
  totalSteps: number;
  isFinal: boolean;
  fields: FormExperienceField[];
}

export interface FormExperienceProps {
  form: FormExperienceForm;
  surface: "standalone" | "booking";
  values: Record<string, string>;
  files?: Record<string, File | null>;
  excludedFieldIds?: ReadonlySet<string>;
  submitting: boolean;
  error: string | null;
  theme?: FormExperienceTheme;
  canHideBranding?: boolean;
  head?: ReactNode;
  honeypot?: ReactNode;
  onValueChange: (fieldId: string, value: string) => void;
  onFileChange?: (fieldId: string, file: File | null) => void;
  onClearFields: (fieldIds: string[]) => void;
  onCheckpoint: (checkpoint: FormExperienceCheckpoint) => Promise<boolean>;
  onExitBack?: () => void;
}
```

- [ ] **Step 4: Move orchestration into `FormExperience`**

Implement `FormExperience` by mechanically moving the active-form state and behavior from `PublicForm.tsx:140-149`, `PublicForm.tsx:317-438`, and `PublicForm.tsx:628-772`. Use Task 1’s model instead of rebuilding steps/screens locally. The top of the component must follow this structure:

```tsx
export function FormExperience(props: FormExperienceProps) {
  const {
    form,
    surface,
    values,
    files = {},
    excludedFieldIds,
    submitting,
    error,
    theme,
    canHideBranding,
    head,
    honeypot,
    onValueChange,
    onFileChange,
    onClearFields,
    onCheckpoint,
    onExitBack,
  } = props;
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [screenIndex, setScreenIndex] = useState(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionLock = useRef(createFormTransitionLock());
  const model = useMemo(
    () =>
      buildFormExperienceModel({
        form,
        values,
        surface,
        excludedFieldIds,
      }),
    [form, values, surface, excludedFieldIds],
  );
  const { steps, screens } = model;
  const currentStep = steps[currentStepIndex];
  const currentFields = currentStep?.fields ?? [];
  const currentScreen = screens[screenIndex] ?? null;
  const isLastStep = currentStepIndex === steps.length - 1;
  const isLastScreen = screenIndex === screens.length - 1;
  const requiredMessage =
    surface === "standalone" ? "Please fill this in" : "This field is required";

  function setValue(fieldId: string, value: string) {
    setFieldErrors((previous) => {
      const next = { ...previous };
      delete next[fieldId];
      return next;
    });
    onValueChange(fieldId, value);
  }

  function setFileValue(fieldId: string, file: File | null) {
    onFileChange?.(fieldId, file);
    setValue(fieldId, file?.name ?? "");
  }
```

Preserve the current index-clamping, hidden-value cleanup, latest-closure refs, 350 ms timer, Enter/arrow/letter keyboard behavior, and validation messages. Keep the host callback separate from locking:

```tsx
  async function checkpoint(
    stepIndex: number,
    isFinal: boolean,
  ): Promise<boolean> {
    const current = steps[stepIndex];
    if (!current) return false;
    return onCheckpoint({
      stepIndex,
      totalSteps: steps.length,
      isFinal,
      fields: current.fields,
    });
  }
```

The lock must cover each complete forward action, not only the awaited checkpoint. Otherwise two rapid Next signals can advance across two questions before a checkpoint is reached. Implement both focused `goNext()` and classic `submitCurrentStep()` with this structure:

```tsx
  async function goNext(): Promise<boolean> {
    if (submitting) return false;
    clearAutoAdvance();
    return transitionLock.current.run(async () => {
      const screen = screens[screenIndex];
      if (!screen) return false;

      const errors = validateScreen(screen);
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return false;
      }

      const next = screens[screenIndex + 1];
      const leavingStep = isLastScreen || next?.stepIndex !== screen.stepIndex;
      if (leavingStep) {
        const accepted = await checkpoint(screen.stepIndex, isLastScreen);
        if (!accepted || isLastScreen) return accepted;
      }

      setDirection("forward");
      setScreenIndex((previous) => Math.min(previous + 1, screens.length - 1));
      return true;
    });
  }

  async function submitCurrentStep(): Promise<boolean> {
    if (submitting) return false;
    return transitionLock.current.run(async () => {
      const errors = validateFields(currentFields);
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return false;
      }
      const accepted = await checkpoint(currentStepIndex, isLastStep);
      if (accepted && !isLastStep) {
        setCurrentStepIndex((previous) => previous + 1);
      }
      return accepted;
    });
  }
```

`validateScreen()` and `validateFields()` must call `validateFormExperienceField()` and return the same error maps as the current page. For `goPrev`, first return when `submitting` or `transitionLock.current.isLocked()`; when already on the first booking screen/step call `onExitBack?.()`, while standalone first-screen back remains disabled. In the hidden-value effect, call `onClearFields(model.hiddenValueFieldIds)` once when the list is non-empty.

- [ ] **Step 5: Move active rendering without altering standalone markup**

Move these existing blocks verbatim into `FormExperience.tsx`, changing only variable/prop references required by the new contract:

- focused active render: `PublicForm.tsx:884-1097`;
- classic active render: `PublicForm.tsx:1102-1211`;
- section media and focused shell: `PublicForm.tsx:1216-1364`;
- page shell: `PublicForm.tsx:1366-1510`.

Export the moved shells under these names:

```tsx
export interface FocusedFormExperienceShellProps {
  children: ReactNode;
  theme?: FormExperienceTheme;
  canHideBranding?: boolean;
  progressPct: number;
  showNav: boolean;
  canPrev?: boolean;
  canNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  media?: ReactNode;
  mediaLayout?: SectionImageLayout;
}

export interface FormExperiencePageShellProps {
  children: ReactNode;
  theme?: FormExperienceTheme;
  canHideBranding?: boolean;
  media?: ReactNode;
  mediaLayout?: SectionImageLayout;
}
```

Implement `FocusedFormExperienceShell(props: FocusedFormExperienceShellProps): ReactNode` with the complete body at `PublicForm.tsx:1262-1375`; destructure the same defaults currently used by `FocusedShell`. Implement `FormExperiencePageShell(props: FormExperiencePageShellProps): ReactNode` with the complete body at `PublicForm.tsx:1393-1509`; destructure the same defaults currently used by `PageShell`. Rename only the functions/props and replace every moved `React.CSSProperties` annotation with the imported `CSSProperties`; every JSX element, class, style, search parameter, and branding branch stays byte-for-byte equivalent.

`surface === "standalone"` must use the moved standalone shell/markup exactly. `surface === "booking"` must render inside a fragment suitable for the existing booking card:

- classic: use the exact title, `RichTextContent`, `space-y-4`, `FormFieldRenderer`, Back/Next/Confirm layout currently at `PublicBooking.tsx:1045-1135`;
- focused: reuse the exact statement/group/question content and `FocusedFieldInput` markup from standalone, but omit the full-page shell and bottom branding; render a compact progress bar above the animated question and keep Back/Next controls inside the booking card;
- booking final button text remains `Confirm Booking`, using `CalendarCheck` while idle and `Loader` while submitting;
- standalone final button text remains `Submit`.

Render `head` at the same location currently occupied by `seoHead`; render `honeypot` at the current hidden-input location. Do not move either relative to visible standalone content.

- [ ] **Step 6: Run render and helper tests**

Run: `bun test tests/form-experience.test.ts tests/form-experience-render.test.tsx`
Expected: PASS.

- [ ] **Step 7: Type-check the new component before either host uses it**

Run: `bunx tsc -p tsconfig.app.json --noEmit`
Expected: PASS with no TypeScript errors.

- [ ] **Step 8: Commit Task 2**

```bash
git add src/components/FormExperience.tsx tests/form-experience-render.test.tsx
git commit -m "refactor(forms): add controlled shared form experience"
```

---

### Task 3: Migrate standalone `PublicForm` with zero behavior/UI change

**Files:**
- Modify: `src/pages/PublicForm.tsx`
- Test: `tests/form-experience.test.ts`
- Test: `tests/form-experience-render.test.tsx`

**Interfaces:**
- Consumes `FormExperience`, `FormExperiencePageShell`, `FocusedFormExperienceShell`, `getAllFormFields`, `getCompletionField`, and `getSortedFormSteps`.
- Changes the internal standalone checkpoint signature to consume `FormExperienceCheckpoint`; public routes and payloads remain unchanged.

- [ ] **Step 1: Capture pre-migration standalone baselines**

Before editing `PublicForm.tsx`, run:

```bash
bun test tests/form-experience.test.ts tests/form-experience-render.test.tsx
bun test tests/worker/form-conditions.test.ts tests/worker/form-prefill.test.ts tests/form-sections.test.ts
```

Expected: PASS. Start `bun run dev` and use the in-app browser on the Local Regression Fixtures. Capture `Classic Regression` and `Focused Regression` at 1440x900 and 390x844. For focused mode, capture the statement, first question, grouped screen, and left section image. Complete both forms while recording the network panel: expect one response `POST`, then exactly one step `PATCH` when each visible section is exited, with the last `PATCH` carrying `complete: true`. Save the screenshots and request log outside the repository or under `/tmp/linkycal-shared-form-baseline`; these are the comparison baselines for Step 6.

- [ ] **Step 2: Replace local types with shared types**

In `PublicForm.tsx`, remove local `FormField`, `FormStep`, `PublicFormData`, `BookingTheme`, and `FocusedScreen`. Import:

```tsx
import {
  FormExperience,
  FormExperiencePageShell,
  FocusedFormExperienceShell,
  type FormExperienceCheckpoint,
  type FormExperienceTheme,
} from "@/components/FormExperience";
import {
  getAllFormFields,
  getCompletionField,
  getSortedFormSteps,
  type FormExperienceForm,
} from "@/lib/form-experience";
```

Change the query type to `{ form: FormExperienceForm; project: ProjectInfo | null; canHideBranding?: boolean }`, and change `ProjectInfo.settings.theme` plus the local `themeOverride`/`theme` annotations to `FormExperienceTheme`.

- [ ] **Step 3: Remove orchestration now owned by `FormExperience`**

Delete from `PublicForm`:

- `currentStepIndex`, `screenIndex`, `direction`, and `fieldErrors` state;
- `fieldsById`, `conditionInputs`, visible step/field construction, classic indices, and focused screens;
- index-clamping and hidden-field cleanup effects;
- `validateField`, `validateCurrentStep`, `submitCurrentStep`, `goNext`, `goPrev`, timer, latest refs, and keyboard listener;
- active focused/classic render branches and the local shell/media component definitions.

Retain `values`, `files`, `responseId`, `submitting`, `submitted`, `error`, spam state, query/theme/embed effects, prefill, upload, response persistence, SEO, and completion behavior.

Replace derived metadata with:

```tsx
  const allSortedSteps = useMemo(
    () => (form ? getSortedFormSteps(form) : []),
    [form],
  );
  const allFields = useMemo(
    () => (form ? getAllFormFields(form) : []),
    [form],
  );
  const completionField = useMemo(
    () => (form ? getCompletionField(form) : null),
    [form],
  );
```

- [ ] **Step 4: Adapt persistence callbacks without changing network timing**

Change `submitStepValues` to accept a checkpoint and use the checkpoint’s already-visible fields:

```tsx
  async function submitStepValues(
    checkpoint: FormExperienceCheckpoint,
  ): Promise<boolean> {
    setSubmitting(true);
    setError(null);
    try {
      const resId = await ensureResponseId();
      const fields: Array<{
        fieldId: string;
        value: string;
        fileUrl?: string;
      }> = [];

      for (const currentField of checkpoint.fields) {
        if (currentField.type === "file") {
          const file = files[currentField.id];
          if (file) {
            const upload = await uploadFieldFile(resId, currentField, file);
            fields.push({
              fieldId: currentField.id,
              value: upload.filename,
              fileUrl: upload.fileUrl,
            });
            continue;
          }
        }
        fields.push({
          fieldId: currentField.id,
          value: values[currentField.id] ?? "",
        });
      }

      const res = await fetch(
        `/api/public/forms/${projectSlug}/${formSlug}/responses/${resId}/steps/${checkpoint.stepIndex}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fields, complete: checkpoint.isFinal }),
        },
      );
      if (!res.ok) throw new Error("Failed to submit");
      if (checkpoint.isFinal) {
        posthog?.capture("form_submitted", {
          form_slug: formSlug,
          form_name: form?.name,
          total_steps: checkpoint.totalSteps,
        });
        setSubmitted(true);
      }
      return true;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Something went wrong. Please try again.",
      );
      return false;
    } finally {
      setSubmitting(false);
    }
  }
```

Add controlled callbacks:

```tsx
  function setValue(fieldId: string, value: string) {
    setValues((previous) => ({ ...previous, [fieldId]: value }));
  }

  function setFileValue(fieldId: string, file: File | null) {
    setFiles((previous) => ({ ...previous, [fieldId]: file }));
  }

  function clearFields(fieldIds: string[]) {
    setValues((previous) => {
      const next = { ...previous };
      for (const id of fieldIds) delete next[id];
      return next;
    });
    setFiles((previous) => {
      const next = { ...previous };
      for (const id of fieldIds) delete next[id];
      return next;
    });
  }
```

- [ ] **Step 5: Render the shared component**

Keep loading/error/completion early returns, replacing their shell names with the shared exports. Replace both active rendering branches with:

```tsx
  return (
    <FormExperience
      form={form}
      surface="standalone"
      values={values}
      files={files}
      submitting={submitting}
      error={error}
      theme={theme}
      canHideBranding={canHideBranding}
      head={seoHead}
      honeypot={
        <div className="sr-only" aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input
            id="website"
            type="text"
            name="website"
            autoComplete="url"
            tabIndex={-1}
            value={spamField}
            onChange={(event) => setSpamField(event.target.value)}
          />
        </div>
      }
      onValueChange={setValue}
      onFileChange={setFileValue}
      onClearFields={clearFields}
      onCheckpoint={submitStepValues}
    />
  );
```

- [ ] **Step 6: Verify standalone parity before touching booking code**

Run:

```bash
bun test tests/form-experience.test.ts tests/form-experience-render.test.tsx
bun test tests/worker/form-conditions.test.ts tests/worker/form-prefill.test.ts tests/form-sections.test.ts
bunx tsc -p tsconfig.app.json --noEmit
```

Expected: all PASS. In the in-app browser, repeat Step 1’s classic/focused desktop/mobile flows and compare screenshots, text, dimensions, animations, keyboard behavior, section imagery, values, and request order. Do not proceed if any standalone DOM/class/visual/API difference is found; correct the extraction until parity is exact.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/pages/PublicForm.tsx src/components/FormExperience.tsx tests/form-experience*.ts*
git commit -m "refactor(forms): run standalone forms through shared experience"
```

---

### Task 4: Run attached booking forms through `FormExperience`

**Files:**
- Modify: `src/pages/PublicBooking.tsx`
- Modify: `tests/form-experience-render.test.tsx`

**Interfaces:**
- Consumes `FormExperience`, `FormExperienceCheckpoint`, `FormExperienceForm`, and `buildFormExperienceModel`.
- `handleBook(): Promise<boolean>` becomes the booking completion adapter; the HTTP contract is unchanged.
- `bookingForm.type` becomes a runtime presentation decision through `FormExperience`.

- [ ] **Step 1: Extend render tests for booking-specific contracts**

Append to `tests/form-experience-render.test.tsx`:

```tsx
test("focused booking uses booking completion copy", () => {
  const current = form("multi_step");
  current.steps[0].fields = [current.steps[0].fields[0]];
  const html = renderExperience(current);
  expect(html).toContain("Confirm Booking");
  expect(html).not.toContain(">Submit<");
});

test("classic booking keeps the existing section title and both fields", () => {
  const current = form("single");
  current.steps[0].title = "Qualification";
  const html = renderExperience(current);
  expect(html).toContain("Qualification");
  expect(html).toContain("First question");
  expect(html).toContain("Second question");
});
```

Run: `bun test tests/form-experience-render.test.tsx`
Expected: PASS if Task 2 already implemented the approved booking surface. If either fails, correct only `FormExperience` booking-surface markup before editing `PublicBooking`.

- [ ] **Step 2: Replace the booking form response type and imports**

Remove the direct `FormFieldRenderer` and attached-form-only `RichTextContent` imports from `PublicBooking.tsx`. Add:

```tsx
import {
  FormExperience,
  type FormExperienceCheckpoint,
} from "@/components/FormExperience";
import {
  buildFormExperienceModel,
  type FormExperienceForm,
} from "@/lib/form-experience";
```

Change the query’s `bookingForm` property from its local object shape to `FormExperienceForm | null`.

- [ ] **Step 3: Replace step-based custom-form derivation**

Keep `mappedFields` and `mappedFieldIds`, but remove `visibleFormSteps`, dynamic `totalSteps`, `validateFormStep`, and `formFieldErrors` state. Add:

```tsx
  const bookingFormModel = useMemo(
    () =>
      bookingForm
        ? buildFormExperienceModel({
            form: bookingForm,
            values: formValues,
            surface: "booking",
            excludedFieldIds: mappedFieldIds,
          })
        : null,
    [bookingForm, formValues, mappedFieldIds],
  );
  const hasBookingFormContent = bookingFormModel?.hasDisplayContent ?? false;
  const confirmationStep = 4;
```

Keep confirmation on the stable internal step `4` even when conditions later remove every attached field. The details screen still calls `handleBook()` directly when `hasBookingFormContent` is false; a successful request then moves to step `4`. This prevents a value-dependent model change from turning step `3` into confirmation before a booking exists.

Add controlled booking callbacks:

```tsx
  function setBookingFormValue(fieldId: string, value: string) {
    setFormValues((previous) => ({ ...previous, [fieldId]: value }));
    const currentField = bookingFormModel?.allFields.find(
      (field) => field.id === fieldId,
    );
    if (currentField?.contactMapping === "name") setGuestName(value);
    if (currentField?.contactMapping === "email") setGuestEmail(value);
  }

  function clearBookingFormFields(fieldIds: string[]) {
    setFormValues((previous) => {
      const next = { ...previous };
      for (const id of fieldIds) delete next[id];
      return next;
    });
  }
```

The contact-mapping updates preserve the current behavior for any additional mapped field that remains visible after the first name/email field is excluded.

- [ ] **Step 4: Make booking completion awaitable**

Change `handleBook` to `async function handleBook(): Promise<boolean>`. Return `false` from the initial guard, `true` after setting booking status/confirmation step, and `false` from `catch`:

```tsx
  async function handleBook(): Promise<boolean> {
    if (!selectedSlot || !guestName || !guestEmail || !eventSlug || !projectSlug) {
      return false;
    }
    setSubmitting(true);
    setBookingError(null);

    try {
      const payload: Record<string, unknown> = {
        projectSlug,
        eventTypeSlug: eventSlug,
        startTime: selectedSlot.start,
        name: guestName,
        email: guestEmail,
        notes: guestNotes || undefined,
        timezone,
        website: spamField,
        _token: formToken,
      };

      if (bookingForm) {
        const merged = { ...formValues };
        if (mappedFields.nameFieldId) {
          merged[mappedFields.nameFieldId] = guestName;
        }
        if (mappedFields.emailFieldId) {
          merged[mappedFields.emailFieldId] = guestEmail;
        }
        if (Object.keys(merged).length > 0) {
          payload.formFields = merged;
        }
      }

      const res = await fetch("/api/v1/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error || "Failed to book",
        );
      }

      const result = (await res.json().catch(() => ({}))) as {
        booking?: { status?: string };
      };
      const status =
        result.booking?.status === "pending" ? "pending" : "confirmed";
      setBookingStatus(status);
      posthog?.capture(
        status === "pending" ? "booking_requested" : "booking_confirmed",
        {
          project_slug: projectSlug,
          event_slug: eventSlug,
          event_name: eventType?.name,
          duration: eventType?.duration,
          start_time: selectedSlot.start,
        },
      );
      setStep(confirmationStep);
      return true;
    } catch (caught) {
      setBookingError(
        caught instanceof Error ? caught.message : "Something went wrong",
      );
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function checkpointBookingForm(
    checkpoint: FormExperienceCheckpoint,
  ): Promise<boolean> {
    if (!checkpoint.isFinal) return true;
    return handleBook();
  }
```

Do not alter the payload shape or backend request timing.

- [ ] **Step 5: Replace attached-form rendering**

On the basic-details screen, change `visibleFormSteps.length > 0` to `hasBookingFormContent`; its Next button still calls `setStep(3)`. Change the inline error condition to `!hasBookingFormContent`.

Delete `PublicBooking.tsx:1045-1135` (the custom form-step renderer) and replace it with:

```tsx
          {step === 3 && hasBookingFormContent && bookingForm && (
            <FormExperience
              form={bookingForm}
              surface="booking"
              values={formValues}
              excludedFieldIds={mappedFieldIds}
              submitting={submitting}
              error={bookingError}
              theme={theme}
              onValueChange={setBookingFormValue}
              onClearFields={clearBookingFormFields}
              onCheckpoint={checkpointBookingForm}
              onExitBack={() => setStep(2)}
            />
          )}
```

Update `handleBookAnother` to clear `formValues` and `bookingError`; remove the deleted `formFieldErrors` reset. Keep date/time, details, confirmation, banner, owner, theme, embed sizing, and footer markup unchanged.

- [ ] **Step 6: Run focused tests and app type-check**

Run:

```bash
bun test tests/form-experience.test.ts tests/form-experience-render.test.tsx
bun test tests/worker/booking-actions.test.ts
bunx tsc -p tsconfig.app.json --noEmit
```

Expected: PASS. Confirm `rg -n "bookingForm\.type" src/pages/PublicBooking.tsx src/components/FormExperience.tsx` shows the runtime type is consumed by the shared model/component path, and `rg -n "FormFieldRenderer" src/pages/PublicBooking.tsx` returns no match.

- [ ] **Step 7: Browser-verify booking flows**

Using the in-app browser against the local dev server, verify these fixtures:

1. No attached form: date/time -> basics -> one booking request -> confirmation.
2. Classic attached form with two sections: existing section-at-a-time layout and copy are unchanged; only the final section sends the booking request.
3. `Focused Booking Regression`: after basics, the `About you` statement appears, then only `Company`; Continue/Enter advances into the next screen, and final completion sends one booking request.
4. Its `Preferences` section renders `Priority` and `Contact method` together on one grouped screen with consecutive question numbers.
5. In their respective classic/focused booking fixtures, `Full name`, `Email`, and `Work email` mapped fields are absent from attached screens but present in the final `formFields` payload with the basics values.
6. `Email context`, whose condition references the excluded mapped `Work email`, is visible for a basics email containing `@` and disappears without retaining a stale value when that source no longer matches.
7. Backend `409` slot conflict: final screen and answers remain visible with the returned booking error.
8. Rapid double-click plus Enter on final: network panel shows one `/api/v1/bookings` request.
9. Pending-confirmation event: existing pending confirmation content remains unchanged.
10. Mobile and embedded focused booking: card width, height messaging, Back behavior, and keyboard behavior remain functional.
11. For each attached-form success, the response body has a non-null `booking.formResponseId`; the dashboard booking shows the submitted fields and the corresponding form response is `completed`. One booking request produces one booking and one linked response.

Do not proceed on any standalone or classic-booking visual regression.

- [ ] **Step 8: Commit Task 4**

```bash
git add src/pages/PublicBooking.tsx src/components/FormExperience.tsx tests/form-experience-render.test.tsx
git commit -m "feat(booking): honor focused attached forms"
```

---

### Task 5: Full regression and delivery verification

**Files:**
- Verify only; change source only to correct failures directly caused by Tasks 1-4.

**Interfaces:**
- Confirms the approved design’s acceptance criteria and produces the final evidence for handoff.

- [ ] **Step 1: Run all focused tests**

Run:

```bash
bun test tests/form-experience.test.ts tests/form-experience-render.test.tsx tests/worker/booking-actions.test.ts tests/worker/form-conditions.test.ts tests/worker/form-prefill.test.ts tests/form-sections.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Run the full repository test suite**

Run: `bun test`
Expected: all tests PASS with 0 failures.

- [ ] **Step 3: Run lint**

Run: `bun run lint`
Expected: exit 0 with no lint errors. Do not reformat `worker/index.ts` or stage its existing user-owned diff.

- [ ] **Step 4: Run the production build**

Run: `bun run build`
Expected: Cloudflare type generation, all TypeScript project references, and Vite production build complete successfully.

- [ ] **Step 5: Repeat the standalone parity gate**

Repeat Task 3 Step 6 after booking integration. Expected: classic/focused standalone screenshots, DOM/classes, animations, keyboard navigation, file uploads, request ordering, completion, redirects, themes, and embed behavior remain identical to the pre-migration baseline.

- [ ] **Step 6: Inspect the final diff**

Run:

```bash
git diff --check
git status --short
git diff --stat
git diff -- src/lib/form-experience.ts src/components/FormExperience.tsx src/pages/PublicForm.tsx src/pages/PublicBooking.tsx tests/form-experience.test.ts tests/form-experience-render.test.tsx
```

Expected: only planned form-experience files plus the pre-existing `worker/index.ts` formatting diff and uncommitted Superpowers docs are present; no backend/schema/API files changed.

- [ ] **Step 7: Request code review**

Use `superpowers:requesting-code-review` against the approved spec and this implementation plan. Require reviewers to check standalone pixel/behavior parity, single-request transition locking, controlled-value preservation, mapped-field condition behavior, and unchanged booking payloads.

- [ ] **Step 8: Commit review corrections separately**

If review finds an in-scope defect, fix only that defect, rerun its focused test plus Steps 1-4, and commit with a narrowly scoped message. Do not bundle unrelated cleanup.

## Definition of Done

- Both `PublicForm` and `PublicBooking` render active forms through `FormExperience`.
- Standalone classic/focused output and behavior are unchanged.
- Classic attached-booking output and behavior are unchanged.
- Focused attached forms render one question per screen except explicit groups.
- Booking basics remain before attached questions; no booking exists until final completion.
- The existing final booking request still carries mapped and attached `formFields`.
- A failed booking remains on the final attached-form screen with answers intact.
- Duplicate UI signals cannot overlap checkpoint or booking requests.
- No backend, API, schema, or migration changes exist.
- Focused tests, full tests, lint, build, browser regression, and code review all pass.

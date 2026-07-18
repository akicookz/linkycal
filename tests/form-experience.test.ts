import { describe, expect, test } from "bun:test";

import {
  buildFormExperienceModel,
  createFormExperienceCheckpoint,
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

  test("booking clears answers in hidden parent steps while standalone retains them", () => {
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
    const values = { first: "hide", third: "remove me" };

    expect(
      buildFormExperienceModel({
        form: input,
        values,
        surface: "booking",
      }).hiddenValueFieldIds,
    ).toEqual(["third"]);
    expect(
      buildFormExperienceModel({
        form: input,
        values,
        surface: "standalone",
      }).hiddenValueFieldIds,
    ).toEqual([]);
  });

  test("excluded mapped fields are retained as booking condition inputs", () => {
    const input = form();
    input.steps[0].title = null;
    input.steps[0].fields[0].contactMapping = "email";
    input.steps[0].fields[0].visibility = {
      when: "all",
      rules: [{ fieldId: "second", operator: "equals", value: "show" }],
    };
    input.steps[0].fields[1].visibility = {
      when: "all",
      rules: [{ fieldId: "first", operator: "equals", value: "ada@example.com" }],
    };

    const model = buildFormExperienceModel({
      form: input,
      values: { first: "ada@example.com", second: "hide" },
      excludedFieldIds: new Set(["first"]),
      surface: "booking",
    });

    expect(model.hiddenValueFieldIds).not.toContain("first");
    expect(model.screens.map((screen) => screen.key)).toEqual(["field-second"]);
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

describe("createFormExperienceCheckpoint", () => {
  test("preserves each supported empty-form checkpoint contract", () => {
    const input = {
      formType: "single" as const,
      surface: "standalone" as const,
      steps: [],
      stepIndex: 0,
      isFinal: false,
    };
    expect(createFormExperienceCheckpoint(input)).toEqual({
      stepIndex: 0,
      totalSteps: 0,
      isFinal: false,
      fields: [],
    });
    expect(
      createFormExperienceCheckpoint({
        ...input,
        formType: "multi_step",
        surface: "booking",
        isFinal: true,
      }),
    ).toEqual({
      stepIndex: 0,
      totalSteps: 0,
      isFinal: true,
      fields: [],
    });
    expect(
      createFormExperienceCheckpoint({ ...input, formType: "multi_step" }),
    ).toBeNull();
  });
});

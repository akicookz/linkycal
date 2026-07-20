import { describe, expect, test } from "bun:test";

import {
  buildFormExperienceModel,
  createFormTransitionLock,
  getContactMappedFieldIds,
  shouldCollectDetailsWithForm,
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

  test("drops titled steps whose fields are all hidden on standalone", () => {
    const input = form({
      steps: [
        { ...form().steps[0], title: null },
        {
          id: "s2",
          sortOrder: 1,
          title: "Extras",
          description: null,
          richDescription: null,
          settings: null,
          visibility: null,
          fields: [
            field("third", {
              stepId: "s2",
              visibility: {
                when: "all",
                rules: [{ fieldId: "first", operator: "equals", value: "show" }],
              },
            }),
          ],
        },
      ],
    });
    const model = buildFormExperienceModel({
      form: input,
      values: { first: "hide" },
      surface: "standalone",
    });
    expect(model.steps.map((step) => step.id)).toEqual(["s1"]);
    expect(model.screens.map((screen) => screen.key)).toEqual([
      "field-first",
      "field-second",
    ]);
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

  test("requiredFieldIds forces matching fields required in steps and screens", () => {
    const model = buildFormExperienceModel({
      form: form(),
      values: {},
      surface: "booking",
      requiredFieldIds: new Set(["first"]),
    });

    const first = model.steps[0]?.fields.find((f) => f.id === "first");
    const second = model.steps[0]?.fields.find((f) => f.id === "second");
    expect(first?.required).toBe(true);
    expect(second?.required).toBe(false);

    const screen = model.screens.find(
      (s) => s.kind === "question" && s.field.id === "first",
    );
    expect(screen?.kind === "question" && screen.field.required).toBe(true);
  });

  test("requiredFieldIds does not resurrect excluded fields", () => {
    const model = buildFormExperienceModel({
      form: form(),
      values: {},
      surface: "booking",
      excludedFieldIds: new Set(["first"]),
      requiredFieldIds: new Set(["first"]),
    });
    expect(
      model.steps.flatMap((s) => s.fields).some((f) => f.id === "first"),
    ).toBe(false);
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
});

describe("getContactMappedFieldIds", () => {
  test("returns the first name- and email-mapped field ids", () => {
    const model = form({
      steps: [
        {
          id: "s1",
          sortOrder: 0,
          title: null,
          description: null,
          richDescription: null,
          settings: null,
          visibility: null,
          fields: [
            field("full-name", { contactMapping: "name" }),
            field("work-email", { sortOrder: 1, contactMapping: "email" }),
            field("alt-email", { sortOrder: 2, contactMapping: "email" }),
          ],
        },
      ],
    });
    expect(getContactMappedFieldIds(model)).toEqual({
      nameFieldId: "full-name",
      emailFieldId: "work-email",
    });
  });

  test("returns empty object when nothing is mapped", () => {
    expect(getContactMappedFieldIds(form())).toEqual({});
  });
});

describe("shouldCollectDetailsWithForm", () => {
  const mappedForm = form({
    steps: [
      {
        id: "s1",
        sortOrder: 0,
        title: null,
        description: null,
        richDescription: null,
        settings: null,
        visibility: null,
        fields: [
          field("full-name", { contactMapping: "name" }),
          field("work-email", { sortOrder: 1, contactMapping: "email" }),
        ],
      },
    ],
  });

  test("true when flag is on and form maps name and email", () => {
    expect(
      shouldCollectDetailsWithForm({ collectDetailsWithForm: true }, mappedForm),
    ).toBe(true);
  });

  test("false without a form", () => {
    expect(
      shouldCollectDetailsWithForm({ collectDetailsWithForm: true }, null),
    ).toBe(false);
  });

  test("false when settings are missing or the flag is off", () => {
    expect(shouldCollectDetailsWithForm(null, mappedForm)).toBe(false);
    expect(shouldCollectDetailsWithForm(undefined, mappedForm)).toBe(false);
    expect(
      shouldCollectDetailsWithForm({ collectDetailsWithForm: false }, mappedForm),
    ).toBe(false);
    expect(shouldCollectDetailsWithForm("yes", mappedForm)).toBe(false);
  });

  test("false when a mapping is missing", () => {
    const nameOnly = form({
      steps: [
        {
          id: "s1",
          sortOrder: 0,
          title: null,
          description: null,
          richDescription: null,
          settings: null,
          visibility: null,
          fields: [field("full-name", { contactMapping: "name" })],
        },
      ],
    });
    expect(
      shouldCollectDetailsWithForm({ collectDetailsWithForm: true }, nameOnly),
    ).toBe(false);
  });
});

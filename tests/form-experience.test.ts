import { describe, expect, test } from "bun:test";

import {
  buildFormExperienceModel,
  createFormTransitionLock,
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

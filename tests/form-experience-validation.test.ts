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
      expect(validateFormExperienceField(requiredField(type), "")).toBe(
        expected,
      );
    });
  }

  test("optional empty values remain valid", () => {
    expect(
      validateFormExperienceField(
        {
          ...requiredField("radio"),
          required: false,
        },
        "",
      ),
    ).toBeNull();
  });

  test("malformed non-empty email keeps format-specific copy", () => {
    expect(
      validateFormExperienceField(requiredField("email"), "not-an-email"),
    ).toBe("Please enter a valid email");
  });
});

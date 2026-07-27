import { describe, expect, test } from "bun:test";

import {
  evaluateFormCondition,
  type FormCondition,
  type FormConditionField,
} from "../../src/lib/form-conditions";
import {
  evaluateFormCondition as widgetEvaluate,
  type FormCondition as WidgetFormCondition,
} from "../../widget/shared/form-conditions";

function fieldsById(
  fields: Array<{
    id: string;
    type: string;
    options?: Array<{ label: string; value: string }> | null;
  }>,
): Record<string, FormConditionField> {
  const map: Record<string, FormConditionField> = {};
  for (const f of fields) {
    map[f.id] = { id: f.id, type: f.type, options: f.options ?? null };
  }
  return map;
}

describe("evaluateFormCondition", () => {
  const fields = fieldsById([
    { id: "a", type: "text" },
    { id: "b", type: "text" },
  ]);
  const rules: FormCondition["rules"] = [
    { fieldId: "a", operator: "equals", value: "x" },
    { fieldId: "b", operator: "equals", value: "y" },
  ];

  test.each([
    ["any, first match", "any", { a: "x", b: "nope" }, true],
    ["any, no matches", "any", { a: "nope", b: "nope" }, false],
    ["all, both match", "all", { a: "x", b: "y" }, true],
    ["all, one misses", "all", { a: "x", b: "nope" }, false],
  ] as const)("%s", (_label, when, values, expected) => {
    expect(
      evaluateFormCondition(
        { when, rules },
        { values: { ...values }, fieldsById: fields },
      ),
    ).toBe(expected);
  });
});

describe("SPA/widget condition contract", () => {
  const choiceOptions = [
    { label: "Founder", value: "founder" },
    { label: "Other", value: "other" },
  ];
  const multiOptions = [
    { label: "A", value: "a" },
    { label: "B", value: "b" },
    { label: "C", value: "c" },
  ];

  test.each([
    ["equals scalar choice", "select", "founder", "equals", "founder", true],
    ["not_equals scalar choice", "select", "founder", "not_equals", "founder", false],
    ["is_one_of multi-value choice", "multi_select", "a,b", "is_one_of", ["a", "c"], true],
    ["is_not_one_of multi-value choice", "multi_select", "a,b", "is_not_one_of", ["b", "c"], false],
    ["contains text case-insensitively", "text", "Hello WORLD", "contains", "world", true],
    ["not_contains text case-insensitively", "text", "Hello WORLD", "not_contains", "world", false],
    ["exists for nonblank text", "text", "present", "exists", null, true],
    ["not_exists for nonblank text", "text", "present", "not_exists", null, false],
    ["gt rejects an equal numeric boundary", "number", "10", "gt", 10, false],
    ["lt accepts a lower number", "number", "9", "lt", 10, true],
    ["gte accepts an equal numeric boundary", "number", "10", "gte", 10, true],
    ["lte rejects a higher number", "number", "11", "lte", 10, false],
  ] as const)(
    "%s",
    (_label, fieldType, rawValue, operator, ruleValue, expected) => {
      const fields = fieldsById([
        {
          id: "source",
          type: fieldType,
          options:
            fieldType === "select"
              ? choiceOptions
              : fieldType === "multi_select"
                ? multiOptions
                : null,
        },
      ]);
      const condition: FormCondition = {
        when: "all",
        rules: [{ fieldId: "source", operator, value: ruleValue }],
      };
      const inputs = {
        values: { source: rawValue },
        fieldsById: fields,
      };

      expect(evaluateFormCondition(condition, inputs)).toBe(expected);
      expect(
        widgetEvaluate(condition as WidgetFormCondition, inputs),
      ).toBe(expected);
    },
  );

  test.each([
    [
      "deleted source field",
      {
        when: "all",
        rules: [{ fieldId: "ghost", operator: "equals", value: "x" }],
      },
    ],
    [
      "unknown persisted operator",
      {
        when: "all",
        rules: [{ fieldId: "source", operator: "renamed_operator", value: "x" }],
      },
    ],
  ] as const)("%s fails closed", (_label, persistedCondition) => {
    const condition = persistedCondition as FormCondition;
    const inputs = {
      values: { source: "x", ghost: "x" },
      fieldsById: fieldsById([{ id: "source", type: "text" }]),
    };

    expect(evaluateFormCondition(condition, inputs)).toBe(false);
    expect(widgetEvaluate(condition as WidgetFormCondition, inputs)).toBe(false);
  });
});

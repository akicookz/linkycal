import { describe, expect, test } from "bun:test";

import {
  evaluateFormCondition,
  isFieldVisible,
  type FormCondition,
  type FormConditionField,
} from "../../src/lib/form-conditions";
import {
  evaluateFormCondition as widgetEvaluate,
  type FormCondition as WidgetFormCondition,
} from "../../widget/shared/form-conditions";

function fieldsById(
  fields: Array<{ id: string; type: string; options?: Array<{ label: string; value: string }> | null }>,
): Record<string, FormConditionField> {
  const map: Record<string, FormConditionField> = {};
  for (const f of fields) {
    map[f.id] = { id: f.id, type: f.type, options: f.options ?? null };
  }
  return map;
}

describe("evaluateFormCondition", () => {
  test("returns true when condition is null or has no rules", () => {
    expect(
      evaluateFormCondition(null, { values: {}, fieldsById: {} }),
    ).toBe(true);
    expect(
      evaluateFormCondition(
        { when: "all", rules: [] },
        { values: {}, fieldsById: {} },
      ),
    ).toBe(true);
  });

  test("equals on a select source", () => {
    const fields = fieldsById([
      { id: "role", type: "select", options: [
        { label: "Founder", value: "founder" },
        { label: "Other", value: "other" },
      ] },
    ]);
    const cond: FormCondition = {
      when: "all",
      rules: [{ fieldId: "role", operator: "equals", value: "founder" }],
    };
    expect(evaluateFormCondition(cond, { values: { role: "founder" }, fieldsById: fields })).toBe(true);
    expect(evaluateFormCondition(cond, { values: { role: "other" }, fieldsById: fields })).toBe(false);
  });

  test("is_one_of on multi_select splits stored value", () => {
    const fields = fieldsById([
      { id: "tags", type: "multi_select", options: [
        { label: "A", value: "a" },
        { label: "B", value: "b" },
        { label: "C", value: "c" },
      ] },
    ]);
    const cond: FormCondition = {
      when: "all",
      rules: [{ fieldId: "tags", operator: "is_one_of", value: ["a", "c"] }],
    };
    expect(evaluateFormCondition(cond, { values: { tags: "a,b" }, fieldsById: fields })).toBe(true);
    expect(evaluateFormCondition(cond, { values: { tags: "b" }, fieldsById: fields })).toBe(false);
  });

  test("is_not_one_of returns true when value is absent", () => {
    const fields = fieldsById([
      { id: "role", type: "select", options: [{ label: "X", value: "x" }] },
    ]);
    const cond: FormCondition = {
      when: "all",
      rules: [{ fieldId: "role", operator: "is_not_one_of", value: ["x"] }],
    };
    expect(evaluateFormCondition(cond, { values: {}, fieldsById: fields })).toBe(true);
    expect(evaluateFormCondition(cond, { values: { role: "x" }, fieldsById: fields })).toBe(false);
  });

  test("contains/not_contains on text source", () => {
    const fields = fieldsById([{ id: "notes", type: "textarea" }]);
    const cond: FormCondition = {
      when: "all",
      rules: [{ fieldId: "notes", operator: "contains", value: "urgent" }],
    };
    expect(evaluateFormCondition(cond, { values: { notes: "This is URGENT now" }, fieldsById: fields })).toBe(true);
    expect(evaluateFormCondition(cond, { values: { notes: "nope" }, fieldsById: fields })).toBe(false);
  });

  test("exists/not_exists", () => {
    const fields = fieldsById([{ id: "email", type: "email" }]);
    const exists: FormCondition = {
      when: "all",
      rules: [{ fieldId: "email", operator: "exists" }],
    };
    const notExists: FormCondition = {
      when: "all",
      rules: [{ fieldId: "email", operator: "not_exists" }],
    };
    expect(evaluateFormCondition(exists, { values: { email: "a@b" }, fieldsById: fields })).toBe(true);
    expect(evaluateFormCondition(exists, { values: { email: "  " }, fieldsById: fields })).toBe(false);
    expect(evaluateFormCondition(notExists, { values: {}, fieldsById: fields })).toBe(true);
  });

  test("gt/lt on number source", () => {
    const fields = fieldsById([{ id: "age", type: "number" }]);
    const gt: FormCondition = {
      when: "all",
      rules: [{ fieldId: "age", operator: "gt", value: 18 }],
    };
    expect(evaluateFormCondition(gt, { values: { age: "20" }, fieldsById: fields })).toBe(true);
    expect(evaluateFormCondition(gt, { values: { age: "10" }, fieldsById: fields })).toBe(false);
    expect(evaluateFormCondition(gt, { values: { age: "nope" }, fieldsById: fields })).toBe(false);
  });

  test("when:any returns true if at least one rule matches", () => {
    const fields = fieldsById([
      { id: "a", type: "text" },
      { id: "b", type: "text" },
    ]);
    const cond: FormCondition = {
      when: "any",
      rules: [
        { fieldId: "a", operator: "equals", value: "x" },
        { fieldId: "b", operator: "equals", value: "y" },
      ],
    };
    expect(evaluateFormCondition(cond, { values: { a: "x", b: "nope" }, fieldsById: fields })).toBe(true);
    expect(evaluateFormCondition(cond, { values: { a: "nope", b: "y" }, fieldsById: fields })).toBe(true);
    expect(evaluateFormCondition(cond, { values: { a: "nope", b: "nope" }, fieldsById: fields })).toBe(false);
  });

  test("when:all requires every rule to match", () => {
    const fields = fieldsById([
      { id: "a", type: "text" },
      { id: "b", type: "text" },
    ]);
    const cond: FormCondition = {
      when: "all",
      rules: [
        { fieldId: "a", operator: "equals", value: "x" },
        { fieldId: "b", operator: "equals", value: "y" },
      ],
    };
    expect(evaluateFormCondition(cond, { values: { a: "x", b: "y" }, fieldsById: fields })).toBe(true);
    expect(evaluateFormCondition(cond, { values: { a: "x", b: "nope" }, fieldsById: fields })).toBe(false);
  });

  test("rule referencing deleted field evaluates false (treated as always-false)", () => {
    const cond: FormCondition = {
      when: "all",
      rules: [{ fieldId: "ghost", operator: "equals", value: "x" }],
    };
    expect(evaluateFormCondition(cond, { values: { ghost: "x" }, fieldsById: {} })).toBe(false);
  });
});

describe("isFieldVisible", () => {
  test("returns true for fields with no visibility rule", () => {
    const field: FormConditionField = { id: "f1", type: "text" };
    expect(isFieldVisible(field, { values: {}, fieldsById: { f1: field } })).toBe(true);
  });
});

describe("SPA/widget parity", () => {
  test("both evaluators agree on a representative fixture", () => {
    const fields = fieldsById([
      { id: "role", type: "select", options: [
        { label: "Founder", value: "founder" },
        { label: "Other", value: "other" },
      ] },
    ]);
    const cond: FormCondition = {
      when: "all",
      rules: [{ fieldId: "role", operator: "equals", value: "founder" }],
    };
    const inputs = { values: { role: "founder" }, fieldsById: fields };
    expect(evaluateFormCondition(cond, inputs)).toBe(true);
    expect(widgetEvaluate(cond as WidgetFormCondition, inputs)).toBe(true);
  });
});

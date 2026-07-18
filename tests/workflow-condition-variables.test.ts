import { describe, expect, test } from "bun:test";

import {
  buildConditionRuleForSource,
  buildWorkflowConditionVariableGroups,
  findWorkflowConditionVariable,
  operatorsForConditionValueType,
} from "../src/lib/workflow-condition-variables";

function flatten(
  groups: ReturnType<typeof buildWorkflowConditionVariableGroups>,
) {
  return groups.flatMap((group) => group.items);
}

describe("buildWorkflowConditionVariableGroups", () => {
  test("builds hour and day stage sources for every project tag", () => {
    const items = flatten(
      buildWorkflowConditionVariableGroups(
        [{ id: "follow-up", name: "Follow Up" }],
        [],
      ),
    );

    expect(items).toContainEqual(
      expect.objectContaining({
        key: "contact.stage.byTag.follow-up.ageHours",
        label: "Follow Up — time in stage (hours)",
        valueType: "number",
      }),
    );
    expect(items).toContainEqual(
      expect.objectContaining({
        key: "contact.stage.byTag.follow-up.ageDays",
        label: "Follow Up — time in stage (days)",
        valueType: "number",
      }),
    );
  });

  test("includes all typed Next Action sources", () => {
    const items = flatten(buildWorkflowConditionVariableGroups([], []));

    expect(items).toContainEqual(
      expect.objectContaining({
        key: "contact.nextAction.text",
        valueType: "text",
      }),
    );
    expect(items).toContainEqual(
      expect.objectContaining({
        key: "contact.nextAction.deadline",
        valueType: "timestamp",
      }),
    );
    expect(items).toContainEqual(
      expect.objectContaining({
        key: "contact.nextAction.overdue",
        valueType: "boolean",
      }),
    );
    expect(items).toContainEqual(
      expect.objectContaining({
        key: "contact.nextAction.hoursUntilDeadline",
        valueType: "number",
      }),
    );
    expect(items).toContainEqual(
      expect.objectContaining({
        key: "contact.nextAction.daysUntilDeadline",
        valueType: "number",
      }),
    );
  });

  test("uses the current tag name without changing the source path", () => {
    const [stage] = flatten(
      buildWorkflowConditionVariableGroups(
        [{ id: "stable-id", name: "Qualified" }],
        [],
      ),
    ).filter((item) => item.key.includes("stable-id"));

    expect(stage?.key).toContain("stable-id");
    expect(stage?.label).toContain("Qualified");
  });

  test("retains a saved source whose tag was deleted", () => {
    const source = "contact.stage.byTag.deleted.ageHours";
    const items = flatten(
      buildWorkflowConditionVariableGroups([], [source]),
    );

    expect(items).toContainEqual(
      expect.objectContaining({
        key: source,
        label: "Stage tag removed",
        valueType: "number",
      }),
    );
  });

  test("does not duplicate a saved source for a current tag", () => {
    const source = "contact.stage.byTag.follow-up.ageHours";
    const items = flatten(
      buildWorkflowConditionVariableGroups(
        [{ id: "follow-up", name: "Follow Up" }],
        [source],
      ),
    );

    expect(items.filter((item) => item.key === source)).toHaveLength(1);
  });
});

describe("operatorsForConditionValueType", () => {
  test("restricts controls by source type", () => {
    expect(operatorsForConditionValueType("text")).toEqual([
      "equals",
      "not_equals",
      "contains",
      "not_contains",
      "exists",
      "not_exists",
    ]);
    expect(operatorsForConditionValueType("number")).toEqual([
      "equals",
      "not_equals",
      "gt",
      "lt",
      "gte",
      "lte",
      "exists",
      "not_exists",
    ]);
    expect(operatorsForConditionValueType("boolean")).toEqual([
      "equals",
      "not_equals",
      "exists",
      "not_exists",
    ]);
    expect(operatorsForConditionValueType("timestamp")).toEqual([
      "exists",
      "not_exists",
    ]);
  });
});

describe("condition source selection", () => {
  test("resets a changed source to a valid operator and value", () => {
    const groups = buildWorkflowConditionVariableGroups([], []);

    expect(
      buildConditionRuleForSource(
        "contact.nextAction.overdue",
        groups,
      ),
    ).toEqual({
      source: "contact.nextAction.overdue",
      operator: "equals",
      value: "false",
    });
    expect(
      buildConditionRuleForSource(
        "contact.nextAction.deadline",
        groups,
      ),
    ).toEqual({
      source: "contact.nextAction.deadline",
      operator: "exists",
      value: null,
    });
  });

  test("finds the selected variable and defaults unknown sources to text", () => {
    const groups = buildWorkflowConditionVariableGroups([], []);

    expect(
      findWorkflowConditionVariable(
        groups,
        "contact.nextAction.hoursUntilDeadline",
      )?.valueType,
    ).toBe("number");
    expect(buildConditionRuleForSource("custom.value", groups)).toEqual({
      source: "custom.value",
      operator: "equals",
      value: "",
    });
  });
});

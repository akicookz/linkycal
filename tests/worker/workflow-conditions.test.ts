import { describe, expect, test } from "bun:test";

import {
  evaluateWorkflowCondition,
  parseWorkflowCondition,
  type WorkflowCondition,
} from "../../worker/lib/workflow-conditions";
import type { WorkflowTriggerContext } from "../../worker/lib/workflow-runtime";

function baseContext(): WorkflowTriggerContext {
  return {
    projectId: "proj_1",
    contactId: "c_1",
    contactEmail: "jane@acme.com",
    contactName: "Jane Doe",
    metadata: {
      workflow: {
        research: {
          latest: {
            result: { summary: "s", company: "Acme", role: "VP", website: null, linkedinUrl: null, location: null, description: null, recommendedTags: [], insights: [], sources: [] },
          },
          byKey: {},
        },
      },
    },
  };
}

describe("evaluateWorkflowCondition", () => {
  test("null/empty returns true", () => {
    expect(evaluateWorkflowCondition(null, baseContext())).toBe(true);
    expect(evaluateWorkflowCondition({ when: "all", rules: [] }, baseContext())).toBe(true);
  });

  test("equals on contact.email", () => {
    const cond: WorkflowCondition = {
      when: "all",
      rules: [{ source: "contact.email", operator: "equals", value: "jane@acme.com" }],
    };
    expect(evaluateWorkflowCondition(cond, baseContext())).toBe(true);

    const ctx = baseContext();
    ctx.contactEmail = "other@example.com";
    expect(evaluateWorkflowCondition(cond, ctx)).toBe(false);
  });

  test("contains on research.company", () => {
    const cond: WorkflowCondition = {
      when: "all",
      rules: [{ source: "research.company", operator: "contains", value: "acm" }],
    };
    expect(evaluateWorkflowCondition(cond, baseContext())).toBe(true);
  });

  test("legacy aliases still resolve (contact_email)", () => {
    const cond: WorkflowCondition = {
      when: "all",
      rules: [{ source: "contact_email", operator: "exists" }],
    };
    expect(evaluateWorkflowCondition(cond, baseContext())).toBe(true);
  });

  test("numeric gt on metadata", () => {
    const ctx = baseContext();
    ctx.metadata = { ...(ctx.metadata ?? {}), priority: "7" };
    const cond: WorkflowCondition = {
      when: "all",
      rules: [{ source: "metadata.priority", operator: "gt", value: 5 }],
    };
    expect(evaluateWorkflowCondition(cond, ctx)).toBe(true);

    const condLow: WorkflowCondition = {
      when: "all",
      rules: [{ source: "metadata.priority", operator: "gt", value: 10 }],
    };
    expect(evaluateWorkflowCondition(condLow, ctx)).toBe(false);
  });

  test("when:any requires one match", () => {
    const cond: WorkflowCondition = {
      when: "any",
      rules: [
        { source: "contact.email", operator: "equals", value: "nope" },
        { source: "contact.name", operator: "contains", value: "Jane" },
      ],
    };
    expect(evaluateWorkflowCondition(cond, baseContext())).toBe(true);
  });
});

describe("parseWorkflowCondition", () => {
  test("returns null for invalid inputs", () => {
    expect(parseWorkflowCondition(null)).toBeNull();
    expect(parseWorkflowCondition({})).toBeNull();
    expect(parseWorkflowCondition("not json")).toBeNull();
  });

  test("parses JSON string into a normalized condition", () => {
    const raw = JSON.stringify({
      when: "any",
      rules: [
        { source: "contact.email", operator: "equals", value: "x@y.com" },
        { invalid: true },
      ],
    });
    const parsed = parseWorkflowCondition(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.when).toBe("any");
    expect(parsed?.rules).toHaveLength(1);
  });
});

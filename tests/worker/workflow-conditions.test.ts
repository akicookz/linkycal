import { describe, expect, test } from "bun:test";

import {
  evaluateWorkflowCondition,
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
  test("evaluates the complete workflow condition policy", () => {
    expect([
      "null and empty",
      [
        evaluateWorkflowCondition(null, baseContext()),
        evaluateWorkflowCondition(
          { when: "all", rules: [] },
          baseContext(),
        ),
      ],
    ]).toEqual(["null and empty", [true, true]]);

    const email: WorkflowCondition = {
      when: "all",
      rules: [
        {
          source: "contact.email",
          operator: "equals",
          value: "jane@acme.com",
        },
      ],
    };
    const otherContact = baseContext();
    otherContact.contactEmail = "other@example.com";
    expect([
      "contact email",
      [
        evaluateWorkflowCondition(email, baseContext()),
        evaluateWorkflowCondition(email, otherContact),
      ],
    ]).toEqual(["contact email", [true, false]]);

    const priorityContext = baseContext();
    priorityContext.metadata = {
      ...(priorityContext.metadata ?? {}),
      priority: "7",
    };
    const priorityAboveFive: WorkflowCondition = {
      when: "all",
      rules: [{ source: "metadata.priority", operator: "gt", value: 5 }],
    };
    const priorityAboveTen: WorkflowCondition = {
      when: "all",
      rules: [{ source: "metadata.priority", operator: "gt", value: 10 }],
    };
    expect([
      "numeric metadata",
      [
        evaluateWorkflowCondition(priorityAboveFive, priorityContext),
        evaluateWorkflowCondition(priorityAboveTen, priorityContext),
      ],
    ]).toEqual(["numeric metadata", [true, false]]);

    const overdue: WorkflowCondition = {
      when: "all",
      rules: [
        {
          source: "contact.nextAction.overdue",
          operator: "equals",
          value: "false",
        },
      ],
    };
    expect([
      "missing Next Action",
      evaluateWorkflowCondition(overdue, baseContext()),
    ]).toEqual(["missing Next Action", false]);

    const missingStageAge: WorkflowCondition = {
      when: "all",
      rules: [
        {
          source: "contact.stage.byTag.deleted.ageHours",
          operator: "gte",
          value: 24,
        },
      ],
    };
    const missingStage: WorkflowCondition = {
      when: "all",
      rules: [
        {
          source: "contact.stage.byTag.deleted.ageHours",
          operator: "not_exists",
        },
      ],
    };
    expect([
      "deleted stage",
      [
        evaluateWorkflowCondition(missingStageAge, baseContext()),
        evaluateWorkflowCondition(missingStage, baseContext()),
      ],
    ]).toEqual(["deleted stage", [false, true]]);

    const any: WorkflowCondition = {
      when: "any",
      rules: [
        { source: "contact.email", operator: "equals", value: "nope" },
        { source: "contact.name", operator: "contains", value: "Jane" },
      ],
    };
    expect([
      "when:any",
      evaluateWorkflowCondition(any, baseContext()),
    ]).toEqual(["when:any", true]);
  });
});

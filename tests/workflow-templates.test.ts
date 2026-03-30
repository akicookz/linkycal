import { describe, expect, test } from "bun:test";

import { workflowTemplates } from "../src/lib/workflow-templates";

describe("workflow templates", () => {
  test("includes the planned common use cases", () => {
    expect(workflowTemplates.map((template) => template.id)).toEqual([
      "form-lead-research",
      "booking-request-triage",
      "manual-contact-research",
      "cancellation-recovery",
    ]);
  });

  test("research templates include an AI research step", () => {
    const researchTemplates = workflowTemplates.filter((template) =>
      ["form-lead-research", "booking-request-triage", "manual-contact-research"].includes(
        template.id,
      ),
    );

    for (const template of researchTemplates) {
      expect(template.steps.some((step) => step.type === "ai_research")).toBe(
        true,
      );
    }
  });
});

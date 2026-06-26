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

  test("manual-contact-research is named 'Research & Enrich Contact' and has no update_contact step", () => {
    const template = workflowTemplates.find((t) => t.id === "manual-contact-research");
    expect(template).toBeDefined();
    expect(template!.name).toBe("Research & Enrich Contact");
    expect(template!.steps.some((s) => s.type === "update_contact")).toBe(false);
  });

  test("form-lead-research has no update_contact step", () => {
    const template = workflowTemplates.find((t) => t.id === "form-lead-research");
    expect(template).toBeDefined();
    expect(template!.steps.some((s) => s.type === "update_contact")).toBe(false);
  });
});

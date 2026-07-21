import { describe, expect, test } from "bun:test";

import {
  buildWorkflowResearchActivityMetadata,
  buildWorkflowContactOperationalContext,
  formatContactsInputValue,
  interpolateWorkflowTemplate,
  mergeWorkflowResearchMetadata,
  normalizeRecipientList,
  resolveStepInputs,
  resolveWorkflowValue,
  workflowStepInputSchema,
  type WorkflowResearchRecord,
  type WorkflowTriggerContext,
} from "../../worker/lib/workflow-runtime";

function buildResearchRecord(): WorkflowResearchRecord {
  return {
    provider: "chatgpt",
    model: "gpt-5.2",
    resultKey: "lead_research",
    prompt: "Research this lead",
    executedAt: "2026-03-30T12:00:00.000Z",
    result: {
      summary: "A product leader at Acme.",
      company: "Acme",
      role: "VP Product",
      website: "https://acme.example",
      linkedinUrl: "https://linkedin.com/in/example",
      location: "Berlin",
      description: "Acme sells scheduling infrastructure.",
      recommendedTags: ["product", "enterprise"],
      insights: ["Likely evaluating scheduling tooling."],
      sources: [
        {
          title: "LinkedIn",
          url: "https://linkedin.com/in/example",
          snippet: null,
        },
      ],
    },
  };
}

function buildContext(): WorkflowTriggerContext {
  return {
    projectId: "proj_123",
    contactId: "ct_123",
    contactEmail: "ava@example.com",
    contactName: "Ava",
  };
}

describe("workflow runtime helpers", () => {
  test("preserves the complete research record in activity metadata", () => {
    const record = {
      resultKey: "lead",
      provider: "gemini" as const,
      model: "gemini-2.5-flash",
      prompt: "Research Ada",
      executedAt: "2026-07-01T10:00:00.000Z",
      result: {
        summary: "Strong fit",
        company: "Analytical Engines",
        role: "Founder",
        website: "https://example.com",
        linkedinUrl: null,
        location: "London",
        description: null,
        companySize: "1-10",
        estimatedRevenue: null,
        recommendedTags: ["qualified"],
        insights: ["Interested in automation"],
        sources: [
          { title: "Company", url: "https://example.com", snippet: null },
        ],
      },
    };

    expect(buildWorkflowResearchActivityMetadata(record)).toEqual({
      resultKey: "lead",
      summary: "Strong fit",
      sourceCount: 1,
      research: record,
    });
  });

  test("exposes exact fractional stage ages and deadline distances", () => {
    const context = buildContext();
    context.contactOperational = buildWorkflowContactOperationalContext(
      {
        enteredAtByTagId: {
          lead: "2026-07-19T09:30:00.000Z",
        },
        nextAction: {
          text: "Call",
          deadline: "2026-07-19T13:00:00.000Z",
        },
      },
      new Date("2026-07-19T12:00:00.000Z"),
    );

    expect(
      resolveWorkflowValue(context, "contact.stage.byTag.lead.enteredAt"),
    ).toBe("2026-07-19T09:30:00.000Z");
    expect(
      resolveWorkflowValue(context, "contact.stage.byTag.lead.ageHours"),
    ).toBe(2.5);
    expect(
      resolveWorkflowValue(context, "contact.stage.byTag.lead.ageDays"),
    ).toBe(2.5 / 24);
    expect(
      resolveWorkflowValue(context, "contact.nextAction.hoursUntilDeadline"),
    ).toBe(1);
    expect(
      resolveWorkflowValue(context, "contact.nextAction.overdue"),
    ).toBe(false);
  });

  test("uses negative deadline distance for an overdue Next Action", () => {
    const context = buildContext();
    context.contactOperational = buildWorkflowContactOperationalContext(
      {
        enteredAtByTagId: {},
        nextAction: {
          text: "Call",
          deadline: "2026-07-19T10:00:00.000Z",
        },
      },
      new Date("2026-07-19T12:00:00.000Z"),
    );

    expect(
      resolveWorkflowValue(context, "contact.nextAction.hoursUntilDeadline"),
    ).toBe(-2);
    expect(
      resolveWorkflowValue(context, "contact.nextAction.daysUntilDeadline"),
    ).toBe(-2 / 24);
    expect(
      resolveWorkflowValue(context, "contact.nextAction.overdue"),
    ).toBe(true);
  });

  test("interpolates dot syntax and legacy underscore aliases", () => {
    const context = buildContext();

    expect(
      interpolateWorkflowTemplate(
        "Hello {{contact.name}} / {{contact_email}}",
        context,
      ),
    ).toBe("Hello Ava / ava@example.com");
  });

  test("normalizes multi-recipient email config and interpolates values", () => {
    const context = buildContext();

    expect(
      normalizeRecipientList(
        ["{{contact.email}}", "team@example.com", "team@example.com"],
        context,
      ),
    ).toEqual(["ava@example.com", "team@example.com"]);
  });

  test("resolveStepInputs pulls path and literal sources, skips malformed entries", () => {
    const context: WorkflowTriggerContext = {
      ...buildContext(),
      metadata: { formFields: { company_field: "Acme" } },
    };

    const resolved = resolveStepInputs(
      [
        { key: "name", source: { kind: "path", path: "contact.name" } },
        { key: "company", source: { kind: "path", path: "form.fields.company_field" } },
        { key: "tier", source: { kind: "literal", value: "enterprise" } },
        { key: "templated", source: { kind: "literal", value: "Hi {{contact.name}}" } },
        { key: "missing", source: { kind: "path", path: "does.not.exist" } },
        { bogus: "shape" },
      ],
      context,
    );

    expect(resolved).toEqual({
      name: "Ava",
      company: "Acme",
      tier: "enterprise",
      templated: "Hi Ava",
      missing: "",
    });
  });

  test("form field values under metadata.formFields are addressable via form.fields.*", () => {
    const context: WorkflowTriggerContext = {
      ...buildContext(),
      metadata: { formFields: { role: "CTO" } },
    };

    expect(
      interpolateWorkflowTemplate("Role: {{form.fields.role}}", context),
    ).toBe("Role: CTO");
  });
});

describe("contact-query inputs", () => {

  test("normalizeRecipientList splits variables that expand to lists", () => {
    const context: WorkflowTriggerContext = {
      ...buildContext(),
      stepInputs: { emails: "a@x.com, b@y.com" },
    };
    expect(normalizeRecipientList(["{{input.emails}}"], context)).toEqual([
      "a@x.com",
      "b@y.com",
    ]);
  });
});

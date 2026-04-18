import { describe, expect, test } from "bun:test";

import {
  interpolateWorkflowTemplate,
  mergeWorkflowResearchMetadata,
  normalizeRecipientList,
  resolveStepInputs,
  resolveWorkflowValue,
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

  test("stores research metadata and exposes latest research fields", () => {
    const context = buildContext();
    const record = buildResearchRecord();
    const metadata = mergeWorkflowResearchMetadata(undefined, record);
    const nextContext = { ...context, metadata };

    expect(
      resolveWorkflowValue(nextContext, "research.summary"),
    ).toBe("A product leader at Acme.");
    expect(
      resolveWorkflowValue(nextContext, "research.byKey.lead_research.result.company"),
    ).toBe("Acme");
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

  test("exposes resolved step inputs to interpolation as {{input.*}}", () => {
    const context: WorkflowTriggerContext = {
      ...buildContext(),
      stepInputs: { name: "Ava", company: "Acme" },
    };

    expect(
      interpolateWorkflowTemplate(
        "Research {{input.name}} at {{input.company}}.",
        context,
      ),
    ).toBe("Research Ava at Acme.");
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

import { describe, expect, test } from "bun:test";

import {
  generateEventTypeApiPrompt,
  generateFormApiPrompt,
} from "../src/lib/prompts";

describe("copy prompt generation", () => {
  test("form API prompt uses exact step fields without duplicate reference sections", () => {
    const prompt = generateFormApiPrompt(
      {
        name: "Lead Intake",
        slug: "lead-intake",
        type: "multi_step",
        steps: [
          {
            title: "Contact",
            description: null,
            fields: [
              {
                id: "full_name",
                label: "Full Name",
                type: "text",
                required: true,
                placeholder: "Jane Smith",
                options: null,
              },
              {
                id: "email",
                label: "Email",
                type: "email",
                required: true,
                placeholder: "jane@example.com",
                options: null,
              },
            ],
          },
          {
            title: "Details",
            description: null,
            fields: [
              {
                id: "team_size",
                label: "Team Size",
                type: "select",
                required: true,
                placeholder: null,
                options: [
                  { label: "1-10", value: "team_1_10" },
                  { label: "11-50", value: "team_11_50" },
                ],
              },
            ],
          },
        ],
      },
      "acme",
      "https://linkycal.com",
    );

    expect(prompt).toContain("`full_name` (Full Name)");
    expect(prompt).toContain("`email` (Email)");
    expect(prompt).toContain("`team_size` (Team Size)");
    expect(prompt).toContain("/responses/RESPONSE_ID/steps/0");
    expect(prompt).toContain("/responses/RESPONSE_ID/steps/1");
    expect(prompt).not.toContain("## Form Structure");
    expect(prompt).not.toContain("## Field Types Reference");
    expect(prompt).not.toContain("## Complete Integration Example");
  });

  test("booking API prompt includes exact booking form field keys once", () => {
    const prompt = generateEventTypeApiPrompt(
      {
        name: "Consultation",
        slug: "consultation",
        duration: 30,
        description: null,
        location: "Google Meet",
        bufferBefore: 0,
        bufferAfter: 0,
        maxPerDay: null,
        requiresConfirmation: false,
        bookingFormId: "form_123",
      },
      "acme",
      "https://linkycal.com",
      [
        {
          id: "company_name",
          label: "Company Name",
          type: "text",
          required: true,
          placeholder: null,
          options: null,
        },
        {
          id: "team_size",
          label: "Team Size",
          type: "select",
          required: true,
          placeholder: null,
          options: [
            { label: "1-10", value: "team_1_10" },
            { label: "11-50", value: "team_11_50" },
          ],
        },
      ],
    );

    expect(prompt).toContain('"formFields": {');
    expect(prompt).toContain('"company_name": "Jane Smith"');
    expect(prompt).toContain('"team_size": "team_1_10"');
    expect(prompt).toContain("`company_name` (Company Name)");
    expect(prompt).toContain("`team_size` (Team Size)");
    expect(prompt).not.toContain("(use actual field ID)");
  });
});

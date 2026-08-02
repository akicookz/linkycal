import {
  afterEach,
  describe,
  expect,
  test,
} from "bun:test";
import { eq } from "drizzle-orm";
import {
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import PublicForm from "../../src/pages/PublicForm";
import {
  evaluateFormCondition,
  type FormCondition,
  type FormConditionField,
} from "../../src/lib/form-conditions";
import type {
  FormExperienceField,
  FormExperienceForm,
  FormExperienceStep,
} from "../../src/lib/form-experience";
import * as dbSchema from "../../worker/db/schema";
import {
  loadPublicFormAction,
  submitPublicFormStepAction,
} from "../../worker/lib/public-form-actions";
import { FormService } from "../../worker/services/form-service";
import {
  restoreRealTime,
  setFixedTime,
} from "../support/fixed-time";
import {
  installHttpCapture,
  type CapturedRequest,
  type HttpCapture,
} from "../support/http-capture";
import { renderRoute } from "../support/render";
import {
  createTestDb,
  type TestDatabase,
} from "../support/test-db";

interface FormApiCapture {
  http: HttpCapture;
  patches: CapturedRequest[];
  starts: CapturedRequest[];
  responseId(): string | null;
}

const ANALYTICS_JOURNEY_ID =
  "123e4567-e89b-42d3-a456-426614174000";
const FORM_ANALYTICS_BASE = {
  journeyId: ANALYTICS_JOURNEY_ID,
  funnelType: "form",
  source: "direct",
  deviceType: "tablet",
} as const;

afterEach(function restoreClock() {
  restoreRealTime();
});

function field(
  id: string,
  stepId: string,
  sortOrder: number,
  label: string,
  overrides: Partial<FormExperienceField> = {},
): FormExperienceField {
  return {
    id,
    stepId,
    sortOrder,
    type: "text",
    label,
    description: null,
    placeholder: null,
    required: false,
    validation: null,
    options: null,
    visibility: null,
    contactMapping: null,
    ...overrides,
  };
}

function step(
  id: string,
  sortOrder: number,
  fields: FormExperienceField[],
  overrides: Partial<FormExperienceStep> = {},
): FormExperienceStep {
  return {
    id,
    sortOrder,
    title: null,
    description: null,
    richDescription: null,
    settings: null,
    visibility: null,
    fields,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installFormApi(
  testDatabase: TestDatabase,
): FormApiCapture {
  const patches: CapturedRequest[] = [];
  const starts: CapturedRequest[] = [];
  let responseId: string | null = null;
  const http = installHttpCapture([
    {
      method: "GET",
      matches: function matchesForm(url) {
        return url.pathname === "/api/public/forms/acme/project-intake";
      },
      respond: async function respondForm() {
        const result = await loadPublicFormAction(
          testDatabase.db,
          "acme",
          "project-intake",
        );
        return jsonResponse(result.body, result.status);
      },
    },
    {
      method: "POST",
      matches: function matchesResponseStart(url) {
        return url.pathname ===
          "/api/public/forms/acme/project-intake/responses";
      },
      respond: async function respondResponseStart(request) {
        starts.push(request);
        const form = await new FormService(testDatabase.db).getBySlug(
          "project-acme",
          "project-intake",
        );
        if (!form) return jsonResponse({ error: "Form not found" }, 404);
        const response = await new FormService(
          testDatabase.db,
        ).createResponse(form.id);
        responseId = response.id;
        return jsonResponse({
          response,
        }, 201);
      },
    },
    {
      method: "PATCH",
      matches: function matchesStep(url) {
        return url.pathname.startsWith(
          "/api/public/forms/acme/project-intake/responses/",
        );
      },
      respond: async function respondStep(request) {
        patches.push(request);
        const pathParts = request.url.pathname.split("/");
        const result = await submitPublicFormStepAction(
          testDatabase.db,
          pathParts.at(-3) ?? "",
          Number(pathParts.at(-1)),
          request.json,
        );
        return jsonResponse(result.body, result.status);
      },
    },
  ]);
  return {
    http,
    patches,
    starts,
    responseId: function getResponseId() {
      return responseId;
    },
  };
}

function renderPublicForm(): void {
  renderRoute(<PublicForm />, {
    route:
      `/acme/project-intake?lc_journey=${ANALYTICS_JOURNEY_ID}`,
    routePattern: "/:projectSlug/:slug",
  });
}

describe("public form experience", () => {
  test("focused form validates, accepts keyboard and pointer input, submits, and shows completion", async () => {
    setFixedTime("2026-03-20T12:00:00.000Z");
    const form: FormExperienceForm = {
      id: "form-focused",
      name: "Project intake",
      type: "multi_step",
      status: "active",
      steps: [
        step(
          "step-focused",
          0,
          [
            field("team-size", "step-focused", 1, "Team size", {
              type: "radio",
              required: true,
              options: [
                { label: "1-10", value: "small" },
                { label: "11-50", value: "medium" },
              ],
            }),
            field("company", "step-focused", 0, "Company name", {
              required: true,
              placeholder: "Northstar Oy",
            }),
          ],
          {
            title: "Tell us about your project",
            description: "Two quick questions before we begin.",
          },
        ),
        step("step-completion", 1, [
          field(
            "completion",
            "step-completion",
            0,
            "Thanks, we will be in touch",
            {
              type: "completion",
              description: "Your project details are on their way.",
            },
          ),
        ]),
      ],
    };
    const testDatabase = createTestDb();
    await seedPublicForm(testDatabase, form);
    const api = installFormApi(testDatabase);

    try {
      const user = userEvent.setup();
      renderPublicForm();

      await screen.findByRole("heading", {
        name: "Tell us about your project",
      });
      expect(screen.queryByRole("textbox", {
        name: "Company name",
      })).toBeNull();
      await user.click(screen.getByRole("button", { name: "Continue" }));

      const company = await screen.findByRole("textbox", {
        name: "Company name",
      });
      expect(screen.queryByText("Team size")).toBeNull();
      await user.click(screen.getByRole("button", { name: "OK" }));
      expect(screen.getByText("Please enter a response")).toBeTruthy();
      expect(api.starts).toEqual([]);
      expect(api.patches).toEqual([]);

      await user.type(company, "Northstar Oy{Enter}");
      await screen.findByRole("heading", { name: /Team size/ });
      await user.click(screen.getByRole("button", { name: "Submit" }));
      expect(screen.getByText("Please select an option")).toBeTruthy();
      expect(api.starts).toEqual([]);
      expect(api.patches).toEqual([]);
      await user.click(screen.getByRole("button", { name: /1-10/ }));

      await screen.findByRole("heading", {
        name: "Thanks, we will be in touch",
      });
      expect(api.starts).toHaveLength(1);
      expect(api.starts[0]!.json).toEqual({
        website: "",
        _token: btoa(String(new Date(
          "2026-03-20T12:00:00.000Z",
        ).getTime())),
        analytics: FORM_ANALYTICS_BASE,
      });
      expect(api.patches).toHaveLength(1);
      expect(api.patches[0]!.json).toEqual({
        fields: [
          { fieldId: "company", value: "Northstar Oy" },
          { fieldId: "team-size", value: "small" },
        ],
        complete: true,
        analytics: {
          ...FORM_ANALYTICS_BASE,
          stageKey: "field-team-size",
          stageLabel: "Team size",
          stageKind: "question",
          stageOrder: 4,
        },
      });
      expect(
        screen.getByText("Your project details are on their way."),
      ).toBeTruthy();
    } finally {
      api.http.restore();
      testDatabase.close();
    }
  });

  test("grouped focused section renders stored order and submits one validated checkpoint", async () => {
    setFixedTime("2026-03-20T12:00:00.000Z");
    const form: FormExperienceForm = {
      id: "form-grouped",
      name: "Grouped intake",
      type: "multi_step",
      status: "active",
      steps: [
        step(
          "step-grouped",
          0,
          [
            field("work-email", "step-grouped", 2, "Work email", {
              type: "email",
              required: true,
            }),
            field("full-name", "step-grouped", 1, "Full name", {
              required: true,
            }),
          ],
          {
            settings: { groupFields: true },
          },
        ),
        step("step-completion", 1, [
          field(
            "completion",
            "step-completion",
            0,
            "Details received",
            { type: "completion" },
          ),
        ]),
      ],
    };
    const testDatabase = createTestDb();
    await seedPublicForm(testDatabase, form);
    const api = installFormApi(testDatabase);

    try {
      const user = userEvent.setup();
      renderPublicForm();

      const name = await screen.findByRole("textbox", { name: "Full name" });
      const email = screen.getByRole("textbox", { name: "Work email" });
      const headings = screen.getAllByRole("heading").map(function text(
        heading,
      ) {
        return heading.textContent?.replace(/^\d+\.\s*/, "").trim();
      });
      expect(headings.slice(0, 2)).toEqual(["Full name*", "Work email*"]);

      await user.click(screen.getByRole("button", { name: "Submit" }));
      expect(screen.getByText("Please enter a response")).toBeTruthy();
      expect(screen.getByText("Please enter your email")).toBeTruthy();
      expect(api.patches).toEqual([]);

      await user.type(name, "Hanna Guest");
      await user.type(email, "hanna@example.com");
      await user.click(screen.getByRole("button", { name: "Submit" }));

      await screen.findByRole("heading", { name: "Details received" });
      expect(api.patches).toHaveLength(1);
      expect(api.patches[0]!.json).toEqual({
        fields: [
          { fieldId: "full-name", value: "Hanna Guest" },
          { fieldId: "work-email", value: "hanna@example.com" },
        ],
        complete: true,
        analytics: {
          ...FORM_ANALYTICS_BASE,
          stageKey: "group-step-grouped",
          stageLabel: "Questions 1–2",
          stageKind: "group",
          stageOrder: 2,
        },
      });
    } finally {
      api.http.restore();
      testDatabase.close();
    }
  });

  test("focused form persists every step even when analytics delivery throws", async () => {
    setFixedTime("2026-03-20T12:00:00.000Z");
    const form: FormExperienceForm = {
      id: "form-checkpoints",
      name: "Checkpoint intake",
      type: "multi_step",
      status: "active",
      steps: [
        step(
          "step-person",
          0,
          [
            field("full-name", "step-person", 0, "Full name", {
              required: true,
            }),
          ],
          { title: "About you" },
        ),
        step(
          "step-company",
          1,
          [
            field("company", "step-company", 0, "Company", {
              required: true,
            }),
          ],
          { title: "Your company" },
        ),
        step("step-completion", 2, [
          field(
            "completion-checkpoints",
            "step-completion",
            0,
            "Response saved",
            { type: "completion" },
          ),
        ]),
      ],
    };
    const testDatabase = createTestDb();
    await seedPublicForm(testDatabase, form);
    const api = installFormApi(testDatabase);
    const originalSendBeacon = navigator.sendBeacon;
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: function throwFromAnalytics() {
        throw new Error("analytics offline");
      },
    });

    try {
      const user = userEvent.setup();
      renderRoute(<PublicForm />, {
        route:
          "/acme/project-intake?lc_journey=123e4567-e89b-42d3-a456-426614174000",
        routePattern: "/:projectSlug/:slug",
      });

      await screen.findByRole("heading", { name: "About you" });
      await user.click(screen.getByRole("button", { name: "Continue" }));
      await user.type(
        screen.getByRole("textbox", { name: "Full name" }),
        "Hanna Guest{Enter}",
      );
      await screen.findByRole("heading", { name: "Your company" });
      await user.click(screen.getByRole("button", { name: "Continue" }));
      await user.type(
        screen.getByRole("textbox", { name: "Company" }),
        "Northstar Oy{Enter}",
      );

      await screen.findByRole("heading", { name: "Response saved" });
      expect(api.starts).toHaveLength(1);
      expect(api.patches).toHaveLength(2);
      expect(api.starts[0]!.json).toEqual({
        website: "",
        _token: btoa(String(new Date(
          "2026-03-20T12:00:00.000Z",
        ).getTime())),
        analytics: {
          ...FORM_ANALYTICS_BASE,
        },
      });
      expect(api.patches[0]!.json).toEqual({
        fields: [
          { fieldId: "full-name", value: "Hanna Guest" },
        ],
        complete: false,
        analytics: {
          ...FORM_ANALYTICS_BASE,
          stageKey: "field-full-name",
          stageLabel: "Full name",
          stageKind: "question",
          stageOrder: 3,
        },
      });
      expect(api.patches[1]!.json).toEqual({
        fields: [
          { fieldId: "company", value: "Northstar Oy" },
        ],
        complete: true,
        analytics: {
          ...FORM_ANALYTICS_BASE,
          stageKey: "field-company",
          stageLabel: "Company",
          stageKind: "question",
          stageOrder: 5,
        },
      });
    } finally {
      Object.defineProperty(navigator, "sendBeacon", {
        configurable: true,
        value: originalSendBeacon,
      });
      api.http.restore();
      testDatabase.close();
    }
  });

  test("classic form submits all fields together", async () => {
    setFixedTime("2026-03-20T12:00:00.000Z");
    const form: FormExperienceForm = {
      id: "form-classic",
      name: "Classic intake",
      type: "single",
      status: "active",
      steps: [
        step("step-classic", 0, [
          field("company", "step-classic", 0, "Company", {
            required: true,
          }),
          field("role", "step-classic", 1, "Role", {
            required: true,
          }),
          field(
            "completion",
            "step-classic",
            2,
            "Classic response received",
            { type: "completion" },
          ),
        ]),
      ],
    };
    const testDatabase = createTestDb();
    await seedPublicForm(testDatabase, form);
    const api = installFormApi(testDatabase);

    try {
      const user = userEvent.setup();
      renderPublicForm();

      const company = await screen.findByRole("textbox", { name: /Company/ });
      const role = screen.getByRole("textbox", { name: /Role/ });
      const submit = screen.getByRole("button", { name: "Submit" });
      await user.type(company, "Northstar Oy");
      await user.type(role, "Operations Lead");
      await user.click(submit);

      await screen.findByRole("heading", {
        name: "Classic response received",
      });
      expect(api.patches[0]!.json).toEqual({
        fields: [
          { fieldId: "company", value: "Northstar Oy" },
          { fieldId: "role", value: "Operations Lead" },
        ],
        complete: true,
        analytics: {
          ...FORM_ANALYTICS_BASE,
          stageKey: "step-step-classic",
          stageLabel: "Step 1",
          stageKind: "step",
          stageOrder: 2,
        },
      });
    } finally {
      api.http.restore();
      testDatabase.close();
    }
  });
});

async function seedPublicForm(
  testDatabase: TestDatabase,
  form: FormExperienceForm,
): Promise<void> {
  await testDatabase.db.insert(dbSchema.schema.users).values({
    id: "owner-form",
    name: "Form Owner",
    email: "owner@example.com",
  });
  await testDatabase.db.insert(dbSchema.projects).values({
    id: "project-acme",
    userId: "owner-form",
    name: "Acme",
    slug: "acme",
  });
  await testDatabase.db.insert(dbSchema.forms).values({
    id: form.id,
    projectId: "project-acme",
    name: form.name,
    slug: "project-intake",
    type: form.type,
    status: "active",
  });
  for (const currentStep of form.steps) {
    await testDatabase.db.insert(dbSchema.formSteps).values({
      id: currentStep.id,
      formId: form.id,
      sortOrder: currentStep.sortOrder,
      title: currentStep.title,
      description: currentStep.description,
      richDescription: currentStep.richDescription,
      settings: currentStep.settings
        ? JSON.stringify(currentStep.settings)
        : null,
      visibility: currentStep.visibility
        ? JSON.stringify(currentStep.visibility)
        : null,
    });
    for (const currentField of currentStep.fields) {
      await testDatabase.db.insert(dbSchema.formFields).values({
        id: currentField.id,
        formId: form.id,
        stepId: currentStep.id,
        sortOrder: currentField.sortOrder,
        type: currentField.type as dbSchema.NewFormFieldRow["type"],
        label: currentField.label,
        description: currentField.description,
        placeholder: currentField.placeholder,
        required: currentField.required,
        validation: currentField.validation
          ? JSON.stringify(currentField.validation)
          : null,
        options: currentField.options
          ? JSON.stringify(currentField.options)
          : null,
        visibility: currentField.visibility
          ? JSON.stringify(currentField.visibility)
          : null,
        contactMapping: currentField.contactMapping,
      });
    }
  }
}

test("conditional answers hidden before completion are removed from payload and persistence", async () => {
  setFixedTime("2026-03-20T12:00:00.000Z");
  const revealCondition: FormCondition = {
    when: "all",
    rules: [
      {
        fieldId: "implementation-help",
        operator: "equals",
        value: "yes",
      },
    ],
  };
  const form: FormExperienceForm = {
    id: "form-conditional",
    name: "Conditional intake",
    type: "single",
    status: "active",
    steps: [
      step("step-needs", 0, [
        field(
          "implementation-help",
          "step-needs",
          0,
          "Do you need implementation help?",
          {
            type: "radio",
            required: true,
            options: [
              { label: "Yes", value: "yes" },
              { label: "No", value: "no" },
            ],
          },
        ),
        field(
          "implementation-budget",
          "step-needs",
          1,
          "Implementation budget",
          {
            type: "number",
            visibility: revealCondition,
          },
        ),
      ]),
      step(
        "step-technical",
        1,
        [
          field(
            "technical-details",
            "step-technical",
            0,
            "Technical details",
            { type: "textarea" },
          ),
        ],
        { visibility: revealCondition },
      ),
      step("step-completion", 2, [
        field(
          "completion",
          "step-completion",
          0,
          "Conditional response received",
          { type: "completion" },
        ),
      ]),
    ],
  };
  const testDatabase = createTestDb();
  await seedPublicForm(testDatabase, form);
  const api = installFormApi(testDatabase);

  try {
    const user = userEvent.setup();
    renderPublicForm();

    await screen.findByRole("radio", { name: "Yes" });
    expect(
      screen.queryByRole("spinbutton", { name: "Implementation budget" }),
    ).toBeNull();
    await user.click(screen.getByRole("radio", { name: "Yes" }));
    const budget = await screen.findByRole("spinbutton", {
      name: "Implementation budget",
    });
    await user.type(budget, "25000");
    await user.click(screen.getByRole("button", { name: "Next" }));

    const technicalDetails = await screen.findByRole("textbox", {
      name: "Technical details",
    });
    await user.type(technicalDetails, "React migration");
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("radio", { name: "No" }));
    await waitFor(function hiddenAnswersDisappear() {
      expect(
        screen.queryByRole("spinbutton", {
          name: "Implementation budget",
        }),
      ).toBeNull();
      expect(
        screen.queryByRole("textbox", { name: "Technical details" }),
      ).toBeNull();
    });
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await screen.findByRole("heading", {
      name: "Conditional response received",
    });
    const finalPatch = api.patches.at(-1)!;
    expect(finalPatch.json).toEqual({
      fields: [
        { fieldId: "implementation-help", value: "no" },
      ],
      clearedFieldIds: [
        "implementation-budget",
        "technical-details",
      ],
      complete: true,
      analytics: {
        ...FORM_ANALYTICS_BASE,
        stageKey: "step-step-needs",
        stageLabel: "Step 1",
        stageKind: "step",
        stageOrder: 2,
      },
    });
    const persistedValues = await testDatabase.db
      .select({
        fieldId: dbSchema.formFieldValues.fieldId,
        value: dbSchema.formFieldValues.value,
      })
      .from(dbSchema.formFieldValues)
      .where(eq(dbSchema.formFieldValues.responseId, api.responseId()!));
    expect(persistedValues).toEqual([
      { fieldId: "implementation-help", value: "no" },
    ]);
  } finally {
    api.http.restore();
    testDatabase.close();
  }
});

test("condition semantics fail closed without duplicating rendered journeys", () => {
  const fieldsById: Record<string, FormConditionField> = {
    plan: { id: "plan", type: "radio" },
    tools: {
      id: "tools",
      type: "multi_select",
      options: [
        { label: "Calendar", value: "calendar" },
        { label: "CRM", value: "crm" },
      ],
    },
    seats: { id: "seats", type: "number" },
    note: { id: "note", type: "text" },
  };
  const cases: Array<{
    name: string;
    values: Record<string, string>;
    condition: FormCondition;
    expected: boolean;
  }> = [
    {
      name: "all requires every rule",
      values: { plan: "pro", note: "" },
      condition: {
        when: "all",
        rules: [
          { fieldId: "plan", operator: "equals", value: "pro" },
          { fieldId: "note", operator: "exists" },
        ],
      },
      expected: false,
    },
    {
      name: "any accepts one matching rule",
      values: { plan: "pro", note: "" },
      condition: {
        when: "any",
        rules: [
          { fieldId: "plan", operator: "equals", value: "pro" },
          { fieldId: "note", operator: "exists" },
        ],
      },
      expected: true,
    },
    {
      name: "scalar equality distinguishes values",
      values: { plan: "free" },
      condition: {
        when: "all",
        rules: [
          { fieldId: "plan", operator: "equals", value: "pro" },
        ],
      },
      expected: false,
    },
    {
      name: "multiselect membership finds a selected option",
      values: { tools: "calendar,crm" },
      condition: {
        when: "all",
        rules: [
          {
            fieldId: "tools",
            operator: "is_one_of",
            value: ["crm"],
          },
        ],
      },
      expected: true,
    },
    {
      name: "numeric boundary rejects equality for greater-than",
      values: { seats: "10" },
      condition: {
        when: "all",
        rules: [
          { fieldId: "seats", operator: "gt", value: 10 },
        ],
      },
      expected: false,
    },
    {
      name: "exists distinguishes an answer from empty",
      values: { note: "Ready" },
      condition: {
        when: "all",
        rules: [{ fieldId: "note", operator: "exists" }],
      },
      expected: true,
    },
    {
      name: "missing source does not reveal a dependent",
      values: {},
      condition: {
        when: "all",
        rules: [
          { fieldId: "deleted-field", operator: "exists" },
        ],
      },
      expected: false,
    },
    {
      name: "unknown persisted operator fails closed",
      values: { plan: "pro" },
      condition: {
        when: "all",
        rules: [
          {
            fieldId: "plan",
            operator: "unsupported" as never,
            value: "pro",
          },
        ],
      },
      expected: false,
    },
  ];

  for (const scenario of cases) {
    expect({
      name: scenario.name,
      visible: evaluateFormCondition(scenario.condition, {
        values: scenario.values,
        fieldsById,
      }),
    }).toEqual({
      name: scenario.name,
      visible: scenario.expected,
    });
  }
});

import { afterEach, describe, expect, test } from "bun:test";

import { buildFormExperienceModel } from "../src/lib/form-experience";
import { isFieldVisible } from "../src/lib/form-conditions";
import { generateFormApiPrompt } from "../src/lib/prompts";
import { createFormFieldSchema } from "../worker/validation";
import { createFormField } from "../worker/mcp/tools/forms";
import type { ToolContext } from "../worker/mcp/agent";
import type { AppEnv } from "../worker/types";
import * as dbSchema from "../worker/db/schema";
import { createTestDb, type TestDatabase } from "./support/test-db";

const hiddenText = {
  id: "utm-source",
  stepId: "step-1",
  sortOrder: 0,
  type: "text",
  label: "UTM source",
  description: null,
  placeholder: null,
  required: false,
  hidden: true,
  validation: null,
  options: null,
};

const visibleFollowup = {
  id: "company",
  stepId: "step-1",
  sortOrder: 1,
  type: "text",
  label: "Company",
  description: null,
  placeholder: null,
  required: false,
  validation: null,
  options: null,
  visibility: {
    when: "all" as const,
    rules: [{ fieldId: "utm-source", operator: "equals" as const, value: "secret" }],
  },
};

function context(testDatabase: TestDatabase, projectId = "project-hidden-fields"): ToolContext {
  return {
    projectId: function projectIdValue() {
      return projectId;
    },
    scopes: function scopes() {
      return ["read", "write"];
    },
    db: function database() {
      return testDatabase.db;
    },
    env: function environment() {
      return {} as AppEnv;
    },
    waitUntil: function waitUntil() {},
  };
}

describe("hidden form fields", function () {
  let testDatabase: TestDatabase | null = null;

  afterEach(function closeDatabase() {
    testDatabase?.close();
    testDatabase = null;
  });

  test("prefill on a hidden field stays and can open a later question", function () {
    const model = buildFormExperienceModel({
      form: {
        id: "form-hidden",
        name: "Hidden",
        type: "single",
        steps: [
          {
            id: "step-1",
            sortOrder: 0,
            title: "Start",
            description: null,
            richDescription: null,
            fields: [hiddenText, visibleFollowup],
          },
        ],
      },
      values: { "utm-source": "secret" },
      surface: "standalone",
    });

    expect(model.fieldsById["utm-source"]).toBeDefined();
    expect(model.hiddenValueFieldIds).not.toContain("utm-source");
    expect(model.steps[0]?.fields.map((field) => field.id)).toEqual(["company"]);
    expect(
      isFieldVisible(visibleFollowup, {
        values: { "utm-source": "secret" },
        fieldsById: model.fieldsById,
      }),
    ).toBe(true);
  });

  test("hidden plus required is rejected before a field is created", function () {
    const parsed = createFormFieldSchema.safeParse({
      stepId: "step-1",
      type: "text",
      label: "Secret",
      hidden: true,
      required: true,
    });
    expect(parsed.success).toBe(false);
  });

  test("create_form_field with hidden and required returns 400", async function () {
    testDatabase = createTestDb();
    await testDatabase.db.insert(dbSchema.schema.users).values({
      id: "owner-hidden-fields",
      name: "Hidden owner",
      email: "hidden@example.com",
    });
    await testDatabase.db.insert(dbSchema.projects).values({
      id: "project-hidden-fields",
      userId: "owner-hidden-fields",
      name: "Hidden project",
      slug: "hidden-project",
    });
    await testDatabase.db.insert(dbSchema.forms).values({
      id: "form-hidden-fields",
      projectId: "project-hidden-fields",
      name: "Intake",
      slug: "intake",
      type: "single",
      status: "active",
    });
    await testDatabase.db.insert(dbSchema.formSteps).values({
      id: "step-hidden-fields",
      formId: "form-hidden-fields",
      sortOrder: 0,
      title: "Start",
    });

    const result = await createFormField(context(testDatabase), {
      formId: "form-hidden-fields",
      stepId: "step-hidden-fields",
      type: "text",
      label: "Secret",
      hidden: true,
      required: true,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Invalid");
  });

  test("a hidden text field persists on standalone submit", async function () {
    testDatabase = createTestDb();
    await testDatabase.db.insert(dbSchema.schema.users).values({
      id: "owner-hidden-persist",
      name: "Hidden owner",
      email: "hidden-persist@example.com",
    });
    await testDatabase.db.insert(dbSchema.projects).values({
      id: "project-hidden-persist",
      userId: "owner-hidden-persist",
      name: "Hidden persist",
      slug: "hidden-persist",
    });
    await testDatabase.db.insert(dbSchema.forms).values({
      id: "form-hidden-persist",
      projectId: "project-hidden-persist",
      name: "Intake",
      slug: "intake",
      type: "single",
      status: "active",
    });
    await testDatabase.db.insert(dbSchema.formSteps).values({
      id: "step-hidden-persist",
      formId: "form-hidden-persist",
      sortOrder: 0,
      title: "Start",
    });

    const created = await createFormField(context(testDatabase, "project-hidden-persist"), {
      formId: "form-hidden-persist",
      stepId: "step-hidden-persist",
      type: "text",
      label: "Campaign",
      hidden: true,
    });
    expect(created.isError).toBeUndefined();
    const body = JSON.parse(created.content[0]!.text) as {
      id: string;
      hidden: boolean;
      required: boolean;
    };
    expect(body.hidden).toBe(true);
    expect(body.required).toBe(false);

    const service = new (await import("../worker/services/form-service")).FormService(
      testDatabase.db,
    );
    const response = await service.createResponse("form-hidden-persist");
    await service.submitStep(response!.id, 0, [
      { fieldId: body.id, value: "summer" },
    ], { complete: true });
    const stored = await service.getResponseWithValues(response!.id);
    expect(stored?.values.some((value) => value.fieldId === body.id && value.value === "summer")).toBe(
      true,
    );
  });

  test("native HTML example emits a hidden input for a hidden field", function () {
    const html = generateFormApiPrompt(
      {
        name: "Intake",
        slug: "intake",
        type: "single",
        steps: [
          {
            title: "Start",
            description: null,
            fields: [
              {
                id: "utm-source",
                label: "UTM source",
                type: "text",
                required: false,
                hidden: true,
                placeholder: null,
                options: null,
              },
              {
                id: "email",
                label: "Email",
                type: "email",
                required: true,
                placeholder: null,
                options: null,
              },
            ],
          },
        ],
      },
      "acme",
      "https://linkycal.com",
    );

    expect(html).toContain('<input type="hidden" name="utm-source"');
    expect(html).not.toContain('<label for="utm-source">');
  });
});

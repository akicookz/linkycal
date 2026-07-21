import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import * as dbSchema from "../../worker/db/schema";
import { buildWorkflowContactOperationalContext } from "../../worker/lib/workflow-runtime";
import { WorkflowExecutionService } from "../../worker/services/workflow-execution-service";
import type { AppEnv } from "../../worker/types";
import { createTestDb } from "./mcp-test-db";

async function seedWorkflowRun() {
  const db = createTestDb();
  await db.insert(dbSchema.schema.users).values({
    id: "u",
    name: "User",
    email: "user@example.com",
  });
  await db.insert(dbSchema.projects).values({
    id: "p",
    userId: "u",
    name: "Project",
    slug: "project",
  });
  await db.insert(dbSchema.tags).values([
    { id: "lead", projectId: "p", name: "Lead" },
    { id: "follow-up", projectId: "p", name: "Follow Up" },
  ]);
  await db.insert(dbSchema.contacts).values({
    id: "c",
    projectId: "p",
    name: "Contact",
  });
  await db.insert(dbSchema.contactTags).values({
    contactId: "c",
    tagId: "follow-up",
  });
  await db.insert(dbSchema.contactActivity).values({
    id: "entered-follow-up",
    contactId: "c",
    type: "tag_added",
    referenceId: "follow-up",
    createdAt: new Date("2026-07-18T12:00:00.000Z"),
  });
  await db.insert(dbSchema.workflows).values({
    id: "workflow",
    projectId: "p",
    name: "Workflow",
    trigger: "manual",
    status: "active",
  });
  await db.insert(dbSchema.workflowSteps).values({
    id: "step",
    workflowId: "workflow",
    sortOrder: 0,
    type: "update_contact",
    config: { field: "notes", value: "matched live stage" },
    condition: {
      when: "all",
      rules: [
        {
          source: "contact.stage.byTag.follow-up.ageHours",
          operator: "exists",
        },
      ],
    },
  });
  await db.insert(dbSchema.workflowRuns).values({
    id: "run",
    workflowId: "workflow",
    status: "running",
    context: JSON.stringify({
      projectId: "p",
      contactId: "c",
      contactOperational: {
        stage: {
          byTag: {
            lead: {
              enteredAt: "2026-07-01T00:00:00.000Z",
              ageHours: 999,
              ageDays: 41,
            },
          },
        },
      },
    }),
  });
  return db;
}

describe("workflow contact operational hydration", () => {
  test("keeps undated Next Action text without deadline facts", () => {
    const context = buildWorkflowContactOperationalContext(
      {
        enteredAtByTagId: {},
        nextAction: { text: "Follow up", deadline: null },
      },
      new Date("2026-07-21T00:00:00.000Z"),
    );

    expect(context.nextAction).toEqual({ text: "Follow up" });
  });

  test("refreshes current stage facts before evaluating a step gate", async () => {
    const db = await seedWorkflowRun();
    const service = new WorkflowExecutionService(db);

    await service.executeStep("run", 0, {} as AppEnv);

    const [contact] = await db
      .select()
      .from(dbSchema.contacts)
      .where(eq(dbSchema.contacts.id, "c"));
    expect(contact?.notes).toBe("matched live stage");

    const [run] = await db
      .select()
      .from(dbSchema.workflowRuns)
      .where(eq(dbSchema.workflowRuns.id, "run"));
    const context = JSON.parse(run?.context ?? "{}") as {
      contactOperational?: {
        stage?: { byTag?: Record<string, unknown> };
      };
    };
    expect(context.contactOperational?.stage?.byTag?.["follow-up"]).toBeDefined();
    expect(context.contactOperational?.stage?.byTag?.lead).toBeUndefined();
  });
});

import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import * as dbSchema from "../../worker/db/schema";
import { buildWorkflowContactOperationalContext } from "../../worker/lib/workflow-runtime";
import { WorkflowExecutionService } from "../../worker/services/workflow-execution-service";
import type { StepLog } from "../../worker/services/workflow-service";
import type { AppEnv } from "../../worker/types";
import { createTestDb } from "./mcp-test-db";

type UnavailableContactCase = "missing" | "foreign";

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
    name: "Current Name",
    email: "current@example.com",
    phone: "+1 555 0100",
    notes: "Current notes",
    company: "Current Company",
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
    config: {
      inputs: [
        { key: "phone", source: { kind: "path", path: "contact.phone" } },
      ],
      field: "notes",
      value: "{{input.phone}}",
    },
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
      contactName: "Stale Name",
      contactEmail: "stale@example.com",
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
    stepLogs: [
      {
        stepIndex: 0,
        stepType: "update_contact",
        stepLabel: "Update Contact",
        status: "pending",
        input: null,
        output: null,
        error: null,
        startedAt: null,
        completedAt: null,
        progress: {
          phase: "queued",
          message: "Queued for execution",
          attempt: 1,
          maxAttempts: 3,
        },
      },
    ],
  });
  return db;
}

async function seedUnavailableContactRun(contactCase: UnavailableContactCase) {
  const db = createTestDb();
  await db.insert(dbSchema.schema.users).values({
    id: "u",
    name: "User",
    email: "user@example.com",
  });
  await db.insert(dbSchema.projects).values([
    { id: "p", userId: "u", name: "Project", slug: "project" },
    { id: "foreign", userId: "u", name: "Foreign", slug: "foreign" },
  ]);
  if (contactCase === "foreign") {
    await db.insert(dbSchema.contacts).values({
      id: "unavailable-contact",
      projectId: "foreign",
      name: "Foreign Contact",
    });
  }
  await db.insert(dbSchema.workflows).values({
    id: "workflow",
    projectId: "p",
    name: "Workflow",
    trigger: "manual",
    status: "active",
  });
  await db.insert(dbSchema.workflowSteps).values([
    {
      id: "step-0",
      workflowId: "workflow",
      sortOrder: 0,
      type: "update_contact",
      config: { field: "notes", value: "first" },
    },
    {
      id: "step-1",
      workflowId: "workflow",
      sortOrder: 1,
      type: "update_contact",
      config: { field: "notes", value: "second" },
    },
  ]);
  await db.insert(dbSchema.workflowRuns).values({
    id: "run",
    workflowId: "workflow",
    status: "running",
    context: JSON.stringify({
      projectId: "p",
      contactId: "unavailable-contact",
    }),
    stepLogs: [
      {
        stepIndex: 0,
        stepType: "update_contact",
        stepLabel: "Update Contact",
        status: "pending",
        input: null,
        output: null,
        error: null,
        startedAt: null,
        completedAt: null,
      },
      {
        stepIndex: 1,
        stepType: "update_contact",
        stepLabel: "Update Contact",
        status: "pending",
        input: null,
        output: null,
        error: null,
        startedAt: null,
        completedAt: null,
      },
    ],
  });
  return db;
}

function buildQueueEnv(enqueued: unknown[]): AppEnv {
  return {
    WORKFLOW_QUEUE: {
      send(message: unknown) {
        enqueued.push(message);
        return Promise.resolve();
      },
    },
  } as unknown as AppEnv;
}

async function executeUnavailableContactRun(contactCase: UnavailableContactCase) {
  const db = await seedUnavailableContactRun(contactCase);
  const enqueued: unknown[] = [];
  const service = new WorkflowExecutionService(db);

  await service.executeStep("run", 0, buildQueueEnv(enqueued));

  const [run] = await db
    .select()
    .from(dbSchema.workflowRuns)
    .where(eq(dbSchema.workflowRuns.id, "run"));
  return {
    run,
    stepLogs: (run?.stepLogs ?? []) as StepLog[],
    enqueued,
  };
}

describe("workflow contact hydration", () => {
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

  test("refreshes current contact values and stage facts before resolving step inputs", async () => {
    const db = await seedWorkflowRun();
    const service = new WorkflowExecutionService(db);

    await service.executeStep("run", 0, {} as AppEnv);

    const [contact] = await db
      .select()
      .from(dbSchema.contacts)
      .where(eq(dbSchema.contacts.id, "c"));
    expect(contact?.notes).toBe("+1 555 0100");

    const [run] = await db
      .select()
      .from(dbSchema.workflowRuns)
      .where(eq(dbSchema.workflowRuns.id, "run"));
    const context = JSON.parse(run?.context ?? "{}") as {
      contactName?: string;
      contactEmail?: string;
      contactPhone?: string;
      contactNotes?: string;
      contactCompany?: string;
      contactOperational?: {
        stage?: { byTag?: Record<string, unknown> };
      };
    };
    expect(context.contactName).toBe("Current Name");
    expect(context.contactEmail).toBe("current@example.com");
    expect(context.contactPhone).toBe("+1 555 0100");
    expect(context.contactNotes).toBe("Current notes");
    expect(context.contactCompany).toBe("Current Company");
    expect(context.contactOperational?.stage?.byTag?.["follow-up"]).toBeDefined();
    expect(context.contactOperational?.stage?.byTag?.lead).toBeUndefined();
  });

  test("fails without enqueueing when the contact is missing or foreign", async () => {
    for (const contactCase of ["missing", "foreign"] as const) {
      const { run, stepLogs, enqueued } =
        await executeUnavailableContactRun(contactCase);

      expect(stepLogs[0]?.status).toBe("failed");
      expect(stepLogs[0]?.error).toBe("Contact unavailable");
      expect(stepLogs[1]?.status).toBe("skipped");
      expect(run?.status).toBe("failed");
      expect(run?.error).toBe("Contact unavailable");
      expect(enqueued).toEqual([]);
    }
  });
});

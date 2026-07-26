import { describe, expect, test } from "bun:test";

import * as dbSchema from "../../worker/db/schema";
import { WorkflowService } from "../../worker/services/workflow-service";
import { seedTwoProjects } from "./mcp-test-db";

describe("WorkflowService.getRunInProject", () => {
  test("returns a run only through its owning project and workflow", async () => {
    const { db, projectA, projectB } = await seedTwoProjects();
    await db.insert(dbSchema.workflows).values([
      {
        id: "workflow-a",
        projectId: projectA.id,
        name: "Workflow A",
        trigger: "manual",
      },
      {
        id: "workflow-b",
        projectId: projectB.id,
        name: "Workflow B",
        trigger: "manual",
      },
    ]);
    await db.insert(dbSchema.workflowRuns).values([
      {
        id: "run-a",
        workflowId: "workflow-a",
        context: JSON.stringify({ projectId: projectA.id, contactId: "contact-a" }),
        status: "completed",
        stepLogs: [
          {
            stepIndex: 0,
            stepType: "send_email",
            stepLabel: "Send email",
            status: "completed",
            input: null,
            output: { sent: true },
            error: null,
            startedAt: "2026-07-01T10:00:00.000Z",
            completedAt: "2026-07-01T10:00:01.000Z",
          },
        ],
      },
      {
        id: "run-b",
        workflowId: "workflow-b",
        context: JSON.stringify({ projectId: projectB.id, contactId: "contact-b" }),
        status: "completed",
        stepLogs: [],
      },
    ]);
    const service = new WorkflowService(db);

    const own = await service.getRunInProject(projectA.id, "workflow-a", "run-a");

    expect(own?.id).toBe("run-a");
    expect(own?.workflowName).toBe("Workflow A");
    expect(Array.isArray(own?.stepLogs)).toBe(true);
    expect(await service.getRunInProject(projectB.id, "workflow-a", "run-a")).toBeNull();
    expect(await service.getRunInProject(projectA.id, "workflow-b", "run-b")).toBeNull();
    expect(await service.getRunInProject(projectA.id, "workflow-a", "run-b")).toBeNull();
  });

  test("persists step progress through the project-scoped run detail", async () => {
    const { db, projectA } = await seedTwoProjects();
    await db.insert(dbSchema.workflows).values({
      id: "workflow-progress",
      projectId: projectA.id,
      name: "Progress Workflow",
      trigger: "manual",
    });
    await db.insert(dbSchema.workflowRuns).values({
      id: "run-progress",
      workflowId: "workflow-progress",
      context: JSON.stringify({ projectId: projectA.id }),
      status: "running",
      stepLogs: [
        {
          stepIndex: 0,
          stepType: "ai_research",
          stepLabel: "AI Research",
          status: "running",
          input: null,
          output: null,
          error: null,
          startedAt: "2026-07-01T10:00:00.000Z",
          completedAt: null,
        },
      ],
    });
    const service = new WorkflowService(db);

    await service.updateStepProgress("run-progress", 0, {
      phase: "researching",
      message: "Researching public sources",
      attempt: 1,
      maxAttempts: 3,
    });
    const run = await service.getRunInProject(
      projectA.id,
      "workflow-progress",
      "run-progress",
    );

    expect(run?.stepLogs?.[0]).toMatchObject({
      status: "running",
      progress: {
        phase: "researching",
        message: "Researching public sources",
        attempt: 1,
        maxAttempts: 3,
      },
    });
  });
});

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
});

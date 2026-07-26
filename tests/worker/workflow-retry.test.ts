import { APICallError } from "ai";
import { describe, expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";

import * as dbSchema from "../../worker/db/schema";
import {
  isLeaseStale,
  isTransientWorkflowError,
  retryDelaySeconds,
  safeWorkflowErrorMessage,
} from "../../worker/lib/workflow-retry";
import type { WorkflowResearchRecord } from "../../worker/lib/workflow-runtime";
import {
  WorkflowExecutionService,
  type WorkflowExecutionDependencies,
} from "../../worker/services/workflow-execution-service";
import type { WorkflowAiResearchService } from "../../worker/services/workflow-ai-research-service";
import type { StepLog } from "../../worker/services/workflow-service";
import type { AppEnv } from "../../worker/types";
import { createTestDb } from "./mcp-test-db";

const RESEARCH_RECORD: WorkflowResearchRecord = {
  provider: "chatgpt",
  model: "gpt-5.2",
  resultKey: "lead",
  prompt: "Research Jane",
  executedAt: "2026-07-26T12:00:00.000Z",
  result: {
    summary: "Research summary",
    company: "Acme",
    role: "Operations lead",
    website: "https://acme.example",
    linkedinUrl: null,
    location: "Seoul",
    description: null,
    companySize: null,
    estimatedRevenue: null,
    recommendedTags: [],
    insights: [],
    sources: [],
  },
};

interface ResearchServiceFake {
  execute: WorkflowAiResearchService["execute"];
}

interface SeedRetryRunOptions {
  firstLog?: Partial<StepLog>;
  includeSecondStep?: boolean;
  stepType?: "ai_research" | "wait";
}

async function seedRetryRun(options: SeedRetryRunOptions = {}) {
  const db = createTestDb();
  const stepType = options.stepType ?? "ai_research";
  await db.insert(dbSchema.schema.users).values({
    id: "user",
    name: "User",
    email: "user@example.com",
  });
  await db.insert(dbSchema.projects).values({
    id: "project",
    userId: "user",
    name: "Project",
    slug: "project",
  });
  await db.insert(dbSchema.contacts).values({
    id: "contact",
    projectId: "project",
    name: "Jane",
    email: "jane@example.com",
  });
  await db.insert(dbSchema.workflows).values({
    id: "workflow",
    projectId: "project",
    name: "Research workflow",
    trigger: "manual",
    status: "active",
  });
  await db.insert(dbSchema.workflowSteps).values([
    {
      id: "step-0",
      workflowId: "workflow",
      sortOrder: 0,
      type: stepType,
      config:
        stepType === "ai_research"
          ? { provider: "chatgpt", resultKey: "lead", prompt: "Research Jane" }
          : { amount: 1, unit: "minutes" },
    },
    ...(options.includeSecondStep
      ? [{
          id: "step-1",
          workflowId: "workflow",
          sortOrder: 1,
          type: "ai_research" as const,
          config: {
            provider: "chatgpt",
            resultKey: "lead",
            prompt: "Research Jane again",
          },
        }]
      : []),
  ]);

  const firstLog: StepLog = {
    stepIndex: 0,
    stepType,
    stepLabel: stepType === "wait" ? "Wait" : "AI Research",
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
    ...options.firstLog,
  };
  const stepLogs = [
    firstLog,
    ...(options.includeSecondStep
      ? [{
          stepIndex: 1,
          stepType: "ai_research",
          stepLabel: "AI Research",
          status: "pending" as const,
          input: null,
          output: null,
          error: null,
          startedAt: null,
          completedAt: null,
          progress: {
            phase: "queued" as const,
            message: "Queued for execution",
            attempt: 1,
            maxAttempts: 3,
          },
        }]
      : []),
  ];
  await db.insert(dbSchema.workflowRuns).values({
    id: "run",
    workflowId: "workflow",
    status: "running",
    context: JSON.stringify({
      projectId: "project",
      contactId: "contact",
    }),
    stepLogs,
  });
  return db;
}

function buildQueueEnv(
  sent: Array<{ body: unknown; options?: QueueSendOptions }>,
): AppEnv {
  const queue = {
    send: async (body: unknown, options?: QueueSendOptions) => {
      sent.push({ body, options });
    },
  } as Queue;
  return {
    WORKFLOW_QUEUE: queue,
    OPENAI_API_KEY: "test-openai-key",
  } as AppEnv;
}

function buildDependencies(
  fake: ResearchServiceFake,
): WorkflowExecutionDependencies {
  return {
    workflowAiResearchService: fake as unknown as WorkflowAiResearchService,
  };
}

async function readRun(
  db: ReturnType<typeof createTestDb>,
) {
  const [run] = await db
    .select()
    .from(dbSchema.workflowRuns)
    .where(eq(dbSchema.workflowRuns.id, "run"));
  return {
    run,
    logs: (run?.stepLogs ?? []) as StepLog[],
  };
}

describe("workflow retry policy", () => {
  test("uses the exact bounded backoff", () => {
    expect(retryDelaySeconds(1)).toBe(15);
    expect(retryDelaySeconds(2)).toBe(60);
    expect(retryDelaySeconds(3)).toBeNull();
  });

  test("trusts AI SDK retryability", () => {
    const retryable = new APICallError({
      message: "rate limited",
      url: "https://api.openai.com",
      requestBodyValues: {},
      statusCode: 429,
      isRetryable: true,
    });
    const permanent = new APICallError({
      message: "rate limited",
      url: "https://api.openai.com",
      requestBodyValues: {},
      statusCode: 429,
      isRetryable: false,
    });

    expect(isTransientWorkflowError(retryable)).toBe(true);
    expect(isTransientWorkflowError(permanent)).toBe(false);
  });

  test("classifies only explicit transient transport and provider failures", () => {
    expect(
      isTransientWorkflowError(new DOMException("timed out", "TimeoutError")),
    ).toBe(true);
    expect(isTransientWorkflowError(new TypeError("fetch failed"))).toBe(true);
    expect(isTransientWorkflowError({ status: 408 })).toBe(true);
    expect(isTransientWorkflowError({ statusCode: "429" })).toBe(true);
    expect(isTransientWorkflowError({ status: 500 })).toBe(true);
    expect(isTransientWorkflowError({ statusCode: 599 })).toBe(true);
    expect(isTransientWorkflowError({ transient: true })).toBe(true);
    expect(isTransientWorkflowError({ status: 600 })).toBe(false);
  });

  test("does not retry validation or authentication failures", () => {
    expect(isTransientWorkflowError(new Error("invalid configuration"))).toBe(false);
    expect(isTransientWorkflowError({ status: 401 })).toBe(false);
  });

  test("scrubs credential-shaped error details", () => {
    const message = safeWorkflowErrorMessage(
      new Error("Authorization: Bearer sk-private-token"),
    );
    expect(message).toBe("Provider request failed");
    expect(message).not.toContain("sk-private-token");
  });

  test("expires a running lease after fifteen minutes", () => {
    const now = new Date("2026-07-26T12:20:00Z");
    expect(isLeaseStale("2026-07-26T12:04:59Z", now)).toBe(true);
    expect(isLeaseStale("2026-07-26T12:05:01Z", now)).toBe(false);
  });
});

describe("workflow execution retry and lease handling", () => {
  test("re-enqueues a transient provider failure with the bounded delay", async () => {
    const db = await seedRetryRun();
    const sent: Array<{ body: unknown; options?: QueueSendOptions }> = [];
    const fake = {
      async execute(): Promise<WorkflowResearchRecord> {
        throw { statusCode: 429 };
      },
    } as ResearchServiceFake;
    const service = new WorkflowExecutionService(db, buildDependencies(fake));

    await service.executeStep("run", 0, buildQueueEnv(sent), { attempt: 1 });

    const { run, logs } = await readRun(db);
    expect(logs[0]?.status).toBe("retrying");
    expect(logs[0]?.progress).toMatchObject({
      phase: "retrying",
      attempt: 2,
      maxAttempts: 3,
    });
    expect(run?.status).toBe("running");
    expect(sent).toEqual([
      {
        body: { workflowRunId: "run", stepIndex: 0, attempt: 2 },
        options: { delaySeconds: 15 },
      },
    ]);
  });

  test("fails a permanent authentication error without enqueueing", async () => {
    const db = await seedRetryRun();
    const sent: Array<{ body: unknown; options?: QueueSendOptions }> = [];
    const fake = {
      async execute(): Promise<WorkflowResearchRecord> {
        throw { statusCode: 401 };
      },
    } as ResearchServiceFake;
    const service = new WorkflowExecutionService(db, buildDependencies(fake));
    const errorLog = spyOn(console, "error").mockImplementation(() => {});

    try {
      await service.executeStep("run", 0, buildQueueEnv(sent), { attempt: 1 });

      const { run, logs } = await readRun(db);
      expect(logs[0]?.status).toBe("failed");
      expect(logs[0]?.error).toBe("Provider authentication failed");
      expect(run?.status).toBe("failed");
      expect(run?.error).toBe("Provider authentication failed");
      expect(sent).toEqual([]);
      expect(errorLog.mock.calls).toEqual([
        [
          "Workflow step failed: run=run step=0 type=ai_research " +
            "message=Provider authentication failed",
        ],
      ]);
    } finally {
      errorLog.mockRestore();
    }
  });

  test("allows only one concurrent delivery to invoke the step action", async () => {
    const db = await seedRetryRun();
    const sent: Array<{ body: unknown; options?: QueueSendOptions }> = [];
    let calls = 0;
    let releaseResearch: (() => void) | undefined;
    let reportStarted: (() => void) | undefined;
    let reportDuplicate: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      reportStarted = resolve;
    });
    const duplicateInvoked = new Promise<void>((resolve) => {
      reportDuplicate = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      releaseResearch = resolve;
    });
    const fake = {
      async execute(): Promise<WorkflowResearchRecord> {
        calls += 1;
        if (calls === 1) {
          reportStarted?.();
        } else {
          reportDuplicate?.();
        }
        await blocked;
        return RESEARCH_RECORD;
      },
    } as ResearchServiceFake;
    const service = new WorkflowExecutionService(db, buildDependencies(fake));

    const first = service.executeStep("run", 0, buildQueueEnv(sent));
    await started;
    const second = service.executeStep("run", 0, buildQueueEnv(sent));
    const secondOutcome = await Promise.race([
      second.then(() => "returned" as const),
      duplicateInvoked.then(() => "invoked" as const),
    ]);
    releaseResearch?.();
    await Promise.all([first, second]);

    expect(secondOutcome).toBe("returned");
    expect(calls).toBe(1);
  });

  test("does not claim a retry lease before its scheduled time", async () => {
    const nextRetryAt = new Date(Date.now() + 60_000).toISOString();
    const db = await seedRetryRun({
      firstLog: {
        status: "retrying",
        progress: {
          phase: "retrying",
          message: "Retrying after a temporary provider error",
          attempt: 2,
          maxAttempts: 3,
          nextRetryAt,
        },
      },
    });
    const sent: Array<{ body: unknown; options?: QueueSendOptions }> = [];
    let calls = 0;
    const fake = {
      async execute(): Promise<WorkflowResearchRecord> {
        calls += 1;
        return RESEARCH_RECORD;
      },
    } as ResearchServiceFake;
    const service = new WorkflowExecutionService(db, buildDependencies(fake));

    await service.executeStep("run", 0, buildQueueEnv(sent), { attempt: 2 });

    const { run, logs } = await readRun(db);
    expect(calls).toBe(0);
    expect(logs[0]?.status).toBe("retrying");
    expect(run?.status).toBe("running");
    expect(sent).toEqual([]);
  });

  test("repairs a completed duplicate by enqueueing the next step without rerunning", async () => {
    const db = await seedRetryRun({
      includeSecondStep: true,
      firstLog: {
        status: "completed",
        completedAt: new Date().toISOString(),
        output: { continued: true },
      },
    });
    const sent: Array<{ body: unknown; options?: QueueSendOptions }> = [];
    let calls = 0;
    const fake = {
      async execute(): Promise<WorkflowResearchRecord> {
        calls += 1;
        return RESEARCH_RECORD;
      },
    } as ResearchServiceFake;
    const service = new WorkflowExecutionService(db, buildDependencies(fake));

    await service.executeStep("run", 0, buildQueueEnv(sent));

    expect(calls).toBe(0);
    expect(sent).toEqual([
      {
        body: { workflowRunId: "run", stepIndex: 1 },
        options: undefined,
      },
    ]);
  });

  test("preserves a completed wait step's original not-before time", async () => {
    const now = Date.parse("2026-07-26T12:20:00.000Z");
    const completedAt = new Date(now - 30_000).toISOString();
    const db = await seedRetryRun({
      includeSecondStep: true,
      stepType: "wait",
      firstLog: {
        status: "completed",
        completedAt,
        output: { waitSeconds: 60 },
      },
    });
    const sent: Array<{ body: unknown; options?: QueueSendOptions }> = [];
    const fake = {
      async execute(): Promise<WorkflowResearchRecord> {
        return RESEARCH_RECORD;
      },
    } as ResearchServiceFake;
    const service = new WorkflowExecutionService(db, buildDependencies(fake));
    const dateNow = spyOn(Date, "now").mockReturnValue(now);

    try {
      await service.executeStep("run", 0, buildQueueEnv(sent));

      expect(sent).toEqual([
        {
          body: { workflowRunId: "run", stepIndex: 1 },
          options: { delaySeconds: 30 },
        },
      ]);
    } finally {
      dateNow.mockRestore();
    }
  });

  test("completes a stopped duplicate without enqueueing", async () => {
    const db = await seedRetryRun({
      includeSecondStep: true,
      firstLog: {
        status: "completed",
        completedAt: new Date().toISOString(),
        output: { continued: false },
      },
    });
    const sent: Array<{ body: unknown; options?: QueueSendOptions }> = [];
    const fake = {
      async execute(): Promise<WorkflowResearchRecord> {
        return RESEARCH_RECORD;
      },
    } as ResearchServiceFake;
    const service = new WorkflowExecutionService(db, buildDependencies(fake));

    await service.executeStep("run", 0, buildQueueEnv(sent));

    const { run } = await readRun(db);
    expect(run?.status).toBe("completed");
    expect(sent).toEqual([]);
  });
});

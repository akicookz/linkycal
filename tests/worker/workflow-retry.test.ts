import { APICallError } from "ai";
import { describe, expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";

import * as dbSchema from "../../worker/db/schema";
import {
  isLeaseStale,
  isTransientWorkflowError,
  retryDelaySeconds,
  safeWorkflowErrorMessage,
  WorkflowFetchError,
} from "../../worker/lib/workflow-retry";
import type { WorkflowResearchRecord } from "../../worker/lib/workflow-runtime";
import {
  WorkflowExecutionService,
  type WorkflowExecutionDependencies,
} from "../../worker/services/workflow-execution-service";
import type { WorkflowAiResearchService } from "../../worker/services/workflow-ai-research-service";
import { ContactService } from "../../worker/services/contact-service";
import {
  WorkflowService,
  type StepLog,
} from "../../worker/services/workflow-service";
import type { AppEnv } from "../../worker/types";
import { createTestDb } from "./mcp-test-db";

const RESEARCH_RECORD: WorkflowResearchRecord = {
  provider: "chatgpt",
  model: "gpt-5.2",
  resultKey: "lead",
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
  stepConfig?: Record<string, unknown>;
  stepCondition?: Record<string, unknown>;
  stepType?: "ai_research" | "send_email" | "wait" | "webhook";
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
      config: options.stepConfig ?? (
        stepType === "ai_research"
          ? { provider: "chatgpt", resultKey: "lead", prompt: "Research Jane" }
          : stepType === "send_email"
            ? {
                toList: ["{{contact.email}}"],
                subject: "Hello Jane",
                body: "Research is ready",
              }
            : stepType === "webhook"
              ? {
                  url: "https://receiver.example/webhook",
                  method: "POST",
                  body: "{\"event\":\"ready\"}",
                }
              : { amount: 1, unit: "minutes" }
      ),
      condition: options.stepCondition,
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
    stepLabel:
      stepType === "wait"
        ? "Wait"
        : stepType === "send_email"
          ? "Send Email"
          : stepType === "webhook"
            ? "Webhook"
            : "AI Research",
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

  test("classifies the complete retryability matrix", () => {
    const cases = [
      [
        "timeout exception",
        new DOMException("timed out", "TimeoutError"),
        true,
      ],
      [
        "wrapped fetch failure",
        new WorkflowFetchError(new TypeError("network request failed")),
        true,
      ],
      ["explicit transient marker", { transient: true }, true],
      ["timeout status", { status: 408 }, true],
      ["rate-limit status", { statusCode: "429" }, true],
      ["provider status lower bound", { status: 500 }, true],
      ["provider status upper bound", { statusCode: 599 }, true],
      ["status above provider range", { status: 600 }, false],
      ["validation status", { status: 422 }, false],
      ["authentication status", { status: 401 }, false],
      ["ordinary error", new Error("invalid configuration"), false],
      ["programming TypeError", new TypeError("programming bug"), false],
    ] as const;

    for (const [name, error, expected] of cases) {
      expect([
        name,
        isTransientWorkflowError(error),
      ]).toEqual([name, expected]);
    }
  });

  test("redacts every supported credential marker", () => {
    const cases = [
      ["Authorization", "Authorization: Basic private"],
      ["Bearer", "Bearer sk-private-token"],
      ["api key", "api_key=private"],
      ["token", "access token private"],
      ["secret", "client_secret=private"],
      ["password", "password=private"],
      ["cookie", "cookie=session-private"],
    ] as const;

    for (const [name, detail] of cases) {
      const message = safeWorkflowErrorMessage(new Error(detail));
      expect([
        name,
        message,
        message.includes("private"),
      ]).toEqual([
        name,
        "Provider request failed",
        false,
      ]);
    }
  });

  test("preserves safe details and replaces provider statuses with stable messages", () => {
    expect(safeWorkflowErrorMessage(new Error("Socket closed"))).toBe(
      "Socket closed",
    );
    expect(
      safeWorkflowErrorMessage({
        status: 401,
        message: "Authorization: Bearer sk-private-token",
      }),
    ).toBe("Provider authentication failed");
    expect(safeWorkflowErrorMessage("")).toBe("Provider request failed");
  });

  test("applies the complete lease-staleness boundary matrix", () => {
    const now = new Date("2026-07-27T12:00:00.000Z");
    const cases = [
      ["missing", undefined, false],
      ["invalid", "not-a-date", false],
      ["one millisecond before", "2026-07-27T11:45:00.001Z", false],
      ["exactly fifteen minutes", "2026-07-27T11:45:00.000Z", true],
    ] as const;

    for (const [name, startedAt, expected] of cases) {
      expect([
        name,
        isLeaseStale(startedAt, now),
      ]).toEqual([name, expected]);
    }
  });
});

describe("workflow execution retry and lease handling", () => {
  test("retries Resend transport ambiguity with one stable run-and-step idempotency key", async () => {
    const db = await seedRetryRun({ stepType: "send_email" });
    const workflowService = new WorkflowService(db);
    const sent: Array<{ body: unknown; options?: QueueSendOptions }> = [];
    const idempotencyKeys: Array<string | null> = [];
    let fetchCalls = 0;
    const fetchRequest = spyOn(globalThis, "fetch").mockImplementation(
      async (_input, init) => {
        fetchCalls += 1;
        idempotencyKeys.push(
          new Headers(init?.headers).get("Idempotency-Key"),
        );
        if (fetchCalls === 1) {
          throw new TypeError("connection closed after request write");
        }
        return new Response(JSON.stringify({ id: "email-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    );
    const service = new WorkflowExecutionService(db);

    try {
      await service.executeStep("run", 0, buildQueueEnv(sent), { attempt: 1 });

      const retryLogs = await workflowService.getStepLogs("run");
      expect(retryLogs[0]?.status).toBe("retrying");
      if (!retryLogs[0]?.progress) {
        throw new Error("expected persisted retry progress");
      }
      retryLogs[0].progress.nextRetryAt = new Date(
        Date.now() - 1_000,
      ).toISOString();
      await workflowService.updateStepLogs("run", retryLogs);

      await service.executeStep("run", 0, buildQueueEnv(sent), { attempt: 2 });

      const { run, logs } = await readRun(db);
      expect(fetchCalls).toBe(2);
      expect(idempotencyKeys).toEqual([
        "workflow-run/run/step/0/send-email",
        "workflow-run/run/step/0/send-email",
      ]);
      expect(logs[0]?.status).toBe("completed");
      expect(run?.status).toBe("completed");
    } finally {
      fetchRequest.mockRestore();
    }
  });

  test("does not auto-retry an unsafe webhook after an ambiguous transport failure", async () => {
    const db = await seedRetryRun({ stepType: "webhook" });
    const sent: Array<{ body: unknown; options?: QueueSendOptions }> = [];
    const fetchRequest = spyOn(globalThis, "fetch").mockImplementation(
      async () => {
        throw new TypeError("connection closed after request write");
      },
    );
    const errorLog = spyOn(console, "error").mockImplementation(() => {});
    const service = new WorkflowExecutionService(db);

    try {
      await service.executeStep("run", 0, buildQueueEnv(sent), { attempt: 1 });

      const { run, logs } = await readRun(db);
      expect(logs[0]?.status).toBe("failed");
      expect(run?.status).toBe("failed");
      expect(sent).toEqual([]);
    } finally {
      errorLog.mockRestore();
      fetchRequest.mockRestore();
    }
  });

  test("retries a plain D1 hydration fault before an unsafe webhook action", async () => {
    const db = await seedRetryRun({ stepType: "webhook" });
    const sent: Array<{ body: unknown; options?: QueueSendOptions }> = [];
    const hydrationError = new Error("D1_ERROR: Network connection lost.");
    const getById = spyOn(
      ContactService.prototype,
      "getById",
    ).mockImplementation(async () => {
      throw hydrationError;
    });
    let fetchCalls = 0;
    const fetchRequest = spyOn(globalThis, "fetch").mockImplementation(
      async () => {
        fetchCalls += 1;
        return new Response(null, { status: 204 });
      },
    );
    const errorLog = spyOn(console, "error").mockImplementation(() => {});
    const service = new WorkflowExecutionService(db);

    try {
      await service.executeStep("run", 0, buildQueueEnv(sent), { attempt: 1 });

      const { run, logs } = await readRun(db);
      expect(fetchCalls).toBe(0);
      expect(run?.status).toBe("running");
      expect(logs[0]?.status).toBe("retrying");
      expect(logs[0]?.progress).toMatchObject({
        phase: "retrying",
        attempt: 2,
        maxAttempts: 3,
      });
      expect(sent).toEqual([
        {
          body: { workflowRunId: "run", stepIndex: 0, attempt: 2 },
          options: { delaySeconds: 15 },
        },
      ]);
    } finally {
      errorLog.mockRestore();
      fetchRequest.mockRestore();
      getById.mockRestore();
    }
  });

  test("recovers an unsafe webhook lease when pre-action retry persistence fails", async () => {
    const db = await seedRetryRun({ stepType: "webhook" });
    const sent: Array<{ body: unknown; options?: QueueSendOptions }> = [];
    const hydrationError = new Error("D1_ERROR: Network connection lost.");
    const persistenceError = new Error("retry persistence unavailable");
    let contactReads = 0;
    const getById = spyOn(
      ContactService.prototype,
      "getById",
    ).mockImplementation(async () => {
      contactReads += 1;
      throw hydrationError;
    });
    const updateStepLogsForLease = spyOn(
      WorkflowService.prototype,
      "updateStepLogsForLease",
    ).mockImplementation(async () => {
      throw persistenceError;
    });
    let fetchCalls = 0;
    const fetchRequest = spyOn(globalThis, "fetch").mockImplementation(
      async () => {
        fetchCalls += 1;
        return new Response(null, { status: 204 });
      },
    );
    const service = new WorkflowExecutionService(db);

    try {
      const firstError = await service
        .executeStep("run", 0, buildQueueEnv(sent), { attempt: 1 })
        .then(() => undefined, (error: unknown) => error);
      expect(firstError).toBe(persistenceError);

      const afterFailure = await readRun(db);
      const leaseStartedAt =
        afterFailure.logs[0]?.progress?.leaseStartedAt;
      expect(afterFailure.run?.status).toBe("running");
      expect(afterFailure.logs[0]?.status).toBe("running");
      expect(afterFailure.logs[0]?.progress?.actionStarted).toBe(false);
      expect(typeof leaseStartedAt).toBe("string");
      if (!leaseStartedAt) {
        throw new Error("expected the pre-action attempt lease");
      }

      const dateNow = spyOn(Date, "now").mockReturnValue(
        Date.parse(leaseStartedAt) + 1_000,
      );
      try {
        await service.executeStep("run", 0, buildQueueEnv(sent), { attempt: 1 });
      } finally {
        dateNow.mockRestore();
      }

      const afterRedelivery = await readRun(db);
      expect(contactReads).toBe(1);
      expect(fetchCalls).toBe(0);
      expect(afterRedelivery.run?.status).toBe("running");
      expect(afterRedelivery.logs[0]?.status).toBe("running");
      expect(afterRedelivery.logs[0]?.progress?.leaseStartedAt).toBe(
        leaseStartedAt,
      );
      expect(sent).toEqual([
        {
          body: { workflowRunId: "run", stepIndex: 0, attempt: 1 },
          options: { delaySeconds: 899 },
        },
      ]);
    } finally {
      fetchRequest.mockRestore();
      updateStepLogsForLease.mockRestore();
      getById.mockRestore();
    }
  });

  test("continues after the unsafe webhook action marker commits but rejects", async () => {
    const db = await seedRetryRun({
      includeSecondStep: true,
      stepType: "webhook",
    });
    const sent: Array<{ body: unknown; options?: QueueSendOptions }> = [];
    const responseError = new Error("D1_ERROR: Network connection lost.");
    const originalUpdateStepProgressForLease =
      WorkflowService.prototype.updateStepProgressForLease;
    let progressWrites = 0;
    const updateStepProgressForLease = spyOn(
      WorkflowService.prototype,
      "updateStepProgressForLease",
    ).mockImplementation(async function (
      runId,
      stepIndex,
      leaseStartedAt,
      progress,
    ) {
      progressWrites += 1;
      const updated = await originalUpdateStepProgressForLease.call(
        this,
        runId,
        stepIndex,
        leaseStartedAt,
        progress,
      );
      if (progressWrites === 1) {
        throw responseError;
      }
      return updated;
    });
    let fetchCalls = 0;
    const fetchRequest = spyOn(globalThis, "fetch").mockImplementation(
      async () => {
        fetchCalls += 1;
        return new Response(null, { status: 204 });
      },
    );
    const service = new WorkflowExecutionService(db);

    try {
      await service.executeStep("run", 0, buildQueueEnv(sent), { attempt: 1 });

      const { run, logs } = await readRun(db);
      expect(progressWrites).toBe(1);
      expect(fetchCalls).toBe(1);
      expect(run?.status).toBe("running");
      expect(logs[0]?.status).toBe("completed");
      expect(logs[0]?.progress?.actionStarted).toBe(true);
      expect(logs[1]?.status).toBe("pending");
      expect(sent).toEqual([
        {
          body: { workflowRunId: "run", stepIndex: 1 },
          options: undefined,
        },
      ]);
    } finally {
      fetchRequest.mockRestore();
      updateStepProgressForLease.mockRestore();
    }
  });

  test("keeps read-only webhook transport failures retryable", async () => {
    const db = await seedRetryRun({
      stepType: "webhook",
      stepConfig: {
        url: "https://receiver.example/status",
        method: "GET",
      },
    });
    const sent: Array<{ body: unknown; options?: QueueSendOptions }> = [];
    const fetchRequest = spyOn(globalThis, "fetch").mockImplementation(
      async () => {
        throw new TypeError("connection closed before response");
      },
    );
    const service = new WorkflowExecutionService(db);

    try {
      await service.executeStep("run", 0, buildQueueEnv(sent), { attempt: 1 });

      const { run, logs } = await readRun(db);
      expect(logs[0]?.status).toBe("retrying");
      expect(run?.status).toBe("running");
      expect(sent).toEqual([
        {
          body: { workflowRunId: "run", stepIndex: 0, attempt: 2 },
          options: { delaySeconds: 15 },
        },
      ]);
    } finally {
      fetchRequest.mockRestore();
    }
  });

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

  test("bounds transient AI finalization retries without partial contact effects", async () => {
    const db = await seedRetryRun();
    const workflowService = new WorkflowService(db);
    const sent: Array<{ body: unknown; options?: QueueSendOptions }> = [];
    const batchError = new Error("D1_ERROR: Network connection lost.");
    const sqliteClient = (
      db as unknown as {
        $client: {
          transaction(callback: () => void): () => void;
        };
      }
    ).$client;
    const transaction = spyOn(sqliteClient, "transaction").mockImplementation(
      () => {
        throw batchError;
      },
    );
    const errorLog = spyOn(console, "error").mockImplementation(() => {});
    let providerCalls = 0;
    const fake = {
      async execute(): Promise<WorkflowResearchRecord> {
        providerCalls += 1;
        return RESEARCH_RECORD;
      },
    } as ResearchServiceFake;
    const service = new WorkflowExecutionService(db, buildDependencies(fake));

    try {
      await service.executeStep("run", 0, buildQueueEnv(sent), { attempt: 1 });

      const attemptTwoLogs = await workflowService.getStepLogs("run");
      expect(attemptTwoLogs[0]?.status).toBe("retrying");
      if (!attemptTwoLogs[0]?.progress) {
        throw new Error("expected attempt-two retry progress");
      }
      attemptTwoLogs[0].progress.nextRetryAt = new Date(
        Date.now() - 1_000,
      ).toISOString();
      await workflowService.updateStepLogs("run", attemptTwoLogs);

      await service.executeStep("run", 0, buildQueueEnv(sent), { attempt: 2 });

      const attemptThreeLogs = await workflowService.getStepLogs("run");
      expect(attemptThreeLogs[0]?.status).toBe("retrying");
      if (!attemptThreeLogs[0]?.progress) {
        throw new Error("expected attempt-three retry progress");
      }
      attemptThreeLogs[0].progress.nextRetryAt = new Date(
        Date.now() - 1_000,
      ).toISOString();
      await workflowService.updateStepLogs("run", attemptThreeLogs);

      await service.executeStep("run", 0, buildQueueEnv(sent), { attempt: 3 });

      const { run, logs } = await readRun(db);
      const [contact] = await db
        .select()
        .from(dbSchema.contacts)
        .where(eq(dbSchema.contacts.id, "contact"));
      const activities = await db
        .select()
        .from(dbSchema.contactActivity)
        .where(eq(dbSchema.contactActivity.contactId, "contact"));
      expect(providerCalls).toBe(3);
      expect(sent).toEqual([
        {
          body: { workflowRunId: "run", stepIndex: 0, attempt: 2 },
          options: { delaySeconds: 15 },
        },
        {
          body: { workflowRunId: "run", stepIndex: 0, attempt: 3 },
          options: { delaySeconds: 60 },
        },
      ]);
      expect(logs[0]?.status).toBe("failed");
      expect(run?.status).toBe("failed");
      expect(contact?.company).toBeNull();
      expect(contact?.notes).toBeNull();
      expect(contact?.metadata).toBeNull();
      expect(activities).toEqual([]);
    } finally {
      errorLog.mockRestore();
      transaction.mockRestore();
    }
  });

  test("schedules active-attempt recovery after finalization retry persistence fails", async () => {
    const db = await seedRetryRun();
    const sent: Array<{ body: unknown; options?: QueueSendOptions }> = [];
    const batchError = new Error("D1_ERROR: Network connection lost.");
    const persistenceError = new Error("retry persistence unavailable");
    const sqliteClient = (
      db as unknown as {
        $client: {
          transaction(callback: () => void): () => void;
        };
      }
    ).$client;
    const transaction = spyOn(sqliteClient, "transaction").mockImplementation(
      () => {
        throw batchError;
      },
    );
    const originalUpdateStepLogsForLease =
      WorkflowService.prototype.updateStepLogsForLease;
    let leaseUpdateCalls = 0;
    const updateStepLogsForLease = spyOn(
      WorkflowService.prototype,
      "updateStepLogsForLease",
    ).mockImplementation(async function (
      runId,
      stepIndex,
      leaseStartedAt,
      stepLogs,
    ) {
      leaseUpdateCalls += 1;
      if (leaseUpdateCalls === 2) {
        throw persistenceError;
      }
      return originalUpdateStepLogsForLease.call(
        this,
        runId,
        stepIndex,
        leaseStartedAt,
        stepLogs,
      );
    });
    let providerCalls = 0;
    const fake = {
      async execute(): Promise<WorkflowResearchRecord> {
        providerCalls += 1;
        return RESEARCH_RECORD;
      },
    } as ResearchServiceFake;
    const service = new WorkflowExecutionService(db, buildDependencies(fake));

    try {
      const firstError = await service
        .executeStep("run", 0, buildQueueEnv(sent), { attempt: 1 })
        .then(() => undefined, (error: unknown) => error);
      expect(firstError).toBe(persistenceError);

      const afterFailure = await readRun(db);
      const leaseStartedAt =
        afterFailure.logs[0]?.progress?.leaseStartedAt;
      expect(afterFailure.logs[0]?.status).toBe("running");
      expect(typeof leaseStartedAt).toBe("string");
      if (!leaseStartedAt) {
        throw new Error("expected the active attempt lease");
      }

      const dateNow = spyOn(Date, "now").mockReturnValue(
        Date.parse(leaseStartedAt) + 1_000,
      );
      try {
        await service.executeStep("run", 0, buildQueueEnv(sent), { attempt: 1 });
      } finally {
        dateNow.mockRestore();
      }

      const afterRedelivery = await readRun(db);
      expect(providerCalls).toBe(1);
      expect(afterRedelivery.logs[0]?.status).toBe("running");
      expect(afterRedelivery.logs[0]?.progress?.leaseStartedAt).toBe(
        leaseStartedAt,
      );
      expect(sent).toEqual([
        {
          body: { workflowRunId: "run", stepIndex: 0, attempt: 1 },
          options: { delaySeconds: 899 },
        },
      ]);
    } finally {
      updateStepLogsForLease.mockRestore();
      transaction.mockRestore();
    }
  });

  test("continues a committed AI finalization whose D1 response rejects", async () => {
    const db = await seedRetryRun({ includeSecondStep: true });
    const sent: Array<{ body: unknown; options?: QueueSendOptions }> = [];
    const responseError = new Error("D1_ERROR: Network connection lost.");
    const sqliteClient = (
      db as unknown as {
        $client: {
          transaction(callback: () => void): () => void;
        };
      }
    ).$client;
    const originalTransaction = sqliteClient.transaction;
    const transaction = spyOn(sqliteClient, "transaction").mockImplementation(
      function (callback) {
        const commit = originalTransaction.call(this, callback);
        return function commitThenReject(): void {
          commit();
          throw responseError;
        };
      },
    );
    let providerCalls = 0;
    const fake = {
      async execute(): Promise<WorkflowResearchRecord> {
        providerCalls += 1;
        return RESEARCH_RECORD;
      },
    } as ResearchServiceFake;
    const service = new WorkflowExecutionService(db, buildDependencies(fake));

    try {
      await service.executeStep("run", 0, buildQueueEnv(sent), { attempt: 1 });

      const { run, logs } = await readRun(db);
      const [contact] = await db
        .select()
        .from(dbSchema.contacts)
        .where(eq(dbSchema.contacts.id, "contact"));
      const activities = await db
        .select()
        .from(dbSchema.contactActivity)
        .where(eq(dbSchema.contactActivity.contactId, "contact"));
      expect(providerCalls).toBe(1);
      expect(logs[0]?.status).toBe("completed");
      expect(logs[1]?.status).toBe("pending");
      expect(run?.status).toBe("running");
      expect(contact?.company).toBe("Acme");
      expect(contact?.notes?.match(/— Research summary \(/g)).toHaveLength(1);
      expect(activities).toHaveLength(1);
      expect(sent).toEqual([
        {
          body: { workflowRunId: "run", stepIndex: 1 },
          options: undefined,
        },
      ]);
    } finally {
      transaction.mockRestore();
    }
  });

  test("fails permanently when the contact disappears before AI finalization", async () => {
    const db = await seedRetryRun();
    const sent: Array<{ body: unknown; options?: QueueSendOptions }> = [];
    const originalGetById = ContactService.prototype.getById;
    let contactReads = 0;
    const getById = spyOn(
      ContactService.prototype,
      "getById",
    ).mockImplementation(async function (id) {
      contactReads += 1;
      if (contactReads === 2) {
        await db
          .delete(dbSchema.contacts)
          .where(eq(dbSchema.contacts.id, "contact"));
      }
      return originalGetById.call(this, id);
    });
    let providerCalls = 0;
    const fake = {
      async execute(): Promise<WorkflowResearchRecord> {
        providerCalls += 1;
        return RESEARCH_RECORD;
      },
    } as ResearchServiceFake;
    const service = new WorkflowExecutionService(db, buildDependencies(fake));
    const errorLog = spyOn(console, "error").mockImplementation(() => {});

    try {
      await service.executeStep("run", 0, buildQueueEnv(sent), { attempt: 1 });

      const { run, logs } = await readRun(db);
      expect(providerCalls).toBe(1);
      expect(logs[0]?.status).toBe("failed");
      expect(logs[0]?.error).toBe("Contact unavailable");
      expect(run?.status).toBe("failed");
      expect(run?.error).toBe("Contact unavailable");
      expect(sent).toEqual([]);

      await service.executeStep("run", 0, buildQueueEnv(sent), { attempt: 1 });

      expect(providerCalls).toBe(1);
      expect(sent).toEqual([]);
    } finally {
      errorLog.mockRestore();
      getById.mockRestore();
    }
  });

  test("does not recover unsafe webhook leases after ambiguous dispatch", async () => {
    const cases = [
      ["action already started", true],
      ["legacy action state unknown", undefined],
    ] as const;

    for (const [name, actionStarted] of cases) {
      const leaseStartedAt = new Date().toISOString();
      const db = await seedRetryRun({
        stepType: "webhook",
        firstLog: {
          status: "running",
          startedAt: leaseStartedAt,
          progress: {
            phase: "preparing",
            message: "Preparing step inputs",
            attempt: 1,
            maxAttempts: 3,
            leaseStartedAt,
            actionStarted,
          },
        },
      });
      const sent: Array<{ body: unknown; options?: QueueSendOptions }> = [];
      const service = new WorkflowExecutionService(db);

      await service.executeStep("run", 0, buildQueueEnv(sent), { attempt: 1 });

      const { run, logs } = await readRun(db);
      expect([
        name,
        logs[0]?.status,
        logs[0]?.progress?.actionStarted,
        run?.status,
        sent,
      ]).toEqual([
        name,
        "running",
        actionStarted,
        "running",
        [],
      ]);
    }
  });

  test("repairs retry delivery after the first delayed queue send rejects", async () => {
    const db = await seedRetryRun();
    const fixedNow = Date.parse("2026-07-26T12:00:00.000Z");
    const attempted: Array<{ body: unknown; options?: QueueSendOptions }> = [];
    const delivered: Array<{ body: unknown; options?: QueueSendOptions }> = [];
    const queueError = new TypeError("queue transport failed");
    let queueCalls = 0;
    const env = {
      WORKFLOW_QUEUE: {
        async send(
          body: unknown,
          options?: QueueSendOptions,
        ): Promise<void> {
          queueCalls += 1;
          attempted.push({ body, options });
          if (queueCalls === 1) throw queueError;
          delivered.push({ body, options });
        },
      } as Queue,
      OPENAI_API_KEY: "test-openai-key",
    } as AppEnv;
    let actionCalls = 0;
    const fake = {
      async execute(): Promise<WorkflowResearchRecord> {
        actionCalls += 1;
        throw { statusCode: 429 };
      },
    } as ResearchServiceFake;
    const service = new WorkflowExecutionService(db, buildDependencies(fake));
    const dateNow = spyOn(Date, "now").mockReturnValue(fixedNow);

    try {
      const sendError = await service
        .executeStep("run", 0, env, { attempt: 1 })
        .then(() => undefined, (error: unknown) => error);

      const afterRejection = await readRun(db);
      expect(sendError).toBe(queueError);
      expect(afterRejection.logs[0]?.status).toBe("retrying");
      expect(afterRejection.logs[0]?.progress).toMatchObject({
        attempt: 2,
        nextRetryAt: "2026-07-26T12:00:15.000Z",
      });
      expect(delivered).toEqual([]);

      await service.executeStep("run", 0, env, { attempt: 1 });

      expect(actionCalls).toBe(1);
      expect(attempted).toEqual([
        {
          body: { workflowRunId: "run", stepIndex: 0, attempt: 2 },
          options: { delaySeconds: 15 },
        },
        {
          body: { workflowRunId: "run", stepIndex: 0, attempt: 2 },
          options: { delaySeconds: 15 },
        },
      ]);
      expect(delivered).toEqual([
        {
          body: { workflowRunId: "run", stepIndex: 0, attempt: 2 },
          options: { delaySeconds: 15 },
        },
      ]);
    } finally {
      dateNow.mockRestore();
    }
  });

  test("does not retry a successful action when continuation enqueue fails", async () => {
    const db = await seedRetryRun({ includeSecondStep: true });
    const attempted: unknown[] = [];
    const delivered: unknown[] = [];
    const queueError = new TypeError("queue transport failed");
    let queueCalls = 0;
    const env = {
      WORKFLOW_QUEUE: {
        async send(body: unknown): Promise<void> {
          queueCalls += 1;
          attempted.push(body);
          if (queueCalls === 1) throw queueError;
          delivered.push(body);
        },
      } as Queue,
      OPENAI_API_KEY: "test-openai-key",
    } as AppEnv;
    let actionCalls = 0;
    const fake = {
      async execute(): Promise<WorkflowResearchRecord> {
        actionCalls += 1;
        return RESEARCH_RECORD;
      },
    } as ResearchServiceFake;
    const service = new WorkflowExecutionService(db, buildDependencies(fake));

    const continuationError = await service
      .executeStep("run", 0, env)
      .then(() => undefined, (error: unknown) => error);

    const afterFailure = await readRun(db);
    const persistedContext = JSON.parse(afterFailure.run?.context ?? "{}") as {
      metadata?: {
        workflow?: { research?: { byKey?: { lead?: unknown } } };
      };
    };
    expect(continuationError).toBe(queueError);
    expect(actionCalls).toBe(1);
    expect(afterFailure.logs[0]?.status).toBe("completed");
    expect(afterFailure.run?.status).toBe("running");
    expect(
      persistedContext.metadata?.workflow?.research?.byKey?.lead,
    ).toBeDefined();
    expect(delivered).toEqual([]);

    await service.executeStep("run", 0, env);

    expect(actionCalls).toBe(1);
    expect(attempted).toEqual([
      { workflowRunId: "run", stepIndex: 1 },
      { workflowRunId: "run", stepIndex: 1 },
    ]);
    expect(delivered).toEqual([{ workflowRunId: "run", stepIndex: 1 }]);
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

  test("keeps contact disappearance fenced behind the active attempt lease", async () => {
    const db = await seedRetryRun();
    const sent: Array<{ body: unknown; options?: QueueSendOptions }> = [];
    let providerCalls = 0;
    let releaseResearch: (() => void) | undefined;
    let reportStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      reportStarted = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      releaseResearch = resolve;
    });
    const fake = {
      async execute(): Promise<WorkflowResearchRecord> {
        providerCalls += 1;
        reportStarted?.();
        await blocked;
        return RESEARCH_RECORD;
      },
    } as ResearchServiceFake;
    const service = new WorkflowExecutionService(db, buildDependencies(fake));
    const errorLog = spyOn(console, "error").mockImplementation(() => {});

    try {
      const owner = service.executeStep("run", 0, buildQueueEnv(sent), {
        attempt: 1,
      });
      await started;

      const beforeRedelivery = await readRun(db);
      const ownerLease =
        beforeRedelivery.logs[0]?.progress?.leaseStartedAt;
      expect(typeof ownerLease).toBe("string");
      await db
        .delete(dbSchema.contacts)
        .where(eq(dbSchema.contacts.id, "contact"));

      await service.executeStep("run", 0, buildQueueEnv(sent), { attempt: 1 });

      const duringOwner = await readRun(db);
      expect(providerCalls).toBe(1);
      expect(duringOwner.run?.status).toBe("running");
      expect(duringOwner.logs[0]?.status).toBe("running");
      expect(duringOwner.logs[0]?.progress?.leaseStartedAt).toBe(ownerLease);
      expect(sent).toHaveLength(1);
      expect(sent[0]?.body).toEqual({
        workflowRunId: "run",
        stepIndex: 0,
        attempt: 1,
      });
      expect(sent[0]?.options?.delaySeconds).toBeGreaterThan(0);

      releaseResearch?.();
      await owner;

      const afterOwner = await readRun(db);
      expect(afterOwner.run?.status).toBe("failed");
      expect(afterOwner.logs[0]?.status).toBe("failed");
      expect(afterOwner.logs[0]?.error).toBe("Contact unavailable");
    } finally {
      releaseResearch?.();
      errorLog.mockRestore();
    }
  });

  test("finalizes a condition skip under its lease without a visible start", async () => {
    const db = await seedRetryRun({
      includeSecondStep: true,
      stepCondition: {
        when: "all",
        rules: [
          {
            source: "contact.email",
            operator: "equals",
            value: "not-jane@example.com",
          },
        ],
      },
    });
    const sent: Array<{ body: unknown; options?: QueueSendOptions }> = [];
    let providerCalls = 0;
    const fake = {
      async execute(): Promise<WorkflowResearchRecord> {
        providerCalls += 1;
        return RESEARCH_RECORD;
      },
    } as ResearchServiceFake;
    const service = new WorkflowExecutionService(db, buildDependencies(fake));

    await service.executeStep("run", 0, buildQueueEnv(sent), { attempt: 1 });

    const { run, logs } = await readRun(db);
    expect(providerCalls).toBe(0);
    expect(run?.status).toBe("running");
    expect(logs[0]?.status).toBe("skipped");
    expect(logs[0]?.startedAt).toBeNull();
    expect(logs[0]?.output).toEqual({ reason: "condition_not_met" });
    expect(logs[1]?.status).toBe("pending");
    expect(sent).toEqual([
      {
        body: { workflowRunId: "run", stepIndex: 1 },
        options: undefined,
      },
    ]);
  });

  test("prevents a stale lease owner from mutating the contact or its replacement lease", async () => {
    const db = await seedRetryRun({ includeSecondStep: true });
    const workflowService = new WorkflowService(db);
    const sent: Array<{ body: unknown; options?: QueueSendOptions }> = [];
    let releaseResearch: (() => void) | undefined;
    let reportStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      reportStarted = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      releaseResearch = resolve;
    });
    const fake = {
      async execute(): Promise<WorkflowResearchRecord> {
        reportStarted?.();
        await blocked;
        return RESEARCH_RECORD;
      },
    } as ResearchServiceFake;
    const service = new WorkflowExecutionService(db, buildDependencies(fake));

    const original = service.executeStep("run", 0, buildQueueEnv(sent));
    await started;

    const staleLogs = await workflowService.getStepLogs("run");
    const originalLease = staleLogs[0]?.progress?.leaseStartedAt;
    const takeoverAt = new Date(Date.now() + 16 * 60_000);
    if (staleLogs[0]?.progress) {
      staleLogs[0].progress.leaseStartedAt = new Date(
        takeoverAt.getTime() - 16 * 60_000,
      ).toISOString();
    }
    await workflowService.updateStepLogs("run", staleLogs);
    const replacementLogs = await workflowService.claimStepLease(
      "run",
      0,
      1,
      takeoverAt,
    );
    const replacementLease = replacementLogs?.[0]?.progress?.leaseStartedAt;

    expect(typeof originalLease).toBe("string");
    expect(typeof replacementLease).toBe("string");
    expect(replacementLease).not.toBe(originalLease);

    releaseResearch?.();
    await original;

    const afterOriginal = await readRun(db);
    const [contact] = await db
      .select()
      .from(dbSchema.contacts)
      .where(eq(dbSchema.contacts.id, "contact"));
    const activities = await db
      .select()
      .from(dbSchema.contactActivity)
      .where(eq(dbSchema.contactActivity.contactId, "contact"));
    expect(afterOriginal.logs[0]?.status).toBe("running");
    expect(afterOriginal.logs[0]?.progress?.leaseStartedAt).toBe(
      replacementLease,
    );
    expect(afterOriginal.run?.status).toBe("running");
    expect(contact?.company).toBeNull();
    expect(contact?.notes).toBeNull();
    expect(contact?.metadata).toBeNull();
    expect(activities).toEqual([]);
    expect(sent).toEqual([]);
  });

  test("fences contact and activity mutations when ownership changes after the saving report", async () => {
    const db = await seedRetryRun();
    const workflowService = new WorkflowService(db);
    const sent: Array<{ body: unknown; options?: QueueSendOptions }> = [];
    const originalGetById = ContactService.prototype.getById;
    let releaseContactRead: (() => void) | undefined;
    let contactReadStarted: (() => void) | undefined;
    const contactRead = new Promise<void>((resolve) => {
      contactReadStarted = resolve;
    });
    const blockedContactRead = new Promise<void>((resolve) => {
      releaseContactRead = resolve;
    });
    let contactReads = 0;
    const getById = spyOn(
      ContactService.prototype,
      "getById",
    ).mockImplementation(async function (id) {
      contactReads += 1;
      if (contactReads === 1) {
        return originalGetById.call(this, id);
      }
      contactReadStarted?.();
      await blockedContactRead;
      return originalGetById.call(this, id);
    });
    const fake = {
      async execute(): Promise<WorkflowResearchRecord> {
        return RESEARCH_RECORD;
      },
    } as ResearchServiceFake;
    const service = new WorkflowExecutionService(db, buildDependencies(fake));

    try {
      const original = service.executeStep("run", 0, buildQueueEnv(sent));
      await contactRead;

      const savingLogs = await workflowService.getStepLogs("run");
      const originalLease = savingLogs[0]?.progress?.leaseStartedAt;
      expect(savingLogs[0]?.progress?.phase).toBe("saving");
      expect(typeof originalLease).toBe("string");
      if (!originalLease) {
        throw new Error("expected the saving owner lease");
      }
      const replacementLogs = await workflowService.claimStepLease(
        "run",
        0,
        1,
        new Date(Date.parse(originalLease) + 16 * 60_000),
      );
      const replacementLease = replacementLogs?.[0]?.progress?.leaseStartedAt;
      expect(typeof replacementLease).toBe("string");
      expect(replacementLease).not.toBe(originalLease);

      releaseContactRead?.();
      await original;

      const [contact] = await db
        .select()
        .from(dbSchema.contacts)
        .where(eq(dbSchema.contacts.id, "contact"));
      const activities = await db
        .select()
        .from(dbSchema.contactActivity)
        .where(eq(dbSchema.contactActivity.contactId, "contact"));
      expect(contact?.company).toBeNull();
      expect(contact?.notes).toBeNull();
      expect(contact?.metadata).toBeNull();
      expect(activities).toEqual([]);
      expect(sent).toEqual([]);
    } finally {
      releaseContactRead?.();
      getById.mockRestore();
    }
  });

  test("finalizes step logs and workflow context in one leased transition", async () => {
    const db = await seedRetryRun();
    const workflowService = new WorkflowService(db);
    const claimedLogs = await workflowService.claimStepLease(
      "run",
      0,
      1,
      new Date("2026-07-26T12:00:00.000Z"),
    );
    const leaseStartedAt = claimedLogs?.[0]?.progress?.leaseStartedAt;
    expect(typeof leaseStartedAt).toBe("string");
    if (!claimedLogs || !leaseStartedAt) {
      throw new Error("expected a claimed lease");
    }
    claimedLogs[0].status = "completed";
    claimedLogs[0].completedAt = "2026-07-26T12:00:01.000Z";
    claimedLogs[0].output = { continued: true, result: "saved" };
    const nextContext = JSON.stringify({
      projectId: "project",
      contactId: "contact",
      stepOutputs: { 0: "saved" },
    });

    const finalized = await workflowService.finalizeStepLease(
      "run",
      0,
      leaseStartedAt,
      claimedLogs,
      nextContext,
    );

    const { run, logs } = await readRun(db);
    expect(finalized).toBe(true);
    expect(logs[0]?.status).toBe("completed");
    expect(run?.context).toBe(nextContext);
    expect(run?.currentStepIndex).toBe(0);
  });

  test("claims a legacy pending log with no progress as attempt one", async () => {
    const db = await seedRetryRun({
      firstLog: {
        progress: undefined,
      },
    });
    const workflowService = new WorkflowService(db);
    const claimed = await workflowService.claimStepLease(
      "run",
      0,
      1,
      new Date("2026-07-26T12:00:00.000Z"),
    );

    expect(claimed?.[0]).toMatchObject({
      status: "running",
      startedAt: "2026-07-26T12:00:00.000Z",
      progress: {
        phase: "preparing",
        attempt: 1,
        maxAttempts: 3,
        leaseStartedAt: "2026-07-26T12:00:00.000Z",
      },
    });
  });

  test("reclaims a stale legacy running log using its started time", async () => {
    const db = await seedRetryRun({
      firstLog: {
        status: "running",
        startedAt: "2026-07-26T12:00:00.000Z",
        progress: undefined,
      },
    });
    const workflowService = new WorkflowService(db);
    const claimed = await workflowService.claimStepLease(
      "run",
      0,
      1,
      new Date("2026-07-26T12:16:00.000Z"),
    );

    expect(claimed?.[0]).toMatchObject({
      status: "running",
      startedAt: "2026-07-26T12:16:00.000Z",
      progress: {
        phase: "preparing",
        attempt: 1,
        maxAttempts: 3,
        leaseStartedAt: "2026-07-26T12:16:00.000Z",
      },
    });
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

  test("does not let a stale lower-attempt message claim a due retry", async () => {
    const db = await seedRetryRun({
      firstLog: {
        status: "retrying",
        progress: {
          phase: "retrying",
          message: "Retrying after a temporary provider error",
          attempt: 2,
          maxAttempts: 3,
          nextRetryAt: new Date(Date.now() - 60_000).toISOString(),
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

    await service.executeStep("run", 0, buildQueueEnv(sent), { attempt: 1 });

    const afterStale = await readRun(db);
    expect(calls).toBe(0);
    expect(afterStale.logs[0]?.status).toBe("retrying");
    expect(afterStale.logs[0]?.progress?.attempt).toBe(2);
    expect(afterStale.run?.status).toBe("running");
    expect(sent).toEqual([
      {
        body: { workflowRunId: "run", stepIndex: 0, attempt: 2 },
        options: undefined,
      },
    ]);

    await service.executeStep("run", 0, buildQueueEnv(sent), { attempt: 2 });

    expect(calls).toBe(1);
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

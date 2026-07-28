import {
  afterEach,
  describe,
  expect,
  test,
} from "bun:test";
import { eq } from "drizzle-orm";

import * as dbSchema from "../../worker/db/schema";
import type {
  WorkflowResearchRecord,
} from "../../worker/lib/workflow-runtime";
import {
  WorkflowAiResearchService,
  type WorkflowAiResearchConfig,
  type WorkflowResearchPhaseReporter,
} from "../../worker/services/workflow-ai-research-service";
import { WorkflowExecutionService } from "../../worker/services/workflow-execution-service";
import type { StepLog } from "../../worker/services/workflow-service";
import type { AppEnv } from "../../worker/types";
import {
  restoreRealTime,
  setFixedTime,
} from "../support/fixed-time";
import {
  seedWorkflowContactScenario,
  seedWorkflowDefinition,
  WORKFLOW_FIXTURE_IDS,
  type WorkflowFixtureStep,
} from "../support/fixtures";
import {
  createFakeQueue,
  type CapturedQueueMessage,
  type FakeQueue,
} from "../support/fake-queue";
import {
  installHttpCapture,
  type HttpCapture,
} from "../support/http-capture";
import {
  createTestDb,
  type TestDatabase,
} from "../support/test-db";

interface WorkflowQueueBody {
  workflowRunId: string;
  stepIndex: number;
  attempt?: number;
  remainingDelay?: number;
}

const CONDITION_SECRET = "workflow-condition-secret";
const EMAIL_SECRET = "workflow-email-secret";
const WEBHOOK_SECRET = "workflow-header-secret";

const FULL_WORKFLOW_STEPS: WorkflowFixtureStep[] = [
  {
    id: "step-condition",
    sortOrder: 0,
    type: "condition",
    config: {
      field: "contact.company",
      operator: "equals",
      value: "Northstar Oy",
    },
  },
  {
    id: "step-tag",
    sortOrder: 1,
    type: "add_tag",
    config: {
      tagId: WORKFLOW_FIXTURE_IDS.tag,
      tagName: "Qualified",
    },
  },
  {
    id: "step-email",
    sortOrder: 2,
    type: "send_email",
    config: {
      inputs: [
        {
          key: "deliveryToken",
          source: {
            kind: "literal",
            value: EMAIL_SECRET,
          },
        },
      ],
      toList: [
        "{{contact.email}}",
        "ops@acme.example",
        "ops@acme.example",
      ],
      subject: "Booking {{booking.id}}: {{contact.name}}",
      body:
        "Hello {{contact.name}}\n" +
        "Booking {{booking.id}} for {{contact.company}}.\n" +
        "Delivery token: {{input.deliveryToken}}",
    },
  },
  {
    id: "step-webhook",
    sortOrder: 3,
    type: "webhook",
    config: {
      url:
        "https://hooks.example.test/bookings/{{booking.id}}" +
        "?api_key={{input.webhookToken}}",
      method: "POST",
      inputs: [
        {
          key: "webhookToken",
          source: {
            kind: "literal",
            value: WEBHOOK_SECRET,
          },
        },
      ],
      headers: JSON.stringify({
        Authorization: "Bearer {{input.webhookToken}}",
        "X-Contact": "{{contact.email}}",
      }),
      body: JSON.stringify({
        bookingId: "{{booking.id}}",
        contactId: "{{contact.id}}",
        email: "{{contact.email}}",
        credential: "{{input.webhookToken}}",
      }),
    },
  },
  {
    id: "step-update",
    sortOrder: 4,
    type: "update_contact",
    config: {
      field: "notes",
      value:
        "Booking {{booking.id}} processed for {{contact.name}}",
    },
  },
];

function fullWorkflowStepsWithSensitiveCondition(): WorkflowFixtureStep[] {
  return FULL_WORKFLOW_STEPS.map(function addSensitiveConditionInput(step) {
    if (step.id !== "step-condition") return step;
    return {
      ...step,
      config: {
        inputs: [
          {
            key: "conditionSecret",
            source: {
              kind: "literal",
              value: CONDITION_SECRET,
            },
          },
        ],
        field: "input.conditionSecret",
        operator: "equals",
        value: CONDITION_SECRET,
      },
    };
  });
}

const RESEARCH_RECORD: WorkflowResearchRecord = {
  resultKey: "research-northstar",
  provider: "chatgpt",
  model: "deterministic-test-model",
  executedAt: "2026-03-23T12:00:00.000Z",
  result: {
    summary: "Northstar builds scheduling software for clinics.",
    company: "Northstar Oy",
    role: "Operations Lead",
    website: "https://northstar.example",
    linkedinUrl: "https://linkedin.com/company/northstar-oy",
    location: "Helsinki, Finland",
    description: "Clinic scheduling infrastructure",
    companySize: "51-200",
    estimatedRevenue: "€10M-€25M",
    recommendedTags: ["healthtech", "qualified"],
    insights: ["Expanding across the Nordic region"],
    sources: [
      {
        title: "Northstar company profile",
        url: "https://northstar.example/about",
        snippet: "Scheduling infrastructure for clinics",
      },
    ],
  },
};

const EXPANDED_PROVIDER_PROMPT =
  "private-expanded-provider-instruction-7f19";

class DeterministicResearchService
  extends WorkflowAiResearchService {
  receivedPrompt = "";

  override async execute(
    config: WorkflowAiResearchConfig,
    _env: AppEnv,
    onPhase?: WorkflowResearchPhaseReporter,
  ): Promise<WorkflowResearchRecord> {
    this.receivedPrompt = config.prompt;
    await onPhase?.("researching");
    await onPhase?.("normalizing");
    return {
      ...RESEARCH_RECORD,
      prompt: EXPANDED_PROVIDER_PROMPT,
    } as WorkflowResearchRecord;
  }
}

afterEach(function restoreClock() {
  restoreRealTime();
});

function makeTestEnv(queue: FakeQueue<WorkflowQueueBody>): AppEnv {
  return {
    WORKFLOW_QUEUE: queue.binding,
    RESEND_API_KEY: "resend-workflow-api-key",
    OPENAI_API_KEY: "openai-workflow-api-key",
    GOOGLE_GENERATIVE_AI_API_KEY: "gemini-workflow-api-key",
  } as AppEnv;
}

function triggerContext(): {
  projectId: string;
  contactId: string;
  bookingId: string;
} {
  return {
    projectId: WORKFLOW_FIXTURE_IDS.project,
    contactId: WORKFLOW_FIXTURE_IDS.contact,
    bookingId: WORKFLOW_FIXTURE_IDS.booking,
  };
}

async function drainMessage(
  service: WorkflowExecutionService,
  env: AppEnv,
  message: CapturedQueueMessage<WorkflowQueueBody>,
): Promise<void> {
  const body = message.body;
  if (body.remainingDelay !== undefined) {
    await service.continueWait(
      body.workflowRunId,
      body.stepIndex,
      body.remainingDelay,
      env,
    );
    return;
  }
  await service.executeStep(
    body.workflowRunId,
    body.stepIndex,
    env,
    { attempt: body.attempt },
  );
}

async function drainAll(
  queue: FakeQueue<WorkflowQueueBody>,
  service: WorkflowExecutionService,
  env: AppEnv,
): Promise<void> {
  let deliveries = 0;
  while (queue.messages.length > 0) {
    deliveries += 1;
    if (deliveries > 30) {
      throw new Error("Workflow queue did not settle");
    }
    await queue.drainNext(async function execute(message) {
      await drainMessage(service, env, message);
    });
  }
}

async function getRun(
  testDatabase: TestDatabase,
  workflowRunId: string,
): Promise<dbSchema.WorkflowRunRow> {
  const [run] = await testDatabase.db
    .select()
    .from(dbSchema.workflowRuns)
    .where(eq(dbSchema.workflowRuns.id, workflowRunId));
  if (!run) throw new Error(`Missing workflow run ${workflowRunId}`);
  return run;
}

function stepLogs(run: dbSchema.WorkflowRunRow): StepLog[] {
  return (run.stepLogs ?? []) as StepLog[];
}

function installSuccessfulWorkflowHttp(): HttpCapture {
  return installHttpCapture([
    {
      method: "POST",
      matches: function matchesResend(url) {
        return url.toString() === "https://api.resend.com/emails";
      },
      respond: function respondResend() {
        return new Response(JSON.stringify({ id: "email-workflow-1" }), {
          status: 200,
        });
      },
    },
    {
      method: "POST",
      matches: function matchesWebhook(url) {
        return url.toString() ===
          "https://hooks.example.test/bookings/booking-northstar" +
            `?api_key=${WEBHOOK_SECRET}`;
      },
      respond: function respondWebhook() {
        return new Response(null, { status: 204 });
      },
    },
  ]);
}

describe("workflow execution journeys", () => {
  test("booking workflow persists mutations and sends exact email and webhook payloads", async () => {
    setFixedTime("2026-03-23T12:00:00.000Z");
    const testDatabase = createTestDb();
    await seedWorkflowContactScenario(testDatabase.db);
    await seedWorkflowDefinition(testDatabase.db, {
      id: "workflow-booking",
      name: "Booking qualification",
      steps: fullWorkflowStepsWithSensitiveCondition(),
    });
    const queue = createFakeQueue<WorkflowQueueBody>();
    const env = makeTestEnv(queue);
    const service = new WorkflowExecutionService(testDatabase.db);
    const http = installSuccessfulWorkflowHttp();

    try {
      await service.dispatchTrigger(
        WORKFLOW_FIXTURE_IDS.project,
        "booking_created",
        triggerContext(),
        env,
      );
      expect(queue.messages).toHaveLength(1);
      const workflowRunId = queue.messages[0]!.body.workflowRunId;

      await drainAll(queue, service, env);

      const requests = http.requests;
      expect(requests).toHaveLength(2);
      const resend = requests.find(function isResend(request) {
        return request.url.hostname === "api.resend.com";
      })!;
      expect(resend.headers.get("Authorization")).toBe(
        "Bearer resend-workflow-api-key",
      );
      expect(resend.headers.get("Idempotency-Key")).toBe(
        `workflow-run/${workflowRunId}/step/2/send-email`,
      );
      expect(resend.json).toEqual({
        from: "LinkyCal <noreply@updates.linkycal.com>",
        to: [
          "hanna@northstar.example",
          "ops@acme.example",
        ],
        subject: "Booking booking-northstar: Hanna Guest",
        html:
          "Hello Hanna Guest<br>" +
          "Booking booking-northstar for Northstar Oy.<br>" +
          `Delivery token: ${EMAIL_SECRET}`,
      });

      const webhook = requests.find(function isWebhook(request) {
        return request.url.hostname === "hooks.example.test";
      })!;
      expect(webhook.method).toBe("POST");
      expect(webhook.url.toString()).toBe(
        "https://hooks.example.test/bookings/booking-northstar" +
          `?api_key=${WEBHOOK_SECRET}`,
      );
      expect(webhook.headers.get("Authorization")).toBe(
        "Bearer workflow-header-secret",
      );
      expect(webhook.headers.get("X-Contact")).toBe(
        "hanna@northstar.example",
      );
      expect(webhook.json).toEqual({
        bookingId: "booking-northstar",
        contactId: "contact-hanna",
        email: "hanna@northstar.example",
        credential: WEBHOOK_SECRET,
      });

      const [contact] = await testDatabase.db
        .select()
        .from(dbSchema.contacts)
        .where(eq(
          dbSchema.contacts.id,
          WORKFLOW_FIXTURE_IDS.contact,
        ));
      expect({
        company: contact!.company,
        notes: contact!.notes,
      }).toEqual({
        company: "Northstar Oy",
        notes:
          "Booking booking-northstar processed for Hanna Guest",
      });
      const assignments = await testDatabase.db
        .select()
        .from(dbSchema.contactTags);
      expect(assignments).toEqual([
        {
          contactId: WORKFLOW_FIXTURE_IDS.contact,
          tagId: WORKFLOW_FIXTURE_IDS.tag,
        },
      ]);

      const run = await getRun(testDatabase, workflowRunId);
      expect(run.status).toBe("completed");
      const logs = stepLogs(run);
      expect(logs.map(function status(log) {
        return log.status;
      })).toEqual([
        "completed",
        "completed",
        "completed",
        "completed",
        "completed",
      ]);
      expect(logs[0]!.input).toMatchObject({
        field: "input.conditionSecret",
        operator: "equals",
        value: "[redacted]",
        actual: "[redacted]",
      });
      expect(logs[0]!.output).toEqual({
        continued: true,
        passed: true,
      });
      expect(logs[2]!.input).toMatchObject({
        recipients: [
          "hanna@northstar.example",
          "ops@acme.example",
        ],
        subject: "Booking booking-northstar: Hanna Guest",
        body:
          "Hello Hanna Guest\n" +
          "Booking booking-northstar for Northstar Oy.\n" +
          "Delivery token: [redacted]",
      });
      expect(logs[2]!.output).toEqual({
        continued: true,
        sent: true,
        recipientCount: 2,
      });
      expect(logs[3]!.input).toMatchObject({
        url:
          "https://hooks.example.test/bookings/booking-northstar" +
          "?api_key=[redacted]",
        method: "POST",
        body: JSON.stringify({
          bookingId: "booking-northstar",
          contactId: "contact-hanna",
          email: "hanna@northstar.example",
          credential: "[redacted]",
        }),
      });
      expect(logs[3]!.output).toEqual({
        continued: true,
        status: 204,
        ok: true,
      });
      const persistedRun = JSON.stringify(run);
      expect(persistedRun).not.toContain(CONDITION_SECRET);
      expect(persistedRun).not.toContain(EMAIL_SECRET);
      expect(persistedRun).not.toContain(WEBHOOK_SECRET);
    } finally {
      http.restore();
      testDatabase.close();
    }
  });

  test("false condition stops every later mutation and delivery", async () => {
    setFixedTime("2026-03-23T12:00:00.000Z");
    const testDatabase = createTestDb();
    await seedWorkflowContactScenario(testDatabase.db, {
      company: "Unqualified GmbH",
    });
    await seedWorkflowDefinition(testDatabase.db, {
      id: "workflow-stopped",
      name: "Stopped booking qualification",
      steps: FULL_WORKFLOW_STEPS,
    });
    const queue = createFakeQueue<WorkflowQueueBody>();
    const env = makeTestEnv(queue);
    const service = new WorkflowExecutionService(testDatabase.db);
    const http = installHttpCapture([]);

    try {
      await service.dispatchTrigger(
        WORKFLOW_FIXTURE_IDS.project,
        "booking_created",
        triggerContext(),
        env,
      );
      const workflowRunId = queue.messages[0]!.body.workflowRunId;
      await drainAll(queue, service, env);

      expect(http.requests).toEqual([]);
      expect(
        await testDatabase.db.select().from(dbSchema.contactTags),
      ).toEqual([]);
      const [contact] = await testDatabase.db
        .select()
        .from(dbSchema.contacts)
        .where(eq(
          dbSchema.contacts.id,
          WORKFLOW_FIXTURE_IDS.contact,
        ));
      expect({
        company: contact!.company,
        notes: contact!.notes,
      }).toEqual({
        company: "Unqualified GmbH",
        notes: "Initial note",
      });

      const run = await getRun(testDatabase, workflowRunId);
      expect(run.status).toBe("completed");
      const logs = stepLogs(run);
      expect(logs[0]!.output).toEqual({
        continued: false,
        passed: false,
      });
      expect(logs.slice(1).map(function status(log) {
        return log.status;
      })).toEqual([
        "skipped",
        "skipped",
        "skipped",
        "skipped",
      ]);
    } finally {
      http.restore();
      testDatabase.close();
    }
  });

  test("wait delays the continuation and mutates only after delivery", async () => {
    setFixedTime("2026-03-23T12:00:00.000Z");
    const testDatabase = createTestDb();
    await seedWorkflowContactScenario(testDatabase.db);
    await seedWorkflowDefinition(testDatabase.db, {
      id: "workflow-wait",
      name: "Delayed follow-up",
      trigger: "manual",
      steps: [
        {
          id: "wait-15-minutes",
          sortOrder: 0,
          type: "wait",
          config: { duration: 15, unit: "minutes" },
        },
        {
          id: "write-follow-up",
          sortOrder: 1,
          type: "update_contact",
          config: {
            field: "notes",
            value: "Follow-up due",
          },
        },
      ],
    });
    const queue = createFakeQueue<WorkflowQueueBody>();
    const env = makeTestEnv(queue);
    const service = new WorkflowExecutionService(testDatabase.db);

    try {
      const workflowRunId = await service.dispatchTestRun(
        "workflow-wait",
        triggerContext(),
        env,
      );
      expect(workflowRunId).not.toBeNull();
      await queue.drainNext(async function drainWait(message) {
        await drainMessage(service, env, message);
      });

      expect(queue.messages).toEqual([
        {
          body: {
            workflowRunId,
            stepIndex: 1,
          },
          delaySeconds: 900,
        },
      ]);
      const [beforeContinuation] = await testDatabase.db
        .select()
        .from(dbSchema.contacts)
        .where(eq(
          dbSchema.contacts.id,
          WORKFLOW_FIXTURE_IDS.contact,
        ));
      expect(beforeContinuation!.notes).toBe("Initial note");

      await queue.drainNext(async function drainContinuation(message) {
        await drainMessage(service, env, message);
      });
      const [afterContinuation] = await testDatabase.db
        .select()
        .from(dbSchema.contacts)
        .where(eq(
          dbSchema.contacts.id,
          WORKFLOW_FIXTURE_IDS.contact,
        ));
      expect(afterContinuation!.notes).toBe("Follow-up due");
      expect(
        (await getRun(testDatabase, workflowRunId!)).status,
      ).toBe("completed");
      expect(queue.messages).toEqual([]);
      await expect(
        queue.drainNext(async function noMessage() {}),
      ).rejects.toThrow("Cannot drain an empty fake queue");
    } finally {
      testDatabase.close();
    }
  });

  test("AI research persists public evidence and never stores expanded provider instructions", async () => {
    setFixedTime("2026-03-23T12:00:00.000Z");
    const testDatabase = createTestDb();
    await seedWorkflowContactScenario(testDatabase.db);
    await seedWorkflowDefinition(testDatabase.db, {
      id: "workflow-research",
      name: "Research contact",
      trigger: "manual",
      steps: [
        {
          id: "research-contact",
          sortOrder: 0,
          type: "ai_research",
          config: {
            provider: "chatgpt",
            resultKey: "research-northstar",
            prompt: "Research {{contact.email}} using public sources",
          },
        },
      ],
    });
    const queue = createFakeQueue<WorkflowQueueBody>();
    const env = makeTestEnv(queue);
    const researchService = new DeterministicResearchService();
    const service = new WorkflowExecutionService(testDatabase.db, {
      workflowAiResearchService: researchService,
    });

    try {
      const workflowRunId = await service.dispatchTestRun(
        "workflow-research",
        triggerContext(),
        env,
      );
      await drainAll(queue, service, env);

      expect(researchService.receivedPrompt).toBe(
        "Research hanna@northstar.example using public sources",
      );
      const [contact] = await testDatabase.db
        .select()
        .from(dbSchema.contacts)
        .where(eq(
          dbSchema.contacts.id,
          WORKFLOW_FIXTURE_IDS.contact,
        ));
      expect({
        company: contact!.company,
        companyWebsite: contact!.companyWebsite,
        position: contact!.position,
        companySize: contact!.companySize,
        estimatedRevenue: contact!.estimatedRevenue,
        linkedinUrl: contact!.linkedinUrl,
        notes: contact!.notes,
      }).toEqual({
        company: "Northstar Oy",
        companyWebsite: "https://northstar.example",
        position: "Operations Lead",
        companySize: "51-200",
        estimatedRevenue: "€10M-€25M",
        linkedinUrl:
          "https://linkedin.com/company/northstar-oy",
        notes:
          "Initial note\n\n" +
          "— Research summary (2026-03-23) —\n" +
          "Northstar builds scheduling software for clinics.",
      });
      expect(contact!.metadata).toEqual({
        workflow: {
          research: {
            latest: RESEARCH_RECORD,
            byKey: {
              "research-northstar": RESEARCH_RECORD,
            },
          },
        },
      });

      const [activity] = await testDatabase.db
        .select()
        .from(dbSchema.contactActivity)
        .where(eq(
          dbSchema.contactActivity.type,
          "workflow_researched",
        ));
      expect(activity!.metadata).toEqual({
        resultKey: "research-northstar",
        summary:
          "Northstar builds scheduling software for clinics.",
        sourceCount: 1,
        research: RESEARCH_RECORD,
      });

      const run = await getRun(testDatabase, workflowRunId!);
      expect(run.status).toBe("completed");
      expect(stepLogs(run)[0]!.output).toMatchObject({
        continued: true,
        summary:
          "Northstar builds scheduling software for clinics.",
        company: "Northstar Oy",
        role: "Operations Lead",
        location: "Helsinki, Finland",
        sources: RESEARCH_RECORD.result.sources,
      });
      const persisted = JSON.stringify({
        contact,
        activity,
        run,
      });
      expect(persisted).not.toContain(EXPANDED_PROVIDER_PROMPT);
      expect(persisted).not.toContain("openai-workflow-api-key");
      expect(persisted).not.toContain("gemini-workflow-api-key");
    } finally {
      testDatabase.close();
    }
  });

  test("replayed email delivery produces one logical message with one stable key", async () => {
    setFixedTime("2026-03-23T12:00:00.000Z");
    const testDatabase = createTestDb();
    await seedWorkflowContactScenario(testDatabase.db);
    await seedWorkflowDefinition(testDatabase.db, {
      id: "workflow-email-replay",
      name: "Replay-safe email",
      trigger: "manual",
      steps: [
        {
          id: "replay-email",
          sortOrder: 0,
          type: "send_email",
          config: {
            toList: ["{{contact.email}}"],
            subject: "Follow up with {{contact.name}}",
            body: "Booking {{booking.id}} is ready.",
          },
        },
        {
          id: "after-replay-email",
          sortOrder: 1,
          type: "update_contact",
          config: {
            field: "notes",
            value: "Replay-safe follow-up sent",
          },
        },
      ],
    });
    const queue = createFakeQueue<WorkflowQueueBody>();
    const env = makeTestEnv(queue);
    const service = new WorkflowExecutionService(testDatabase.db);
    const http = installHttpCapture([
      {
        method: "POST",
        matches: function matchesResend(url) {
          return url.toString() === "https://api.resend.com/emails";
        },
        respond: function respondResend() {
          return new Response(JSON.stringify({ id: "email-replay" }));
        },
      },
    ]);

    try {
      const workflowRunId = await service.dispatchTestRun(
        "workflow-email-replay",
        triggerContext(),
        env,
      );
      const originalDelivery = queue.messages[0]!;
      await queue.drainNext(async function firstDelivery(message) {
        await drainMessage(service, env, message);
      });
      await drainMessage(service, env, originalDelivery);
      await drainMessage(service, env, originalDelivery);
      await drainAll(queue, service, env);

      const resendRequests = http.requestsFor(
        "POST",
        "/emails",
      );
      expect(resendRequests).toHaveLength(1);
      expect(resendRequests[0]!.headers.get("Idempotency-Key")).toBe(
        `workflow-run/${workflowRunId}/step/0/send-email`,
      );
      expect(resendRequests[0]!.json).toEqual({
        from: "LinkyCal <noreply@updates.linkycal.com>",
        to: ["hanna@northstar.example"],
        subject: "Follow up with Hanna Guest",
        html: "Booking booking-northstar is ready.",
      });
      expect(
        (await getRun(testDatabase, workflowRunId!)).status,
      ).toBe("completed");
      const [contact] = await testDatabase.db
        .select()
        .from(dbSchema.contacts)
        .where(eq(
          dbSchema.contacts.id,
          WORKFLOW_FIXTURE_IDS.contact,
        ));
      expect(contact!.notes).toBe("Replay-safe follow-up sent");
      expect(queue.messages).toEqual([]);
    } finally {
      http.restore();
      testDatabase.close();
    }
  });

  test("permanent webhook failure stops later steps and persists no provider secrets", async () => {
    setFixedTime("2026-03-23T12:00:00.000Z");
    const testDatabase = createTestDb();
    await seedWorkflowContactScenario(testDatabase.db);
    await seedWorkflowDefinition(testDatabase.db, {
      id: "workflow-webhook-failure",
      name: "Failing webhook",
      trigger: "manual",
      steps: [
        {
          id: "failing-webhook",
          sortOrder: 0,
          type: "webhook",
          config: {
            url: "https://hooks.example.test/failure",
            method: "POST",
            inputs: [
              {
                key: "webhookToken",
                source: {
                  kind: "literal",
                  value: "configured-authorization-secret",
                },
              },
            ],
            headers: JSON.stringify({
              Authorization: "Bearer {{input.webhookToken}}",
            }),
            body: JSON.stringify({
              bookingId: "{{booking.id}}",
            }),
          },
        },
        {
          id: "must-not-run",
          sortOrder: 1,
          type: "update_contact",
          config: {
            field: "notes",
            value: "This must never persist",
          },
        },
      ],
    });
    const queue = createFakeQueue<WorkflowQueueBody>();
    const env = makeTestEnv(queue);
    const service = new WorkflowExecutionService(testDatabase.db);
    const http = installHttpCapture([
      {
        method: "POST",
        matches: function matchesWebhook(url) {
          return url.toString() ===
            "https://hooks.example.test/failure";
        },
        respond: function respondFailure() {
          return new Response(
            "provider-secret-body",
            {
              status: 400,
              statusText: "Bad Request",
            },
          );
        },
      },
    ]);

    try {
      const workflowRunId = await service.dispatchTestRun(
        "workflow-webhook-failure",
        triggerContext(),
        env,
      );
      await drainAll(queue, service, env);

      expect(http.requests).toHaveLength(1);
      expect(
        http.requests[0]!.headers.get("Authorization"),
      ).toBe("Bearer configured-authorization-secret");
      const [contact] = await testDatabase.db
        .select()
        .from(dbSchema.contacts)
        .where(eq(
          dbSchema.contacts.id,
          WORKFLOW_FIXTURE_IDS.contact,
        ));
      expect(contact!.notes).toBe("Initial note");

      const run = await getRun(testDatabase, workflowRunId!);
      expect({
        status: run.status,
        error: run.error,
        stepStatuses: stepLogs(run).map(function status(log) {
          return log.status;
        }),
      }).toEqual({
        status: "failed",
        error: "Provider request was invalid",
        stepStatuses: ["failed", "skipped"],
      });
      const persisted = JSON.stringify({
        run,
        contact,
        activity: await testDatabase.db
          .select()
          .from(dbSchema.contactActivity),
      });
      expect(persisted).not.toContain("provider-secret-body");
      expect(persisted).not.toContain(
        "configured-authorization-secret",
      );
      expect(persisted).not.toContain("resend-workflow-api-key");
      expect(persisted).not.toContain("openai-workflow-api-key");
      expect(queue.messages).toEqual([]);
    } finally {
      http.restore();
      testDatabase.close();
    }
  });
});

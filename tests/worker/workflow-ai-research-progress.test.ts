import { createElement } from "react";
import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";

import { WorkflowStepLog } from "../../src/components/WorkflowStepLog";
import * as dbSchema from "../../worker/db/schema";
import type {
  WorkflowResearchRecord,
  WorkflowResearchResult,
} from "../../worker/lib/workflow-runtime";
import {
  WorkflowAiResearchService,
  type WorkflowResearchPhaseReporter,
} from "../../worker/services/workflow-ai-research-service";
import { WorkflowExecutionService } from "../../worker/services/workflow-execution-service";
import { WorkflowService, type StepLog } from "../../worker/services/workflow-service";
import type { AppEnv } from "../../worker/types";
import { createTestDb } from "./mcp-test-db";

type GenerateTextRunner = typeof import("ai").generateText;

const STRUCTURED_RESULT: WorkflowResearchResult = {
  summary: "Public research summary",
  company: "Acme",
  role: "Operations lead",
  website: "https://acme.example",
  linkedinUrl: "https://linkedin.example/in/jane",
  location: "Seoul",
  description: "Operations software",
  companySize: "51-200",
  estimatedRevenue: "$10M-$50M",
  recommendedTags: ["qualified"],
  insights: ["Recently expanded operations"],
  sources: [
    {
      title: "Acme company profile",
      url: "https://acme.example/about",
      snippet: "Acme builds operations software.",
    },
  ],
};

function buildEnv(): AppEnv {
  return {
    OPENAI_API_KEY: "test-openai-key",
    GOOGLE_GENERATIVE_AI_API_KEY: "test-google-key",
  } as AppEnv;
}

function buildChatGptRunner(events: string[]): GenerateTextRunner {
  async function fakeGenerate() {
    events.push("provider");
    return {
      get output() {
        events.push("record");
        return STRUCTURED_RESULT;
      },
      sources: [],
    };
  }

  return fakeGenerate as unknown as GenerateTextRunner;
}

function buildGeminiRunner(events: string[]): GenerateTextRunner {
  let callCount = 0;

  async function fakeGenerate() {
    callCount += 1;
    events.push("provider");
    if (callCount === 1) {
      return {
        text: "Grounded public research notes",
        sources: [
          {
            type: "url",
            id: "source-1",
            url: "https://acme.example/about",
            title: "Acme company profile",
          },
        ],
      };
    }
    return {
      output: STRUCTURED_RESULT,
      sources: [],
    };
  }

  return fakeGenerate as unknown as GenerateTextRunner;
}

async function seedAiResearchRun() {
  const db = createTestDb();
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
    email: "jane@acme.example",
  });
  await db.insert(dbSchema.workflows).values({
    id: "workflow",
    projectId: "project",
    name: "Research workflow",
    trigger: "manual",
    status: "active",
  });
  await db.insert(dbSchema.workflowSteps).values({
    id: "research-step",
    workflowId: "workflow",
    sortOrder: 0,
    type: "ai_research",
    config: {
      provider: "chatgpt",
      resultKey: "lead",
      prompt: "Research {{input.email}}",
      inputs: [
        {
          key: "email",
          source: { kind: "path", path: "contact.email" },
        },
      ],
    },
  });
  await db.insert(dbSchema.workflowRuns).values({
    id: "run",
    workflowId: "workflow",
    status: "running",
    context: JSON.stringify({
      projectId: "project",
      contactId: "contact",
    }),
    stepLogs: [
      {
        stepIndex: 0,
        stepType: "ai_research",
        stepLabel: "AI Research",
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
          maxAttempts: 1,
        },
      },
    ],
  });
  return db;
}

describe("WorkflowAiResearchService progress", () => {
  test("reports ChatGPT phases only at the grounded request and record boundaries", async () => {
    const events: string[] = [];
    const service = new WorkflowAiResearchService(buildChatGptRunner(events));

    await service.execute(
      {
        provider: "chatgpt",
        prompt: "Research Jane",
        resultKey: "lead",
      },
      buildEnv(),
      async (phase) => {
        events.push(phase);
      },
    );

    expect(events).toEqual([
      "researching",
      "provider",
      "normalizing",
      "record",
    ]);
  });

  test("reports Gemini normalizing between its grounded and structuring passes", async () => {
    const events: string[] = [];
    const service = new WorkflowAiResearchService(buildGeminiRunner(events));

    await service.execute(
      {
        provider: "gemini",
        prompt: "Research Jane",
        resultKey: "lead",
      },
      buildEnv(),
      async (phase) => {
        events.push(phase);
      },
    );

    expect(events).toEqual([
      "researching",
      "provider",
      "normalizing",
      "provider",
    ]);
  });
});

describe("WorkflowExecutionService AI research progress", () => {
  test("persists honest phases and reports saving before updating the contact", async () => {
    const db = await seedAiResearchRun();
    const workflowService = new WorkflowService(db);
    const service = new WorkflowExecutionService(db);
    const observedProgress: NonNullable<StepLog["progress"]>[] = [];
    let progressAtContactUpdate: StepLog["progress"];

    const record: WorkflowResearchRecord = {
      provider: "chatgpt",
      model: "gpt-5.2",
      resultKey: "lead",
      prompt: "Research jane@acme.example",
      executedAt: "2026-07-26T10:00:00.000Z",
      result: STRUCTURED_RESULT,
    };
    const fakeResearchService = {
      async execute(
        _config: unknown,
        _env: AppEnv,
        onPhase?: WorkflowResearchPhaseReporter,
      ): Promise<WorkflowResearchRecord> {
        if (onPhase) {
          await onPhase("researching");
          const researchingLogs = await workflowService.getStepLogs("run");
          if (researchingLogs[0]?.progress) {
            observedProgress.push(researchingLogs[0].progress);
          }
          await onPhase("normalizing");
          const normalizingLogs = await workflowService.getStepLogs("run");
          if (normalizingLogs[0]?.progress) {
            observedProgress.push(normalizingLogs[0].progress);
          }
        }
        return record;
      },
    };

    type ExecutionServiceInternals = {
      workflowAiResearchService: typeof fakeResearchService;
      contactService: {
        update: (
          contactId: string,
          data: Record<string, unknown>,
        ) => Promise<unknown>;
      };
    };
    const internals = service as unknown as ExecutionServiceInternals;
    internals.workflowAiResearchService = fakeResearchService;
    const updateContact = internals.contactService.update.bind(
      internals.contactService,
    );
    internals.contactService.update = async function update(
      contactId,
      data,
    ) {
      const logs = await workflowService.getStepLogs("run");
      progressAtContactUpdate = logs[0]?.progress;
      return updateContact(contactId, data);
    };

    await service.executeStep("run", 0, buildEnv());

    const [run] = await db
      .select()
      .from(dbSchema.workflowRuns)
      .where(eq(dbSchema.workflowRuns.id, "run"));
    const finalLogs = (run?.stepLogs ?? []) as StepLog[];
    const finalProgress = finalLogs[0]?.progress;

    expect(
      observedProgress.map(({ phase, message, attempt, maxAttempts }) => ({
        phase,
        message,
        attempt,
        maxAttempts,
      })),
    ).toEqual([
      {
        phase: "researching",
        message: "Researching public sources",
        attempt: 1,
        maxAttempts: 3,
      },
      {
        phase: "normalizing",
        message: "Structuring findings",
        attempt: 1,
        maxAttempts: 3,
      },
    ]);
    expect(progressAtContactUpdate).toMatchObject({
      phase: "saving",
      message: "Updating the contact",
      attempt: 1,
      maxAttempts: 3,
    });
    expect(finalProgress).toMatchObject({
      phase: "saving",
      message: "Updating the contact",
      attempt: 1,
      maxAttempts: 3,
    });
    expect(finalProgress?.leaseStartedAt).toBe(finalLogs[0]?.startedAt);
  });
});

describe("WorkflowStepLog AI research evidence", () => {
  test("separates supplied inputs, AI findings, and public sources", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowStepLog, {
        stepType: "ai_research",
        input: {
          resolvedInputs: {
            productActivity: "74 exact upstream events",
          },
          resultKey: "lead",
          finalPrompt: "Research Jane using public sources",
        },
        output: {
          summary: STRUCTURED_RESULT.summary,
          company: STRUCTURED_RESULT.company,
          role: STRUCTURED_RESULT.role,
          website: STRUCTURED_RESULT.website,
          location: STRUCTURED_RESULT.location,
          linkedinUrl: STRUCTURED_RESULT.linkedinUrl,
          insights: STRUCTURED_RESULT.insights,
          sources: STRUCTURED_RESULT.sources,
        },
        error: null,
      }),
    );

    const inputsIndex = html.indexOf(">Inputs<");
    const requestIndex = html.indexOf(">Research request<");
    const findingsIndex = html.indexOf(">AI findings<");
    const sourcesIndex = html.indexOf(">Public sources<");

    expect([
      inputsIndex >= 0,
      requestIndex > inputsIndex,
      findingsIndex > requestIndex,
      sourcesIndex > findingsIndex,
    ]).toEqual([true, true, true, true]);
    expect(html.slice(findingsIndex, sourcesIndex)).not.toContain(
      "74 exact upstream events",
    );
    expect(html.slice(findingsIndex, sourcesIndex)).toContain(
      "Recently expanded operations",
    );
    expect(html.slice(sourcesIndex)).toContain("https://acme.example/about");
  });
});

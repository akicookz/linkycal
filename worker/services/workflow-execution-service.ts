import { eq, and, lte, isNotNull, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as dbSchema from "../db/schema";
import {
  computeNextRunAt,
  parseWorkflowTriggerConfig,
  type WorkflowContactFilter,
} from "../lib/workflow-schedule";
import {
  buildWorkflowResearchActivityMetadata,
  buildWorkflowContactOperationalContext,
  formatContactsInputValue,
  interpolateWorkflowTemplate,
  mergeWorkflowResearchMetadata,
  normalizeRecipientList,
  resolveStepInputs,
  resolveWorkflowValue,
  workflowStepInputSchema,
  type WorkflowTriggerContext,
  type WorkflowResearchRecord,
} from "../lib/workflow-runtime";
import { enrichContactFromResearch, appendResearchSummaryToNotes } from "../lib/contact-enrich";
import {
  evaluateWorkflowCondition,
  parseWorkflowCondition,
} from "../lib/workflow-conditions";
import {
  isTransientWorkflowError,
  isWorkflowStepRetrySafe,
  MAX_WORKFLOW_ATTEMPTS,
  retryDelaySeconds,
  safeWorkflowErrorMessage,
  WORKFLOW_LEASE_MS,
  WorkflowFetchError,
} from "../lib/workflow-retry";
import type { AppEnv } from "../types";
import { WorkflowService, type StepLog } from "./workflow-service";
import {
  WorkflowAiResearchService,
  type WorkflowResearchPhase,
} from "./workflow-ai-research-service";
import { ContactService } from "./contact-service";
import { TagService } from "./tag-service";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TriggerContext = WorkflowTriggerContext;

export interface WorkflowExecutionDependencies {
  workflowAiResearchService?: WorkflowAiResearchService;
}

export interface WorkflowStepExecutionOptions {
  attempt?: number;
}

interface StepSnapshot {
  resolved: Record<string, unknown>;
  output: Record<string, unknown>;
  researchApplication?: {
    contactId: string;
    record: WorkflowResearchRecord;
  };
}

interface StepExecutionProgress {
  attempt: number;
  leaseStartedAt: string;
  stepIndex: number;
  workflowRunId: string;
  report(
    progress: NonNullable<StepLog["progress"]>,
  ): Promise<void>;
}

interface PersistLeasedFailureOptions {
  actionStarted: boolean;
}

type WorkflowTrigger = dbSchema.WorkflowRow["trigger"];

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_ADDRESS = "LinkyCal <noreply@updates.linkycal.com>";
const WEBHOOK_TIMEOUT_MS = 10_000;
const MAX_QUEUE_DELAY_SECONDS = 43_200;

class ContactUnavailableError extends Error {
  constructor() {
    super("Contact unavailable");
    this.name = "ContactUnavailableError";
  }
}

class StepLeaseLostError extends Error {
  constructor() {
    super("Workflow step lease lost");
    this.name = "StepLeaseLostError";
  }
}

class WorkflowPersistenceError extends Error {
  readonly cause: unknown;
  readonly transient = true;

  constructor(cause: unknown) {
    super("Workflow persistence temporarily unavailable");
    this.name = "WorkflowPersistenceError";
    this.cause = cause;
  }
}

class WorkflowProviderResponseError extends Error {
  readonly status: number;

  constructor(provider: string, status: number) {
    super(`${provider} request failed`);
    this.name = "WorkflowProviderResponseError";
    this.status = status;
  }
}

async function workflowFetch(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new WorkflowFetchError(error);
    }
    throw error;
  }
}

const STEP_LABELS: Record<string, string> = {
  send_email: "Send Email",
  ai_research: "AI Research",
  add_tag: "Add Tag",
  remove_tag: "Remove Tag",
  wait: "Wait",
  condition: "Condition",
  webhook: "Webhook",
  update_contact: "Update Contact",
};

// ─── Workflow Execution Service ──────────────────────────────────────────────
//
// LOOP PREVENTION CONTRACT:
// This service is called from two contexts:
// 1. HTTP request handlers call `dispatchTrigger()` via `waitUntil()`.
// 2. The queue consumer calls `executeStep()`.
//
// Step executors (add_tag, update_contact, etc.) call domain services directly
// (ContactService, etc.) — they NEVER call `dispatchTrigger()`. This ensures
// that actions taken by workflow steps cannot re-trigger other workflows,
// preventing infinite loops. Do NOT add dispatchTrigger calls inside step
// executors without adding explicit recursion guards.

export class WorkflowExecutionService {
  private workflowService: WorkflowService;
  private contactService: ContactService;
  private tagService: TagService;
  private workflowAiResearchService: WorkflowAiResearchService;

  constructor(
    private db: DrizzleD1Database<Record<string, unknown>>,
    dependencies: WorkflowExecutionDependencies = {},
  ) {
    this.workflowService = new WorkflowService(db);
    this.contactService = new ContactService(db);
    this.tagService = new TagService(db);
    this.workflowAiResearchService =
      dependencies.workflowAiResearchService ?? new WorkflowAiResearchService();
  }

  // ─── Trigger Dispatch ──────────────────────────────────────────────────

  async dispatchTrigger(
    projectId: string,
    trigger: WorkflowTrigger,
    context: TriggerContext,
    env: AppEnv,
  ): Promise<void> {
    try {
      // Find all active workflows for this project with matching trigger
      const workflows = await this.db
        .select()
        .from(dbSchema.workflows)
        .where(
          and(
            eq(dbSchema.workflows.projectId, projectId),
            eq(dbSchema.workflows.trigger, trigger),
            eq(dbSchema.workflows.status, "active"),
          ),
        );

      if (workflows.length === 0) return;

      for (const workflow of workflows) {
        // Check the workflow has at least one step
        const steps = await this.workflowService.listSteps(workflow.id);
        if (steps.length === 0) continue;

        await this.startRun(workflow.id, steps, context, env);
      }
    } catch (err) {
      console.error(`Workflow dispatch failed for trigger ${trigger}:`, err);
    }
  }

  // ─── Scheduled Dispatch ────────────────────────────────────────────────
  // Called from the cron handler. Fires every active scheduled workflow whose
  // nextRunAt has elapsed, fanning out to its configured contact audience.

  async dispatchScheduledWorkflows(env: AppEnv): Promise<number> {
    const now = new Date();
    const due = await this.db
      .select()
      .from(dbSchema.workflows)
      .where(
        and(
          eq(dbSchema.workflows.trigger, "scheduled"),
          eq(dbSchema.workflows.status, "active"),
          isNotNull(dbSchema.workflows.nextRunAt),
          lte(dbSchema.workflows.nextRunAt, now),
        ),
      );

    let started = 0;
    for (const workflow of due) {
      const config = parseWorkflowTriggerConfig(workflow.triggerConfig);

      // Advance the clock before dispatching so an overlapping cron
      // invocation can't fire the same occurrence twice.
      await this.db
        .update(dbSchema.workflows)
        .set({ nextRunAt: computeNextRunAt(config?.schedule ?? null, now) })
        .where(eq(dbSchema.workflows.id, workflow.id));

      try {
        started += await this.dispatchToFilteredContacts(
          workflow.id,
          workflow.projectId,
          config?.contactFilter ?? null,
          env,
        );
      } catch (err) {
        console.error(`Scheduled workflow ${workflow.id} dispatch failed:`, err);
      }
    }
    return started;
  }

  // ─── Contact Fan-Out ───────────────────────────────────────────────────
  // Starts one run per contact matching the filter. A null filter means a
  // single run with no contact context; empty tagIds means all contacts.

  async dispatchToFilteredContacts(
    workflowId: string,
    projectId: string,
    filter: WorkflowContactFilter | null,
    env: AppEnv,
  ): Promise<number> {
    const steps = await this.workflowService.listSteps(workflowId);
    if (steps.length === 0) return 0;

    if (!filter) {
      const runId = await this.startRun(workflowId, steps, { projectId }, env);
      return runId ? 1 : 0;
    }

    const tagIds = filter.tagIds.filter(Boolean);
    const contacts = await this.contactService.list(
      projectId,
      tagIds.length > 0
        ? { tagIds, matchAllTags: filter.matchAllTags }
        : undefined,
    );

    let started = 0;
    for (const contact of contacts) {
      const context: TriggerContext = {
        projectId,
        contactId: contact.id,
        contactEmail: contact.email ?? undefined,
        contactName: contact.name ?? undefined,
      };
      const runId = await this.startRun(workflowId, steps, context, env);
      if (runId) started++;
    }
    return started;
  }

  // ─── Test Run (specific workflow, no status/trigger filter) ─────────────

  async dispatchTestRun(
    workflowId: string,
    context: TriggerContext,
    env: AppEnv,
  ): Promise<string | null> {
    const steps = await this.workflowService.listSteps(workflowId);
    if (steps.length === 0) return null;

    return this.startRun(workflowId, steps, context, env);
  }

  // ─── Run Bootstrap ─────────────────────────────────────────────────────
  // Creates a run with pending step logs and enqueues its first step.

  private async startRun(
    workflowId: string,
    steps: dbSchema.WorkflowStepRow[],
    context: TriggerContext,
    env: AppEnv,
  ): Promise<string | null> {
    const run = await this.workflowService.createRun(
      workflowId,
      context.formResponseId ?? context.bookingId ?? context.contactId ?? undefined,
      serializeWorkflowContextForPersistence(context),
    );
    if (!run) return null;

    const pendingLogs: StepLog[] = steps.map((s, i) => ({
      stepIndex: i,
      stepType: s.type,
      stepLabel: STEP_LABELS[s.type] ?? s.type,
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
        maxAttempts: MAX_WORKFLOW_ATTEMPTS,
      },
    }));
    await this.workflowService.updateStepLogs(run.id, pendingLogs);

    await env.WORKFLOW_QUEUE.send({
      workflowRunId: run.id,
      stepIndex: 0,
    });
    return run.id;
  }

  // ─── Step Execution ────────────────────────────────────────────────────

  async executeStep(
    workflowRunId: string,
    stepIndex: number,
    env: AppEnv,
    options?: WorkflowStepExecutionOptions,
  ): Promise<void> {
    // Load the run
    const runs = await this.db
      .select()
      .from(dbSchema.workflowRuns)
      .where(eq(dbSchema.workflowRuns.id, workflowRunId))
      .limit(1);
    const run = runs[0];

    if (!run) {
      console.error(`Workflow run ${workflowRunId} not found`);
      return;
    }

    if (run.status !== "running") {
      return; // Already completed or failed
    }

    // Parse trigger context
    const context: TriggerContext = run.context
      ? JSON.parse(run.context)
      : {};

    // Load the workflow and its steps
    const full = await this.workflowService.getFullWorkflow(run.workflowId);
    if (!full) {
      await this.workflowService.failRun(workflowRunId, "Workflow not found");
      return;
    }

    // Get step at the requested index
    const step = full.steps[stepIndex];
    if (!step) {
      // No more steps — complete the run
      await this.workflowService.completeRun(workflowRunId);
      return;
    }

    let stepLogs = await this.workflowService.getStepLogs(workflowRunId);
    const attempt = options?.attempt ?? 1;
    const existingLog = stepLogs[stepIndex];
    if (existingLog?.status === "completed" || existingLog?.status === "skipped") {
      await this.enqueueNextOrComplete(run, full.steps, stepIndex, env, existingLog);
      return;
    }
    if (
      existingLog &&
      await this.repairPersistedRetryContinuation(
        workflowRunId,
        stepIndex,
        attempt,
        existingLog,
        env,
      )
    ) {
      return;
    }
    const config = (step.config ?? {}) as Record<string, unknown>;

    const claimedLogs = await this.workflowService.claimStepLease(
      workflowRunId,
      stepIndex,
      attempt,
      new Date(),
    );
    if (!claimedLogs) {
      await this.scheduleActiveLeaseRecovery(
        workflowRunId,
        stepIndex,
        attempt,
        step.type,
        config,
        env,
      );
      return;
    }
    stepLogs = claimedLogs;

    const claimedLog = stepLogs[stepIndex];
    const claimedProgress = claimedLog?.progress;
    const leaseStartedAt = claimedProgress?.leaseStartedAt;
    if (!claimedLog || !claimedProgress || !leaseStartedAt) {
      return;
    }
    const leaseToken = leaseStartedAt;
    const workflowService = this.workflowService;

    async function readCommittedStepLog(): Promise<StepLog | null> {
      const currentLogs = await workflowService.getStepLogs(workflowRunId);
      const currentLog = currentLogs[stepIndex];
      return currentLog?.status === "completed" ||
        currentLog?.status === "skipped"
        ? currentLog
        : null;
    }

    async function readConfirmedActionStartedLogs(): Promise<StepLog[] | null> {
      try {
        const currentLogs = await workflowService.getStepLogs(workflowRunId);
        const currentLog = currentLogs[stepIndex];
        return currentLog?.status === "running" &&
            currentLog.progress?.leaseStartedAt === leaseToken &&
            currentLog.progress.attempt === attempt &&
            currentLog.progress.actionStarted === true
          ? currentLogs
          : null;
      } catch {
        return null;
      }
    }

    async function persistLeasedFailure(
      err: unknown,
      options: PersistLeasedFailureOptions,
    ): Promise<StepLog | null> {
      const delaySeconds =
        (!options.actionStarted ||
          isWorkflowStepRetrySafe(step.type, config)) &&
        isTransientWorkflowError(err)
          ? retryDelaySeconds(attempt)
          : null;
      if (delaySeconds !== null && stepLogs[stepIndex]) {
        const nextRetryAt = new Date(
          Date.now() + delaySeconds * 1000,
        ).toISOString();
        stepLogs[stepIndex].status = "retrying";
        stepLogs[stepIndex].completedAt = null;
        stepLogs[stepIndex].output = null;
        stepLogs[stepIndex].error = null;
        stepLogs[stepIndex].progress = {
          phase: "retrying",
          message: "Retrying after a temporary provider error",
          attempt: attempt + 1,
          maxAttempts: MAX_WORKFLOW_ATTEMPTS,
          nextRetryAt,
        };
        const scheduled = await workflowService.updateStepLogsForLease(
          workflowRunId,
          stepIndex,
          leaseToken,
          stepLogs,
        );
        if (!scheduled) {
          return readCommittedStepLog();
        }
        await env.WORKFLOW_QUEUE.send(
          { workflowRunId, stepIndex, attempt: attempt + 1 },
          { delaySeconds },
        );
        return null;
      }

      const message = safeWorkflowErrorMessage(err);
      if (stepLogs[stepIndex]) {
        stepLogs[stepIndex].status = "failed";
        stepLogs[stepIndex].completedAt = new Date().toISOString();
        stepLogs[stepIndex].output = null;
        stepLogs[stepIndex].error = message;
      }
      for (let i = stepIndex + 1; i < stepLogs.length; i++) {
        if (stepLogs[i]) stepLogs[i].status = "skipped";
      }
      const failed = await workflowService.failStepLease(
        workflowRunId,
        stepIndex,
        leaseToken,
        stepLogs,
        message,
        new Date(),
      );
      if (!failed) {
        return readCommittedStepLog();
      }

      console.error(
        `Workflow step failed: run=${workflowRunId} step=${stepIndex} type=${step.type} message=${message}`,
      );
      return null;
    }

    let shouldSkipStep = false;
    try {
      await this.refreshContactContext(context);

      // Resolve per-step inputs into context.stepInputs so executors can
      // reference them via {{input.<key>}}. Each claimed attempt gets a fresh
      // resolution so step outputs accumulated in context propagate.
      context.stepInputs = resolveStepInputs(config.inputs, context);
      await this.resolveContactQueryInputs(config.inputs, context);

      // Distinct from the "condition" step type which halts the run. This
      // per-step gate skips only the current step.
      const stepGate = parseWorkflowCondition(step.condition);
      shouldSkipStep = Boolean(
        stepGate && !evaluateWorkflowCondition(stepGate, context),
      );
    } catch (err) {
      const committedLog = await persistLeasedFailure(err, {
        actionStarted: false,
      });
      if (committedLog) {
        await this.enqueueNextOrComplete(
          run,
          full.steps,
          stepIndex,
          env,
          committedLog,
        );
      }
      return;
    }

    if (shouldSkipStep) {
      claimedLog.status = "skipped";
      claimedLog.startedAt = null;
      claimedLog.completedAt = new Date().toISOString();
      claimedLog.output = { reason: "condition_not_met" };
      claimedLog.error = null;
      claimedLog.progress = existingLog?.progress;
      const finalized = await workflowService.finalizeStepLease(
        workflowRunId,
        stepIndex,
        leaseToken,
        stepLogs,
        serializeWorkflowContextForPersistence(context),
      );
      if (!finalized) {
        return;
      }
      await this.enqueueNextOrComplete(
        run,
        full.steps,
        stepIndex,
        env,
        claimedLog,
      );
      return;
    }

    // ── Step logging: attach resolved inputs to the claimed lease ──
    const loggedConfig = sanitizeWorkflowConfigForLog(
      config,
      context.stepInputs,
    );
    claimedLog.input = {
      config: loggedConfig,
      resolvedInputs: sanitizeResolvedWorkflowInputs(context.stepInputs),
    };
    const attachedInput = await workflowService.updateStepLogsForLease(
      workflowRunId,
      stepIndex,
      leaseToken,
      stepLogs,
    );
    if (!attachedInput) {
      return;
    }

    async function report(
      progress: NonNullable<StepLog["progress"]>,
    ): Promise<void> {
      const actionProgress = {
        ...progress,
        actionStarted: true,
      };
      if (stepLogs[stepIndex]) {
        stepLogs[stepIndex].progress = actionProgress;
      }
      const updated = await workflowService.updateStepProgressForLease(
        workflowRunId,
        stepIndex,
        leaseToken,
        actionProgress,
      );
      if (!updated) {
        throw new StepLeaseLostError();
      }
    }
    const executionProgress: StepExecutionProgress = {
      attempt,
      leaseStartedAt: leaseToken,
      stepIndex,
      workflowRunId,
      report,
    };

    const actionStartedProgress = {
      ...claimedProgress,
      actionStarted: true,
    };
    claimedLog.progress = actionStartedProgress;
    let markedActionStarted: boolean;
    try {
      markedActionStarted = await workflowService.updateStepProgressForLease(
        workflowRunId,
        stepIndex,
        leaseToken,
        actionStartedProgress,
      );
    } catch (err) {
      const confirmedLogs = await readConfirmedActionStartedLogs();
      if (!confirmedLogs) {
        throw err;
      }
      stepLogs = confirmedLogs;
      markedActionStarted = true;
    }
    if (!markedActionStarted) {
      return;
    }

    const snapshot: StepSnapshot = { resolved: {}, output: {} };
    let shouldContinue: boolean;
    try {
      shouldContinue = await this.executeStepAction(
        step.type,
        config,
        context,
        env,
        snapshot,
        executionProgress,
      );
    } catch (err) {
      // Handle wait step: re-enqueue with delay instead of failing.
      if (err instanceof WaitSignal) {
        // ── Step logging: mark wait as completed ──
        if (stepLogs[stepIndex]) {
          stepLogs[stepIndex].status = "completed";
          stepLogs[stepIndex].completedAt = new Date().toISOString();
          stepLogs[stepIndex].output = { waitSeconds: err.delaySeconds };
        }
        const finalized = await this.workflowService.finalizeStepLease(
          workflowRunId,
          stepIndex,
          leaseToken,
          stepLogs,
          serializeWorkflowContextForPersistence(context),
        );
        if (!finalized) {
          return;
        }

        const completedLog = stepLogs[stepIndex];
        if (completedLog) {
          await this.enqueueNextOrComplete(
            run,
            full.steps,
            stepIndex,
            env,
            completedLog,
          );
        }
        return;
      }

      const committedLog = await persistLeasedFailure(err, {
        actionStarted: true,
      });
      if (committedLog) {
        await this.enqueueNextOrComplete(
          run,
          full.steps,
          stepIndex,
          env,
          committedLog,
        );
      }
      return;
    }

    // Non-AI action retries end above: their persistence and continuation
    // failures must not replay a successful side effect. AI Research's leased
    // atomic finalization is caught separately below because the whole step has
    // an explicit safe-replay contract.
    const now = new Date().toISOString();
    if (stepLogs[stepIndex]) {
      stepLogs[stepIndex].status = "completed";
      stepLogs[stepIndex].completedAt = now;
      stepLogs[stepIndex].input = {
        config: loggedConfig,
        resolvedInputs: sanitizeResolvedWorkflowInputs(context.stepInputs),
        ...sanitizeWorkflowRecordForLog(
          snapshot.resolved,
          context.stepInputs,
        ),
      };
      stepLogs[stepIndex].output = {
        continued: shouldContinue,
        ...sanitizeWorkflowRecordForLog(
          snapshot.output,
          context.stepInputs,
        ),
      };
    }
    if (!shouldContinue) {
      for (let i = stepIndex + 1; i < stepLogs.length; i++) {
        if (stepLogs[i]) stepLogs[i].status = "skipped";
      }
    }
    let finalized: boolean;
    if (snapshot.researchApplication) {
      try {
        finalized = await this.finalizeAiResearchStepLease(
          workflowRunId,
          stepIndex,
          leaseToken,
          stepLogs,
          serializeWorkflowContextForPersistence(context),
          snapshot.researchApplication.contactId,
          snapshot.researchApplication.record,
        );
      } catch (err) {
        const committedLog = await persistLeasedFailure(err, {
          actionStarted: true,
        });
        if (committedLog) {
          await this.enqueueNextOrComplete(
            run,
            full.steps,
            stepIndex,
            env,
            committedLog,
          );
        }
        return;
      }
    } else {
      finalized = await this.workflowService.finalizeStepLease(
        workflowRunId,
        stepIndex,
        leaseToken,
        stepLogs,
        serializeWorkflowContextForPersistence(context),
      );
    }
    if (!finalized) {
      return;
    }

    const completedLog = stepLogs[stepIndex];
    if (completedLog) {
      await this.enqueueNextOrComplete(
        run,
        full.steps,
        stepIndex,
        env,
        completedLog,
      );
    }
  }

  private async repairPersistedRetryContinuation(
    workflowRunId: string,
    stepIndex: number,
    deliveredAttempt: number,
    log: StepLog,
    env: AppEnv,
  ): Promise<boolean> {
    const expectedAttempt = log.progress?.attempt;
    const nextRetryAt = Date.parse(log.progress?.nextRetryAt ?? "");
    if (
      log.status !== "retrying" ||
      typeof expectedAttempt !== "number" ||
      !Number.isInteger(expectedAttempt) ||
      expectedAttempt <= deliveredAttempt ||
      expectedAttempt > MAX_WORKFLOW_ATTEMPTS ||
      !Number.isFinite(nextRetryAt)
    ) {
      return false;
    }

    const delaySeconds = Math.max(
      0,
      Math.ceil((nextRetryAt - Date.now()) / 1000),
    );
    const body = { workflowRunId, stepIndex, attempt: expectedAttempt };
    if (delaySeconds > 0) {
      await env.WORKFLOW_QUEUE.send(body, { delaySeconds });
    } else {
      await env.WORKFLOW_QUEUE.send(body);
    }
    return true;
  }

  private async scheduleActiveLeaseRecovery(
    workflowRunId: string,
    stepIndex: number,
    deliveredAttempt: number,
    stepType: string,
    config: Record<string, unknown>,
    env: AppEnv,
  ): Promise<void> {
    const logs = await this.workflowService.getStepLogs(workflowRunId);
    const log = logs[stepIndex];
    const persistedAttempt = log?.progress?.attempt ?? 1;
    const leaseStartedAt =
      log?.progress?.leaseStartedAt ?? log?.startedAt ?? undefined;
    if (
      log?.status !== "running" ||
      persistedAttempt !== deliveredAttempt ||
      !leaseStartedAt
    ) {
      return;
    }

    // Explicit pre-action leases are safe to recover because no action has
    // started. Once action execution begins, use the same replay contract as
    // ordinary retries. Legacy logs have no marker and therefore fail closed
    // for unsafe steps.
    if (
      log.progress?.actionStarted !== false &&
      !isWorkflowStepRetrySafe(stepType, config)
    ) {
      return;
    }

    const leaseExpiresAt = Date.parse(leaseStartedAt) + WORKFLOW_LEASE_MS;
    if (!Number.isFinite(leaseExpiresAt)) {
      return;
    }
    const delaySeconds = Math.max(
      0,
      Math.ceil((leaseExpiresAt - Date.now()) / 1000),
    );
    const body = {
      workflowRunId,
      stepIndex,
      attempt: deliveredAttempt,
    };
    if (delaySeconds > 0) {
      await env.WORKFLOW_QUEUE.send(body, { delaySeconds });
    } else {
      await env.WORKFLOW_QUEUE.send(body);
    }
  }

  private async enqueueNextOrComplete(
    run: dbSchema.WorkflowRunRow,
    steps: dbSchema.WorkflowStepRow[],
    stepIndex: number,
    env: AppEnv,
    log: StepLog,
  ): Promise<void> {
    if (log.output?.continued === false) {
      await this.workflowService.completeRun(run.id);
      return;
    }

    const nextIndex = stepIndex + 1;
    if (nextIndex >= steps.length) {
      await this.workflowService.completeRun(run.id);
      return;
    }

    if (
      log.stepType === "wait" &&
      log.completedAt &&
      typeof log.output?.waitSeconds === "number"
    ) {
      const notBefore =
        Date.parse(log.completedAt) + log.output.waitSeconds * 1000;
      const remainingDelay = Math.max(
        0,
        Math.ceil((notBefore - Date.now()) / 1000),
      );
      if (remainingDelay > MAX_QUEUE_DELAY_SECONDS) {
        await env.WORKFLOW_QUEUE.send(
          {
            workflowRunId: run.id,
            stepIndex,
            remainingDelay: remainingDelay - MAX_QUEUE_DELAY_SECONDS,
          },
          { delaySeconds: MAX_QUEUE_DELAY_SECONDS },
        );
        return;
      }
      if (remainingDelay > 0) {
        await env.WORKFLOW_QUEUE.send(
          { workflowRunId: run.id, stepIndex: nextIndex },
          { delaySeconds: remainingDelay },
        );
        return;
      }
    }

    await env.WORKFLOW_QUEUE.send({
      workflowRunId: run.id,
      stepIndex: nextIndex,
    });
  }

  // ─── Wait Continuation ──────────────────────────────────────────────────
  // For waits exceeding CF Queues' 12h max, the consumer calls this instead
  // of executeStep. It re-enqueues with the remaining delay or advances to
  // the next step when the wait is fully elapsed.

  async continueWait(
    workflowRunId: string,
    stepIndex: number,
    remainingDelay: number,
    env: AppEnv,
  ): Promise<void> {
    // Check run is still active before continuing (prevents zombie re-enqueues)
    const runs = await this.db
      .select()
      .from(dbSchema.workflowRuns)
      .where(eq(dbSchema.workflowRuns.id, workflowRunId))
      .limit(1);
    const run = runs[0];
    if (!run || run.status !== "running") return;

    if (remainingDelay > MAX_QUEUE_DELAY_SECONDS) {
      await env.WORKFLOW_QUEUE.send(
        {
          workflowRunId,
          stepIndex,
          remainingDelay: remainingDelay - MAX_QUEUE_DELAY_SECONDS,
        },
        { delaySeconds: MAX_QUEUE_DELAY_SECONDS },
      );
    } else {
      const full = await this.workflowService.getFullWorkflow(run.workflowId);
      if (!full) {
        await this.workflowService.failRun(workflowRunId, "Workflow not found");
        return;
      }

      const nextIndex = stepIndex + 1;
      if (nextIndex < full.steps.length) {
        await env.WORKFLOW_QUEUE.send(
          { workflowRunId, stepIndex: nextIndex },
          { delaySeconds: remainingDelay },
        );
      } else {
        await this.workflowService.completeRun(workflowRunId);
      }
    }
  }

  // ─── Contact-Query Inputs ──────────────────────────────────────────────
  // Inputs with source kind "contacts" resolve to a live tag-filtered contact
  // list (empty tagIds = all contacts in the project). Resolved here rather
  // than in resolveStepInputs because they need DB access.

  private async resolveContactQueryInputs(
    inputs: unknown,
    context: TriggerContext,
  ): Promise<void> {
    if (!Array.isArray(inputs)) return;

    for (const raw of inputs) {
      const parsed = workflowStepInputSchema.safeParse(raw);
      if (!parsed.success || parsed.data.source.kind !== "contacts") continue;
      const { key, source } = parsed.data;

      const tagIds = source.tagIds.filter(Boolean);
      const contacts = await this.runPreActionDatabaseRead(
        () => this.contactService.list(
          context.projectId,
          tagIds.length > 0
            ? { tagIds, matchAllTags: source.matchAllTags }
            : undefined,
        ),
      );

      context.stepInputs = {
        ...context.stepInputs,
        [key]: formatContactsInputValue(contacts, source.format),
      };
    }
  }

  // ─── Step Action Executors ─────────────────────────────────────────────

  /**
   * Execute a single step action. Returns true if the workflow should continue
   * to the next step, false if it should stop (e.g., condition evaluated false).
   */
  private async executeStepAction(
    type: string,
    config: Record<string, unknown>,
    context: TriggerContext,
    env: AppEnv,
    snap: StepSnapshot,
    progress: StepExecutionProgress,
  ): Promise<boolean> {
    switch (type) {
      case "send_email":
        await this.executeSendEmail(config, context, env, snap, progress);
        return true;

      case "ai_research":
        await this.executeAiResearch(config, context, env, snap, progress);
        return true;

      case "add_tag":
        await this.executeAddTag(config, context, snap);
        return true;

      case "remove_tag":
        await this.executeRemoveTag(config, context, snap);
        return true;

      case "wait":
        // executeWait always throws WaitSignal, caught by executeStep
        // to re-enqueue with a delay. This return is a safety fallback.
        await this.executeWait(config);
        return false;

      case "condition":
        return this.executeCondition(config, context, snap);

      case "webhook":
        await this.executeWebhook(config, context, snap);
        return true;

      case "update_contact":
        await this.executeUpdateContact(config, context, snap);
        return true;

      default:
        console.warn(`Unknown step type: ${type}`);
        return true;
    }
  }

  // ─── send_email ────────────────────────────────────────────────────────

  private async executeSendEmail(
    config: Record<string, unknown>,
    context: TriggerContext,
    env: AppEnv,
    snap: StepSnapshot,
    progress: StepExecutionProgress,
  ): Promise<void> {
    const recipients = normalizeRecipientList(
      config.toList ?? config.to,
      context,
    );
    const subject = this.interpolate(config.subject as string, context);
    const body = this.interpolate(config.body as string, context);

    snap.resolved = { recipients, subject, body, from: FROM_ADDRESS };

    if (recipients.length === 0) {
      throw new Error("send_email: missing 'to' address");
    }
    if (!subject) throw new Error("send_email: missing 'subject'");

    // The body is sent as HTML; plain-text bodies (no tags) would otherwise
    // collapse their line breaks.
    const htmlBody = /<[a-z][\s\S]*>/i.test(body)
      ? body
      : body.replace(/\n/g, "<br>");

    const response = await workflowFetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": buildResendIdempotencyKey(
          progress.workflowRunId,
          progress.stepIndex,
        ),
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: recipients,
        subject,
        html: htmlBody || "",
      }),
    });

    if (!response.ok) {
      throw new WorkflowProviderResponseError(
        "Email provider",
        response.status,
      );
    }

    snap.output = { sent: true, recipientCount: recipients.length };
  }

  // ─── ai_research ────────────────────────────────────────────────────────

  private async executeAiResearch(
    config: Record<string, unknown>,
    context: TriggerContext,
    env: AppEnv,
    snap: StepSnapshot,
    progress?: StepExecutionProgress,
  ): Promise<void> {
    const contactId = context.contactId;
    if (!contactId) {
      console.warn("ai_research: no contactId in context, skipping");
      return;
    }

    const provider = config.provider;
    if (provider !== "chatgpt" && provider !== "gemini") {
      throw new Error("ai_research: invalid research configuration");
    }

    const researchRequest = String(config.prompt ?? "");
    const userPrompt = this.interpolate(researchRequest, context);
    const contextBlock = buildInputContextBlock(context.stepInputs);
    const finalPrompt = contextBlock ? `${contextBlock}\n\n${userPrompt}` : userPrompt;
    const resultKey = typeof config.resultKey === "string" ? config.resultKey : undefined;

    snap.resolved = {
      provider,
      resultKey: resultKey ?? "research",
      researchRequest,
    };

    async function reportResearchPhase(
      phase: WorkflowResearchPhase,
    ): Promise<void> {
      if (!progress) return;
      await progress.report({
        phase,
        message:
          phase === "researching"
            ? "Researching public sources"
            : "Structuring findings",
        attempt: progress.attempt,
        maxAttempts: MAX_WORKFLOW_ATTEMPTS,
        leaseStartedAt: progress.leaseStartedAt,
      });
    }

    const record = await this.workflowAiResearchService.execute(
      { provider, prompt: finalPrompt, resultKey },
      env,
      reportResearchPhase,
    );

    if (progress) {
      await progress.report({
        phase: "saving",
        message: "Updating the contact",
        attempt: progress.attempt,
        maxAttempts: MAX_WORKFLOW_ATTEMPTS,
        leaseStartedAt: progress.leaseStartedAt,
      });
    }
    snap.researchApplication = { contactId, record };

    context.metadata = mergeWorkflowResearchMetadata(context.metadata, record);

    snap.output = {
      summary: record.result.summary,
      company: record.result.company,
      role: record.result.role,
      website: record.result.website,
      location: record.result.location,
      linkedinUrl: record.result.linkedinUrl,
      companySize: record.result.companySize,
      estimatedRevenue: record.result.estimatedRevenue,
      sources: record.result.sources,
      recommendedTags: record.result.recommendedTags,
      insights: record.result.insights,
    };
  }

  private async finalizeAiResearchStepLease(
    workflowRunId: string,
    stepIndex: number,
    leaseStartedAt: string,
    stepLogs: StepLog[],
    context: string,
    contactId: string,
    record: WorkflowResearchRecord,
  ): Promise<boolean> {
    const contact = await this.contactService.getById(contactId);
    if (!contact) {
      throw new ContactUnavailableError();
    }

    const contactMetadata = parseRecord(contact.metadata);
    const nextMetadata = mergeWorkflowResearchMetadata(contactMetadata, record);
    const fields = enrichContactFromResearch(record.result);
    const today = new Date().toISOString().slice(0, 10);
    const nextNotes = appendResearchSummaryToNotes(
      contact.notes,
      record.result.summary,
      today,
    );
    const statusPath = `$[${stepIndex}].status`;
    const leasePath = `$[${stepIndex}].progress.leaseStartedAt`;
    const leaseCondition = and(
      eq(dbSchema.workflowRuns.id, workflowRunId),
      eq(dbSchema.workflowRuns.status, "running"),
      sql`json_extract(${dbSchema.workflowRuns.stepLogs}, ${statusPath}) = 'running'`,
      sql`json_extract(${dbSchema.workflowRuns.stepLogs}, ${leasePath}) = ${leaseStartedAt}`,
    );
    const leaseExists = sql`exists (
      select 1
      from ${dbSchema.workflowRuns}
      where ${leaseCondition}
    )`;

    const contactUpdate = this.db
      .update(dbSchema.contacts)
      .set({
        ...fields,
        metadata: nextMetadata,
        notes: nextNotes,
      })
      .where(
        and(
          eq(dbSchema.contacts.id, contactId),
          leaseExists,
        ),
      )
      .returning({ id: dbSchema.contacts.id });
    const activityMetadata = buildWorkflowResearchActivityMetadata(record);
    const activityInsert = this.db
      .insert(dbSchema.contactActivity)
      .select(
        this.db
          .select({
            id: sql<string>`${buildWorkflowResearchActivityId(
              workflowRunId,
              stepIndex,
            )}`.as("id"),
            contactId: sql<string>`${contactId}`.as("contact_id"),
            type:
              sql<"workflow_researched">`'workflow_researched'`.as("type"),
            referenceId: sql<string | null>`null`.as("reference_id"),
            metadata:
              sql<Record<string, unknown>>`json(${JSON.stringify(
                activityMetadata,
              )})`.as("metadata"),
            createdAt: sql<Date>`unixepoch()`.as("created_at"),
          })
          .from(dbSchema.workflowRuns)
          .where(leaseCondition)
          .limit(1),
      )
      .onConflictDoNothing({ target: dbSchema.contactActivity.id })
      .returning({ id: dbSchema.contactActivity.id });
    const runFinalize = this.db
      .update(dbSchema.workflowRuns)
      .set({
        stepLogs: stepLogs as unknown as null,
        currentStepIndex: stepIndex,
        context,
      })
      .where(leaseCondition)
      .returning({ id: dbSchema.workflowRuns.id });

    let results: unknown[];
    try {
      results = await runAtomicWorkflowBatch(
        this.db,
        [contactUpdate, activityInsert, runFinalize],
      );
    } catch (error) {
      throw new WorkflowPersistenceError(error);
    }
    const finalizedRows = results[2];
    return Array.isArray(finalizedRows) && finalizedRows.length > 0;
  }

  // Single place that turns a research record into contact updates:
  // metadata envelope + structured columns + appended summary + activity.
  private async applyResearchToContact(
    contactId: string,
    record: WorkflowResearchRecord,
  ): Promise<void> {
    const contact = await this.contactService.getById(contactId);
    const contactMetadata = parseRecord(contact?.metadata);
    const nextMetadata = mergeWorkflowResearchMetadata(contactMetadata, record);
    const fields = enrichContactFromResearch(record.result);
    const today = new Date().toISOString().slice(0, 10);
    const nextNotes = appendResearchSummaryToNotes(
      contact?.notes ?? null,
      record.result.summary,
      today,
    );
    await this.contactService.update(contactId, {
      ...fields,
      metadata: nextMetadata,
      notes: nextNotes,
    });
    await this.contactService.logActivity(
      contactId,
      "workflow_researched",
      undefined,
      buildWorkflowResearchActivityMetadata(record),
    );
  }

  // On-demand enrichment (called by the queue consumer for `enrich` jobs).
  async enrichContact(projectId: string, contactId: string, env: AppEnv): Promise<void> {
    const contact = await this.contactService.getById(contactId);
    if (!contact || contact.projectId !== projectId) return;
    const prompt =
      `Research this contact and their company using public sources: ` +
      `${contact.name}${contact.email ? ` <${contact.email}>` : ""}. ` +
      `Return the company name, company website, the person's position/title, ` +
      `the company's size (employee range), an estimated annual revenue range, ` +
      `their LinkedIn URL, and a concise executive summary for sales outreach.`;
    const record = await this.researchForEnrichment(prompt, env);
    await this.applyResearchToContact(contactId, record);
  }

  // Enrichment research with provider fallback: try ChatGPT, and if it fails and
  // a Gemini key is configured, retry once via Gemini. Only if both providers
  // fail (or ChatGPT fails with no Gemini key) does the error surface.
  private async researchForEnrichment(prompt: string, env: AppEnv) {
    try {
      return await this.workflowAiResearchService.execute(
        { provider: "chatgpt", prompt, resultKey: "enrichment" },
        env,
      );
    } catch (chatgptErr) {
      if (!env.GOOGLE_GENERATIVE_AI_API_KEY) throw chatgptErr;
      console.error(
        "Enrichment: ChatGPT provider failed, falling back to Gemini:",
        chatgptErr,
      );
      return await this.workflowAiResearchService.execute(
        { provider: "gemini", prompt, resultKey: "enrichment" },
        env,
      );
    }
  }

  // ─── add_tag ───────────────────────────────────────────────────────────

  private async executeAddTag(
    config: Record<string, unknown>,
    context: TriggerContext,
    snap: StepSnapshot,
  ): Promise<void> {
    const contactId = context.contactId;
    const projectId = context.projectId;
    const tagId = config.tagId as string;
    const tagName = typeof config.tagName === "string" ? config.tagName : undefined;

    snap.resolved = { tagId, tagName };

    if (!contactId) {
      console.warn("add_tag: no contactId in context, skipping");
      snap.output = { applied: false, reason: "no_contact" };
      return;
    }
    if (!tagId) throw new Error("add_tag: missing 'tagId' in config");

    const result = await this.tagService.assignToContact(
      projectId,
      contactId,
      tagId,
    );
    if (result.status !== "ok") {
      throw new Error(`add_tag: ${result.status}`);
    }
    snap.output = { applied: result.changed };
  }

  // ─── remove_tag ────────────────────────────────────────────────────────

  private async executeRemoveTag(
    config: Record<string, unknown>,
    context: TriggerContext,
    snap: StepSnapshot,
  ): Promise<void> {
    const contactId = context.contactId;
    const projectId = context.projectId;
    const tagId = config.tagId as string;
    const tagName = typeof config.tagName === "string" ? config.tagName : undefined;

    snap.resolved = { tagId, tagName };

    if (!contactId) {
      console.warn("remove_tag: no contactId in context, skipping");
      snap.output = { removed: false, reason: "no_contact" };
      return;
    }
    if (!tagId) throw new Error("remove_tag: missing 'tagId' in config");

    const result = await this.tagService.removeFromContact(
      projectId,
      contactId,
      tagId,
    );
    if (result.status !== "ok") {
      throw new Error(`remove_tag: ${result.status}`);
    }
    snap.output = { removed: result.changed };
  }

  // ─── wait ──────────────────────────────────────────────────────────────

  private async executeWait(
    config: Record<string, unknown>,
  ): Promise<void> {
    const duration = Number(config.duration) || 0;
    const unit = (config.unit as string) || "minutes";

    let delaySeconds: number;
    switch (unit) {
      case "hours":
        delaySeconds = duration * 3600;
        break;
      case "days":
        delaySeconds = duration * 86400;
        break;
      case "minutes":
      default:
        delaySeconds = duration * 60;
        break;
    }

    if (delaySeconds <= 0) {
      delaySeconds = 1;
    }

    // Throws WaitSignal which is caught by executeStep. The handler
    // caps at CF Queues max (12h) and re-enqueues the same step with
    // remaining time if needed.
    throw new WaitSignal(delaySeconds);
  }

  // ─── condition ─────────────────────────────────────────────────────────

  private executeCondition(
    config: Record<string, unknown>,
    context: TriggerContext,
    snap: StepSnapshot,
  ): boolean {
    const field = config.field as string;
    const operator = config.operator as string;
    const value = config.value as string;

    if (!field || !operator) {
      console.warn("condition: missing field or operator, continuing");
      snap.resolved = { field, operator, value };
      snap.output = { passed: true, reason: "missing_field_or_operator" };
      return true;
    }

    const actual = this.resolveField(field, context);
    snap.resolved = { field, operator, value, actual };

    let passed: boolean;
    switch (operator) {
      case "equals":
        passed = String(actual) === String(value);
        break;
      case "not_equals":
        passed = String(actual) !== String(value);
        break;
      case "contains":
        passed = String(actual).includes(String(value));
        break;
      case "not_contains":
        passed = !String(actual).includes(String(value));
        break;
      case "exists":
        passed = actual !== undefined && actual !== null && actual !== "";
        break;
      case "not_exists":
        passed = actual === undefined || actual === null || actual === "";
        break;
      default:
        console.warn(`condition: unknown operator '${operator}', continuing`);
        passed = true;
    }
    snap.output = { passed };
    return passed;
  }

  // ─── webhook ───────────────────────────────────────────────────────────

  private async executeWebhook(
    config: Record<string, unknown>,
    context: TriggerContext,
    snap: StepSnapshot,
  ): Promise<void> {
    const url = this.interpolate(config.url as string, context) || (config.url as string);
    if (!url) throw new Error("webhook: missing 'url' in config");

    const method = ((config.method as string) || "POST").toUpperCase();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (config.headers) {
      try {
        const parsed =
          typeof config.headers === "string"
            ? JSON.parse(config.headers)
            : config.headers;
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          !Array.isArray(parsed)
        ) {
          for (const [name, value] of Object.entries(parsed)) {
            if (typeof value !== "string") continue;
            headers[name] = this.interpolate(value, context);
          }
        }
      } catch {
        // Ignore malformed headers
      }
    }

    const body =
      method !== "GET" && method !== "HEAD"
        ? this.interpolate(
            (config.body as string) || JSON.stringify(context),
            context,
          )
        : undefined;

    snap.resolved = {
      url,
      method,
      headers: sanitizeWorkflowLogValue(headers),
      body: sanitizeWorkflowLogValue(body),
    };

    const response = await workflowFetch(url, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new WorkflowProviderResponseError(
        "Webhook provider",
        response.status,
      );
    }

    snap.output = { status: response.status, ok: true };
  }

  // ─── update_contact ────────────────────────────────────────────────────

  private async executeUpdateContact(
    config: Record<string, unknown>,
    context: TriggerContext,
    snap: StepSnapshot,
  ): Promise<void> {
    const contactId = context.contactId;
    const field = config.field as string;
    const value = this.interpolate(config.value as string, context);

    snap.resolved = { field, value };

    if (!contactId) {
      console.warn("update_contact: no contactId in context, skipping");
      snap.output = { updated: false, reason: "no_contact" };
      return;
    }

    if (!field) throw new Error("update_contact: missing 'field' in config");

    const allowedFields = ["name", "email", "phone", "notes"];
    if (!allowedFields.includes(field)) {
      throw new Error(`update_contact: invalid field '${field}'. Allowed: ${allowedFields.join(", ")}`);
    }

    await this.contactService.update(contactId, { [field]: value });
    snap.output = { updated: true, field, value };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  private async refreshContactContext(context: TriggerContext): Promise<void> {
    const contactId = context.contactId;
    if (!contactId) {
      delete context.contactOperational;
      return;
    }

    const [contact, factsByContact] = await this.runPreActionDatabaseRead(
      () => Promise.all([
        this.contactService.getById(contactId),
        this.contactService.getOperationalFacts([contactId]),
      ]),
    );
    if (!contact || contact.projectId !== context.projectId) {
      throw new ContactUnavailableError();
    }

    context.contactName = contact.name;
    context.contactEmail = contact.email ?? undefined;
    context.contactPhone = contact.phone ?? undefined;
    context.contactNotes = contact.notes ?? undefined;
    context.contactCompany = contact.company ?? undefined;
    context.contactWebsite = contact.companyWebsite ?? undefined;
    context.contactPosition = contact.position ?? undefined;
    context.contactCompanySize = contact.companySize ?? undefined;
    context.contactEstimatedRevenue = contact.estimatedRevenue ?? undefined;
    context.contactLinkedinUrl = contact.linkedinUrl ?? undefined;

    const facts = factsByContact[contactId];
    context.contactOperational = facts
      ? buildWorkflowContactOperationalContext(facts, new Date())
      : { stage: { byTag: {} } };
  }

  private async runPreActionDatabaseRead<T>(
    read: () => Promise<T>,
  ): Promise<T> {
    try {
      return await read();
    } catch (err) {
      throw new WorkflowPersistenceError(err);
    }
  }

  /**
   * Dot-path syntax is the primary format, but legacy underscore tokens still
   * resolve through the shared runtime helpers for backward compatibility.
   */
  private interpolate(template: string | undefined, context: TriggerContext): string {
    return interpolateWorkflowTemplate(template, context);
  }

  /**
   * Resolve a field name to a value from context (for condition evaluation).
   */
  private resolveField(
    field: string,
    context: TriggerContext,
  ): unknown {
    return resolveWorkflowValue(context, field);
  }
}

// ─── Wait Signal ─────────────────────────────────────────────────────────────
// Special error class used by the wait step to signal that the next step should
// be enqueued with a delay instead of immediately.

export class WaitSignal extends Error {
  constructor(public delaySeconds: number) {
    super(`wait:${delaySeconds}`);
    this.name = "WaitSignal";
  }
}

function buildInputContextBlock(
  stepInputs: Record<string, unknown> | undefined,
): string {
  if (!stepInputs) return "";
  const lines: string[] = [];
  for (const [key, value] of Object.entries(stepInputs)) {
    if (value == null) continue;
    const str = typeof value === "string" ? value : String(value);
    if (str.length === 0) continue;
    lines.push(`- ${key}: ${str}`);
  }
  if (lines.length === 0) return "";
  return ["Context:", ...lines].join("\n");
}

function buildResendIdempotencyKey(
  workflowRunId: string,
  stepIndex: number,
): string {
  return `workflow-run/${workflowRunId}/step/${stepIndex}/send-email`;
}

function buildWorkflowResearchActivityId(
  workflowRunId: string,
  stepIndex: number,
): string {
  return `workflow-research/${workflowRunId}/step/${stepIndex}`;
}

const SENSITIVE_WORKFLOW_LOG_KEY =
  /authorization|proxy-authorization|api[-_]?key|token|secret|password|cookie|credential/i;

function sanitizeWorkflowConfigForLog(
  config: Record<string, unknown>,
  stepInputs: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return sanitizeWorkflowRecordForLog(config, stepInputs);
}

function sanitizeWorkflowRecordForLog(
  value: Record<string, unknown>,
  stepInputs: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const sanitized = sanitizeWorkflowLogValue(value);
  const sensitiveValues = Object.entries(stepInputs ?? {})
    .filter(function isSensitiveInput([key]) {
      return SENSITIVE_WORKFLOW_LOG_KEY.test(key);
    })
    .map(function inputValue([, inputValue]) {
      return inputValue;
    });

  return redactWorkflowValues(
    sanitized,
    sensitiveValues,
  ) as Record<string, unknown>;
}

function redactWorkflowValues(
  value: unknown,
  sensitiveValues: unknown[],
): unknown {
  if (typeof value === "string") {
    let redacted = value;
    for (const sensitiveValue of sensitiveValues) {
      if (
        typeof sensitiveValue === "string" &&
        sensitiveValue.length > 0
      ) {
        redacted = redacted.replaceAll(sensitiveValue, "[redacted]");
      }
    }
    return redacted;
  }
  if (
    value !== null &&
    typeof value !== "object" &&
    sensitiveValues.some(function matchesSecret(sensitiveValue) {
      return Object.is(value, sensitiveValue);
    })
  ) {
    return "[redacted]";
  }
  if (Array.isArray(value)) {
    return value.map(function redactItem(item) {
      return redactWorkflowValues(item, sensitiveValues);
    });
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(function redactEntry([key, entryValue]) {
        return [
          key,
          redactWorkflowValues(entryValue, sensitiveValues),
        ];
      }),
    );
  }
  return value;
}

function sanitizeResolvedWorkflowInputs(
  stepInputs: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!stepInputs) return undefined;
  return Object.fromEntries(
    Object.entries(stepInputs).map(function sanitizeInput([key, value]) {
      return [
        key,
        SENSITIVE_WORKFLOW_LOG_KEY.test(key)
          ? "[redacted]"
          : sanitizeWorkflowLogValue(value, key),
      ];
    }),
  );
}

function serializeWorkflowContextForPersistence(
  context: TriggerContext,
): string {
  return JSON.stringify({
    ...context,
    ...(context.stepInputs
      ? { stepInputs: sanitizeResolvedWorkflowInputs(context.stepInputs) }
      : {}),
  });
}

function sanitizeWorkflowLogValue(
  value: unknown,
  key = "",
): unknown {
  if (SENSITIVE_WORKFLOW_LOG_KEY.test(key)) {
    return "[redacted]";
  }
  if (Array.isArray(value)) {
    return value.map(function sanitizeItem(item) {
      return sanitizeWorkflowLogValue(item);
    });
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(function sanitizeEntry([entryKey, entryValue]) {
        return [
          entryKey,
          sanitizeWorkflowLogValue(entryValue, entryKey),
        ];
      }),
    );
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        return JSON.stringify(
          sanitizeWorkflowLogValue(JSON.parse(trimmed)),
        );
      } catch {
        return value;
      }
    }
  }
  return value;
}

interface AtomicWorkflowBatchQuery {
  all(): unknown;
}

async function runAtomicWorkflowBatch(
  database: DrizzleD1Database<Record<string, unknown>>,
  queries: readonly AtomicWorkflowBatchQuery[],
): Promise<unknown[]> {
  const batchDatabase = database as unknown as {
    batch?: (
      batchQueries: readonly AtomicWorkflowBatchQuery[],
    ) => Promise<unknown[]>;
  };
  if (typeof batchDatabase.batch === "function") {
    return batchDatabase.batch.call(database, queries);
  }

  // Worker tests use the synchronous Bun SQLite Drizzle adapter behind the
  // D1-compatible service type. Mirror D1 batch atomicity with its native
  // transaction so the same ownership interleavings are exercised.
  const syncDatabase = database as unknown as {
    $client?: {
      transaction?: (callback: () => void) => () => void;
    };
  };
  const transactionFactory = syncDatabase.$client?.transaction;
  if (typeof transactionFactory !== "function") {
    throw new Error("Atomic workflow batch unavailable");
  }

  let results: unknown[] = [];
  const transaction = transactionFactory.call(syncDatabase.$client, () => {
    results = queries.map((query) => query.all());
  });
  transaction();
  return results;
}

function parseRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value) return undefined;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return isRecord(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

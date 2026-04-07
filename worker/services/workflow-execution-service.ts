import { eq, and } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as dbSchema from "../db/schema";
import {
  interpolateWorkflowTemplate,
  mergeWorkflowResearchMetadata,
  normalizeRecipientList,
  resolveWorkflowValue,
  type WorkflowTriggerContext,
} from "../lib/workflow-runtime";
import type { AppEnv } from "../types";
import { WorkflowService, type StepLog } from "./workflow-service";
import { WorkflowAiResearchService } from "./workflow-ai-research-service";
import { ContactService } from "./contact-service";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TriggerContext extends WorkflowTriggerContext {}

type WorkflowTrigger =
  | "form_submitted"
  | "booking_created"
  | "booking_cancelled"
  | "booking_pending"
  | "booking_confirmed"
  | "tag_added"
  | "manual";

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_ADDRESS = "LinkyCal <noreply@updates.linkycal.com>";
const WEBHOOK_TIMEOUT_MS = 10_000;

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
  private workflowAiResearchService: WorkflowAiResearchService;

  constructor(private db: DrizzleD1Database<Record<string, unknown>>) {
    this.workflowService = new WorkflowService(db);
    this.contactService = new ContactService(db);
    this.workflowAiResearchService = new WorkflowAiResearchService();
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

        // Create a run and enqueue the first step
        const run = await this.workflowService.createRun(
          workflow.id,
          context.formResponseId ?? context.bookingId ?? context.contactId ?? undefined,
          JSON.stringify(context),
        );

        if (run) {
          // Init pending step logs
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
          }));
          await this.workflowService.updateStepLogs(run.id, pendingLogs);

          await env.WORKFLOW_QUEUE.send({
            workflowRunId: run.id,
            stepIndex: 0,
          });
        }
      }
    } catch (err) {
      console.error(`Workflow dispatch failed for trigger ${trigger}:`, err);
    }
  }

  // ─── Test Run (specific workflow, no status/trigger filter) ─────────────

  async dispatchTestRun(
    workflowId: string,
    context: TriggerContext,
    env: AppEnv,
  ): Promise<string | null> {
    const steps = await this.workflowService.listSteps(workflowId);
    if (steps.length === 0) return null;

    const run = await this.workflowService.createRun(
      workflowId,
      context.contactId ?? undefined,
      JSON.stringify(context),
    );

    if (run) {
      // Init pending step logs
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
      }));
      await this.workflowService.updateStepLogs(run.id, pendingLogs);

      await env.WORKFLOW_QUEUE.send({
        workflowRunId: run.id,
        stepIndex: 0,
      });
      return run.id;
    }
    return null;
  }

  // ─── Step Execution ────────────────────────────────────────────────────

  async executeStep(
    workflowRunId: string,
    stepIndex: number,
    env: AppEnv,
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

    // ── Step logging: mark as running ──
    const stepLogs = await this.workflowService.getStepLogs(workflowRunId);
    const config = (step.config ?? {}) as Record<string, unknown>;
    if (stepLogs[stepIndex]) {
      stepLogs[stepIndex].status = "running";
      stepLogs[stepIndex].startedAt = new Date().toISOString();
      stepLogs[stepIndex].input = { config };
    }
    await this.workflowService.updateStepLogs(workflowRunId, stepLogs);

    try {
      // Execute the step based on type
      const shouldContinue = await this.executeStepAction(
        step.type,
        config,
        context,
        env,
      );

      // ── Step logging: mark as completed ──
      const now = new Date().toISOString();
      if (stepLogs[stepIndex]) {
        stepLogs[stepIndex].status = "completed";
        stepLogs[stepIndex].completedAt = now;
        stepLogs[stepIndex].output = { continued: shouldContinue };
      }
      await this.workflowService.updateStepLogs(workflowRunId, stepLogs);

      // Update run progress
      await this.workflowService.updateRunProgress(
        workflowRunId,
        stepIndex,
        undefined,
        undefined,
        JSON.stringify(context),
      );

      if (!shouldContinue) {
        // Condition evaluated to false — mark remaining steps as skipped
        for (let i = stepIndex + 1; i < stepLogs.length; i++) {
          if (stepLogs[i]) stepLogs[i].status = "skipped";
        }
        await this.workflowService.updateStepLogs(workflowRunId, stepLogs);
        await this.workflowService.completeRun(workflowRunId);
        return;
      }

      // Enqueue next step
      const nextIndex = stepIndex + 1;
      if (nextIndex < full.steps.length) {
        await env.WORKFLOW_QUEUE.send({
          workflowRunId,
          stepIndex: nextIndex,
        });
      } else {
        // All steps done
        await this.workflowService.completeRun(workflowRunId);
      }
    } catch (err) {
      // Handle wait step: re-enqueue with delay instead of failing.
      if (err instanceof WaitSignal) {
        const MAX_DELAY = 43200; // 12 hours

        // ── Step logging: mark wait as completed ──
        if (stepLogs[stepIndex]) {
          stepLogs[stepIndex].status = "completed";
          stepLogs[stepIndex].completedAt = new Date().toISOString();
          stepLogs[stepIndex].output = { waitSeconds: err.delaySeconds };
        }
        await this.workflowService.updateStepLogs(workflowRunId, stepLogs);

        await this.workflowService.updateRunProgress(
          workflowRunId,
          stepIndex,
          undefined,
          undefined,
          JSON.stringify(context),
        );

        if (err.delaySeconds > MAX_DELAY) {
          await env.WORKFLOW_QUEUE.send(
            { workflowRunId, stepIndex, remainingDelay: err.delaySeconds - MAX_DELAY },
            { delaySeconds: MAX_DELAY },
          );
        } else {
          const nextIndex = stepIndex + 1;
          if (nextIndex < full.steps.length) {
            await env.WORKFLOW_QUEUE.send(
              { workflowRunId, stepIndex: nextIndex },
              { delaySeconds: err.delaySeconds },
            );
          } else {
            await this.workflowService.completeRun(workflowRunId);
          }
        }
        return;
      }

      // ── Step logging: mark as failed ──
      const message = err instanceof Error ? err.message : String(err);
      if (stepLogs[stepIndex]) {
        stepLogs[stepIndex].status = "failed";
        stepLogs[stepIndex].completedAt = new Date().toISOString();
        stepLogs[stepIndex].error = message;
      }
      // Mark remaining steps as skipped
      for (let i = stepIndex + 1; i < stepLogs.length; i++) {
        if (stepLogs[i]) stepLogs[i].status = "skipped";
      }
      await this.workflowService.updateStepLogs(workflowRunId, stepLogs);

      console.error(
        `Workflow step failed: run=${workflowRunId} step=${stepIndex} type=${step.type}`,
        err,
      );
      await this.workflowService.failRun(workflowRunId, message);
    }
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
    const MAX_DELAY = 43200; // 12 hours

    // Check run is still active before continuing (prevents zombie re-enqueues)
    const runs = await this.db
      .select()
      .from(dbSchema.workflowRuns)
      .where(eq(dbSchema.workflowRuns.id, workflowRunId))
      .limit(1);
    const run = runs[0];
    if (!run || run.status !== "running") return;

    if (remainingDelay > MAX_DELAY) {
      await env.WORKFLOW_QUEUE.send(
        { workflowRunId, stepIndex, remainingDelay: remainingDelay - MAX_DELAY },
        { delaySeconds: MAX_DELAY },
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
  ): Promise<boolean> {
    switch (type) {
      case "send_email":
        await this.executeSendEmail(config, context, env);
        return true;

      case "ai_research":
        await this.executeAiResearch(config, context, env);
        return true;

      case "add_tag":
        await this.executeAddTag(config, context);
        return true;

      case "remove_tag":
        await this.executeRemoveTag(config, context);
        return true;

      case "wait":
        // executeWait always throws WaitSignal, caught by executeStep
        // to re-enqueue with a delay. This return is a safety fallback.
        await this.executeWait(config, context);
        return false;

      case "condition":
        return this.executeCondition(config, context);

      case "webhook":
        await this.executeWebhook(config, context);
        return true;

      case "update_contact":
        await this.executeUpdateContact(config, context);
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
  ): Promise<void> {
    const recipients = normalizeRecipientList(
      config.toList ?? config.to,
      context,
    );
    const subject = this.interpolate(config.subject as string, context);
    const body = this.interpolate(config.body as string, context);

    if (recipients.length === 0) {
      throw new Error("send_email: missing 'to' address");
    }
    if (!subject) throw new Error("send_email: missing 'subject'");

    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: recipients,
        subject,
        html: body || "",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`send_email failed: ${error}`);
    }
  }

  // ─── ai_research ────────────────────────────────────────────────────────

  private async executeAiResearch(
    config: Record<string, unknown>,
    context: TriggerContext,
    env: AppEnv,
  ): Promise<void> {
    const contactId = context.contactId;
    if (!contactId) {
      console.warn("ai_research: no contactId in context, skipping");
      return;
    }

    const provider = config.provider;
    if (provider !== "chatgpt" && provider !== "gemini") {
      throw new Error("ai_research: invalid 'provider'. Allowed: chatgpt, gemini");
    }

    const record = await this.workflowAiResearchService.execute(
      {
        provider,
        prompt: String(config.prompt ?? ""),
        resultKey: typeof config.resultKey === "string" ? config.resultKey : undefined,
      },
      context,
      env,
    );

    const contact = await this.contactService.getById(contactId);
    const contactMetadata = parseRecord(contact?.metadata);
    const nextMetadata = mergeWorkflowResearchMetadata(contactMetadata, record);

    await this.contactService.update(contactId, { metadata: nextMetadata });
    await this.contactService.logActivity(contactId, "workflow_researched", undefined, {
      provider: record.provider,
      model: record.model,
      resultKey: record.resultKey,
      summary: record.result.summary,
      sourceCount: record.result.sources.length,
    });

    context.metadata = mergeWorkflowResearchMetadata(context.metadata, record);
  }

  // ─── add_tag ───────────────────────────────────────────────────────────

  private async executeAddTag(
    config: Record<string, unknown>,
    context: TriggerContext,
  ): Promise<void> {
    const contactId = context.contactId;
    const tagId = config.tagId as string;

    if (!contactId) {
      console.warn("add_tag: no contactId in context, skipping");
      return;
    }
    if (!tagId) throw new Error("add_tag: missing 'tagId' in config");

    await this.contactService.addTag(contactId, tagId);
  }

  // ─── remove_tag ────────────────────────────────────────────────────────

  private async executeRemoveTag(
    config: Record<string, unknown>,
    context: TriggerContext,
  ): Promise<void> {
    const contactId = context.contactId;
    const tagId = config.tagId as string;

    if (!contactId) {
      console.warn("remove_tag: no contactId in context, skipping");
      return;
    }
    if (!tagId) throw new Error("remove_tag: missing 'tagId' in config");

    await this.contactService.removeTag(contactId, tagId);
  }

  // ─── wait ──────────────────────────────────────────────────────────────

  private async executeWait(
    config: Record<string, unknown>,
    _context: TriggerContext,
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
  ): boolean {
    const field = config.field as string;
    const operator = config.operator as string;
    const value = config.value as string;

    if (!field || !operator) {
      console.warn("condition: missing field or operator, continuing");
      return true;
    }

    // Resolve the field value from context
    const actual = this.resolveField(field, context);

    switch (operator) {
      case "equals":
        return String(actual) === String(value);
      case "not_equals":
        return String(actual) !== String(value);
      case "contains":
        return String(actual).includes(String(value));
      case "not_contains":
        return !String(actual).includes(String(value));
      case "exists":
        return actual !== undefined && actual !== null && actual !== "";
      case "not_exists":
        return actual === undefined || actual === null || actual === "";
      default:
        console.warn(`condition: unknown operator '${operator}', continuing`);
        return true;
    }
  }

  // ─── webhook ───────────────────────────────────────────────────────────

  private async executeWebhook(
    config: Record<string, unknown>,
    context: TriggerContext,
  ): Promise<void> {
    const url = config.url as string;
    if (!url) throw new Error("webhook: missing 'url' in config");

    const method = ((config.method as string) || "POST").toUpperCase();

    let headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (config.headers) {
      try {
        const parsed =
          typeof config.headers === "string"
            ? JSON.parse(config.headers)
            : config.headers;
        headers = { ...headers, ...parsed };
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

    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `webhook failed: ${response.status} ${response.statusText} — ${text.slice(0, 200)}`,
      );
    }
  }

  // ─── update_contact ────────────────────────────────────────────────────

  private async executeUpdateContact(
    config: Record<string, unknown>,
    context: TriggerContext,
  ): Promise<void> {
    const contactId = context.contactId;
    if (!contactId) {
      console.warn("update_contact: no contactId in context, skipping");
      return;
    }

    const field = config.field as string;
    const value = this.interpolate(config.value as string, context);

    if (!field) throw new Error("update_contact: missing 'field' in config");

    const allowedFields = ["name", "email", "phone", "notes"];
    if (!allowedFields.includes(field)) {
      throw new Error(`update_contact: invalid field '${field}'. Allowed: ${allowedFields.join(", ")}`);
    }

    await this.contactService.update(contactId, { [field]: value });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

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

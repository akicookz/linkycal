import { eq, and } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as dbSchema from "../db/schema";
import type { AppEnv } from "../types";
import { WorkflowService } from "./workflow-service";
import { ContactService } from "./contact-service";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TriggerContext {
  projectId: string;
  contactId?: string;
  contactEmail?: string;
  contactName?: string;
  formResponseId?: string;
  bookingId?: string;
  tagId?: string;
  metadata?: Record<string, unknown>;
}

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

  constructor(private db: DrizzleD1Database<Record<string, unknown>>) {
    this.workflowService = new WorkflowService(db);
    this.contactService = new ContactService(db);
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

    try {
      const config = step.config ? JSON.parse(step.config as string) : {};

      // Execute the step based on type
      const shouldContinue = await this.executeStepAction(
        step.type,
        config,
        context,
        env,
      );

      // Update run progress
      await this.workflowService.updateRunProgress(
        workflowRunId,
        stepIndex,
      );

      if (!shouldContinue) {
        // Condition evaluated to false — end the run
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
      // CF Queues max delay is 12 hours (43200s). For longer waits, we
      // re-enqueue the SAME step with the remaining time.
      if (err instanceof WaitSignal) {
        const MAX_DELAY = 43200; // 12 hours
        await this.workflowService.updateRunProgress(workflowRunId, stepIndex);

        if (err.delaySeconds > MAX_DELAY) {
          // Re-enqueue the same step with remaining delay
          await env.WORKFLOW_QUEUE.send(
            { workflowRunId, stepIndex, remainingDelay: err.delaySeconds - MAX_DELAY },
            { delaySeconds: MAX_DELAY },
          );
        } else {
          // Delay fits — enqueue the next step after the wait
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

      const message = err instanceof Error ? err.message : String(err);
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
    const to = this.interpolate(config.to as string, context);
    const subject = this.interpolate(config.subject as string, context);
    const body = this.interpolate(config.body as string, context);

    if (!to) throw new Error("send_email: missing 'to' address");
    if (!subject) throw new Error("send_email: missing 'subject'");

    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [to],
        subject,
        html: body || "",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`send_email failed: ${error}`);
    }
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
    const value = config.value as string;

    if (!field) throw new Error("update_contact: missing 'field' in config");

    const allowedFields = ["name", "email", "phone", "notes"];
    if (!allowedFields.includes(field)) {
      throw new Error(`update_contact: invalid field '${field}'. Allowed: ${allowedFields.join(", ")}`);
    }

    await this.contactService.update(contactId, { [field]: value });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  /**
   * Replace template variables like {{contact_name}}, {{contact_email}} etc.
   * with values from the trigger context.
   */
  private interpolate(template: string | undefined, context: TriggerContext): string {
    if (!template) return "";

    return template
      .replace(/\{\{contact_name\}\}/g, context.contactName ?? "")
      .replace(/\{\{contact_email\}\}/g, context.contactEmail ?? "")
      .replace(/\{\{contact_id\}\}/g, context.contactId ?? "")
      .replace(/\{\{booking_id\}\}/g, context.bookingId ?? "")
      .replace(/\{\{form_response_id\}\}/g, context.formResponseId ?? "")
      .replace(/\{\{project_id\}\}/g, context.projectId ?? "")
      .replace(/\{\{tag_id\}\}/g, context.tagId ?? "");
  }

  /**
   * Resolve a field name to a value from context (for condition evaluation).
   */
  private resolveField(
    field: string,
    context: TriggerContext,
  ): string | undefined {
    const map: Record<string, string | undefined> = {
      contact_name: context.contactName,
      contact_email: context.contactEmail,
      contact_id: context.contactId,
      booking_id: context.bookingId,
      form_response_id: context.formResponseId,
      tag_id: context.tagId,
      project_id: context.projectId,
    };
    return map[field];
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

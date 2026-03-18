import { eq, and, asc, desc } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as dbSchema from "../db/schema";

// ─── Workflow Service ────────────────────────────────────────────────────────

export class WorkflowService {
  constructor(private db: DrizzleD1Database<Record<string, unknown>>) {}

  // ─── Workflows CRUD ─────────────────────────────────────────────────────

  async list(projectId: string) {
    return this.db
      .select()
      .from(dbSchema.workflows)
      .where(eq(dbSchema.workflows.projectId, projectId))
      .orderBy(desc(dbSchema.workflows.createdAt));
  }

  async getById(id: string) {
    const rows = await this.db
      .select()
      .from(dbSchema.workflows)
      .where(eq(dbSchema.workflows.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async create(
    projectId: string,
    data: {
      name: string;
      trigger: "form_submitted" | "booking_created" | "booking_cancelled" | "tag_added" | "manual";
    },
  ) {
    const id = crypto.randomUUID();
    await this.db.insert(dbSchema.workflows).values({
      id,
      projectId,
      name: data.name,
      trigger: data.trigger,
      status: "draft",
    });
    return this.getById(id);
  }

  async update(
    id: string,
    data: {
      name?: string;
      trigger?: "form_submitted" | "booking_created" | "booking_cancelled" | "tag_added" | "manual";
      status?: "active" | "draft";
    },
  ) {
    const values: Record<string, unknown> = {};
    if (data.name !== undefined) values.name = data.name;
    if (data.trigger !== undefined) values.trigger = data.trigger;
    if (data.status !== undefined) values.status = data.status;

    if (Object.keys(values).length === 0) return this.getById(id);

    await this.db
      .update(dbSchema.workflows)
      .set(values)
      .where(eq(dbSchema.workflows.id, id));

    return this.getById(id);
  }

  async delete(id: string) {
    await this.db.delete(dbSchema.workflows).where(eq(dbSchema.workflows.id, id));
  }

  // ─── Steps CRUD ─────────────────────────────────────────────────────────

  async listSteps(workflowId: string) {
    return this.db
      .select()
      .from(dbSchema.workflowSteps)
      .where(eq(dbSchema.workflowSteps.workflowId, workflowId))
      .orderBy(asc(dbSchema.workflowSteps.sortOrder));
  }

  async getStepById(id: string) {
    const rows = await this.db
      .select()
      .from(dbSchema.workflowSteps)
      .where(eq(dbSchema.workflowSteps.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async createStep(
    workflowId: string,
    data: {
      sortOrder?: number;
      type: "send_email" | "add_tag" | "remove_tag" | "wait" | "condition" | "webhook" | "update_contact";
      config?: Record<string, unknown>;
    },
  ) {
    const id = crypto.randomUUID();

    let sortOrder = data.sortOrder ?? -1;
    if (sortOrder < 0) {
      const steps = await this.listSteps(workflowId);
      sortOrder = steps.length;
    }

    await this.db.insert(dbSchema.workflowSteps).values({
      id,
      workflowId,
      sortOrder,
      type: data.type,
      config: data.config ? JSON.stringify(data.config) : null,
    });

    return this.getStepById(id);
  }

  async updateStep(
    id: string,
    data: {
      sortOrder?: number;
      type?: "send_email" | "add_tag" | "remove_tag" | "wait" | "condition" | "webhook" | "update_contact";
      config?: Record<string, unknown> | null;
    },
  ) {
    const values: Record<string, unknown> = {};
    if (data.sortOrder !== undefined) values.sortOrder = data.sortOrder;
    if (data.type !== undefined) values.type = data.type;
    if (data.config !== undefined)
      values.config = data.config ? JSON.stringify(data.config) : null;

    if (Object.keys(values).length === 0) return this.getStepById(id);

    await this.db
      .update(dbSchema.workflowSteps)
      .set(values)
      .where(eq(dbSchema.workflowSteps.id, id));

    return this.getStepById(id);
  }

  async deleteStep(id: string) {
    await this.db
      .delete(dbSchema.workflowSteps)
      .where(eq(dbSchema.workflowSteps.id, id));
  }

  async reorderSteps(workflowId: string, stepIds: string[]) {
    for (let i = 0; i < stepIds.length; i++) {
      await this.db
        .update(dbSchema.workflowSteps)
        .set({ sortOrder: i })
        .where(
          and(
            eq(dbSchema.workflowSteps.id, stepIds[i]),
            eq(dbSchema.workflowSteps.workflowId, workflowId),
          ),
        );
    }
    return this.listSteps(workflowId);
  }

  // ─── Full Workflow ──────────────────────────────────────────────────────

  async getFullWorkflow(id: string) {
    const workflow = await this.getById(id);
    if (!workflow) return null;

    const steps = await this.listSteps(id);
    return { ...workflow, steps };
  }

  // ─── Runs ───────────────────────────────────────────────────────────────

  async listRuns(workflowId: string, limit?: number) {
    const query = this.db
      .select()
      .from(dbSchema.workflowRuns)
      .where(eq(dbSchema.workflowRuns.workflowId, workflowId))
      .orderBy(desc(dbSchema.workflowRuns.startedAt));

    if (limit) {
      return query.limit(limit);
    }
    return query;
  }

  async createRun(workflowId: string, triggerId?: string) {
    const id = crypto.randomUUID();
    await this.db.insert(dbSchema.workflowRuns).values({
      id,
      workflowId,
      triggerId: triggerId ?? null,
      status: "running",
      currentStepIndex: 0,
    });

    const rows = await this.db
      .select()
      .from(dbSchema.workflowRuns)
      .where(eq(dbSchema.workflowRuns.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async updateRunProgress(
    runId: string,
    stepIndex: number,
    status?: string,
    error?: string,
  ) {
    const values: Record<string, unknown> = {
      currentStepIndex: stepIndex,
    };
    if (status !== undefined) values.status = status;
    if (error !== undefined) values.error = error;

    await this.db
      .update(dbSchema.workflowRuns)
      .set(values)
      .where(eq(dbSchema.workflowRuns.id, runId));

    const rows = await this.db
      .select()
      .from(dbSchema.workflowRuns)
      .where(eq(dbSchema.workflowRuns.id, runId))
      .limit(1);
    return rows[0] ?? null;
  }

  async completeRun(runId: string) {
    await this.db
      .update(dbSchema.workflowRuns)
      .set({
        status: "completed",
        completedAt: new Date(),
      })
      .where(eq(dbSchema.workflowRuns.id, runId));

    const rows = await this.db
      .select()
      .from(dbSchema.workflowRuns)
      .where(eq(dbSchema.workflowRuns.id, runId))
      .limit(1);
    return rows[0] ?? null;
  }

  async failRun(runId: string, error: string) {
    await this.db
      .update(dbSchema.workflowRuns)
      .set({
        status: "failed",
        completedAt: new Date(),
        error,
      })
      .where(eq(dbSchema.workflowRuns.id, runId));

    const rows = await this.db
      .select()
      .from(dbSchema.workflowRuns)
      .where(eq(dbSchema.workflowRuns.id, runId))
      .limit(1);
    return rows[0] ?? null;
  }
}

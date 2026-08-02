import {
  and,
  desc,
  eq,
  gt,
  gte,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  sql,
} from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import { evaluateEntitlement } from "../../shared/entitlement-decision";
import type {
  EntitlementDecision,
  Plan,
} from "../../shared/plan-catalog";
import * as dbSchema from "../db/schema";
import type { WorkspaceRef } from "../types";

type AppDatabase = DrizzleD1Database<Record<string, unknown>>;

export type MeteredEntitlementKey =
  | "formResponses"
  | "bookings"
  | "workflowExecutions"
  | "transactionalEmails"
  | "integrationRequests"
  | "enrichments";

export interface MeteredReservationInput {
  workspace: WorkspaceRef;
  subscription: dbSchema.SubscriptionRow | null;
  plan: Plan;
  key: MeteredEntitlementKey;
  amount: number;
  operationId?: string;
  allowExistingOverage?: boolean;
  observe?: boolean;
  now: Date;
}

interface PeriodInput {
  workspace: WorkspaceRef;
  subscription: dbSchema.SubscriptionRow | null;
  now: Date;
}

interface UsagePeriodBounds {
  start: Date;
  end: Date;
}

interface ChangeResult {
  changes?: number;
  meta?: { changes?: number };
}

interface SyncStatement {
  get(...params: unknown[]): Record<string, unknown> | null;
  run(...params: unknown[]): ChangeResult;
}

interface SyncSqliteClient {
  query(query: string): SyncStatement;
  transaction<T>(callback: () => T): () => T;
}

interface D1StatementLike {
  bind(...values: unknown[]): D1StatementLike;
}

interface D1ClientLike {
  prepare(query: string): D1StatementLike;
  batch(statements: D1StatementLike[]): Promise<unknown[]>;
}

interface DatabaseWithClient {
  $client?: unknown;
}

export class UsageService {
  constructor(private db: AppDatabase) {}

  async getOrCreatePeriod(
    input: PeriodInput,
  ): Promise<dbSchema.WorkspaceUsagePeriodRow> {
    const bounds = usagePeriodBounds(input.subscription, input.now);
    const [existingPeriod] = await this.db
      .select()
      .from(dbSchema.workspaceUsagePeriods)
      .where(
        and(
          eq(
            dbSchema.workspaceUsagePeriods.workspaceType,
            input.workspace.type,
          ),
          eq(dbSchema.workspaceUsagePeriods.workspaceId, input.workspace.id),
          eq(dbSchema.workspaceUsagePeriods.periodStart, bounds.start),
        ),
      )
      .limit(1);
    if (existingPeriod && !existingPeriod.supersededAt) return existingPeriod;

    if (existingPeriod?.supersededAt) {
      const canonicalPeriod = await this.findActivePeriod(input);
      if (canonicalPeriod) return canonicalPeriod;
      throw new Error(
        `Superseded usage period has no active replacement for ${input.workspace.type}:${input.workspace.id}`,
      );
    }

    const activePeriod = await this.findActivePeriod(input, bounds.start);
    if (activePeriod) {
      await carryUsagePeriod(this.db, input, bounds, activePeriod);
    } else {
      const initialConversions = await initialConversionCounters(
        this.db,
        input.workspace,
        bounds,
      );
      await this.db
        .insert(dbSchema.workspaceUsagePeriods)
        .values({
          id: crypto.randomUUID(),
          workspaceType: input.workspace.type,
          workspaceId: input.workspace.id,
          periodStart: bounds.start,
          periodEnd: bounds.end,
          ...initialConversions,
        })
        .onConflictDoNothing({
          target: [
            dbSchema.workspaceUsagePeriods.workspaceType,
            dbSchema.workspaceUsagePeriods.workspaceId,
            dbSchema.workspaceUsagePeriods.periodStart,
          ],
        });
    }

    const [period] = await this.db
      .select()
      .from(dbSchema.workspaceUsagePeriods)
      .where(
        and(
          eq(
            dbSchema.workspaceUsagePeriods.workspaceType,
            input.workspace.type,
          ),
          eq(dbSchema.workspaceUsagePeriods.workspaceId, input.workspace.id),
          eq(dbSchema.workspaceUsagePeriods.periodStart, bounds.start),
          isNull(dbSchema.workspaceUsagePeriods.supersededAt),
        ),
      )
      .limit(1);

    if (!period) {
      throw new Error(
        `Failed to ensure usage period for ${input.workspace.type}:${input.workspace.id}`,
      );
    }
    return period;
  }

  private async findActivePeriod(
    input: PeriodInput,
    excludedStart?: Date,
  ): Promise<dbSchema.WorkspaceUsagePeriodRow | null> {
    const conditions = [
      eq(dbSchema.workspaceUsagePeriods.workspaceType, input.workspace.type),
      eq(dbSchema.workspaceUsagePeriods.workspaceId, input.workspace.id),
      lte(dbSchema.workspaceUsagePeriods.periodStart, input.now),
      gt(dbSchema.workspaceUsagePeriods.periodEnd, input.now),
      isNull(dbSchema.workspaceUsagePeriods.supersededAt),
    ];
    if (excludedStart) {
      conditions.push(
        ne(dbSchema.workspaceUsagePeriods.periodStart, excludedStart),
      );
    }
    const [period] = await this.db
      .select()
      .from(dbSchema.workspaceUsagePeriods)
      .where(and(...conditions))
      .orderBy(desc(dbSchema.workspaceUsagePeriods.periodStart))
      .limit(1);
    return period ?? null;
  }

  async getDecision(
    input: MeteredReservationInput,
  ): Promise<EntitlementDecision> {
    assertReservationAmount(input.amount);
    const period = await this.getOrCreatePeriod(input);
    return evaluateEntitlement({
      plan: input.plan,
      key: input.key,
      used: usageValue(period, input.key),
      amount: input.amount,
      periodStart: period.periodStart,
      resetAt: period.periodEnd,
    });
  }

  async reserve(
    input: MeteredReservationInput,
  ): Promise<EntitlementDecision> {
    assertReservationAmount(input.amount);
    return this.reserveCurrentPeriod(input, 0);
  }

  private async reserveCurrentPeriod(
    input: MeteredReservationInput,
    retryCount: number,
  ): Promise<EntitlementDecision> {
    const period = await this.getOrCreatePeriod(input);
    const currentUsed = usageValue(period, input.key);
    const initialDecision = evaluateEntitlement({
      plan: input.plan,
      key: input.key,
      used: currentUsed,
      amount: input.amount,
      periodStart: period.periodStart,
      resetAt: period.periodEnd,
    });
    const allowExistingFormCompletion =
      input.key === "formResponses" &&
      input.allowExistingOverage === true &&
      Boolean(input.operationId);

    if (
      !initialDecision.allowed &&
      !allowExistingFormCompletion &&
      input.observe !== true
    ) {
      return initialDecision;
    }
    const allowOverage = allowExistingFormCompletion || input.observe === true;

    if (input.operationId && input.key !== "integrationRequests") {
      const state = await this.reserveOperation(
        input,
        period,
        initialDecision.hardLimit,
        allowOverage,
      );
      const updated = await this.getPeriodById(period.id);
      if (updated.supersededAt) {
        if (retryCount >= 2) {
          throw new Error("Usage period changed repeatedly during reservation");
        }
        return this.reserveCurrentPeriod(input, retryCount + 1);
      }
      if (state === "reserved" || state === "consumed") {
        if (input.observe) return initialDecision;
        return successfulReservationDecision(
          input,
          updated,
          allowExistingFormCompletion,
        );
      }
      return decisionFromPeriod(input, updated);
    }

    const changed = await this.incrementCounter(
      period.id,
      input.key,
      input.amount,
      initialDecision.hardLimit,
      allowOverage,
    );
    if (!changed) {
      const updated = await this.getPeriodById(period.id);
      if (updated.supersededAt) {
        if (retryCount >= 2) {
          throw new Error("Usage period changed repeatedly during reservation");
        }
        return this.reserveCurrentPeriod(input, retryCount + 1);
      }
      return decisionFromPeriod(input, updated);
    }

    return allowExistingFormCompletion
      ? existingFormCompletionDecision(initialDecision)
      : initialDecision;
  }

  async consume(input: MeteredReservationInput): Promise<void> {
    if (!input.operationId || input.key === "integrationRequests") return;
    await this.db
      .update(dbSchema.workspaceUsageEvents)
      .set({ state: "consumed", updatedAt: input.now })
      .where(
        and(
          eq(
            dbSchema.workspaceUsageEvents.workspaceType,
            input.workspace.type,
          ),
          eq(dbSchema.workspaceUsageEvents.workspaceId, input.workspace.id),
          eq(dbSchema.workspaceUsageEvents.entitlementKey, input.key),
          eq(dbSchema.workspaceUsageEvents.operationId, input.operationId),
          eq(dbSchema.workspaceUsageEvents.state, "reserved"),
        ),
      );
  }

  async release(input: MeteredReservationInput): Promise<void> {
    if (!input.operationId || input.key === "integrationRequests") return;
    const event = await this.getOperation(input);
    if (!event || event.state !== "reserved") return;

    const client = (this.db as AppDatabase & DatabaseWithClient).$client;
    if (isD1Client(client)) {
      await releaseWithD1Batch(client, event, input.key, input.now);
      return;
    }
    if (isSyncSqliteClient(client)) {
      releaseWithSqliteTransaction(
        client,
        event,
        input.key,
        input.now,
      );
      return;
    }

    await this.releaseBestEffort(event, input);
  }

  private async reserveOperation(
    input: MeteredReservationInput,
    period: dbSchema.WorkspaceUsagePeriodRow,
    hardLimit: number | null,
    allowExistingOverage: boolean,
  ): Promise<dbSchema.WorkspaceUsageEventRow["state"]> {
    const existing = await this.getOperation(input);
    if (existing && existing.state !== "released") {
      return existing.state;
    }

    const client = (this.db as AppDatabase & DatabaseWithClient).$client;
    if (isD1Client(client)) {
      await reserveWithD1Batch(
        client,
        input,
        period,
        hardLimit,
        allowExistingOverage,
        existing,
      );
    } else if (isSyncSqliteClient(client)) {
      reserveWithSqliteTransaction(
        client,
        input,
        period,
        hardLimit,
        allowExistingOverage,
      );
    } else {
      await this.reserveBestEffort(
        input,
        period,
        hardLimit,
        allowExistingOverage,
        existing,
      );
    }

    return (await this.getOperation(input))?.state ?? "released";
  }

  private async reserveBestEffort(
    input: MeteredReservationInput,
    period: dbSchema.WorkspaceUsagePeriodRow,
    hardLimit: number | null,
    allowExistingOverage: boolean,
    existing: dbSchema.WorkspaceUsageEventRow | null,
  ): Promise<void> {
    if (!existing) {
      await this.db
        .insert(dbSchema.workspaceUsageEvents)
        .values(operationRow(input, period.id, "released"))
        .onConflictDoNothing();
    }
    const changed = await this.incrementCounter(
      period.id,
      input.key,
      input.amount,
      hardLimit,
      allowExistingOverage,
    );
    if (!changed) return;
    await this.db
      .update(dbSchema.workspaceUsageEvents)
      .set({
        usagePeriodId: period.id,
        amount: input.amount,
        state: "reserved",
        updatedAt: input.now,
      })
      .where(
        and(
          eq(dbSchema.workspaceUsageEvents.workspaceType, input.workspace.type),
          eq(dbSchema.workspaceUsageEvents.workspaceId, input.workspace.id),
          eq(dbSchema.workspaceUsageEvents.entitlementKey, input.key),
          eq(dbSchema.workspaceUsageEvents.operationId, input.operationId!),
          eq(dbSchema.workspaceUsageEvents.state, "released"),
        ),
      );
  }

  private async releaseBestEffort(
    event: dbSchema.WorkspaceUsageEventRow,
    input: MeteredReservationInput,
  ): Promise<void> {
    await this.db
      .update(dbSchema.workspaceUsagePeriods)
      .set(counterSet(input.key, -event.amount))
      .where(eq(dbSchema.workspaceUsagePeriods.id, event.usagePeriodId));
    await this.db
      .update(dbSchema.workspaceUsageEvents)
      .set({ state: "released", updatedAt: input.now })
      .where(eq(dbSchema.workspaceUsageEvents.id, event.id));
  }

  private async incrementCounter(
    periodId: string,
    key: MeteredEntitlementKey,
    amount: number,
    hardLimit: number | null,
    allowOverage: boolean,
  ): Promise<boolean> {
    const column = counterColumn(key);
    const conditions = [
      eq(dbSchema.workspaceUsagePeriods.id, periodId),
      isNull(dbSchema.workspaceUsagePeriods.supersededAt),
    ];
    if (hardLimit !== null && !allowOverage) {
      conditions.push(sql`${column} + ${amount} <= ${hardLimit}`);
    }
    const result = await this.db
      .update(dbSchema.workspaceUsagePeriods)
      .set(counterSet(key, amount))
      .where(and(...conditions));
    return changeCount(result) === 1;
  }

  private async getOperation(
    input: MeteredReservationInput,
  ): Promise<dbSchema.WorkspaceUsageEventRow | null> {
    if (!input.operationId) return null;
    const [event] = await this.db
      .select()
      .from(dbSchema.workspaceUsageEvents)
      .where(
        and(
          eq(
            dbSchema.workspaceUsageEvents.workspaceType,
            input.workspace.type,
          ),
          eq(dbSchema.workspaceUsageEvents.workspaceId, input.workspace.id),
          eq(dbSchema.workspaceUsageEvents.entitlementKey, input.key),
          eq(dbSchema.workspaceUsageEvents.operationId, input.operationId),
        ),
      )
      .limit(1);
    return event ?? null;
  }

  private async getPeriodById(
    periodId: string,
  ): Promise<dbSchema.WorkspaceUsagePeriodRow> {
    const [period] = await this.db
      .select()
      .from(dbSchema.workspaceUsagePeriods)
      .where(eq(dbSchema.workspaceUsagePeriods.id, periodId))
      .limit(1);
    if (!period) throw new Error(`Usage period ${periodId} no longer exists`);
    return period;
  }
}

function usageCounters(
  period: dbSchema.WorkspaceUsagePeriodRow,
): Pick<
  dbSchema.NewWorkspaceUsagePeriodRow,
  MeteredEntitlementKey
> {
  return {
    formResponses: period.formResponses,
    bookings: period.bookings,
    workflowExecutions: period.workflowExecutions,
    transactionalEmails: period.transactionalEmails,
    integrationRequests: period.integrationRequests,
    enrichments: period.enrichments,
  };
}

async function initialConversionCounters(
  db: AppDatabase,
  workspace: WorkspaceRef,
  bounds: UsagePeriodBounds,
): Promise<
  Pick<dbSchema.NewWorkspaceUsagePeriodRow, "bookings" | "formResponses">
> {
  const projectCondition = workspace.teamId
    ? eq(dbSchema.projects.teamId, workspace.teamId)
    : and(
        eq(dbSchema.projects.userId, workspace.ownerUserId),
        isNull(dbSchema.projects.teamId),
      );
  const [bookingRows, responseRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(dbSchema.bookings)
      .innerJoin(
        dbSchema.eventTypes,
        eq(dbSchema.bookings.eventTypeId, dbSchema.eventTypes.id),
      )
      .innerJoin(
        dbSchema.projects,
        eq(dbSchema.eventTypes.projectId, dbSchema.projects.id),
      )
      .where(
        and(
          projectCondition,
          isNotNull(dbSchema.bookings.usageRecordedAt),
          gte(dbSchema.bookings.usageRecordedAt, bounds.start),
          lt(dbSchema.bookings.usageRecordedAt, bounds.end),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)` })
      .from(dbSchema.formResponses)
      .innerJoin(
        dbSchema.forms,
        eq(dbSchema.formResponses.formId, dbSchema.forms.id),
      )
      .innerJoin(
        dbSchema.projects,
        eq(dbSchema.forms.projectId, dbSchema.projects.id),
      )
      .where(
        and(
          projectCondition,
          eq(dbSchema.formResponses.status, "completed"),
          isNotNull(dbSchema.formResponses.usageRecordedAt),
          gte(dbSchema.formResponses.usageRecordedAt, bounds.start),
          lt(dbSchema.formResponses.usageRecordedAt, bounds.end),
        ),
      ),
  ]);
  return {
    bookings: Number(bookingRows[0]?.count ?? 0),
    formResponses: Number(responseRows[0]?.count ?? 0),
  };
}

async function carryUsagePeriod(
  db: AppDatabase,
  input: PeriodInput,
  bounds: UsagePeriodBounds,
  activePeriod: dbSchema.WorkspaceUsagePeriodRow,
): Promise<void> {
  const periodId = crypto.randomUUID();
  const client = (db as AppDatabase & DatabaseWithClient).$client;
  if (isD1Client(client)) {
    await client.batch([
      client
        .prepare(
          "INSERT INTO workspace_usage_periods (id, workspace_type, workspace_id, period_start, period_end, form_responses, bookings, workflow_executions, transactional_emails, integration_requests, enrichments, created_at, updated_at) SELECT ?, ?, ?, ?, ?, form_responses, bookings, workflow_executions, transactional_emails, integration_requests, enrichments, unixepoch(), ? FROM workspace_usage_periods WHERE id = ? AND superseded_at IS NULL ON CONFLICT(workspace_type, workspace_id, period_start) DO NOTHING",
        )
        .bind(
          periodId,
          input.workspace.type,
          input.workspace.id,
          toEpochSeconds(bounds.start),
          toEpochSeconds(bounds.end),
          toEpochSeconds(input.now),
          activePeriod.id,
        ),
      client
        .prepare(
          "UPDATE workspace_usage_periods SET superseded_at = ?, updated_at = ? WHERE id = ? AND superseded_at IS NULL AND changes() = 1",
        )
        .bind(
          toEpochSeconds(input.now),
          toEpochSeconds(input.now),
          activePeriod.id,
        ),
      client
        .prepare(
          "UPDATE workspace_usage_events SET usage_period_id = ?, updated_at = ? WHERE usage_period_id = ? AND state = 'reserved' AND changes() = 1",
        )
        .bind(periodId, toEpochSeconds(input.now), activePeriod.id),
    ]);
    return;
  }

  if (isSyncSqliteClient(client)) {
    const run = client.transaction(function carryPeriodTransaction() {
      const inserted = client
        .query(
          "INSERT OR IGNORE INTO workspace_usage_periods (id, workspace_type, workspace_id, period_start, period_end, form_responses, bookings, workflow_executions, transactional_emails, integration_requests, enrichments, created_at, updated_at) SELECT ?, ?, ?, ?, ?, form_responses, bookings, workflow_executions, transactional_emails, integration_requests, enrichments, unixepoch(), ? FROM workspace_usage_periods WHERE id = ? AND superseded_at IS NULL",
        )
        .run(
          periodId,
          input.workspace.type,
          input.workspace.id,
          toEpochSeconds(bounds.start),
          toEpochSeconds(bounds.end),
          toEpochSeconds(input.now),
          activePeriod.id,
        );
      if (changeCount(inserted) !== 1) return;
      const superseded = client
        .query(
          "UPDATE workspace_usage_periods SET superseded_at = ?, updated_at = ? WHERE id = ? AND superseded_at IS NULL",
        )
        .run(
          toEpochSeconds(input.now),
          toEpochSeconds(input.now),
          activePeriod.id,
        );
      if (changeCount(superseded) !== 1) {
        throw new Error("Active usage period changed during rebasing");
      }
      client
        .query(
          "UPDATE workspace_usage_events SET usage_period_id = ?, updated_at = ? WHERE usage_period_id = ? AND state = 'reserved'",
        )
        .run(periodId, toEpochSeconds(input.now), activePeriod.id);
    });
    run();
    return;
  }

  const inserted = await db
    .insert(dbSchema.workspaceUsagePeriods)
    .values({
      id: periodId,
      workspaceType: input.workspace.type,
      workspaceId: input.workspace.id,
      periodStart: bounds.start,
      periodEnd: bounds.end,
      ...usageCounters(activePeriod),
    })
    .onConflictDoNothing({
      target: [
        dbSchema.workspaceUsagePeriods.workspaceType,
        dbSchema.workspaceUsagePeriods.workspaceId,
        dbSchema.workspaceUsagePeriods.periodStart,
      ],
    })
    .returning({ id: dbSchema.workspaceUsagePeriods.id });
  if (inserted.length === 0) return;
  const superseded = await db
    .update(dbSchema.workspaceUsagePeriods)
    .set({ supersededAt: input.now, updatedAt: input.now })
    .where(
      and(
        eq(dbSchema.workspaceUsagePeriods.id, activePeriod.id),
        isNull(dbSchema.workspaceUsagePeriods.supersededAt),
      ),
    )
    .returning({ id: dbSchema.workspaceUsagePeriods.id });
  if (superseded.length === 0) {
    await db
      .delete(dbSchema.workspaceUsagePeriods)
      .where(eq(dbSchema.workspaceUsagePeriods.id, periodId));
    return;
  }
  await db
    .update(dbSchema.workspaceUsageEvents)
    .set({ usagePeriodId: periodId, updatedAt: input.now })
    .where(
      and(
        eq(dbSchema.workspaceUsageEvents.usagePeriodId, activePeriod.id),
        eq(dbSchema.workspaceUsageEvents.state, "reserved"),
      ),
    );
}

export function usagePeriodBounds(
  subscription: dbSchema.SubscriptionRow | null,
  now: Date,
): UsagePeriodBounds {
  if (
    subscription?.plan !== "free" &&
    subscription?.currentPeriodStart &&
    subscription.currentPeriodEnd
  ) {
    return {
      start: subscription.currentPeriodStart,
      end: subscription.currentPeriodEnd,
    };
  }

  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}

function usageValue(
  period: dbSchema.WorkspaceUsagePeriodRow,
  key: MeteredEntitlementKey,
): number {
  return period[key];
}

function counterColumn(key: MeteredEntitlementKey) {
  return dbSchema.workspaceUsagePeriods[key];
}

function counterSet(
  key: MeteredEntitlementKey,
  amount: number,
): Partial<dbSchema.NewWorkspaceUsagePeriodRow> {
  return {
    [key]: sql`${counterColumn(key)} + ${amount}`,
    updatedAt: new Date(),
  };
}

function decisionFromPeriod(
  input: MeteredReservationInput,
  period: dbSchema.WorkspaceUsagePeriodRow,
): EntitlementDecision {
  return evaluateEntitlement({
    plan: input.plan,
    key: input.key,
    used: usageValue(period, input.key),
    amount: input.amount,
    periodStart: period.periodStart,
    resetAt: period.periodEnd,
  });
}

function successfulReservationDecision(
  input: MeteredReservationInput,
  period: dbSchema.WorkspaceUsagePeriodRow,
  allowExistingFormCompletion: boolean,
): EntitlementDecision {
  const decision = evaluateEntitlement({
    plan: input.plan,
    key: input.key,
    used: Math.max(0, usageValue(period, input.key) - input.amount),
    amount: input.amount,
    periodStart: period.periodStart,
    resetAt: period.periodEnd,
  });
  return successfulExistingOperationDecision(
    decision,
    allowExistingFormCompletion,
  );
}

function existingFormCompletionDecision(
  decision: EntitlementDecision,
): EntitlementDecision {
  return {
    ...decision,
    allowed: true,
    status: decision.status === "blocked" ? "grace" : decision.status,
    recommendedPlan: null,
  };
}

function successfulExistingOperationDecision(
  decision: EntitlementDecision,
  allowExistingFormCompletion: boolean,
): EntitlementDecision {
  if (allowExistingFormCompletion) {
    return existingFormCompletionDecision(decision);
  }
  return {
    ...decision,
    allowed: true,
    status: decision.status === "blocked" ? "grace" : decision.status,
    recommendedPlan: null,
  };
}

function operationRow(
  input: MeteredReservationInput,
  usagePeriodId: string,
  state: dbSchema.WorkspaceUsageEventRow["state"],
): dbSchema.NewWorkspaceUsageEventRow {
  return {
    id: crypto.randomUUID(),
    usagePeriodId,
    workspaceType: input.workspace.type,
    workspaceId: input.workspace.id,
    entitlementKey: input.key,
    operationId: input.operationId!,
    amount: input.amount,
    state,
    updatedAt: input.now,
  };
}

async function reserveWithD1Batch(
  client: D1ClientLike,
  input: MeteredReservationInput,
  period: dbSchema.WorkspaceUsagePeriodRow,
  hardLimit: number | null,
  allowOverage: boolean,
  existing: dbSchema.WorkspaceUsageEventRow | null,
): Promise<void> {
  const column = counterSqlColumn(input.key);
  const capClause =
    hardLimit === null || allowOverage
      ? ""
      : ` AND ${column} + ? <= ?`;
  const capValues =
    hardLimit === null || allowOverage ? [] : [input.amount, hardLimit];
  const statements: D1StatementLike[] = [];

  if (!existing) {
    statements.push(
      client
        .prepare(
          "INSERT OR IGNORE INTO workspace_usage_events (id, usage_period_id, workspace_type, workspace_id, entitlement_key, operation_id, amount, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'released', unixepoch(), ?)",
        )
        .bind(
          crypto.randomUUID(),
          period.id,
          input.workspace.type,
          input.workspace.id,
          input.key,
          input.operationId,
          input.amount,
          toEpochSeconds(input.now),
        ),
    );
  }

  const eventReleasedGate = existing
    ? " AND EXISTS (SELECT 1 FROM workspace_usage_events WHERE id = ? AND state = 'released')"
    : " AND changes() = 1";
  const eventReleasedValues = existing ? [existing.id] : [];
  statements.push(
    client
      .prepare(
        `UPDATE workspace_usage_periods SET ${column} = ${column} + ?, updated_at = ? WHERE id = ? AND superseded_at IS NULL${eventReleasedGate}${capClause}`,
      )
      .bind(
        input.amount,
        toEpochSeconds(input.now),
        period.id,
        ...eventReleasedValues,
        ...capValues,
      ),
  );
  statements.push(
    client
      .prepare(
        "UPDATE workspace_usage_events SET usage_period_id = ?, amount = ?, state = 'reserved', updated_at = ? WHERE workspace_type = ? AND workspace_id = ? AND entitlement_key = ? AND operation_id = ? AND state = 'released' AND changes() = 1",
      )
      .bind(
        period.id,
        input.amount,
        toEpochSeconds(input.now),
        input.workspace.type,
        input.workspace.id,
        input.key,
        input.operationId,
      ),
  );
  await client.batch(statements);
}

function reserveWithSqliteTransaction(
  client: SyncSqliteClient,
  input: MeteredReservationInput,
  period: dbSchema.WorkspaceUsagePeriodRow,
  hardLimit: number | null,
  allowOverage: boolean,
): void {
  const run = client.transaction(function reserveTransaction() {
    const existing = client
      .query(
        "SELECT id, state FROM workspace_usage_events WHERE workspace_type = ? AND workspace_id = ? AND entitlement_key = ? AND operation_id = ? LIMIT 1",
      )
      .get(
        input.workspace.type,
        input.workspace.id,
        input.key,
        input.operationId,
      );
    if (existing && existing.state !== "released") return;

    const eventId =
      typeof existing?.id === "string" ? existing.id : crypto.randomUUID();
    if (!existing) {
      client
        .query(
          "INSERT INTO workspace_usage_events (id, usage_period_id, workspace_type, workspace_id, entitlement_key, operation_id, amount, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'released', unixepoch(), ?)",
        )
        .run(
          eventId,
          period.id,
          input.workspace.type,
          input.workspace.id,
          input.key,
          input.operationId,
          input.amount,
          toEpochSeconds(input.now),
        );
    }

    const column = counterSqlColumn(input.key);
    const capClause =
      hardLimit === null || allowOverage
        ? ""
        : ` AND ${column} + ? <= ?`;
    const capValues =
      hardLimit === null || allowOverage ? [] : [input.amount, hardLimit];
    const result = client
      .query(
        `UPDATE workspace_usage_periods SET ${column} = ${column} + ?, updated_at = ? WHERE id = ? AND superseded_at IS NULL${capClause}`,
      )
      .run(
        input.amount,
        toEpochSeconds(input.now),
        period.id,
        ...capValues,
      );
    if (changeCount(result) !== 1) return;

    client
      .query(
        "UPDATE workspace_usage_events SET usage_period_id = ?, amount = ?, state = 'reserved', updated_at = ? WHERE id = ? AND state = 'released'",
      )
      .run(
        period.id,
        input.amount,
        toEpochSeconds(input.now),
        eventId,
      );
  });
  run();
}

async function releaseWithD1Batch(
  client: D1ClientLike,
  event: dbSchema.WorkspaceUsageEventRow,
  key: MeteredEntitlementKey,
  now: Date,
): Promise<void> {
  const column = counterSqlColumn(key);
  await client.batch([
    client
      .prepare(
        `UPDATE workspace_usage_periods SET ${column} = max(0, ${column} - coalesce((SELECT amount FROM workspace_usage_events WHERE id = ? AND state = 'reserved'), 0)), updated_at = ? WHERE id = (SELECT usage_period_id FROM workspace_usage_events WHERE id = ? AND state = 'reserved')`,
      )
      .bind(event.id, toEpochSeconds(now), event.id),
    client
      .prepare(
        "UPDATE workspace_usage_events SET state = 'released', updated_at = ? WHERE id = ? AND state = 'reserved' AND changes() = 1",
      )
      .bind(toEpochSeconds(now), event.id),
  ]);
}

function releaseWithSqliteTransaction(
  client: SyncSqliteClient,
  event: dbSchema.WorkspaceUsageEventRow,
  key: MeteredEntitlementKey,
  now: Date,
): void {
  const run = client.transaction(function releaseTransaction() {
    const current = client
      .query(
        "SELECT state, usage_period_id, amount FROM workspace_usage_events WHERE id = ? LIMIT 1",
      )
      .get(event.id);
    if (current?.state !== "reserved") return;
    const column = counterSqlColumn(key);
    client
      .query(
        `UPDATE workspace_usage_periods SET ${column} = max(0, ${column} - ?), updated_at = ? WHERE id = ?`,
      )
      .run(
        Number(current.amount),
        toEpochSeconds(now),
        String(current.usage_period_id),
      );
    client
      .query(
        "UPDATE workspace_usage_events SET state = 'released', updated_at = ? WHERE id = ? AND state = 'reserved'",
      )
      .run(toEpochSeconds(now), event.id);
  });
  run();
}

function counterSqlColumn(key: MeteredEntitlementKey): string {
  const columns: Record<MeteredEntitlementKey, string> = {
    formResponses: "form_responses",
    bookings: "bookings",
    workflowExecutions: "workflow_executions",
    transactionalEmails: "transactional_emails",
    integrationRequests: "integration_requests",
    enrichments: "enrichments",
  };
  return columns[key];
}

function changeCount(result: unknown): number {
  if (!result || typeof result !== "object") return 0;
  const value = result as ChangeResult;
  return Number(value.changes ?? value.meta?.changes ?? 0);
}

function isD1Client(client: unknown): client is D1ClientLike {
  if (!client || typeof client !== "object") return false;
  const candidate = client as Partial<D1ClientLike>;
  return (
    typeof candidate.prepare === "function" &&
    typeof candidate.batch === "function"
  );
}

function isSyncSqliteClient(client: unknown): client is SyncSqliteClient {
  if (!client || typeof client !== "object") return false;
  const candidate = client as Partial<SyncSqliteClient>;
  return (
    typeof candidate.query === "function" &&
    typeof candidate.transaction === "function"
  );
}

function assertReservationAmount(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("Usage reservation amount must be a positive integer");
  }
}

function toEpochSeconds(value: Date): number {
  return Math.floor(value.getTime() / 1000);
}

import { and, eq, sql } from "drizzle-orm";
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
    await this.db
      .insert(dbSchema.workspaceUsagePeriods)
      .values({
        id: crypto.randomUUID(),
        workspaceType: input.workspace.type,
        workspaceId: input.workspace.id,
        periodStart: bounds.start,
        periodEnd: bounds.end,
      })
      .onConflictDoNothing({
        target: [
          dbSchema.workspaceUsagePeriods.workspaceType,
          dbSchema.workspaceUsagePeriods.workspaceId,
          dbSchema.workspaceUsagePeriods.periodStart,
        ],
      });

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

    if (!initialDecision.allowed && !allowExistingFormCompletion) {
      return initialDecision;
    }

    if (input.operationId && input.key !== "integrationRequests") {
      const state = await this.reserveOperation(
        input,
        period,
        initialDecision.hardLimit,
        allowExistingFormCompletion,
      );
      const updated = await this.getPeriodById(period.id);
      if (state === "reserved" || state === "consumed") {
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
      allowExistingFormCompletion,
    );
    if (!changed) {
      return decisionFromPeriod(input, await this.getPeriodById(period.id));
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
      await releaseWithD1Batch(client, event, input.key, input.amount, input.now);
      return;
    }
    if (isSyncSqliteClient(client)) {
      releaseWithSqliteTransaction(
        client,
        event,
        input.key,
        input.amount,
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
      .set({ state: "reserved", updatedAt: input.now })
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
      .set(counterSet(input.key, -input.amount))
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
    const condition =
      hardLimit === null || allowOverage
        ? eq(dbSchema.workspaceUsagePeriods.id, periodId)
        : and(
            eq(dbSchema.workspaceUsagePeriods.id, periodId),
            sql`${column} + ${amount} <= ${hardLimit}`,
          );
    const result = await this.db
      .update(dbSchema.workspaceUsagePeriods)
      .set(counterSet(key, amount))
      .where(condition);
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

  const insertGate = existing ? "" : " AND changes() = 1";
  statements.push(
    client
      .prepare(
        `UPDATE workspace_usage_periods SET ${column} = ${column} + ?, updated_at = ? WHERE id = ?${insertGate}${capClause}`,
      )
      .bind(
        input.amount,
        toEpochSeconds(input.now),
        period.id,
        ...capValues,
      ),
  );
  statements.push(
    client
      .prepare(
        "UPDATE workspace_usage_events SET state = 'reserved', updated_at = ? WHERE workspace_type = ? AND workspace_id = ? AND entitlement_key = ? AND operation_id = ? AND state = 'released' AND changes() = 1",
      )
      .bind(
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
        `UPDATE workspace_usage_periods SET ${column} = ${column} + ?, updated_at = ? WHERE id = ?${capClause}`,
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
        "UPDATE workspace_usage_events SET state = 'reserved', updated_at = ? WHERE id = ? AND state = 'released'",
      )
      .run(toEpochSeconds(input.now), eventId);
  });
  run();
}

async function releaseWithD1Batch(
  client: D1ClientLike,
  event: dbSchema.WorkspaceUsageEventRow,
  key: MeteredEntitlementKey,
  amount: number,
  now: Date,
): Promise<void> {
  const column = counterSqlColumn(key);
  await client.batch([
    client
      .prepare(
        `UPDATE workspace_usage_periods SET ${column} = max(0, ${column} - ?), updated_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM workspace_usage_events WHERE id = ? AND state = 'reserved')`,
      )
      .bind(amount, toEpochSeconds(now), event.usagePeriodId, event.id),
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
  amount: number,
  now: Date,
): void {
  const run = client.transaction(function releaseTransaction() {
    const current = client
      .query("SELECT state FROM workspace_usage_events WHERE id = ? LIMIT 1")
      .get(event.id);
    if (current?.state !== "reserved") return;
    const column = counterSqlColumn(key);
    client
      .query(
        `UPDATE workspace_usage_periods SET ${column} = max(0, ${column} - ?), updated_at = ? WHERE id = ?`,
      )
      .run(amount, toEpochSeconds(now), event.usagePeriodId);
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

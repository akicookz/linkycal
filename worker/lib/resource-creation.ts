import { and, eq, gte, isNull, ne, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

import { evaluateEntitlement } from "../../shared/entitlement-decision";
import type {
  EntitlementDecision,
  Plan,
  WorkspaceRef,
} from "../../shared/plan-catalog";
import * as dbSchema from "../db/schema";
import {
  entitlementError,
  type EntitlementErrorBody,
} from "./entitlement-errors";
import {
  EntitlementService,
  type ResourceEntitlementKey,
} from "../services/entitlement-service";

export type AppDatabase = DrizzleD1Database<Record<string, unknown>>;

export interface CapacityFailure {
  ok: false;
  status: 403;
  body: EntitlementErrorBody;
  decision: EntitlementDecision;
}

export interface CapacitySuccess {
  ok: true;
  decision: EntitlementDecision;
}

export type CapacityResult = CapacitySuccess | CapacityFailure;

export async function requireResourceCapacity(input: {
  db: AppDatabase;
  projectId: string;
  key: ResourceEntitlementKey;
  amount?: number;
  actionLabel?: string;
}): Promise<CapacityResult> {
  const decision = await new EntitlementService(input.db).resource(
    input.projectId,
    input.key,
    input.amount ?? 1,
  );
  return capacityResult(
    decision,
    input.actionLabel ?? actionLabelFor(input.key, input.amount ?? 1),
  );
}

export async function createWithResourceCapacity<T>(input: {
  db: AppDatabase;
  projectId: string;
  key: ResourceEntitlementKey;
  amount?: number;
  actionLabel?: string;
  create(db: AppDatabase): Promise<T>;
}): Promise<{ ok: true; value: T } | CapacityFailure> {
  return input.db.transaction(async (rawTransaction) => {
    const transaction = rawTransaction as unknown as AppDatabase;
    const capacity = await requireResourceCapacity({
      db: transaction,
      projectId: input.projectId,
      key: input.key,
      amount: input.amount,
      actionLabel: input.actionLabel,
    });
    if (!capacity.ok) return capacity;
    return { ok: true as const, value: await input.create(transaction) };
  });
}

export async function requireWorkspaceResourceCapacity(input: {
  db: AppDatabase;
  workspace: WorkspaceRef;
  plan: Plan;
  key: "projects" | "teamMembers" | "calendarConnections";
  amount?: number;
  actionLabel?: string;
  now?: Date;
}): Promise<CapacityResult> {
  const used = await workspaceResourceUsage(input);
  const decision = evaluateEntitlement({
    plan: input.plan,
    key: input.key,
    used,
    amount: input.amount ?? 1,
  });
  return capacityResult(
    decision,
    input.actionLabel ?? actionLabelFor(input.key, input.amount ?? 1),
  );
}

export async function createWithWorkspaceResourceCapacity<T>(input: {
  db: AppDatabase;
  workspace: WorkspaceRef;
  plan: Plan;
  key: "projects" | "teamMembers" | "calendarConnections";
  amount?: number;
  actionLabel?: string;
  now?: Date;
  create(db: AppDatabase): Promise<T>;
}): Promise<{ ok: true; value: T } | CapacityFailure> {
  return input.db.transaction(async (rawTransaction) => {
    const transaction = rawTransaction as unknown as AppDatabase;
    const capacity = await requireWorkspaceResourceCapacity({
      db: transaction,
      workspace: input.workspace,
      plan: input.plan,
      key: input.key,
      amount: input.amount,
      actionLabel: input.actionLabel,
      now: input.now,
    });
    if (!capacity.ok) return capacity;
    return { ok: true as const, value: await input.create(transaction) };
  });
}

function capacityResult(
  decision: EntitlementDecision,
  actionLabel: string,
): CapacityResult {
  if (decision.allowed) return { ok: true, decision };
  const failure = entitlementError(decision, actionLabel);
  return {
    ok: false,
    status: 403,
    body: failure.body,
    decision,
  };
}

async function workspaceResourceUsage(input: {
  db: AppDatabase;
  workspace: WorkspaceRef;
  key: "projects" | "teamMembers" | "calendarConnections";
  now?: Date;
}): Promise<number> {
  if (input.key === "projects") {
    const condition = input.workspace.teamId
      ? eq(dbSchema.projects.teamId, input.workspace.teamId)
      : and(
          eq(dbSchema.projects.userId, input.workspace.ownerUserId),
          isNull(dbSchema.projects.teamId),
        );
    return count(input.db, dbSchema.projects, condition);
  }

  if (input.key === "calendarConnections") {
    return input.workspace.teamId
      ? count(
          input.db,
          dbSchema.teamCalendarConnections,
          eq(
            dbSchema.teamCalendarConnections.teamId,
            input.workspace.teamId,
          ),
        )
      : count(
          input.db,
          dbSchema.calendarConnections,
          eq(
            dbSchema.calendarConnections.userId,
            input.workspace.ownerUserId,
          ),
        );
  }

  if (!input.workspace.teamId) return 0;
  const [members, pendingInvites] = await Promise.all([
    count(
      input.db,
      dbSchema.teamMembers,
      and(
        eq(dbSchema.teamMembers.teamId, input.workspace.teamId),
        ne(dbSchema.teamMembers.role, "owner"),
      ),
    ),
    count(
      input.db,
      dbSchema.teamInvites,
      and(
        eq(dbSchema.teamInvites.teamId, input.workspace.teamId),
        eq(dbSchema.teamInvites.status, "pending"),
        gte(dbSchema.teamInvites.expiresAt, input.now ?? new Date()),
      ),
    ),
  ]);
  return members + pendingInvites;
}

async function count(
  db: AppDatabase,
  table: SQLiteTable,
  condition: SQL | undefined,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(table)
    .where(condition);
  return Number(row?.count ?? 0);
}

function actionLabelFor(
  key: ResourceEntitlementKey,
  amount: number,
): string {
  const label = {
    projects: "create another project",
    forms: "create another form",
    eventTypes: "create another event type",
    contacts: amount === 1 ? "create another contact" : "import these contacts",
    workflows: "create another workflow",
    calendarConnections: "connect another calendar",
    teamMembers: "add another team member",
  } satisfies Record<ResourceEntitlementKey, string>;
  return label[key];
}

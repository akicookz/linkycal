import { and, eq, lte } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

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
import {
  applyEntitlementEnforcement,
  type EntitlementModeEnv,
} from "./entitlement-mode";
import { workspaceResourceUsage } from "./workspace-resource-usage";

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
  env?: EntitlementModeEnv;
  channel?: string;
  operationId?: string;
}): Promise<CapacityResult> {
  const service = new EntitlementService(input.db);
  let decision = await service.resource(
    input.projectId,
    input.key,
    input.amount ?? 1,
  );
  if (input.env && !decision.allowed) {
    const resolved = await service.resolveProject(input.projectId);
    if (resolved) {
      decision = applyEntitlementEnforcement(decision, {
        env: input.env,
        workspace: resolved.workspace,
        projectId: input.projectId,
        plan: resolved.subscription.plan,
        channel: input.channel ?? "unknown",
        operationId: input.operationId,
      });
    }
  }
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
  env?: EntitlementModeEnv;
  channel?: string;
  operationId?: string;
  create(db: AppDatabase): Promise<T>;
}): Promise<{ ok: true; value: T } | CapacityFailure> {
  return withResourceCreationLease(
    input.db,
    `project:${input.projectId}:${input.key}`,
    async function createWithProjectLease() {
      const capacity = await requireResourceCapacity({
        db: input.db,
        projectId: input.projectId,
        key: input.key,
        amount: input.amount,
        actionLabel: input.actionLabel,
        env: input.env,
        channel: input.channel,
        operationId: input.operationId,
      });
      if (!capacity.ok) return capacity;
      return { ok: true as const, value: await input.create(input.db) };
    },
  );
}

export async function requireWorkspaceResourceCapacity(input: {
  db: AppDatabase;
  workspace: WorkspaceRef;
  plan: Plan;
  key: "projects" | "teamMembers" | "calendarConnections";
  amount?: number;
  actionLabel?: string;
  now?: Date;
  env?: EntitlementModeEnv;
  channel?: string;
  operationId?: string;
}): Promise<CapacityResult> {
  const used = await workspaceResourceUsage(input);
  let decision = evaluateEntitlement({
    plan: input.plan,
    key: input.key,
    used,
    amount: input.amount ?? 1,
  });
  if (input.env && !decision.allowed) {
    decision = applyEntitlementEnforcement(decision, {
      env: input.env,
      workspace: input.workspace,
      projectId: null,
      plan: input.plan,
      channel: input.channel ?? "unknown",
      operationId: input.operationId,
    });
  }
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
  env?: EntitlementModeEnv;
  channel?: string;
  operationId?: string;
  create(db: AppDatabase): Promise<T>;
}): Promise<{ ok: true; value: T } | CapacityFailure> {
  return withResourceCreationLease(
    input.db,
    `workspace:${input.workspace.type}:${input.workspace.id}:${input.key}`,
    async function createWithWorkspaceLease() {
      const capacity = await requireWorkspaceResourceCapacity({
        db: input.db,
        workspace: input.workspace,
        plan: input.plan,
        key: input.key,
        amount: input.amount,
        actionLabel: input.actionLabel,
        now: input.now,
        env: input.env,
        channel: input.channel,
        operationId: input.operationId,
      });
      if (!capacity.ok) return capacity;
      return { ok: true as const, value: await input.create(input.db) };
    },
  );
}

async function withResourceCreationLease<T>(
  db: AppDatabase,
  lockKey: string,
  action: () => Promise<T>,
): Promise<T> {
  const token = crypto.randomUUID();
  await acquireResourceCreationLease(db, lockKey, token);
  try {
    return await action();
  } finally {
    await db
      .delete(dbSchema.entitlementResourceLocks)
      .where(
        and(
          eq(dbSchema.entitlementResourceLocks.lockKey, lockKey),
          eq(dbSchema.entitlementResourceLocks.token, token),
        ),
      );
  }
}

async function acquireResourceCreationLease(
  db: AppDatabase,
  lockKey: string,
  token: string,
): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15_000);
    const claimed = await db
      .insert(dbSchema.entitlementResourceLocks)
      .values({ lockKey, token, expiresAt })
      .onConflictDoUpdate({
        target: dbSchema.entitlementResourceLocks.lockKey,
        set: { token, expiresAt, updatedAt: now },
        setWhere: lte(dbSchema.entitlementResourceLocks.expiresAt, now),
      })
      .returning({ token: dbSchema.entitlementResourceLocks.token });
    if (claimed[0]?.token === token) return;
    await waitForLease(25);
  }
  throw new Error("Resource capacity check is busy; retry the request");
}

async function waitForLease(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
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

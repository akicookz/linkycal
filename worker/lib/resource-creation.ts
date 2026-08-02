import { eq } from "drizzle-orm";
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
  const amount = input.amount ?? 1;
  const claimPrefix = await resourceClaimPrefix(
    input.db,
    input.projectId,
    input.key,
  );
  return createWithResourceClaims({
    db: input.db,
    claimPrefix,
    amount,
    actionLabel: input.actionLabel ?? actionLabelFor(input.key, amount),
    capacity: async function projectCapacity() {
      return requireResourceCapacity({
        db: input.db,
        projectId: input.projectId,
        key: input.key,
        amount,
        actionLabel: input.actionLabel,
        env: input.env,
        channel: input.channel,
        operationId: input.operationId,
      });
    },
    create: input.create,
  });
}

async function resourceClaimPrefix(
  db: AppDatabase,
  projectId: string,
  key: ResourceEntitlementKey,
): Promise<string> {
  if (
    key !== "projects" &&
    key !== "teamMembers" &&
    key !== "calendarConnections"
  ) {
    return `project:${projectId}:${key}`;
  }

  const resolved = await new EntitlementService(db).resolveProject(projectId);
  if (!resolved) throw new Error(`Project ${projectId} not found`);
  return `workspace:${resolved.workspace.type}:${resolved.workspace.id}:${key}`;
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
  const amount = input.amount ?? 1;
  return createWithResourceClaims({
    db: input.db,
    claimPrefix:
      `workspace:${input.workspace.type}:${input.workspace.id}:${input.key}`,
    amount,
    actionLabel: input.actionLabel ?? actionLabelFor(input.key, amount),
    capacity: async function workspaceCapacity() {
      return requireWorkspaceResourceCapacity({
        db: input.db,
        workspace: input.workspace,
        plan: input.plan,
        key: input.key,
        amount,
        actionLabel: input.actionLabel,
        now: input.now,
        env: input.env,
        channel: input.channel,
        operationId: input.operationId,
      });
    },
    create: input.create,
  });
}

async function createWithResourceClaims<T>(input: {
  db: AppDatabase;
  claimPrefix: string;
  amount: number;
  actionLabel: string;
  capacity(): Promise<CapacityResult>;
  create(db: AppDatabase): Promise<T>;
}): Promise<{ ok: true; value: T } | CapacityFailure> {
  if (input.amount <= 0) {
    return { ok: true, value: await input.create(input.db) };
  }

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const capacity = await input.capacity();
    if (!capacity.ok) return capacity;
    const hardLimit = capacity.decision.hardLimit;
    const used = capacity.decision.used;
    if (
      hardLimit === null ||
      used === null ||
      used + input.amount > hardLimit
    ) {
      return { ok: true, value: await input.create(input.db) };
    }

    const claim = await tryClaimResourceSlots({
      db: input.db,
      claimPrefix: input.claimPrefix,
      token: crypto.randomUUID(),
      used,
      amount: input.amount,
      hardLimit,
    });
    if (claim.status === "acquired") {
      try {
        return { ok: true, value: await input.create(input.db) };
      } finally {
        await input.db
          .delete(dbSchema.entitlementResourceLocks)
          .where(eq(dbSchema.entitlementResourceLocks.token, claim.token));
      }
    }
    if (claim.status === "full" && attempt >= 3) {
      return reservedCapacityFailure(
        capacity.decision,
        used + claim.activeClaims,
        input.actionLabel,
      );
    }
    await waitForClaim(25);
  }

  const capacity = await input.capacity();
  if (!capacity.ok) return capacity;
  return reservedCapacityFailure(
    capacity.decision,
    capacity.decision.hardLimit ?? capacity.decision.used ?? 0,
    input.actionLabel,
  );
}

type ClaimResult =
  | { status: "acquired"; token: string }
  | { status: "collision" }
  | { status: "full"; activeClaims: number };

async function tryClaimResourceSlots(input: {
  db: AppDatabase;
  claimPrefix: string;
  token: string;
  used: number;
  amount: number;
  hardLimit: number;
}): Promise<ClaimResult> {
  const rows = await input.db
    .select({ lockKey: dbSchema.entitlementResourceLocks.lockKey })
    .from(dbSchema.entitlementResourceLocks);
  const prefix = `${input.claimPrefix}:slot:`;
  const activeKeys = new Set(
    rows
      .map((row) => row.lockKey)
      .filter((lockKey) => lockKey.startsWith(prefix)),
  );
  const availableSlots: number[] = [];
  for (
    let slot = input.used;
    slot < input.hardLimit && availableSlots.length < input.amount;
    slot += 1
  ) {
    if (!activeKeys.has(`${prefix}${slot}`)) availableSlots.push(slot);
  }
  if (availableSlots.length < input.amount) {
    return { status: "full", activeClaims: activeKeys.size };
  }

  try {
    await input.db.insert(dbSchema.entitlementResourceLocks).values(
      availableSlots.map((slot) => ({
        lockKey: `${prefix}${slot}`,
        token: input.token,
        // Claims deliberately do not expire: capacity fails closed if an
        // isolate dies, so a stale writer can never cross a hard limit.
        expiresAt: new Date("9999-12-31T23:59:59.000Z"),
      })),
    );
    return { status: "acquired", token: input.token };
  } catch (error) {
    if (isUniqueConstraintError(error)) return { status: "collision" };
    throw error;
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (/unique constraint|constraint failed/i.test(String(current))) {
      return true;
    }
    current = typeof current === "object" && "cause" in current
      ? (current as { cause?: unknown }).cause
      : null;
  }
  return false;
}

function reservedCapacityFailure(
  decision: EntitlementDecision,
  used: number,
  actionLabel: string,
): CapacityFailure {
  const reservedDecision: EntitlementDecision = {
    ...decision,
    allowed: false,
    status: "blocked",
    used,
  };
  const failure = capacityResult(reservedDecision, actionLabel);
  if (failure.ok) throw new Error("Reserved capacity must be blocked");
  return failure;
}

async function waitForClaim(milliseconds: number): Promise<void> {
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

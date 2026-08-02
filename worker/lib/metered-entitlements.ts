import type { DrizzleD1Database } from "drizzle-orm/d1";

import type { EntitlementDecision } from "../../shared/plan-catalog";
import * as dbSchema from "../db/schema";
import type { MeteredEmailDependency } from "../services/email-service";
import {
  UsageService,
  type MeteredEntitlementKey,
  type MeteredReservationInput,
} from "../services/usage-service";
import { EntitlementService } from "../services/entitlement-service";
import {
  entitlementError,
  mcpEntitlementError,
  type EntitlementErrorBody,
  type EntitlementHttpError,
} from "./entitlement-errors";
import {
  applyEntitlementEnforcement,
  type EntitlementModeEnv,
} from "./entitlement-mode";

type AppDatabase = DrizzleD1Database<Record<string, unknown>>;

export interface ProjectUsageReservation {
  decision: EntitlementDecision;
  input: MeteredReservationInput;
  consume(): Promise<void>;
  release(): Promise<void>;
  httpError(actionLabel: string): EntitlementHttpError;
  mcpError(actionLabel: string): {
    [key: string]: unknown;
    isError: true;
    content: Array<{ type: "text"; text: string }>;
    structuredContent: { entitlementError: EntitlementErrorBody };
  };
}

export async function getProjectUsageDecision(input: {
  db: AppDatabase;
  projectId: string;
  key: MeteredEntitlementKey;
  amount?: number;
  now?: Date;
  env?: EntitlementModeEnv;
  channel?: string;
}): Promise<EntitlementDecision> {
  const resolved = await new EntitlementService(input.db).resolveProject(
    input.projectId,
  );
  if (!resolved) throw new Error(`Project ${input.projectId} not found`);
  const decision = await new UsageService(input.db).getDecision({
    workspace: resolved.workspace,
    subscription: resolved.subscriptionRecord,
    plan: resolved.subscription.plan,
    key: input.key,
    amount: input.amount ?? 1,
    now: input.now ?? new Date(),
  });
  return input.env
    ? applyEntitlementEnforcement(decision, {
        env: input.env,
        workspace: resolved.workspace,
        projectId: input.projectId,
        plan: resolved.subscription.plan,
        channel: input.channel ?? "unknown",
      })
    : decision;
}

export async function reserveProjectUsage(input: {
  db: AppDatabase;
  projectId: string;
  key: MeteredEntitlementKey;
  amount?: number;
  operationId?: string;
  allowExistingOverage?: boolean;
  now?: Date;
  channel: string;
  env?: EntitlementModeEnv;
}): Promise<ProjectUsageReservation> {
  const resolved = await new EntitlementService(input.db).resolveProject(
    input.projectId,
  );
  if (!resolved) throw new Error(`Project ${input.projectId} not found`);

  const reservationInput: MeteredReservationInput = {
    workspace: resolved.workspace,
    subscription: resolved.subscriptionRecord,
    plan: resolved.subscription.plan,
    key: input.key,
    amount: input.amount ?? 1,
    operationId: input.operationId,
    allowExistingOverage: input.allowExistingOverage,
    now: input.now ?? new Date(),
  };
  const usage = new UsageService(input.db);
  const reservedDecision = await usage.reserve(reservationInput);
  const decision = input.env
    ? applyEntitlementEnforcement(reservedDecision, {
        env: input.env,
        workspace: resolved.workspace,
        projectId: input.projectId,
        plan: resolved.subscription.plan,
        channel: input.channel,
        operationId: input.operationId,
      })
    : reservedDecision;

  return {
    decision,
    input: reservationInput,
    consume: async () => usage.consume(reservationInput),
    release: async () => usage.release(reservationInput),
    httpError: (actionLabel) => entitlementError(decision, actionLabel),
    mcpError: (actionLabel) => mcpEntitlementError(decision, actionLabel),
  };
}

export async function recordEntitlementOutcome(input: {
  db: AppDatabase;
  projectId: string;
  sourceType: string;
  sourceId: string;
  entitlementKey: MeteredEntitlementKey | "contacts" | "storageBytes";
  channel: string;
  outcome?: "blocked" | "skipped";
}): Promise<void> {
  const resolved = await new EntitlementService(input.db).resolveProject(
    input.projectId,
  );
  if (!resolved) return;
  await input.db.insert(dbSchema.entitlementOutcomes).values({
    id: crypto.randomUUID(),
    workspaceType: resolved.workspace.type,
    workspaceId: resolved.workspace.id,
    projectId: input.projectId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    entitlementKey: input.entitlementKey,
    outcome: input.outcome ?? "skipped",
    channel: input.channel,
  });
}

export async function createMeteredEmailDependency(input: {
  db: AppDatabase;
  env?: EntitlementModeEnv;
  projectId: string;
  sourceType: string;
  sourceId: string;
  channel: string;
  now?: () => Date;
}): Promise<MeteredEmailDependency> {
  return {
    beforeSend: async (message) => {
      const recipients = Array.from(
        new Set([message.to, ...(message.cc ?? [])].map(normalizeRecipient)),
      ).sort();
      const operationId = [
        input.sourceId,
        input.channel,
        stableSegment(message.subject),
        ...recipients,
      ].join(":");
      const reservation = await reserveProjectUsage({
        db: input.db,
        projectId: input.projectId,
        key: "transactionalEmails",
        amount: recipients.length,
        operationId,
        now: input.now?.(),
        channel: input.channel,
        env: input.env,
      });
      if (!reservation.decision.allowed) {
        await recordEntitlementOutcome({
          db: input.db,
          projectId: input.projectId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          entitlementKey: "transactionalEmails",
          channel: input.channel,
        });
      }
      return {
        allowed: reservation.decision.allowed,
        operationId,
        consume: reservation.consume,
        release: reservation.release,
      };
    },
  };
}

function normalizeRecipient(value: string): string {
  return value.trim().toLowerCase();
}

function stableSegment(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

import { and, desc, eq, isNull } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import * as dbSchema from "../db/schema";
import type { Plan, PlanLimits } from "../types";
import { PLAN_LIMITS } from "./plan-limits";

type AppDatabase = DrizzleD1Database<Record<string, unknown>>;

export interface SubscriptionSummary {
  plan: Plan;
  status: string;
}

export interface ProjectEntitlements {
  ownerUserId: string;
  teamId: string | null;
  subscription: SubscriptionSummary;
  planLimits: PlanLimits;
}

export async function getLegacySubscriptionRecordByUserId(
  db: AppDatabase,
  userId: string,
): Promise<dbSchema.SubscriptionRow | null> {
  const [subscription] = await db
    .select()
    .from(dbSchema.subscriptions)
    .where(
      and(
        eq(dbSchema.subscriptions.userId, userId),
        isNull(dbSchema.subscriptions.teamId),
      ),
    )
    .orderBy(
      desc(dbSchema.subscriptions.updatedAt),
      desc(dbSchema.subscriptions.createdAt),
    )
    .limit(1);

  return subscription ?? null;
}

export async function getSubscriptionRecordByTeamId(
  db: AppDatabase,
  teamId: string,
): Promise<dbSchema.SubscriptionRow | null> {
  const [subscription] = await db
    .select()
    .from(dbSchema.subscriptions)
    .where(eq(dbSchema.subscriptions.teamId, teamId))
    .orderBy(
      desc(dbSchema.subscriptions.updatedAt),
      desc(dbSchema.subscriptions.createdAt),
    )
    .limit(1);

  return subscription ?? null;
}

export async function getSubscriptionRecordByCustomerId(
  db: AppDatabase,
  customerId: string,
): Promise<dbSchema.SubscriptionRow | null> {
  const [subscription] = await db
    .select()
    .from(dbSchema.subscriptions)
    .where(eq(dbSchema.subscriptions.stripeCustomerId, customerId))
    .orderBy(
      desc(dbSchema.subscriptions.updatedAt),
      desc(dbSchema.subscriptions.createdAt),
    )
    .limit(1);

  return subscription ?? null;
}

export async function getSubscriptionRecordByStripeSubscriptionId(
  db: AppDatabase,
  subscriptionId: string,
): Promise<dbSchema.SubscriptionRow | null> {
  const [subscription] = await db
    .select()
    .from(dbSchema.subscriptions)
    .where(eq(dbSchema.subscriptions.stripeSubscriptionId, subscriptionId))
    .limit(1);

  return subscription ?? null;
}

export async function ensureTeamSubscriptionRecord(
  db: AppDatabase,
  ownerUserId: string,
  teamId: string,
): Promise<dbSchema.SubscriptionRow> {
  const existing = await getSubscriptionRecordByTeamId(db, teamId);
  if (existing) return existing;

  try {
    await db.insert(dbSchema.subscriptions).values({
      id: crypto.randomUUID(),
      userId: ownerUserId,
      teamId,
      plan: "free",
      interval: "monthly",
      status: "active",
    });
  } catch (error) {
    if (!isSubscriptionUniqueConstraintError(error)) {
      throw error;
    }
  }

  const created = await getSubscriptionRecordByTeamId(db, teamId);
  if (!created) {
    throw new Error(`Failed to ensure subscription record for team ${teamId}`);
  }

  return created;
}

export async function ensureLegacySubscriptionRecord(
  db: AppDatabase,
  userId: string,
): Promise<dbSchema.SubscriptionRow> {
  const existing = await getLegacySubscriptionRecordByUserId(db, userId);
  if (existing) return existing;

  try {
    await db.insert(dbSchema.subscriptions).values({
      id: crypto.randomUUID(),
      userId,
      teamId: null,
      plan: "free",
      interval: "monthly",
      status: "active",
    });
  } catch (error) {
    if (!isSubscriptionUniqueConstraintError(error)) {
      throw error;
    }
  }

  const created = await getLegacySubscriptionRecordByUserId(db, userId);
  if (!created) {
    throw new Error(`Failed to ensure legacy subscription record for user ${userId}`);
  }

  return created;
}

export function resolveSubscriptionPlan(
  subscription: dbSchema.SubscriptionRow | null,
): SubscriptionSummary {
  let plan: Plan = (subscription?.plan as Plan) ?? "free";
  const status = subscription?.status ?? "active";

  if (
    subscription &&
    (status === "past_due" || status === "unpaid") &&
    plan !== "free"
  ) {
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    const updatedAt =
      subscription.updatedAt instanceof Date
        ? subscription.updatedAt.getTime()
        : new Date(subscription.updatedAt as unknown as string).getTime();
    if (Date.now() - updatedAt > threeDaysMs) {
      plan = "free";
    }
  }

  return { plan, status };
}

export async function resolveProjectEntitlements(
  db: AppDatabase,
  projectId: string,
  options: { ensureSubscription?: boolean } = {},
): Promise<ProjectEntitlements | null> {
  const [project] = await db
    .select({
      userId: dbSchema.projects.userId,
      teamId: dbSchema.projects.teamId,
    })
    .from(dbSchema.projects)
    .where(eq(dbSchema.projects.id, projectId))
    .limit(1);

  if (!project) return null;

  if (!project.teamId) {
    const subscription = options.ensureSubscription
      ? await ensureLegacySubscriptionRecord(db, project.userId)
      : await getLegacySubscriptionRecordByUserId(db, project.userId);
    const summary = resolveSubscriptionPlan(subscription);
    return {
      ownerUserId: project.userId,
      teamId: null,
      subscription: summary,
      planLimits: PLAN_LIMITS[summary.plan],
    };
  }

  const [team] = await db
    .select({ ownerUserId: dbSchema.teams.ownerUserId })
    .from(dbSchema.teams)
    .where(eq(dbSchema.teams.id, project.teamId))
    .limit(1);

  const ownerUserId = team?.ownerUserId ?? project.userId;
  const subscription = options.ensureSubscription
    ? await ensureTeamSubscriptionRecord(db, ownerUserId, project.teamId)
    : await getSubscriptionRecordByTeamId(db, project.teamId);
  const summary = resolveSubscriptionPlan(subscription);

  return {
    ownerUserId,
    teamId: project.teamId,
    subscription: summary,
    planLimits: PLAN_LIMITS[summary.plan],
  };
}

function isSubscriptionUniqueConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("unique constraint failed") &&
    (message.includes("subscriptions.user_id") ||
      message.includes("subscriptions.team_id") ||
      message.includes("subscriptions.stripe_subscription_id"))
  );
}

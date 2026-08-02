import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

import { evaluateEntitlement } from "../../shared/entitlement-decision";
import {
  ENTITLEMENT_METADATA,
  PLAN_CATALOG,
  type EntitlementDecision,
  type EntitlementKey,
  type EntitlementOutcomeSummary,
  type ProjectEntitlementSnapshot,
} from "../../shared/plan-catalog";
import * as dbSchema from "../db/schema";
import {
  resolveProjectEntitlements,
  type ProjectEntitlements,
} from "../lib/entitlements";
import { resolveProjectAccess } from "../lib/team-access";
import { workspaceResourceUsage } from "../lib/workspace-resource-usage";
import { UsageService } from "./usage-service";

type AppDatabase = DrizzleD1Database<Record<string, unknown>>;

export type FeatureEntitlementKey =
  | "analytics"
  | "analyticsRetentionMonths"
  | "widgets"
  | "themeOverrides"
  | "apiAccess"
  | "mcpAccess"
  | "customCss"
  | "removeBranding";

export type ResourceEntitlementKey =
  | "projects"
  | "forms"
  | "eventTypes"
  | "contacts"
  | "workflows"
  | "calendarConnections"
  | "teamMembers";

type ResourceCounts = Record<ResourceEntitlementKey, number>;

export class EntitlementService {
  constructor(private db: AppDatabase) {}

  async resolveProject(projectId: string): Promise<ProjectEntitlements | null> {
    return resolveProjectEntitlements(this.db, projectId, {
      ensureSubscription: true,
    });
  }

  async feature(
    projectId: string,
    key: FeatureEntitlementKey,
  ): Promise<EntitlementDecision> {
    const resolved = await this.resolveProject(projectId);
    if (!resolved) throw new Error(`Project ${projectId} not found`);
    return evaluateEntitlement({
      plan: resolved.subscription.plan,
      key,
    });
  }

  async resource(
    projectId: string,
    key: ResourceEntitlementKey,
    amount = 1,
  ): Promise<EntitlementDecision> {
    const resolved = await this.resolveProject(projectId);
    if (!resolved) throw new Error(`Project ${projectId} not found`);
    const counts = await this.resourceCounts(projectId, resolved);
    return evaluateEntitlement({
      plan: resolved.subscription.plan,
      key,
      used: counts[key],
      amount,
    });
  }

  async snapshot(
    projectId: string,
    actorUserId?: string,
  ): Promise<ProjectEntitlementSnapshot | null> {
    const resolved = await this.resolveProject(projectId);
    if (!resolved) return null;

    const access = actorUserId
      ? await resolveProjectAccess(this.db, projectId, actorUserId)
      : null;
    if (actorUserId && !access) return null;

    const usageService = new UsageService(this.db);
    const [counts, period, storageBytes, outcomes] = await Promise.all([
      this.resourceCounts(projectId, resolved),
      usageService.getOrCreatePeriod({
        workspace: resolved.workspace,
        subscription: resolved.subscriptionRecord,
        now: new Date(),
      }),
      this.storageBytes(resolved),
      this.recentOutcomes(projectId),
    ]);

    const entitlements = {} as Record<EntitlementKey, EntitlementDecision>;
    for (const key of Object.keys(ENTITLEMENT_METADATA) as EntitlementKey[]) {
      const metadata = ENTITLEMENT_METADATA[key];
      if (metadata.kind === "feature") {
        entitlements[key] = evaluateEntitlement({
          plan: resolved.subscription.plan,
          key,
        });
      } else if (key === "storageBytes") {
        entitlements[key] = evaluateEntitlement({
          plan: resolved.subscription.plan,
          key,
          used: storageBytes,
        });
      } else if (metadata.kind === "resource") {
        entitlements[key] = evaluateEntitlement({
          plan: resolved.subscription.plan,
          key,
          used: counts[key as ResourceEntitlementKey],
        });
      } else {
        entitlements[key] = evaluateEntitlement({
          plan: resolved.subscription.plan,
          key,
          used: meteredUsage(period, key),
          periodStart: period.periodStart,
          resetAt: period.periodEnd,
        });
      }
    }

    const subscriptionRecord = resolved.subscriptionRecord;
    return {
      workspace: resolved.workspace,
      plan: {
        id: resolved.subscription.plan,
        name: PLAN_CATALOG[resolved.subscription.plan].name,
        status: resolved.subscription.status,
        interval: subscriptionRecord?.interval ?? "monthly",
        currentPeriodStart: toIso(subscriptionRecord?.currentPeriodStart),
        currentPeriodEnd: toIso(subscriptionRecord?.currentPeriodEnd),
      },
      billing: {
        teamId: resolved.teamId,
        ownerUserId: resolved.ownerUserId,
        canManageBilling:
          access?.isLegacyOwner === true ||
          access?.teamRole === "owner" ||
          access?.teamRole === "admin",
      },
      access: {
        teamRole: access?.teamRole ?? null,
        projectRole: access?.projectRole ?? null,
        effectiveProjectRole: access?.effectiveProjectRole ?? null,
      },
      entitlements,
      recentOutcomes: outcomes,
      subscription: resolved.subscription,
      planLimits: resolved.planLimits,
    };
  }

  private async resourceCounts(
    projectId: string,
    resolved: ProjectEntitlements,
  ): Promise<ResourceCounts> {
    const projectCondition = resolved.workspace.teamId
      ? eq(dbSchema.projects.teamId, resolved.workspace.teamId)
      : and(
          eq(dbSchema.projects.userId, resolved.workspace.ownerUserId),
          isNull(dbSchema.projects.teamId),
        );
    const calendarTable = resolved.workspace.teamId
      ? dbSchema.teamCalendarConnections
      : dbSchema.calendarConnections;
    const calendarCondition = resolved.workspace.teamId
      ? eq(
          dbSchema.teamCalendarConnections.teamId,
          resolved.workspace.teamId,
        )
      : eq(
          dbSchema.calendarConnections.userId,
          resolved.workspace.ownerUserId,
        );

    const [
      projects,
      forms,
      eventTypes,
      contacts,
      workflows,
      calendarConnections,
      teamMembers,
    ] = await Promise.all([
      countRows(this.db, dbSchema.projects, projectCondition),
      countRows(
        this.db,
        dbSchema.forms,
        eq(dbSchema.forms.projectId, projectId),
      ),
      countRows(
        this.db,
        dbSchema.eventTypes,
        eq(dbSchema.eventTypes.projectId, projectId),
      ),
      countRows(
        this.db,
        dbSchema.contacts,
        eq(dbSchema.contacts.projectId, projectId),
      ),
      countRows(
        this.db,
        dbSchema.workflows,
        eq(dbSchema.workflows.projectId, projectId),
      ),
      countRows(this.db, calendarTable, calendarCondition),
      workspaceResourceUsage({
        db: this.db,
        workspace: resolved.workspace,
        key: "teamMembers",
      }),
    ]);

    return {
      projects,
      forms,
      eventTypes,
      contacts,
      workflows,
      calendarConnections,
      teamMembers,
    };
  }

  private async storageBytes(resolved: ProjectEntitlements): Promise<number> {
    const [row] = await this.db
      .select({ sizeBytes: dbSchema.workspaceStorageTotals.sizeBytes })
      .from(dbSchema.workspaceStorageTotals)
      .where(
        and(
          eq(
            dbSchema.workspaceStorageTotals.workspaceType,
            resolved.workspace.type,
          ),
          eq(
            dbSchema.workspaceStorageTotals.workspaceId,
            resolved.workspace.id,
          ),
        ),
      )
      .limit(1);
    return row?.sizeBytes ?? 0;
  }

  private async recentOutcomes(
    projectId: string,
  ): Promise<EntitlementOutcomeSummary[]> {
    const rows = await this.db
      .select({
        id: dbSchema.entitlementOutcomes.id,
        sourceType: dbSchema.entitlementOutcomes.sourceType,
        sourceId: dbSchema.entitlementOutcomes.sourceId,
        entitlementKey: dbSchema.entitlementOutcomes.entitlementKey,
        outcome: dbSchema.entitlementOutcomes.outcome,
        channel: dbSchema.entitlementOutcomes.channel,
        createdAt: dbSchema.entitlementOutcomes.createdAt,
      })
      .from(dbSchema.entitlementOutcomes)
      .where(eq(dbSchema.entitlementOutcomes.projectId, projectId))
      .orderBy(desc(dbSchema.entitlementOutcomes.createdAt))
      .limit(10);

    return rows.flatMap((row) => {
      if (!isEntitlementKey(row.entitlementKey)) return [];
      return [
        {
          id: row.id,
          sourceType: row.sourceType,
          sourceId: row.sourceId,
          entitlement: row.entitlementKey,
          outcome: row.outcome,
          channel: row.channel,
          createdAt: row.createdAt.toISOString(),
        },
      ];
    });
  }
}

async function countRows(
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

function meteredUsage(
  period: dbSchema.WorkspaceUsagePeriodRow,
  key: EntitlementKey,
): number {
  switch (key) {
    case "formResponses":
    case "bookings":
    case "workflowExecutions":
    case "transactionalEmails":
    case "integrationRequests":
    case "enrichments":
      return period[key];
    default:
      return 0;
  }
}

function isEntitlementKey(value: string): value is EntitlementKey {
  return Object.hasOwn(ENTITLEMENT_METADATA, value);
}

function toIso(value: Date | null | undefined): string | null {
  return value?.toISOString() ?? null;
}

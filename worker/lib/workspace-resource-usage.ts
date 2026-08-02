import { and, eq, gte, isNull, ne, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

import type { WorkspaceRef } from "../../shared/plan-catalog";
import * as dbSchema from "../db/schema";

type AppDatabase = DrizzleD1Database<Record<string, unknown>>;
export type WorkspaceResourceKey =
  | "projects"
  | "teamMembers"
  | "calendarConnections";

export async function workspaceResourceUsage(input: {
  db: AppDatabase;
  workspace: WorkspaceRef;
  key: WorkspaceResourceKey;
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

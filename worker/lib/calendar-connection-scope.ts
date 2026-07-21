import { and, eq, inArray } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import * as dbSchema from "../db/schema";
import type { ProjectScope } from "../types";

type AppDatabase = DrizzleD1Database<Record<string, unknown>>;

export async function projectCanUseCalendarConnections(
  db: AppDatabase,
  scope: ProjectScope,
  connectionIds: string[],
): Promise<boolean> {
  const uniqueIds = Array.from(new Set(connectionIds.filter(Boolean)));
  if (uniqueIds.length === 0) return true;

  if (scope.teamId) {
    const rows = await db
      .select({ connectionId: dbSchema.teamCalendarConnections.connectionId })
      .from(dbSchema.teamCalendarConnections)
      .where(
        and(
          eq(dbSchema.teamCalendarConnections.teamId, scope.teamId),
          inArray(dbSchema.teamCalendarConnections.connectionId, uniqueIds),
        ),
      );
    return rows.length === uniqueIds.length;
  }

  const rows = await db
    .select({ id: dbSchema.calendarConnections.id })
    .from(dbSchema.calendarConnections)
    .where(
      and(
        eq(dbSchema.calendarConnections.userId, scope.ownerUserId),
        inArray(dbSchema.calendarConnections.id, uniqueIds),
      ),
    );
  return rows.length === uniqueIds.length;
}

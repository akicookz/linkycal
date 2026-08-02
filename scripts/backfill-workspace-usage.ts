import { Database } from "bun:sqlite";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import * as dbSchema from "../worker/db/schema";
import { usagePeriodBounds } from "../worker/services/usage-service";

type AppDatabase = DrizzleD1Database<Record<string, unknown>>;

export async function backfillWorkspaceUsage(
  db: AppDatabase,
  now: Date,
): Promise<void> {
  const bounds = usagePeriodBounds(null, now);
  const legacyRows = await db
    .select({
      userId: dbSchema.usage.userId,
      enrichments: dbSchema.usage.enrichmentsCount,
    })
    .from(dbSchema.usage)
    .where(
      and(
        eq(dbSchema.usage.periodStart, bounds.start),
        sql`${dbSchema.usage.enrichmentsCount} > 0`,
      ),
    );

  for (const row of legacyRows) {
    await db
      .insert(dbSchema.workspaceUsagePeriods)
      .values({
        id: crypto.randomUUID(),
        workspaceType: "personal",
        workspaceId: row.userId,
        periodStart: bounds.start,
        periodEnd: bounds.end,
        enrichments: row.enrichments,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          dbSchema.workspaceUsagePeriods.workspaceType,
          dbSchema.workspaceUsagePeriods.workspaceId,
          dbSchema.workspaceUsagePeriods.periodStart,
        ],
        set: {
          enrichments: sql`max(${dbSchema.workspaceUsagePeriods.enrichments}, ${row.enrichments})`,
          updatedAt: now,
        },
      });
  }
}

async function runCli(): Promise<void> {
  const databasePath = Bun.argv[2];
  if (!databasePath) {
    throw new Error(
      "Usage: bun scripts/backfill-workspace-usage.ts <sqlite-database-path>",
    );
  }

  const sqlite = new Database(databasePath);
  try {
    const db = drizzle(sqlite, {
      schema: dbSchema.schema,
    }) as unknown as AppDatabase;
    await backfillWorkspaceUsage(db, new Date());
  } finally {
    sqlite.close();
  }
}

if (import.meta.main) {
  await runCli();
}

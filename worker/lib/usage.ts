import { and, eq, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as dbSchema from "../db/schema";

type DB = DrizzleD1Database<Record<string, unknown>>;

// First instant of the current calendar month, UTC — the enrichment quota window.
export function currentPeriodStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function getEnrichmentUsage(
  db: DB,
  userId: string,
  now: Date,
): Promise<number> {
  const periodStart = currentPeriodStart(now);
  const [row] = await db
    .select({ count: dbSchema.usage.enrichmentsCount })
    .from(dbSchema.usage)
    .where(
      and(
        eq(dbSchema.usage.userId, userId),
        eq(dbSchema.usage.periodStart, periodStart),
      ),
    )
    .limit(1);
  return row?.count ?? 0;
}

export async function incrementEnrichmentUsage(
  db: DB,
  userId: string,
  now: Date,
): Promise<void> {
  const periodStart = currentPeriodStart(now);
  await db
    .insert(dbSchema.usage)
    .values({ id: crypto.randomUUID(), userId, periodStart, enrichmentsCount: 1 })
    .onConflictDoUpdate({
      target: [dbSchema.usage.userId, dbSchema.usage.periodStart],
      set: { enrichmentsCount: sql`${dbSchema.usage.enrichmentsCount} + 1` },
    });
}

import type { DrizzleD1Database } from "drizzle-orm/d1";

import { UsageService, usagePeriodBounds } from "../services/usage-service";

type DB = DrizzleD1Database<Record<string, unknown>>;

// First instant of the current calendar month, UTC — the enrichment quota window.
export function currentPeriodStart(now: Date): Date {
  return usagePeriodBounds(null, now).start;
}

export async function getEnrichmentUsage(
  db: DB,
  userId: string,
  now: Date,
): Promise<number> {
  const period = await new UsageService(db).getOrCreatePeriod({
    workspace: personalWorkspace(userId),
    subscription: null,
    now,
  });
  return period.enrichments;
}

export async function incrementEnrichmentUsage(
  db: DB,
  userId: string,
  now: Date,
): Promise<void> {
  await new UsageService(db).reserve({
    workspace: personalWorkspace(userId),
    subscription: null,
    plan: "business",
    key: "enrichments",
    amount: 1,
    now,
  });
}

function personalWorkspace(userId: string) {
  return {
    type: "personal" as const,
    id: userId,
    ownerUserId: userId,
    teamId: null,
  };
}

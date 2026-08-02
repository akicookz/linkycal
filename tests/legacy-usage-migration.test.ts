import { afterEach, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";

import { backfillWorkspaceUsage } from "../scripts/backfill-workspace-usage";
import * as dbSchema from "../worker/db/schema";
import { createTestDb, type TestDatabase } from "./support/test-db";

describe("legacy usage backfill", () => {
  let testDatabase: TestDatabase | null = null;

  afterEach(() => {
    testDatabase?.close();
    testDatabase = null;
  });

  test("current legacy enrichment usage remains personal, never leaks into a team, and is idempotent", async () => {
    testDatabase = createTestDb();
    const now = new Date("2026-08-15T12:00:00.000Z");
    const periodStart = new Date("2026-08-01T00:00:00.000Z");
    const periodEnd = new Date("2026-09-01T00:00:00.000Z");

    await testDatabase.db.insert(dbSchema.schema.users).values([
      { id: "personal-user", name: "Personal", email: "personal@example.com" },
      { id: "team-owner", name: "Team Owner", email: "team@example.com" },
    ]);
    await testDatabase.db.insert(dbSchema.usage).values([
      {
        id: "legacy-personal-current",
        userId: "personal-user",
        periodStart,
        enrichmentsCount: 7,
      },
      {
        id: "legacy-owner-current",
        userId: "team-owner",
        periodStart,
        enrichmentsCount: 9,
      },
      {
        id: "legacy-personal-old",
        userId: "personal-user",
        periodStart: new Date("2026-07-01T00:00:00.000Z"),
        enrichmentsCount: 99,
      },
    ]);
    await testDatabase.db.insert(dbSchema.workspaceUsagePeriods).values({
      id: "existing-team-period",
      workspaceType: "team",
      workspaceId: "team-paid",
      periodStart,
      periodEnd,
      enrichments: 4,
    });

    await backfillWorkspaceUsage(testDatabase.db, now);
    await backfillWorkspaceUsage(testDatabase.db, now);

    const personalRows = await testDatabase.db
      .select()
      .from(dbSchema.workspaceUsagePeriods)
      .where(eq(dbSchema.workspaceUsagePeriods.workspaceType, "personal"));
    expect(personalRows).toHaveLength(2);
    expect(
      personalRows
        .map((row) => [row.workspaceId, row.enrichments])
        .sort((left, right) => left[0].localeCompare(right[0])),
    ).toEqual([
      ["personal-user", 7],
      ["team-owner", 9],
    ]);

    const [teamPeriod] = await testDatabase.db
      .select()
      .from(dbSchema.workspaceUsagePeriods)
      .where(
        and(
          eq(dbSchema.workspaceUsagePeriods.workspaceType, "team"),
          eq(dbSchema.workspaceUsagePeriods.workspaceId, "team-paid"),
        ),
      );
    expect(teamPeriod?.enrichments).toBe(4);
  });
});

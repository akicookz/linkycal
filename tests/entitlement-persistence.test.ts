import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import * as dbSchema from "../worker/db/schema";
import { createTestDb, type TestDatabase } from "./support/test-db";

describe("workspace entitlement persistence", () => {
  let testDatabase: TestDatabase | null = null;

  afterEach(() => {
    testDatabase?.close();
    testDatabase = null;
  });

  test("usage, storage, CSS, and safe outcome records enforce their durable identity contracts", async () => {
    testDatabase = createTestDb();
    await seedWorkspace(testDatabase);

    const periodStart = new Date("2026-08-01T00:00:00.000Z");
    const periodEnd = new Date("2026-09-01T00:00:00.000Z");
    await testDatabase.db.insert(dbSchema.workspaceUsagePeriods).values({
      id: "period-august",
      workspaceType: "team",
      workspaceId: "team-entitlements",
      periodStart,
      periodEnd,
    });

    const [period] = await testDatabase.db
      .select()
      .from(dbSchema.workspaceUsagePeriods)
      .where(eq(dbSchema.workspaceUsagePeriods.id, "period-august"));
    expect(period).toMatchObject({
      formResponses: 0,
      bookings: 0,
      workflowExecutions: 0,
      transactionalEmails: 0,
      integrationRequests: 0,
      enrichments: 0,
    });
    expect(period?.updatedAt).toBeInstanceOf(Date);

    await expectConstraintViolation(() =>
      testDatabase!.db.insert(dbSchema.workspaceUsagePeriods).values({
        id: "period-duplicate",
        workspaceType: "team",
        workspaceId: "team-entitlements",
        periodStart,
        periodEnd,
      }),
    );

    await testDatabase.db.insert(dbSchema.workspaceUsageEvents).values({
      id: "usage-event-1",
      usagePeriodId: "period-august",
      workspaceType: "team",
      workspaceId: "team-entitlements",
      entitlementKey: "formResponses",
      operationId: "response-1",
      amount: 1,
      state: "reserved",
    });
    await expectConstraintViolation(() =>
      testDatabase!.db.insert(dbSchema.workspaceUsageEvents).values({
        id: "usage-event-duplicate",
        usagePeriodId: "period-august",
        workspaceType: "team",
        workspaceId: "team-entitlements",
        entitlementKey: "formResponses",
        operationId: "response-1",
        amount: 1,
        state: "consumed",
      }),
    );

    await testDatabase.db.insert(dbSchema.workspaceStorageTotals).values({
      id: "storage-total",
      workspaceType: "team",
      workspaceId: "team-entitlements",
    });
    const [storageTotal] = await testDatabase.db
      .select()
      .from(dbSchema.workspaceStorageTotals)
      .where(eq(dbSchema.workspaceStorageTotals.id, "storage-total"));
    expect(storageTotal?.sizeBytes).toBe(0);
    expect(storageTotal?.updatedAt).toBeInstanceOf(Date);

    await testDatabase.db.insert(dbSchema.storedObjects).values({
      id: "stored-object-1",
      workspaceType: "team",
      workspaceId: "team-entitlements",
      projectId: "project-entitlements",
      objectKey: "projects/project-entitlements/logo.png",
      category: "project_asset",
      sizeBytes: 128,
    });
    await expectConstraintViolation(() =>
      testDatabase!.db.insert(dbSchema.storedObjects).values({
        id: "stored-object-duplicate",
        workspaceType: "team",
        workspaceId: "team-entitlements",
        projectId: "project-entitlements",
        objectKey: "projects/project-entitlements/logo.png",
        category: "form_asset",
        sizeBytes: 256,
      }),
    );

    await testDatabase.db.insert(dbSchema.projectCustomCss).values({
      id: "custom-css",
      projectId: "project-entitlements",
      sourceCss: ".lc-button { color: red; }",
      compiledCss: ".lc-button{color:red}",
      updatedByUserId: "owner-entitlements",
    });
    const [customCss] = await testDatabase.db
      .select()
      .from(dbSchema.projectCustomCss)
      .where(eq(dbSchema.projectCustomCss.id, "custom-css"));
    expect(customCss?.sourceBytes).toBe(0);
    expect(customCss?.updatedAt).toBeInstanceOf(Date);

    await testDatabase.db.insert(dbSchema.entitlementOutcomes).values({
      id: "outcome-email-skipped",
      workspaceType: "team",
      workspaceId: "team-entitlements",
      projectId: "project-entitlements",
      sourceType: "workflow_run",
      sourceId: "workflow-run-1",
      entitlementKey: "transactionalEmails",
      outcome: "skipped",
      channel: "email",
    });

    await testDatabase.db
      .delete(dbSchema.projects)
      .where(eq(dbSchema.projects.id, "project-entitlements"));

    expect(await testDatabase.db.select().from(dbSchema.storedObjects)).toHaveLength(0);
    expect(await testDatabase.db.select().from(dbSchema.projectCustomCss)).toHaveLength(0);
    expect(await testDatabase.db.select().from(dbSchema.entitlementOutcomes)).toHaveLength(0);
    expect(await testDatabase.db.select().from(dbSchema.workspaceUsageEvents)).toHaveLength(1);
  });
});

async function seedWorkspace(testDatabase: TestDatabase): Promise<void> {
  await testDatabase.db.insert(dbSchema.schema.users).values({
    id: "owner-entitlements",
    name: "Entitlement Owner",
    email: "entitlements@example.com",
  });
  await testDatabase.db.insert(dbSchema.teams).values({
    id: "team-entitlements",
    ownerUserId: "owner-entitlements",
    name: "Entitlement Team",
    slug: "entitlement-team",
  });
  await testDatabase.db.insert(dbSchema.projects).values({
    id: "project-entitlements",
    userId: "owner-entitlements",
    teamId: "team-entitlements",
    name: "Entitlement Project",
    slug: "entitlement-project",
  });
}

async function expectConstraintViolation(
  operation: () => PromiseLike<unknown>,
): Promise<void> {
  let rejected = false;
  try {
    await operation();
  } catch {
    rejected = true;
  }
  expect(rejected).toBe(true);
}

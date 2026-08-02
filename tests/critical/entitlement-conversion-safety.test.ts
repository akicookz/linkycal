import { afterEach, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";

import * as dbSchema from "../../worker/db/schema";
import { recordPersistedBookingUsage } from "../../worker/lib/booking-actions";
import { ensureContact } from "../../worker/lib/contact-actions";
import {
  startPublicFormResponseAction,
  submitPublicFormStepAction,
} from "../../worker/lib/public-form-actions";
import type { AppEnv } from "../../worker/types";
import { createTestDb, type TestDatabase } from "../support/test-db";

describe("entitlement conversion safety", () => {
  let testDatabase: TestDatabase | null = null;

  afterEach(() => {
    testDatabase?.close();
    testDatabase = null;
  });

  test("new responses stop at the grace ceiling while an existing response completes once beyond it", async () => {
    testDatabase = createTestDb();
    await seedConversionProject(testDatabase, { formResponses: 550 });

    const blocked = await startPublicFormResponseAction(
      testDatabase.db,
      "project-conversion",
      "form-conversion",
    );
    expect(blocked).toEqual({
      ok: false,
      status: 429,
      body: {
        error: "This form is temporarily unavailable",
        code: "plan_usage_limit_reached",
      },
    });
    expect(await responseCount(testDatabase)).toBe(0);

    await testDatabase.db
      .update(dbSchema.workspaceUsagePeriods)
      .set({ formResponses: 549 })
      .where(eq(dbSchema.workspaceUsagePeriods.id, "period-conversion"));
    const started = await startPublicFormResponseAction(
      testDatabase.db,
      "project-conversion",
      "form-conversion",
    );
    expect(started.ok).toBe(true);
    if (!started.ok) throw new Error("response did not start");

    await testDatabase.db
      .update(dbSchema.workspaceUsagePeriods)
      .set({ formResponses: 550 })
      .where(eq(dbSchema.workspaceUsagePeriods.id, "period-conversion"));
    const firstCompletion = await submitPublicFormStepAction(
      testDatabase.db,
      started.body.response.id,
      0,
      { fields: [], complete: true },
    );
    expect(firstCompletion).toMatchObject({
      ok: true,
      body: { response: { status: "completed" } },
    });
    await submitPublicFormStepAction(
      testDatabase.db,
      started.body.response.id,
      0,
      { fields: [], complete: true },
    );
    const [period] = await testDatabase.db
      .select()
      .from(dbSchema.workspaceUsagePeriods)
      .where(eq(dbSchema.workspaceUsagePeriods.id, "period-conversion"));
    expect(period?.formResponses).toBe(551);
  });

  test("automatic contacts skip only new rows at cap and existing contacts still update", async () => {
    testDatabase = createTestDb();
    await seedConversionProject(testDatabase, { contacts: 500 });
    const env = {} as AppEnv;

    const skipped = await ensureContact(
      testDatabase.db,
      env,
      "project-conversion",
      { name: "Overflow", email: "overflow@example.com" },
      "booking",
      {
        preserveSource: true,
        sourceType: "booking",
        sourceId: "booking-overflow",
      },
    );
    expect(skipped).toMatchObject({
      contact: null,
      skippedReason: "plan_resource_limit_reached",
    });
    expect(await contactCount(testDatabase)).toBe(500);

    const updated = await ensureContact(
      testDatabase.db,
      env,
      "project-conversion",
      { name: "Updated existing", email: "contact-0@example.com" },
      "booking",
      {
        preserveSource: true,
        sourceType: "booking",
        sourceId: "booking-existing",
      },
    );
    expect(updated).toMatchObject({
      created: false,
      skippedReason: null,
      contact: { name: "Updated existing" },
    });
    expect(await contactCount(testDatabase)).toBe(500);
  });

  test("booking observations are unlimited and idempotent by booking id", async () => {
    testDatabase = createTestDb();
    await seedConversionProject(testDatabase);
    await recordPersistedBookingUsage(
      testDatabase.db,
      "project-conversion",
      "booking-1",
    );
    await recordPersistedBookingUsage(
      testDatabase.db,
      "project-conversion",
      "booking-1",
    );
    const [period] = await testDatabase.db
      .select()
      .from(dbSchema.workspaceUsagePeriods)
      .where(eq(dbSchema.workspaceUsagePeriods.id, "period-conversion"));
    expect(period?.bookings).toBe(1);
  });
});

async function seedConversionProject(
  testDatabase: TestDatabase,
  options: { formResponses?: number; contacts?: number } = {},
): Promise<void> {
  await testDatabase.db.insert(dbSchema.schema.users).values({
    id: "owner-conversion",
    name: "Conversion Owner",
    email: "conversion@example.com",
    emailVerified: true,
  });
  await testDatabase.db.insert(dbSchema.teams).values({
    id: "team-conversion",
    ownerUserId: "owner-conversion",
    name: "Conversion Team",
    slug: "conversion-team",
  });
  await testDatabase.db.insert(dbSchema.projects).values({
    id: "project-conversion",
    userId: "owner-conversion",
    teamId: "team-conversion",
    name: "Conversion Project",
    slug: "conversion-project",
  });
  await testDatabase.db.insert(dbSchema.subscriptions).values({
    id: "subscription-conversion",
    userId: "owner-conversion",
    teamId: "team-conversion",
    plan: "free",
    status: "active",
  });
  await testDatabase.db.insert(dbSchema.forms).values({
    id: "form-conversion",
    projectId: "project-conversion",
    name: "Conversion Form",
    slug: "conversion-form",
    status: "active",
  });
  await testDatabase.db.insert(dbSchema.formSteps).values({
    id: "step-conversion",
    formId: "form-conversion",
    title: "Submit",
    sortOrder: 0,
  });
  await testDatabase.db.insert(dbSchema.workspaceUsagePeriods).values({
    id: "period-conversion",
    workspaceType: "team",
    workspaceId: "team-conversion",
    periodStart: new Date("2026-08-01T00:00:00.000Z"),
    periodEnd: new Date("2026-09-01T00:00:00.000Z"),
    formResponses: options.formResponses ?? 0,
  });
  const contacts = Array.from({ length: options.contacts ?? 0 }, (_, index) => ({
    id: `contact-${index}`,
    projectId: "project-conversion",
    name: `Contact ${index}`,
    email: `contact-${index}@example.com`,
  }));
  if (contacts.length > 0) {
    await testDatabase.db.insert(dbSchema.contacts).values(contacts);
  }
}

async function responseCount(testDatabase: TestDatabase): Promise<number> {
  const [row] = await testDatabase.db
    .select({ count: sql<number>`count(*)` })
    .from(dbSchema.formResponses);
  return Number(row?.count ?? 0);
}

async function contactCount(testDatabase: TestDatabase): Promise<number> {
  const [row] = await testDatabase.db
    .select({ count: sql<number>`count(*)` })
    .from(dbSchema.contacts);
  return Number(row?.count ?? 0);
}

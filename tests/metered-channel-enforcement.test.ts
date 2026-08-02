import { afterEach, describe, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";

import * as dbSchema from "../worker/db/schema";
import {
  createMeteredEmailDependency,
  reserveProjectUsage,
} from "../worker/lib/metered-entitlements";
import { ok, withToolErrors } from "../worker/mcp/helpers";
import { EmailService } from "../worker/services/email-service";
import { createTestDb, type TestDatabase } from "./support/test-db";

const NOW = new Date("2026-08-15T12:00:00.000Z");

describe("metered channel enforcement", () => {
  let testDatabase: TestDatabase | null = null;
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    testDatabase?.close();
    testDatabase = null;
    globalThis.fetch = originalFetch;
  });

  test("REST and MCP share one integration request ceiling and MCP returns the structured denial", async () => {
    testDatabase = createTestDb();
    await seedMeteredProject(testDatabase);
    const first = await reserveProjectUsage({
      db: testDatabase.db,
      projectId: "project-metered",
      key: "integrationRequests",
      now: NOW,
      channel: "api",
    });
    expect(first.decision.allowed).toBe(true);

    const guarded = withToolErrors(
      "list_forms",
      async () => ok({ shouldNotRun: true }),
      {
        reserveToolUsage: async () => {
          const reservation = await reserveProjectUsage({
            db: testDatabase!.db,
            projectId: "project-metered",
            key: "integrationRequests",
            now: NOW,
            channel: "mcp",
          });
          return reservation.decision.allowed
            ? null
            : reservation.mcpError("use this MCP tool");
        },
      },
    );
    const result = await guarded({});
    expect(result).toMatchObject({
      isError: true,
      structuredContent: {
        entitlementError: {
          code: "plan_usage_limit_reached",
          entitlement: "integrationRequests",
          used: 11_000,
          hardLimit: 11_000,
        },
      },
    });
  });

  test("email reservations release on provider rejection and consume once on acceptance", async () => {
    testDatabase = createTestDb();
    await seedMeteredProject(testDatabase, { transactionalEmails: 0 });
    let responseStatus = 503;
    globalThis.fetch = mock(async () => new Response("", { status: responseStatus }));

    const dependency = await createMeteredEmailDependency({
      db: testDatabase.db,
      projectId: "project-metered",
      sourceType: "booking",
      sourceId: "booking-1",
      channel: "booking_email",
      now: () => NOW,
    });
    const service = new EmailService("resend-key", dependency);
    await expect(
      service.sendBookingRequestReceived({
        to: "guest@example.com",
        guestName: "Guest",
        eventTypeName: "Demo",
        startTime: NOW,
        endTime: new Date(NOW.getTime() + 30 * 60_000),
        timezone: "UTC",
      }),
    ).rejects.toThrow("Failed to send email");

    let [period] = await testDatabase.db
      .select()
      .from(dbSchema.workspaceUsagePeriods)
      .where(eq(dbSchema.workspaceUsagePeriods.workspaceId, "team-metered"));
    expect(period?.transactionalEmails).toBe(0);

    responseStatus = 200;
    await service.sendBookingRequestReceived({
      to: "guest@example.com",
      guestName: "Guest",
      eventTypeName: "Demo",
      startTime: NOW,
      endTime: new Date(NOW.getTime() + 30 * 60_000),
      timezone: "UTC",
    });
    [period] = await testDatabase.db
      .select()
      .from(dbSchema.workspaceUsagePeriods)
      .where(eq(dbSchema.workspaceUsagePeriods.workspaceId, "team-metered"));
    expect(period?.transactionalEmails).toBe(1);
  });
});

async function seedMeteredProject(
  testDatabase: TestDatabase,
  usage: { transactionalEmails?: number } = {},
): Promise<void> {
  await testDatabase.db.insert(dbSchema.schema.users).values({
    id: "owner-metered",
    name: "Metered Owner",
    email: "metered@example.com",
    emailVerified: true,
  });
  await testDatabase.db.insert(dbSchema.teams).values({
    id: "team-metered",
    ownerUserId: "owner-metered",
    name: "Metered Team",
    slug: "metered-team",
  });
  await testDatabase.db.insert(dbSchema.projects).values({
    id: "project-metered",
    userId: "owner-metered",
    teamId: "team-metered",
    name: "Metered Project",
    slug: "metered-project",
  });
  await testDatabase.db.insert(dbSchema.subscriptions).values({
    id: "subscription-metered",
    userId: "owner-metered",
    teamId: "team-metered",
    plan: "free",
    status: "active",
  });
  await testDatabase.db.insert(dbSchema.workspaceUsagePeriods).values({
    id: "period-metered",
    workspaceType: "team",
    workspaceId: "team-metered",
    periodStart: new Date("2026-08-01T00:00:00.000Z"),
    periodEnd: new Date("2026-09-01T00:00:00.000Z"),
    integrationRequests: 10_999,
    transactionalEmails: usage.transactionalEmails ?? 0,
  });
}

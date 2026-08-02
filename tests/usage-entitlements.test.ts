import { afterEach, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";

import * as dbSchema from "../worker/db/schema";
import {
  entitlementError,
  mcpEntitlementError,
} from "../worker/lib/entitlement-errors";
import { UsageService } from "../worker/services/usage-service";
import type { WorkspaceRef } from "../worker/types";
import {
  createD1TestDb,
  createTestDb,
  type TestDatabase,
} from "./support/test-db";

const FREE_WORKSPACE: WorkspaceRef = {
  type: "personal",
  id: "free-user",
  ownerUserId: "free-user",
  teamId: null,
};
const NOW = new Date("2026-08-15T12:00:00.000Z");

describe("workspace usage entitlements", () => {
  let testDatabase: TestDatabase | null = null;

  afterEach(() => {
    testDatabase?.close();
    testDatabase = null;
  });

  test("periods use UTC calendar boundaries unless Stripe provides both paid boundaries", async () => {
    testDatabase = createTestDb();
    const service = new UsageService(testDatabase.db);

    const freePeriod = await service.getOrCreatePeriod({
      workspace: FREE_WORKSPACE,
      subscription: null,
      now: NOW,
    });
    expect(freePeriod.periodStart).toEqual(
      new Date("2026-08-01T00:00:00.000Z"),
    );
    expect(freePeriod.periodEnd).toEqual(
      new Date("2026-09-01T00:00:00.000Z"),
    );

    await seedPaidWorkspace(testDatabase);
    const [subscription] = await testDatabase.db
      .select()
      .from(dbSchema.subscriptions)
      .where(eq(dbSchema.subscriptions.id, "subscription-pro"));
    const paidPeriod = await service.getOrCreatePeriod({
      workspace: {
        type: "team",
        id: "team-pro",
        ownerUserId: "pro-owner",
        teamId: "team-pro",
      },
      subscription: subscription ?? null,
      now: NOW,
    });
    expect(paidPeriod.periodStart).toEqual(
      new Date("2026-07-20T10:00:00.000Z"),
    );
    expect(paidPeriod.periodEnd).toEqual(
      new Date("2026-08-20T10:00:00.000Z"),
    );
  });

  test("upgrading mid-period carries active usage into Stripe billing boundaries", async () => {
    testDatabase = createTestDb();
    const service = new UsageService(testDatabase.db);
    const freePeriod = await service.getOrCreatePeriod({
      workspace: FREE_WORKSPACE,
      subscription: null,
      now: NOW,
    });
    await testDatabase.db
      .update(dbSchema.workspaceUsagePeriods)
      .set({
        formResponses: 321,
        workflowExecutions: 42,
        integrationRequests: 8_765,
      })
      .where(eq(dbSchema.workspaceUsagePeriods.id, freePeriod.id));

    const paidPeriod = await service.getOrCreatePeriod({
      workspace: FREE_WORKSPACE,
      subscription: {
        id: "subscription-upgrade",
        userId: FREE_WORKSPACE.ownerUserId,
        teamId: null,
        plan: "pro",
        interval: "monthly",
        status: "active",
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        currentPeriodStart: NOW,
        currentPeriodEnd: new Date("2026-09-15T12:00:00.000Z"),
        cancelAtPeriodEnd: false,
        createdAt: NOW,
        updatedAt: NOW,
      },
      now: NOW,
    });

    expect(paidPeriod.periodStart).toEqual(NOW);
    expect(paidPeriod.formResponses).toBe(321);
    expect(paidPeriod.workflowExecutions).toBe(42);
    expect(paidPeriod.integrationRequests).toBe(8_765);
  });

  test("warning, grace, hard-limit, and unlimited decisions use persisted workspace counters", async () => {
    testDatabase = createTestDb();
    const service = new UsageService(testDatabase.db);
    const period = await service.getOrCreatePeriod({
      workspace: FREE_WORKSPACE,
      subscription: null,
      now: NOW,
    });

    for (const [used, expectedStatus, expectedAllowed] of [
      [199, "available", true],
      [200, "warning", true],
      [250, "grace", true],
      [275, "blocked", false],
    ] as const) {
      await testDatabase.db
        .update(dbSchema.workspaceUsagePeriods)
        .set({ workflowExecutions: used })
        .where(eq(dbSchema.workspaceUsagePeriods.id, period.id));
      const decision = await service.getDecision({
        workspace: FREE_WORKSPACE,
        subscription: null,
        plan: "free",
        key: "workflowExecutions",
        amount: 1,
        now: NOW,
      });
      expect(decision.status).toBe(expectedStatus);
      expect(decision.allowed).toBe(expectedAllowed);
    }

    const bookingDecision = await service.reserve({
      workspace: FREE_WORKSPACE,
      subscription: null,
      plan: "free",
      key: "bookings",
      amount: 1,
      now: NOW,
    });
    expect(bookingDecision).toMatchObject({ allowed: true, limit: null });
  });

  test("the final atomic slot can be claimed only once", async () => {
    testDatabase = createTestDb();
    const service = new UsageService(testDatabase.db);
    const period = await service.getOrCreatePeriod({
      workspace: FREE_WORKSPACE,
      subscription: null,
      now: NOW,
    });
    await testDatabase.db
      .update(dbSchema.workspaceUsagePeriods)
      .set({ workflowExecutions: 274 })
      .where(eq(dbSchema.workspaceUsagePeriods.id, period.id));

    const decisions = await Promise.all([
      service.reserve({
        workspace: FREE_WORKSPACE,
        subscription: null,
        plan: "free",
        key: "workflowExecutions",
        amount: 1,
        operationId: "workflow-run-a",
        now: NOW,
      }),
      service.reserve({
        workspace: FREE_WORKSPACE,
        subscription: null,
        plan: "free",
        key: "workflowExecutions",
        amount: 1,
        operationId: "workflow-run-b",
        now: NOW,
      }),
    ]);
    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(1);

    const [updated] = await testDatabase.db
      .select()
      .from(dbSchema.workspaceUsagePeriods)
      .where(eq(dbSchema.workspaceUsagePeriods.id, period.id));
    expect(updated?.workflowExecutions).toBe(275);
  });

  test("operation ids are idempotent across reserve, consume, release, and re-reserve", async () => {
    testDatabase = createTestDb();
    const service = new UsageService(testDatabase.db);
    const input = {
      workspace: FREE_WORKSPACE,
      subscription: null,
      plan: "free" as const,
      key: "transactionalEmails" as const,
      amount: 1,
      operationId: "email-booking-1-recipient-1",
      now: NOW,
    };

    expect((await service.reserve(input)).allowed).toBe(true);
    expect((await service.reserve(input)).allowed).toBe(true);
    await service.consume(input);
    await service.consume(input);

    let [period] = await testDatabase.db
      .select()
      .from(dbSchema.workspaceUsagePeriods)
      .where(
        and(
          eq(dbSchema.workspaceUsagePeriods.workspaceType, "personal"),
          eq(dbSchema.workspaceUsagePeriods.workspaceId, FREE_WORKSPACE.id),
        ),
      );
    expect(period?.transactionalEmails).toBe(1);
    let [event] = await testDatabase.db
      .select()
      .from(dbSchema.workspaceUsageEvents)
      .where(eq(dbSchema.workspaceUsageEvents.operationId, input.operationId));
    expect(event?.state).toBe("consumed");

    const retryableInput = { ...input, operationId: "email-retryable" };
    await service.reserve(retryableInput);
    await service.release(retryableInput);
    await service.reserve(retryableInput);

    [period] = await testDatabase.db
      .select()
      .from(dbSchema.workspaceUsagePeriods)
      .where(eq(dbSchema.workspaceUsagePeriods.id, period!.id));
    expect(period?.transactionalEmails).toBe(2);
    [event] = await testDatabase.db
      .select()
      .from(dbSchema.workspaceUsageEvents)
      .where(
        eq(dbSchema.workspaceUsageEvents.operationId, "email-retryable"),
      );
    expect(event?.state).toBe("reserved");
  });

  test("re-reserving a released operation moves its ledger to the current period", async () => {
    testDatabase = createTestDb();
    const service = new UsageService(testDatabase.db);
    const firstInput = {
      workspace: FREE_WORKSPACE,
      subscription: null,
      plan: "free" as const,
      key: "transactionalEmails" as const,
      amount: 1,
      operationId: "email-cross-period-retry",
      now: NOW,
    };
    await service.reserve(firstInput);
    await service.release(firstInput);

    const secondInput = {
      ...firstInput,
      now: new Date("2026-09-15T12:00:00.000Z"),
    };
    await service.reserve(secondInput);
    const periods = await testDatabase.db
      .select()
      .from(dbSchema.workspaceUsagePeriods)
      .where(eq(dbSchema.workspaceUsagePeriods.workspaceId, FREE_WORKSPACE.id));
    const [event] = await testDatabase.db
      .select()
      .from(dbSchema.workspaceUsageEvents)
      .where(
        eq(
          dbSchema.workspaceUsageEvents.operationId,
          secondInput.operationId,
        ),
      );
    const secondPeriod = periods.find((period) =>
      period.periodStart.getUTCMonth() === 8
    );
    expect(secondPeriod?.transactionalEmails).toBe(1);
    expect(event?.usagePeriodId).toBe(secondPeriod?.id);

    await service.release(secondInput);
    const [releasedPeriod] = await testDatabase.db
      .select()
      .from(dbSchema.workspaceUsagePeriods)
      .where(eq(dbSchema.workspaceUsagePeriods.id, secondPeriod!.id));
    expect(releasedPeriod?.transactionalEmails).toBe(0);
  });

  test("D1 counts concurrent re-reservations of a released operation once", async () => {
    const d1Database = await createD1TestDb();
    try {
      const service = new UsageService(d1Database.db);
      const input = {
        workspace: FREE_WORKSPACE,
        subscription: null,
        plan: "free" as const,
        key: "transactionalEmails" as const,
        amount: 1,
        operationId: "d1-email-retry",
        now: NOW,
      };
      await service.reserve(input);
      await service.release(input);
      await Promise.all([service.reserve(input), service.reserve(input)]);

      const [period] = await d1Database.db
        .select()
        .from(dbSchema.workspaceUsagePeriods)
        .where(eq(dbSchema.workspaceUsagePeriods.workspaceId, FREE_WORKSPACE.id));
      const [event] = await d1Database.db
        .select()
        .from(dbSchema.workspaceUsageEvents)
        .where(
          eq(dbSchema.workspaceUsageEvents.operationId, input.operationId),
        );
      expect(period?.transactionalEmails).toBe(1);
      expect(event?.state).toBe("reserved");
    } finally {
      await d1Database.close();
    }
  }, 30_000);

  test("an in-progress form may finish in bounded overage and exhausted quotas serialize consistently", async () => {
    testDatabase = createTestDb();
    const service = new UsageService(testDatabase.db);
    const period = await service.getOrCreatePeriod({
      workspace: FREE_WORKSPACE,
      subscription: null,
      now: NOW,
    });
    await testDatabase.db
      .update(dbSchema.workspaceUsagePeriods)
      .set({ formResponses: 550, workflowExecutions: 275 })
      .where(eq(dbSchema.workspaceUsagePeriods.id, period.id));

    const completion = await service.reserve({
      workspace: FREE_WORKSPACE,
      subscription: null,
      plan: "free",
      key: "formResponses",
      amount: 1,
      operationId: "response-already-started",
      allowExistingOverage: true,
      now: NOW,
    });
    expect(completion).toMatchObject({ allowed: true, status: "grace" });

    const exhausted = await service.getDecision({
      workspace: FREE_WORKSPACE,
      subscription: null,
      plan: "free",
      key: "workflowExecutions",
      amount: 1,
      now: NOW,
    });
    const httpError = entitlementError(exhausted, "run this workflow");
    expect(httpError.status).toBe(429);
    expect(httpError.body).toEqual({
      error:
        "Cannot run this workflow because this workspace has reached its monthly limit.",
      code: "plan_usage_limit_reached",
      entitlement: "workflowExecutions",
      scope: "workspace",
      used: 275,
      limit: 250,
      hardLimit: 275,
      resetAt: "2026-09-01T00:00:00.000Z",
      recommendedPlan: "pro",
    });
    expect(Number(httpError.headers["Retry-After"])).toBeGreaterThanOrEqual(0);
    expect(mcpEntitlementError(exhausted, "run this workflow")).toMatchObject({
      isError: true,
      structuredContent: { entitlementError: httpError.body },
    });
  });
});

async function seedPaidWorkspace(testDatabase: TestDatabase): Promise<void> {
  await testDatabase.db.insert(dbSchema.schema.users).values({
    id: "pro-owner",
    name: "Pro Owner",
    email: "pro@example.com",
  });
  await testDatabase.db.insert(dbSchema.teams).values({
    id: "team-pro",
    ownerUserId: "pro-owner",
    name: "Pro Team",
    slug: "pro-team",
  });
  await testDatabase.db.insert(dbSchema.subscriptions).values({
    id: "subscription-pro",
    userId: "pro-owner",
    teamId: "team-pro",
    plan: "pro",
    interval: "monthly",
    status: "active",
    currentPeriodStart: new Date("2026-07-20T10:00:00.000Z"),
    currentPeriodEnd: new Date("2026-08-20T10:00:00.000Z"),
  });
}

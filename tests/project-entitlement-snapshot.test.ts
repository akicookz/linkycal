import { afterEach, describe, expect, test } from "bun:test";

import * as dbSchema from "../worker/db/schema";
import { EntitlementService } from "../worker/services/entitlement-service";
import { createTestDb, type TestDatabase } from "./support/test-db";

describe("project entitlement snapshots", () => {
  let testDatabase: TestDatabase | null = null;

  afterEach(() => {
    testDatabase?.close();
    testDatabase = null;
  });

  test("a regular team member sees the paid workspace plan, real usage, features, and safe outcomes", async () => {
    testDatabase = createTestDb();
    await seedProWorkspace(testDatabase);

    const snapshot = await new EntitlementService(testDatabase.db).snapshot(
      "project-primary",
      "member-pro",
    );

    expect(snapshot?.workspace).toEqual({
      type: "team",
      id: "team-pro-snapshot",
      ownerUserId: "owner-pro",
      teamId: "team-pro-snapshot",
    });
    expect(snapshot?.plan).toMatchObject({
      id: "pro",
      status: "active",
      interval: "monthly",
    });
    expect(snapshot?.billing).toEqual({
      teamId: "team-pro-snapshot",
      ownerUserId: "owner-pro",
      canManageBilling: false,
    });
    expect(snapshot?.access).toMatchObject({
      teamRole: "member",
      projectRole: "viewer",
      effectiveProjectRole: "viewer",
    });

    expect(snapshot?.entitlements.projects).toMatchObject({
      used: 2,
      limit: 5,
      allowed: true,
    });
    expect(snapshot?.entitlements.forms).toMatchObject({ used: 2, limit: 20 });
    expect(snapshot?.entitlements.contacts).toMatchObject({ used: 3, limit: 5000 });
    expect(snapshot?.entitlements.calendarConnections).toMatchObject({
      used: 1,
      limit: null,
    });
    expect(snapshot?.entitlements.teamMembers).toMatchObject({
      used: 1,
      limit: null,
    });

    for (const key of [
      "apiAccess",
      "mcpAccess",
      "widgets",
      "themeOverrides",
      "customCss",
      "removeBranding",
      "analytics",
    ] as const) {
      expect(snapshot?.entitlements[key]).toMatchObject({
        enabled: true,
        allowed: true,
      });
    }
    expect(snapshot?.entitlements.formResponses).toMatchObject({
      used: 123,
      limit: 10_000,
      resetAt: "2026-08-20T10:00:00.000Z",
    });
    expect(snapshot?.entitlements.storageBytes).toMatchObject({
      used: 4096,
      limit: 10_000_000_000,
      resetAt: null,
    });
    expect(snapshot?.recentOutcomes).toEqual([
      {
        id: "outcome-snapshot",
        sourceType: "workflow_run",
        sourceId: "workflow-run-snapshot",
        entitlement: "transactionalEmails",
        outcome: "skipped",
        channel: "email",
        createdAt: "2026-08-15T11:00:00.000Z",
      },
    ]);

    expect(
      await new EntitlementService(testDatabase.db).snapshot(
        "missing-project",
        "member-pro",
      ),
    ).toBeNull();
  });
});

async function seedProWorkspace(testDatabase: TestDatabase): Promise<void> {
  await testDatabase.db.insert(dbSchema.schema.users).values([
    { id: "owner-pro", name: "Owner", email: "owner-pro@example.com" },
    { id: "member-pro", name: "Member", email: "member-pro@example.com" },
  ]);
  await testDatabase.db.insert(dbSchema.teams).values({
    id: "team-pro-snapshot",
    ownerUserId: "owner-pro",
    name: "Pro Snapshot Team",
    slug: "pro-snapshot-team",
  });
  await testDatabase.db.insert(dbSchema.teamMembers).values([
    {
      id: "team-member-owner-pro",
      teamId: "team-pro-snapshot",
      userId: "owner-pro",
      role: "owner",
    },
    {
      id: "team-member-pro",
      teamId: "team-pro-snapshot",
      userId: "member-pro",
      role: "member",
    },
  ]);
  await testDatabase.db.insert(dbSchema.projects).values([
    {
      id: "project-primary",
      userId: "owner-pro",
      teamId: "team-pro-snapshot",
      name: "Primary",
      slug: "primary-snapshot",
    },
    {
      id: "project-secondary",
      userId: "owner-pro",
      teamId: "team-pro-snapshot",
      name: "Secondary",
      slug: "secondary-snapshot",
    },
  ]);
  await testDatabase.db.insert(dbSchema.projectMembers).values({
    id: "project-member-pro",
    projectId: "project-primary",
    teamMemberId: "team-member-pro",
    role: "viewer",
  });
  await testDatabase.db.insert(dbSchema.subscriptions).values({
    id: "subscription-pro-snapshot",
    userId: "owner-pro",
    teamId: "team-pro-snapshot",
    plan: "pro",
    interval: "monthly",
    status: "active",
    currentPeriodStart: new Date("2026-07-20T10:00:00.000Z"),
    currentPeriodEnd: new Date("2026-08-20T10:00:00.000Z"),
  });
  await testDatabase.db.insert(dbSchema.forms).values([
    {
      id: "form-snapshot-1",
      projectId: "project-primary",
      name: "Form 1",
      slug: "form-1",
    },
    {
      id: "form-snapshot-2",
      projectId: "project-primary",
      name: "Form 2",
      slug: "form-2",
    },
  ]);
  await testDatabase.db.insert(dbSchema.contacts).values([
    { id: "contact-1", projectId: "project-primary", name: "One" },
    { id: "contact-2", projectId: "project-primary", name: "Two" },
    { id: "contact-3", projectId: "project-primary", name: "Three" },
  ]);
  await testDatabase.db.insert(dbSchema.eventTypes).values({
    id: "event-snapshot",
    projectId: "project-primary",
    name: "Snapshot event",
    slug: "snapshot-event",
  });
  await testDatabase.db.insert(dbSchema.workflows).values({
    id: "workflow-snapshot",
    projectId: "project-primary",
    name: "Snapshot workflow",
    trigger: "manual",
  });
  await testDatabase.db.insert(dbSchema.calendarConnections).values({
    id: "calendar-snapshot",
    userId: "owner-pro",
    accessToken: "encrypted-access",
    refreshToken: "encrypted-refresh",
    email: "calendar@example.com",
  });
  await testDatabase.db.insert(dbSchema.teamCalendarConnections).values({
    id: "team-calendar-snapshot",
    teamId: "team-pro-snapshot",
    connectionId: "calendar-snapshot",
    createdByUserId: "owner-pro",
  });
  await testDatabase.db.insert(dbSchema.workspaceUsagePeriods).values({
    id: "period-snapshot",
    workspaceType: "team",
    workspaceId: "team-pro-snapshot",
    periodStart: new Date("2026-07-20T10:00:00.000Z"),
    periodEnd: new Date("2026-08-20T10:00:00.000Z"),
    formResponses: 123,
    workflowExecutions: 45,
    transactionalEmails: 67,
    integrationRequests: 890,
    enrichments: 12,
  });
  await testDatabase.db.insert(dbSchema.workspaceStorageTotals).values({
    id: "storage-snapshot",
    workspaceType: "team",
    workspaceId: "team-pro-snapshot",
    sizeBytes: 4096,
  });
  await testDatabase.db.insert(dbSchema.entitlementOutcomes).values({
    id: "outcome-snapshot",
    workspaceType: "team",
    workspaceId: "team-pro-snapshot",
    projectId: "project-primary",
    sourceType: "workflow_run",
    sourceId: "workflow-run-snapshot",
    entitlementKey: "transactionalEmails",
    outcome: "skipped",
    channel: "email",
    createdAt: new Date("2026-08-15T11:00:00.000Z"),
  });
}

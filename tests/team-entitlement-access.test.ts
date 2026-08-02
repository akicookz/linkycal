import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import * as dbSchema from "../worker/db/schema";
import { resolveProjectEntitlements } from "../worker/lib/entitlements";
import {
  getTeamBillingReadContext,
  hasProjectPermission,
  requiredProjectPermission,
  resolveProjectAccess,
} from "../worker/lib/team-access";
import { createTestDb, type TestDatabase } from "./support/test-db";

const TEAM_ID = "team-paid";
const PROJECT_ID = "project-paid";
const OWNER_ID = "owner";
const ADMIN_ID = "admin";
const MEMBER_ID = "member";
const OUTSIDER_ID = "outsider";

describe("team entitlement access", () => {
  let testDatabase: TestDatabase | null = null;

  afterEach(() => {
    testDatabase?.close();
    testDatabase = null;
  });

  test("invited project readers inherit the workspace plan and can list members", async () => {
    testDatabase = createTestDb();
    await seedPaidTeam(testDatabase);

    expect(
      requiredProjectPermission(
        "GET",
        `/api/projects/${PROJECT_ID}/members`,
      ),
    ).toBe("project:read");
    expect(
      requiredProjectPermission(
        "HEAD",
        `/api/projects/${PROJECT_ID}/members`,
      ),
    ).toBe("project:read");
    expect(
      requiredProjectPermission(
        "POST",
        `/api/projects/${PROJECT_ID}/members`,
      ),
    ).toBe("project:members");

    const access = await resolveProjectAccess(
      testDatabase.db,
      PROJECT_ID,
      MEMBER_ID,
    );
    expect(access).not.toBeNull();
    expect(
      access &&
        hasProjectPermission(
          access,
          requiredProjectPermission(
            "GET",
            `/api/projects/${PROJECT_ID}/members`,
          ),
        ),
    ).toBe(true);

    const entitlements = await resolveProjectEntitlements(
      testDatabase.db,
      PROJECT_ID,
    );
    expect(entitlements?.subscription.plan).toBe("business");
    expect(entitlements?.subscriptionRecord?.plan).toBe("business");
    expect(entitlements?.workspace).toEqual({
      type: "team",
      id: TEAM_ID,
      ownerUserId: OWNER_ID,
      teamId: TEAM_ID,
    });
  });

  test("all workspace members can read billing while only owner and admin can manage it", async () => {
    testDatabase = createTestDb();
    await seedPaidTeam(testDatabase);

    for (const [userId, canManageBilling] of [
      [OWNER_ID, true],
      [ADMIN_ID, true],
      [MEMBER_ID, false],
    ] as const) {
      const context = await getTeamBillingReadContext(
        testDatabase.db,
        TEAM_ID,
        userId,
      );
      expect(context).toMatchObject({
        team: { id: TEAM_ID },
        member: { userId },
        canManageBilling,
      });
    }

    expect(
      await getTeamBillingReadContext(
        testDatabase.db,
        TEAM_ID,
        OUTSIDER_ID,
      ),
    ).toBeNull();
  });

  test("a downgrade blocks new collaboration without revoking an existing project grant", async () => {
    testDatabase = createTestDb();
    await seedPaidTeam(testDatabase);

    await testDatabase.db
      .update(dbSchema.subscriptions)
      .set({ plan: "free" })
      .where(eq(dbSchema.subscriptions.id, "subscription-paid"));

    const access = await resolveProjectAccess(
      testDatabase.db,
      PROJECT_ID,
      MEMBER_ID,
    );
    const entitlements = await resolveProjectEntitlements(
      testDatabase.db,
      PROJECT_ID,
    );

    expect(entitlements?.subscription.plan).toBe("free");
    expect(access).not.toBeNull();
    expect(
      access &&
        hasProjectPermission(
          access,
          requiredProjectPermission("GET", `/api/projects/${PROJECT_ID}`),
        ),
    ).toBe(true);
  });
});

async function seedPaidTeam(testDatabase: TestDatabase): Promise<void> {
  await testDatabase.db.insert(dbSchema.schema.users).values([
    { id: OWNER_ID, name: "Owner", email: "owner@example.com" },
    { id: ADMIN_ID, name: "Admin", email: "admin@example.com" },
    { id: MEMBER_ID, name: "Member", email: "member@example.com" },
    { id: OUTSIDER_ID, name: "Outsider", email: "outsider@example.com" },
  ]);
  await testDatabase.db.insert(dbSchema.teams).values({
    id: TEAM_ID,
    ownerUserId: OWNER_ID,
    name: "Paid Team",
    slug: "paid-team",
  });
  await testDatabase.db.insert(dbSchema.teamMembers).values([
    {
      id: "team-member-owner",
      teamId: TEAM_ID,
      userId: OWNER_ID,
      role: "owner",
    },
    {
      id: "team-member-admin",
      teamId: TEAM_ID,
      userId: ADMIN_ID,
      role: "admin",
    },
    {
      id: "team-member-invited",
      teamId: TEAM_ID,
      userId: MEMBER_ID,
      role: "member",
      invitedByUserId: OWNER_ID,
    },
  ]);
  await testDatabase.db.insert(dbSchema.projects).values({
    id: PROJECT_ID,
    userId: OWNER_ID,
    teamId: TEAM_ID,
    name: "Paid Project",
    slug: "paid-project",
  });
  await testDatabase.db.insert(dbSchema.projectMembers).values({
    id: "project-member-viewer",
    projectId: PROJECT_ID,
    teamMemberId: "team-member-invited",
    role: "viewer",
  });
  await testDatabase.db.insert(dbSchema.subscriptions).values({
    id: "subscription-paid",
    userId: OWNER_ID,
    teamId: TEAM_ID,
    plan: "business",
    interval: "monthly",
    status: "active",
  });
}

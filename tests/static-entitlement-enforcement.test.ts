import { afterEach, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";

import * as dbSchema from "../worker/db/schema";
import {
  importContactsWithCapacity,
} from "../worker/lib/contact-actions";
import {
  createWithResourceCapacity,
  createWithWorkspaceResourceCapacity,
  requireWorkspaceResourceCapacity,
} from "../worker/lib/resource-creation";
import type { ToolContext } from "../worker/mcp/agent";
import { createContact as createMcpContact } from "../worker/mcp/tools/contacts";
import { createEventType as createMcpEventType } from "../worker/mcp/tools/event-types";
import { createForm as createMcpForm } from "../worker/mcp/tools/forms";
import { FormService } from "../worker/services/form-service";
import type { AppEnv, WorkspaceRef } from "../worker/types";
import {
  createD1TestDb,
  createTestDb,
  type TestDatabase,
} from "./support/test-db";

const WORKSPACE: WorkspaceRef = {
  type: "team",
  id: "team-static",
  ownerUserId: "owner-static",
  teamId: "team-static",
};

describe("static entitlement enforcement", () => {
  let testDatabase: TestDatabase | null = null;

  afterEach(() => {
    testDatabase?.close();
    testDatabase = null;
  });

  test("the final project and form slots persist while the next atomic creation returns a structured decision", async () => {
    testDatabase = createTestDb();
    await seedStaticWorkspace(testDatabase, { forms: 2 });

    const finalForm = await createWithResourceCapacity({
      db: testDatabase.db,
      projectId: "project-static",
      key: "forms",
      create: async (db) =>
        new FormService(db).create("project-static", {
          name: "Final form",
          slug: "final-form",
          type: "single",
        }),
    });
    expect(finalForm.ok).toBe(true);

    const blockedForm = await createWithResourceCapacity({
      db: testDatabase.db,
      projectId: "project-static",
      key: "forms",
      create: async (db) =>
        new FormService(db).create("project-static", {
          name: "Overflow form",
          slug: "overflow-form",
          type: "single",
        }),
    });
    expect(blockedForm).toMatchObject({
      ok: false,
      status: 403,
      body: {
        code: "plan_resource_limit_reached",
        entitlement: "forms",
        used: 3,
        limit: 3,
        recommendedPlan: "pro",
      },
    });
    expect(
      await testDatabase.db
        .select({ count: sql<number>`count(*)` })
        .from(dbSchema.forms)
        .where(eq(dbSchema.forms.projectId, "project-static")),
    ).toEqual([{ count: 3 }]);

    const blockedProject = await createWithWorkspaceResourceCapacity({
      db: testDatabase.db,
      workspace: WORKSPACE,
      plan: "free",
      key: "projects",
      create: async (db) => {
        await db.insert(dbSchema.projects).values({
          id: "project-overflow",
          userId: "owner-static",
          teamId: "team-static",
          name: "Overflow",
          slug: "overflow-static",
        });
      },
    });
    expect(blockedProject).toMatchObject({
      ok: false,
      body: { entitlement: "projects", used: 1, limit: 1 },
    });
  });

  test("D1 serializes concurrent attempts for the final resource slot", async () => {
    const d1Database = await createD1TestDb();
    try {
      await seedStaticWorkspace(d1Database, { forms: 2 });
      async function createForm(suffix: string) {
        return createWithResourceCapacity({
          db: d1Database.db,
          projectId: "project-static",
          key: "forms",
          create: async (db) =>
            new FormService(db).create("project-static", {
              name: `Concurrent ${suffix}`,
              slug: `concurrent-${suffix}`,
              type: "single",
            }),
        });
      }

      const results = await Promise.all([createForm("a"), createForm("b")]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.filter((result) => !result.ok)).toHaveLength(1);
      expect(
        await d1Database.db
          .select({ count: sql<number>`count(*)` })
          .from(dbSchema.forms)
          .where(eq(dbSchema.forms.projectId, "project-static")),
      ).toEqual([{ count: 3 }]);
    } finally {
      await d1Database.close();
    }
  }, 30_000);

  test("an in-flight D1 capacity claim cannot expire and admit a stale concurrent writer", async () => {
    const d1Database = await createD1TestDb();
    try {
      await seedStaticWorkspace(d1Database, { forms: 2 });
      let releaseFirst = function releaseFirstPlaceholder() {};
      const firstMayFinish = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      let markFirstEntered = function markFirstEnteredPlaceholder() {};
      const firstEntered = new Promise<void>((resolve) => {
        markFirstEntered = resolve;
      });
      let secondEntered = false;
      const first = createWithResourceCapacity({
        db: d1Database.db,
        projectId: "project-static",
        key: "forms",
        create: async (db) => {
          markFirstEntered();
          await firstMayFinish;
          return new FormService(db).create("project-static", {
            name: "Slow final form",
            slug: "slow-final-form",
            type: "single",
          });
        },
      });
      await firstEntered;
      await d1Database.db
        .update(dbSchema.entitlementResourceLocks)
        .set({ expiresAt: new Date(0) });
      const second = createWithResourceCapacity({
        db: d1Database.db,
        projectId: "project-static",
        key: "forms",
        create: async (db) => {
          secondEntered = true;
          return new FormService(db).create("project-static", {
            name: "Concurrent stale writer",
            slug: "concurrent-stale-writer",
            type: "single",
          });
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));
      const staleWriterEntered = secondEntered;
      releaseFirst();
      const results = await Promise.all([first, second]);
      expect(staleWriterEntered).toBe(false);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.filter((result) => !result.ok)).toHaveLength(1);
    } finally {
      await d1Database.close();
    }
  }, 30_000);

  test("contact imports reject as one unit, then deduplicate existing and repeated emails before capacity", async () => {
    testDatabase = createTestDb();
    await seedStaticWorkspace(testDatabase, { contacts: 499 });

    const rejected = await importContactsWithCapacity(
      testDatabase.db,
      "project-static",
      [
        { name: "First new", email: "first-new@example.com" },
        { name: "Second new", email: "second-new@example.com" },
      ],
    );
    expect(rejected).toMatchObject({
      ok: false,
      body: {
        entitlement: "contacts",
        used: 499,
        limit: 500,
      },
    });
    expect(await contactCount(testDatabase)).toBe(499);

    const accepted = await importContactsWithCapacity(
      testDatabase.db,
      "project-static",
      [
        { name: "Existing", email: "contact-1@example.com" },
        { name: "Only new", email: "only-new@example.com" },
        { name: "Repeated new", email: "ONLY-NEW@example.com" },
      ],
    );
    expect(accepted).toMatchObject({ ok: true, created: 1, skipped: 2 });
    expect(await contactCount(testDatabase)).toBe(500);
  });

  test("MCP form, event-type, and contact creation return the same structured errors as HTTP", async () => {
    testDatabase = createTestDb();
    await seedStaticWorkspace(testDatabase, {
      forms: 3,
      eventTypes: 3,
      contacts: 500,
    });
    const context = toolContext(testDatabase);

    const results = await Promise.all([
      createMcpForm(context, {
        name: "Overflow form",
        slug: "overflow-form",
        type: "single",
      }),
      createMcpEventType(context, {
        name: "Overflow event",
        slug: "overflow-event",
        duration: 30,
        bufferBefore: 0,
        bufferAfter: 0,
        weekStart: "monday",
        enabled: true,
        requiresConfirmation: false,
      }),
      createMcpContact(context, {
        name: "Overflow contact",
        email: "overflow@example.com",
      }),
    ]);

    const errors = results.map(
      (result) =>
        (result.structuredContent as {
          entitlementError?: { entitlement: string; code: string };
        })?.entitlementError,
    );
    expect(errors[0]).toMatchObject({
      entitlement: "forms",
      code: "plan_resource_limit_reached",
    });
    expect(errors[1]).toMatchObject({
      entitlement: "eventTypes",
      code: "plan_resource_limit_reached",
    });
    expect(errors[2]).toMatchObject({
      entitlement: "contacts",
      code: "plan_resource_limit_reached",
    });
  });

  test("Free workspace collaboration and second-calendar attempts use structured feature or capacity failures", async () => {
    testDatabase = createTestDb();
    await seedStaticWorkspace(testDatabase, { calendarConnections: 1 });

    const [team, calendar] = await Promise.all([
      requireWorkspaceResourceCapacity({
        db: testDatabase.db,
        workspace: WORKSPACE,
        plan: "free",
        key: "teamMembers",
      }),
      requireWorkspaceResourceCapacity({
        db: testDatabase.db,
        workspace: WORKSPACE,
        plan: "free",
        key: "calendarConnections",
      }),
    ]);
    expect(team).toMatchObject({
      ok: false,
      body: {
        entitlement: "teamMembers",
        code: "plan_resource_limit_reached",
      },
    });
    expect(calendar).toMatchObject({
      ok: false,
      body: {
        entitlement: "calendarConnections",
        used: 1,
        limit: 1,
      },
    });
  });
});

interface SeedOptions {
  forms?: number;
  eventTypes?: number;
  contacts?: number;
  calendarConnections?: number;
}

async function seedStaticWorkspace(
  testDatabase: Pick<TestDatabase, "db">,
  options: SeedOptions,
): Promise<void> {
  await testDatabase.db.insert(dbSchema.schema.users).values({
    id: "owner-static",
    name: "Static Owner",
    email: "owner-static@example.com",
  });
  await testDatabase.db.insert(dbSchema.teams).values({
    id: "team-static",
    ownerUserId: "owner-static",
    name: "Static Team",
    slug: "static-team",
  });
  await testDatabase.db.insert(dbSchema.teamMembers).values({
    id: "team-member-owner-static",
    teamId: "team-static",
    userId: "owner-static",
    role: "owner",
  });
  await testDatabase.db.insert(dbSchema.projects).values({
    id: "project-static",
    userId: "owner-static",
    teamId: "team-static",
    name: "Static Project",
    slug: "static-project",
  });
  await testDatabase.db.insert(dbSchema.subscriptions).values({
    id: "subscription-static",
    userId: "owner-static",
    teamId: "team-static",
    plan: "free",
    status: "active",
  });

  if (options.forms) {
    await testDatabase.db.insert(dbSchema.forms).values(
      Array.from({ length: options.forms }, (_, index) => ({
        id: `form-static-${index + 1}`,
        projectId: "project-static",
        name: `Form ${index + 1}`,
        slug: `form-${index + 1}`,
      })),
    );
  }
  if (options.eventTypes) {
    await testDatabase.db.insert(dbSchema.eventTypes).values(
      Array.from({ length: options.eventTypes }, (_, index) => ({
        id: `event-static-${index + 1}`,
        projectId: "project-static",
        name: `Event ${index + 1}`,
        slug: `event-${index + 1}`,
      })),
    );
  }
  if (options.contacts) {
    await testDatabase.db.insert(dbSchema.contacts).values(
      Array.from({ length: options.contacts }, (_, index) => ({
        id: `contact-static-${index + 1}`,
        projectId: "project-static",
        name: `Contact ${index + 1}`,
        email: `contact-${index + 1}@example.com`,
      })),
    );
  }
  if (options.calendarConnections) {
    await testDatabase.db.insert(dbSchema.calendarConnections).values({
      id: "calendar-static",
      userId: "owner-static",
      accessToken: "access",
      refreshToken: "refresh",
      email: "calendar-static@example.com",
    });
    await testDatabase.db.insert(dbSchema.teamCalendarConnections).values({
      id: "team-calendar-static",
      teamId: "team-static",
      connectionId: "calendar-static",
      createdByUserId: "owner-static",
    });
  }
}

function toolContext(testDatabase: TestDatabase): ToolContext {
  return {
    projectId: function projectId() {
      return "project-static";
    },
    db: function db() {
      return testDatabase.db;
    },
    env: function env() {
      return {} as AppEnv;
    },
    waitUntil: function waitUntil() {},
  };
}

async function contactCount(testDatabase: TestDatabase): Promise<number> {
  const [row] = await testDatabase.db
    .select({ count: sql<number>`count(*)` })
    .from(dbSchema.contacts)
    .where(eq(dbSchema.contacts.projectId, "project-static"));
  return Number(row?.count ?? 0);
}

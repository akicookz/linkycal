import { describe, expect, test } from "bun:test";

import * as dbSchema from "../../worker/db/schema";
import {
  ensurePersonalTeam,
  hasProjectPermission,
  resolveProjectAccess,
} from "../../worker/lib/team-access";
import { PLAN_LIMITS } from "../../worker/lib/plan-limits";
import { createTestDb } from "./mcp-test-db";

describe("team project access", () => {
  test("free plan allows one calendar connection and no team members", () => {
    expect(PLAN_LIMITS.free.calendarSync).toBe(true);
    expect(PLAN_LIMITS.free.maxCalendarConnections).toBe(1);
    expect(PLAN_LIMITS.free.maxTeamMembers).toBe(0);
  });

  test("personal team owner gets implicit project admin access", async () => {
    const db = createTestDb();
    await db.insert(dbSchema.schema.users).values({
      id: "user-a",
      name: "Alice",
      email: "alice@example.com",
    });

    const team = await ensurePersonalTeam(db, { id: "user-a", name: "Alice" });
    await db.insert(dbSchema.projects).values({
      id: "proj-a",
      userId: "user-a",
      teamId: team.id,
      name: "Project A",
      slug: "project-a",
    });

    const access = await resolveProjectAccess(db, "proj-a", "user-a");
    expect(access?.teamRole).toBe("owner");
    expect(access?.effectiveProjectRole).toBe("admin");
    expect(access && hasProjectPermission(access, "project:api_keys")).toBe(true);
  });

  test("plain team member needs an explicit project grant", async () => {
    const db = createTestDb();
    await db.insert(dbSchema.schema.users).values([
      { id: "owner", name: "Owner", email: "owner@example.com" },
      { id: "member", name: "Member", email: "member@example.com" },
    ]);

    const team = await ensurePersonalTeam(db, { id: "owner", name: "Owner" });
    await db.insert(dbSchema.teamMembers).values({
      id: "tm-member",
      teamId: team.id,
      userId: "member",
      role: "member",
    });
    await db.insert(dbSchema.projects).values({
      id: "proj-a",
      userId: "owner",
      teamId: team.id,
      name: "Project A",
      slug: "project-a",
    });

    expect(await resolveProjectAccess(db, "proj-a", "member")).toBeNull();

    await db.insert(dbSchema.projectMembers).values({
      id: "pm-member",
      projectId: "proj-a",
      teamMemberId: "tm-member",
      role: "editor",
    });

    const access = await resolveProjectAccess(db, "proj-a", "member");
    expect(access?.effectiveProjectRole).toBe("editor");
    expect(access && hasProjectPermission(access, "project:write")).toBe(true);
    expect(access && hasProjectPermission(access, "project:api_keys")).toBe(false);
  });

  test("team admin gets implicit access to all team projects", async () => {
    const db = createTestDb();
    await db.insert(dbSchema.schema.users).values([
      { id: "owner", name: "Owner", email: "owner@example.com" },
      { id: "admin", name: "Admin", email: "admin@example.com" },
    ]);

    const team = await ensurePersonalTeam(db, { id: "owner", name: "Owner" });
    await db.insert(dbSchema.teamMembers).values({
      id: "tm-admin",
      teamId: team.id,
      userId: "admin",
      role: "admin",
    });
    await db.insert(dbSchema.projects).values({
      id: "proj-a",
      userId: "owner",
      teamId: team.id,
      name: "Project A",
      slug: "project-a",
    });

    const access = await resolveProjectAccess(db, "proj-a", "admin");
    expect(access?.teamRole).toBe("admin");
    expect(access && hasProjectPermission(access, "project:delete")).toBe(true);
  });
});

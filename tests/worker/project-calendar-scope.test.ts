import { describe, expect, test } from "bun:test";

import * as dbSchema from "../../worker/db/schema";
import { projectCanUseCalendarConnections } from "../../worker/lib/calendar-connection-scope";
import type { ProjectScope } from "../../worker/types";
import { createTestDb } from "./mcp-test-db";

async function createFixture() {
  const db = createTestDb();
  await db.insert(dbSchema.schema.users).values([
    { id: "owner", name: "Owner", email: "owner@example.com" },
    { id: "outsider", name: "Outsider", email: "outsider@example.com" },
  ]);
  await db.insert(dbSchema.teams).values({
    id: "team-a",
    ownerUserId: "owner",
    name: "Team A",
    slug: "team-a",
  });
  await db.insert(dbSchema.calendarConnections).values([
    {
      id: "owner-connection",
      userId: "owner",
      accessToken: "access-owner",
      refreshToken: "refresh-owner",
      email: "owner@example.com",
    },
    {
      id: "team-connection",
      userId: "owner",
      accessToken: "access-team",
      refreshToken: "refresh-team",
      email: "calendar@example.com",
    },
    {
      id: "foreign-connection",
      userId: "outsider",
      accessToken: "access-foreign",
      refreshToken: "refresh-foreign",
      email: "outsider@example.com",
    },
  ]);
  await db.insert(dbSchema.teamCalendarConnections).values({
    id: "team-link",
    teamId: "team-a",
    connectionId: "team-connection",
    createdByUserId: "owner",
  });

  return db;
}

describe("project calendar connection scope", () => {
  test("legacy projects use only their owner's connections", async () => {
    const db = await createFixture();
    const scope: ProjectScope = {
      projectId: "project-a",
      ownerUserId: "owner",
      teamId: null,
    };

    await expect(
      projectCanUseCalendarConnections(db, scope, ["owner-connection"]),
    ).resolves.toBe(true);
    await expect(
      projectCanUseCalendarConnections(db, scope, ["foreign-connection"]),
    ).resolves.toBe(false);
  });

  test("team projects use only connections linked to their team", async () => {
    const db = await createFixture();
    const scope: ProjectScope = {
      projectId: "project-a",
      ownerUserId: "owner",
      teamId: "team-a",
    };

    await expect(
      projectCanUseCalendarConnections(db, scope, ["team-connection"]),
    ).resolves.toBe(true);
    await expect(
      projectCanUseCalendarConnections(db, scope, ["owner-connection"]),
    ).resolves.toBe(false);
  });

  test("deduplicates connection IDs and allows an empty selection", async () => {
    const db = await createFixture();
    const scope: ProjectScope = {
      projectId: "project-a",
      ownerUserId: "owner",
      teamId: null,
    };

    await expect(
      projectCanUseCalendarConnections(db, scope, [
        "owner-connection",
        "owner-connection",
      ]),
    ).resolves.toBe(true);
    await expect(
      projectCanUseCalendarConnections(db, scope, []),
    ).resolves.toBe(true);
  });
});

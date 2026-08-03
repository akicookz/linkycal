import { afterEach, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";

import * as dbSchema from "../worker/db/schema";
import type { ToolContext } from "../worker/mcp/agent";
import { getEventType } from "../worker/mcp/tools/event-types";
import type { AppEnv } from "../worker/types";
import {
  applyProductionMigrations,
  createTestDb,
  type TestDatabase,
} from "./support/test-db";

async function seedLegacyEventType(testDatabase: TestDatabase): Promise<void> {
  await testDatabase.db.insert(dbSchema.schema.users).values({
    id: "owner-mcp-readonly",
    name: "MCP reader",
    email: "mcp-reader@example.com",
  });
  await testDatabase.db.insert(dbSchema.projects).values({
    id: "project-mcp-readonly",
    userId: "owner-mcp-readonly",
    name: "Read-only project",
    slug: "mcp-readonly",
  });
  await testDatabase.db.insert(dbSchema.eventTypes).values({
    id: "event-mcp-readonly",
    projectId: "project-mcp-readonly",
    name: "Legacy meeting",
    slug: "legacy-meeting",
    duration: 30,
    scheduleId: null,
  });
}

function context(testDatabase: TestDatabase): ToolContext {
  return {
    projectId: function projectId() {
      return "project-mcp-readonly";
    },
    scopes: function scopes() {
      return ["read"];
    },
    db: function database() {
      return testDatabase.db;
    },
    env: function environment() {
      return {} as AppEnv;
    },
    waitUntil: function waitUntil() {},
  };
}

describe("MCP read-only tool contract", function () {
  let testDatabase: TestDatabase | null = null;

  afterEach(function closeDatabase() {
    testDatabase?.close();
    testDatabase = null;
  });

  test("reading a legacy event type never creates or attaches a schedule", async function () {
    testDatabase = createTestDb();
    await seedLegacyEventType(testDatabase);

    const result = await getEventType(context(testDatabase), {
      eventTypeId: "event-mcp-readonly",
    });

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0]!.text)).toMatchObject({
      eventType: { id: "event-mcp-readonly", scheduleId: null },
      schedule: null,
      rules: [],
      overrides: [],
    });
    expect(
      await testDatabase.db
        .select({ count: sql<number>`count(*)` })
        .from(dbSchema.schedules),
    ).toEqual([{ count: 0 }]);
    expect(
      await testDatabase.db
        .select({ scheduleId: dbSchema.eventTypes.scheduleId })
        .from(dbSchema.eventTypes)
        .where(eq(dbSchema.eventTypes.id, "event-mcp-readonly")),
    ).toEqual([{ scheduleId: null }]);
  });

  test("the MCP discovery migration preserves the legacy default-schedule response", async function () {
    testDatabase = createTestDb({ through: "0036_mcp_oauth_grants.sql" });
    await seedLegacyEventType(testDatabase);

    applyProductionMigrations(testDatabase.sqlite, {
      after: "0036_mcp_oauth_grants.sql",
    });

    const result = await getEventType(context(testDatabase), {
      eventTypeId: "event-mcp-readonly",
    });
    const body = JSON.parse(result.content[0]!.text) as {
      eventType: { scheduleId: string | null };
      schedule: { id: string; name: string; timezone: string } | null;
      rules: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
    };

    expect(result.isError).toBeUndefined();
    expect(body.eventType.scheduleId).toBe(body.schedule?.id ?? null);
    expect(body.schedule).toMatchObject({
      name: "Working Hours",
      timezone: "America/New_York",
    });
    expect(
      body.rules.map((rule) => ({
        dayOfWeek: rule.dayOfWeek,
        startTime: rule.startTime,
        endTime: rule.endTime,
      })),
    ).toEqual([
      { dayOfWeek: 1, startTime: "09:00", endTime: "17:00" },
      { dayOfWeek: 2, startTime: "09:00", endTime: "17:00" },
      { dayOfWeek: 3, startTime: "09:00", endTime: "17:00" },
      { dayOfWeek: 4, startTime: "09:00", endTime: "17:00" },
      { dayOfWeek: 5, startTime: "09:00", endTime: "17:00" },
    ]);
  });
});

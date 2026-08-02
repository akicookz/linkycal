import { describe, expect, test } from "bun:test";

import { getAnalyticsOverviewAction } from "../worker/lib/analytics-actions";
import { toLegacyPlanLimits } from "../worker/lib/plan-limits";
import * as dbSchema from "../worker/db/schema";
import type { AppEnv } from "../worker/types";
import { installHttpCapture } from "./support/http-capture";
import { createTestDb } from "./support/test-db";

const NOW = new Date("2026-08-02T12:00:00.000Z");

describe("analytics plan access windows", () => {
  test("Free receives the shared structured feature error without querying analytics", async function () {
    let queryCount = 0;
    const http = installHttpCapture([{
      method: "POST",
      matches: () => true,
      respond: () => {
        queryCount += 1;
        return Response.json({ data: [], meta: {}, rows: 0 });
      },
    }]);

    try {
      const result = await getAnalyticsOverviewAction({
        db: {} as never,
        env: analyticsEnv(),
        projectId: "project-free",
        planLimits: toLegacyPlanLimits("free"),
        query: { period: "30d" },
        now: NOW,
      });

      expect(result).toMatchObject({
        ok: false,
        status: 403,
        body: {
          code: "plan_feature_unavailable",
          entitlement: "analytics",
          recommendedPlan: "pro",
        },
      });
      expect(queryCount).toBe(0);
    } finally {
      http.restore();
    }
  });

  test.each([
    { plan: "pro" as const, start: "2025-08-02", months: 12 },
    { plan: "business" as const, start: "2023-08-02", months: 36 },
  ])("$plan clamps custom queries to its $months-month history", async function (example) {
    const sqlBodies: string[] = [];
    const http = installHttpCapture([{
      method: "POST",
      matches: (url) => url.pathname.endsWith("/analytics_engine/sql"),
      respond: (request) => {
        sqlBodies.push(request.text);
        return Response.json({ data: [], meta: {}, rows: 0 });
      },
    }]);

    try {
      const result = await getAnalyticsOverviewAction({
        db: {} as never,
        env: analyticsEnv(),
        projectId: `project-${example.plan}`,
        planLimits: toLegacyPlanLimits(example.plan),
        query: {
          period: "custom",
          start: "2020-01-01",
          end: "2026-08-02",
        },
        now: NOW,
      });

      expect(result.ok).toBe(true);
      expect(sqlBodies.length).toBeGreaterThan(0);
      expect(sqlBodies.every((sql) => sql.includes(`timestamp >= '${example.start}'`)))
        .toBe(true);
      expect(sqlBodies.join("\n")).not.toContain("2020-01-01");
    } finally {
      http.restore();
    }
  });

  test("Free analytics observe mode uses the Pro history window", async () => {
    const testDatabase = createTestDb();
    await testDatabase.db.insert(dbSchema.schema.users).values({
      id: "analytics-observe-owner",
      name: "Analytics Owner",
      email: "analytics-observe@example.com",
    });
    await testDatabase.db.insert(dbSchema.teams).values({
      id: "analytics-observe-team",
      ownerUserId: "analytics-observe-owner",
      name: "Analytics Observe",
      slug: "analytics-observe",
    });
    await testDatabase.db.insert(dbSchema.projects).values({
      id: "project-free-observe",
      userId: "analytics-observe-owner",
      teamId: "analytics-observe-team",
      name: "Observed Analytics",
      slug: "observed-analytics",
    });
    await testDatabase.db.insert(dbSchema.subscriptions).values({
      id: "analytics-observe-subscription",
      userId: "analytics-observe-owner",
      teamId: "analytics-observe-team",
      plan: "free",
      status: "active",
    });
    const sqlBodies: string[] = [];
    const http = installHttpCapture([{
      method: "POST",
      matches: (url) => url.pathname.endsWith("/analytics_engine/sql"),
      respond: (request) => {
        sqlBodies.push(request.text);
        return Response.json({ data: [], meta: {}, rows: 0 });
      },
    }]);

    try {
      const result = await getAnalyticsOverviewAction({
        db: testDatabase.db,
        env: {
          ...analyticsEnv(),
          ENTITLEMENT_ENFORCEMENT_MODE: "observe",
        },
        projectId: "project-free-observe",
        planLimits: toLegacyPlanLimits("free"),
        query: {
          period: "custom",
          start: "2020-01-01",
          end: "2026-08-02",
        },
        now: NOW,
      });
      expect(result.ok).toBe(true);
      expect(sqlBodies.every((sql) => sql.includes("timestamp >= '2025-08-02'")))
        .toBe(true);
    } finally {
      http.restore();
      testDatabase.close();
    }
  });
});

function analyticsEnv() {
  return {
    CF_ACCOUNT_ID: "account-1",
    WAE_API_TOKEN: "token-1",
  } as AppEnv;
}

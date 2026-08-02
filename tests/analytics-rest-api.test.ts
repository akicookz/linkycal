import {
  describe,
  expect,
  test,
} from "bun:test";

import * as dbSchema from "../worker/db/schema";
import {
  configureAnalyticsIntegrationAction,
  listAnalyticsIntegrationsAction,
  writeAnonymousAnalyticsEvents,
} from "../worker/lib/analytics-actions";
import {
  projectRouteAccess,
} from "../worker/lib/api-route-policy";
import { PLAN_LIMITS } from "../worker/lib/plan-limits";
import { createTestDb } from "./support/test-db";

function createDataset(points: AnalyticsEngineDataPoint[]) {
  return {
    writeDataPoint: function writeDataPoint(point: AnalyticsEngineDataPoint) {
      points.push(point);
    },
  } as AnalyticsEngineDataset;
}

describe("analytics REST contract", () => {
  test("reports and provider settings are project API-key routes", () => {
    const routes = [
      ["GET", "/api/projects/project-acme/analytics/filters"],
      ["GET", "/api/projects/project-acme/analytics/overview"],
      ["GET", "/api/projects/project-acme/analytics/bookings"],
      ["GET", "/api/projects/project-acme/analytics/forms"],
      ["GET", "/api/projects/project-acme/analytics/integrations"],
      ["PUT", "/api/projects/project-acme/analytics/integrations/ga4"],
    ] as const;
    expect(routes.map(function access([method, path]) {
      return projectRouteAccess(method, path);
    })).toEqual([
      "apiKey",
      "apiKey",
      "apiKey",
      "apiKey",
      "apiKey",
      "apiKey",
    ]);
  });

  test("integration actions share strict Pro gating and provider-specific writes", async () => {
    const testDatabase = createTestDb();
    await testDatabase.db.insert(dbSchema.schema.users).values({
      id: "owner-rest-analytics",
      name: "Analytics owner",
      email: "analytics-rest@example.com",
    });
    await testDatabase.db.insert(dbSchema.projects).values({
      id: "project-rest-analytics",
      userId: "owner-rest-analytics",
      name: "Analytics project",
      slug: "analytics-project",
      settings: JSON.stringify({
        theme: { primaryBg: "#1B4332" },
      }),
    });

    try {
      const common = {
        db: testDatabase.db,
        env: {
          CF_ACCOUNT_ID: "account-1",
          WAE_API_TOKEN: "token-1",
        },
        projectId: "project-rest-analytics",
      };
      expect(await listAnalyticsIntegrationsAction({
        ...common,
        planLimits: PLAN_LIMITS.free,
      })).toEqual({
        ok: false,
        status: 403,
        body: {
          error: "Cannot view analytics because this feature is not available on the workspace plan.",
          code: "plan_feature_unavailable",
          entitlement: "analytics",
          scope: "workspace",
          used: null,
          limit: null,
          hardLimit: null,
          resetAt: null,
          recommendedPlan: "pro",
        },
      });
      expect(await configureAnalyticsIntegrationAction({
        ...common,
        planLimits: PLAN_LIMITS.free,
        provider: "ga4",
        body: {
          enabled: true,
          measurementId: "G-ABCD1234",
        },
      })).toEqual({
        ok: false,
        status: 403,
        body: {
          error: "Cannot view analytics because this feature is not available on the workspace plan.",
          code: "plan_feature_unavailable",
          entitlement: "analytics",
          scope: "workspace",
          used: null,
          limit: null,
          hardLimit: null,
          resetAt: null,
          recommendedPlan: "pro",
        },
      });

      expect(await configureAnalyticsIntegrationAction({
        ...common,
        planLimits: PLAN_LIMITS.pro,
        provider: "ga4",
        body: {
          enabled: true,
          measurementId: "G-ABCD1234",
        },
      })).toEqual({
        ok: true,
        status: 200,
        body: {
          integration: {
            provider: "ga4",
            enabled: true,
            measurementId: "G-ABCD1234",
          },
        },
      });
      expect(await configureAnalyticsIntegrationAction({
        ...common,
        planLimits: PLAN_LIMITS.pro,
        provider: "posthog",
        body: {
          enabled: true,
          projectKey: "phc_abcdefghijk",
          host: "https://collector.example.com",
        },
      })).toEqual({
        ok: false,
        status: 400,
        body: { error: "Invalid analytics integration" },
      });
      expect(await configureAnalyticsIntegrationAction({
        ...common,
        planLimits: PLAN_LIMITS.pro,
        provider: "unknown",
        body: { enabled: false },
      })).toEqual({
        ok: false,
        status: 400,
        body: { error: "Invalid analytics integration provider" },
      });
      expect(await listAnalyticsIntegrationsAction({
        ...common,
        planLimits: PLAN_LIMITS.pro,
      })).toEqual({
        ok: true,
        status: 200,
        body: {
          integrations: [
            {
              provider: "ga4",
              enabled: true,
              measurementId: "G-ABCD1234",
            },
            { provider: "meta_pixel", enabled: false },
            { provider: "posthog", enabled: false, host: "us" },
          ],
        },
      });

      const [project] = await testDatabase.db
        .select({ settings: dbSchema.projects.settings })
        .from(dbSchema.projects);
      expect(JSON.parse(project!.settings!)).toEqual({
        theme: { primaryBg: "#1B4332" },
        analyticsIntegrations: {
          ga4: {
            enabled: true,
            measurementId: "G-ABCD1234",
          },
          meta_pixel: { enabled: false },
          posthog: { enabled: false, host: "us" },
        },
      });
    } finally {
      testDatabase.close();
    }
  });

  test("anonymous single and batch tracking write only known projects and preserve safe detail fields", async () => {
    const testDatabase = createTestDb();
    await testDatabase.db.insert(dbSchema.schema.users).values({
      id: "owner-track",
      name: "Track owner",
      email: "track@example.com",
    });
    await testDatabase.db.insert(dbSchema.projects).values({
      id: "project-track",
      userId: "owner-track",
      name: "Track",
      slug: "track",
    });
    const points: AnalyticsEngineDataPoint[] = [];

    try {
      await writeAnonymousAnalyticsEvents({
        db: testDatabase.db,
        analytics: createDataset(points),
        events: [
          {
            event: "booking_availability_shown",
            projectSlug: "track",
            resourceSlug: "intro-call",
            journeyId: "123e4567-e89b-42d3-a456-426614174000",
            funnelType: "booking",
            stageKey: "booking-availability",
            stageLabel: "Available times",
            stageKind: "availability",
            stageOrder: 3,
            source: "widget",
            deviceType: "mobile",
            slotCount: 2,
            daysAhead: 5,
            durationMinutes: 30,
            primaryValue: "2026-08-03T15:00:00.000Z",
            context: {
              selectedDateUtc: "2026-08-03T15:00:00.000Z",
            },
          },
          {
            event: "form_view",
            projectSlug: "missing-project",
            resourceSlug: "lead-form",
          },
        ],
        country: "FI",
        city: "Helsinki",
      });

      expect(points).toHaveLength(1);
      expect(points[0]).toEqual({
        indexes: ["project-track"],
        blobs: [
          "project-track",
          "booking_availability_shown",
          "intro-call",
          "",
          "",
          "",
          "",
          "",
          "",
          "FI",
          "Helsinki",
          "widget",
          JSON.stringify({
            context: {
              selectedDateUtc: "2026-08-03T15:00:00.000Z",
            },
          }),
          "123e4567-e89b-42d3-a456-426614174000",
          "booking",
          "booking-availability",
          "Available times",
          "availability",
          "2026-08-03T15:00:00.000Z",
          "mobile",
        ],
        doubles: [1, 3, 2, 5, 30],
      });
    } finally {
      testDatabase.close();
    }
  });
});

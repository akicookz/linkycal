import {
  describe,
  expect,
  test,
} from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import * as dbSchema from "../worker/db/schema";
import type {
  ToolContext,
} from "../worker/mcp/agent";
import {
  configureAnalyticsIntegration,
  getAnalyticsOverview,
  getBookingFunnelAnalytics,
  getFormFunnelAnalytics,
  listAnalyticsIntegrations,
  registerAnalyticsTools,
} from "../worker/mcp/tools/analytics";
import type { AppEnv } from "../worker/types";
import { withToolErrors } from "../worker/mcp/helpers";
import { installHttpCapture } from "./support/http-capture";
import { createTestDb } from "./support/test-db";

function parsedResult(result: {
  content: Array<{ type: "text"; text: string }>;
}): unknown {
  return JSON.parse(result.content[0]!.text);
}

describe("project-scoped analytics MCP tools", () => {
  test("analytics tools share aggregate actions, ownership, entitlement, and strict provider validation", async () => {
    const testDatabase = createTestDb();
    await testDatabase.db.insert(dbSchema.schema.users).values([
      {
        id: "owner-mcp-analytics",
        name: "MCP owner",
        email: "mcp-analytics@example.com",
      },
      {
        id: "owner-mcp-free",
        name: "MCP free owner",
        email: "mcp-free@example.com",
      },
    ]);
    await testDatabase.db.insert(dbSchema.projects).values([
      {
        id: "project-mcp-pro",
        userId: "owner-mcp-analytics",
        name: "MCP Pro",
        slug: "mcp-pro",
      },
      {
        id: "project-mcp-free",
        userId: "owner-mcp-free",
        name: "MCP Free",
        slug: "mcp-free",
      },
    ]);
    await testDatabase.db.insert(dbSchema.subscriptions).values({
      id: "subscription-mcp-pro",
      userId: "owner-mcp-analytics",
      plan: "pro",
      status: "active",
    });
    await testDatabase.db.insert(dbSchema.eventTypes).values([
      {
        id: "event-mcp-owned",
        projectId: "project-mcp-pro",
        name: "Owned MCP call",
        slug: "owned-mcp-call",
        duration: 30,
      },
      {
        id: "event-mcp-foreign",
        projectId: "project-mcp-free",
        name: "Foreign MCP call",
        slug: "foreign-mcp-call",
        duration: 30,
      },
    ]);
    await testDatabase.db.insert(dbSchema.forms).values([
      {
        id: "form-mcp-owned",
        projectId: "project-mcp-pro",
        name: "Owned MCP form",
        slug: "owned-mcp-form",
      },
      {
        id: "form-mcp-foreign",
        projectId: "project-mcp-free",
        name: "Foreign MCP form",
        slug: "foreign-mcp-form",
      },
    ]);

    function context(projectId: string): ToolContext {
      return {
        projectId: function scopedProject() {
          return projectId;
        },
        scopes: function scopes() {
          return ["read", "write"];
        },
        db: function database() {
          return testDatabase.db;
        },
        env: function environment() {
          return {
            CF_ACCOUNT_ID: "account-1",
            WAE_API_TOKEN: "token-1",
          } as AppEnv;
        },
        waitUntil: function waitUntil() {},
      };
    }

    const sql = installHttpCapture([
      {
        method: "POST",
        matches: function matchesAnalyticsSql(url) {
          return url.pathname.endsWith("/analytics_engine/sql");
        },
        respond: function emptyAnalytics() {
          return new Response(JSON.stringify({
            data: [],
            meta: {},
            rows: 0,
          }));
        },
      },
    ]);
    const pro = context("project-mcp-pro");
    const free = context("project-mcp-free");

    try {
      const overview = await getAnalyticsOverview(pro, { period: "30d" });
      expect(parsedResult(overview)).toEqual({
        totals: {
          views: 0,
          conversions: 0,
          conversionRate: 0,
          uniqueSources: 0,
        },
        timeSeries: [],
        topSources: [],
        topCountries: [],
      });

      const booking = await getBookingFunnelAnalytics(pro, {
        period: "30d",
        eventTypeId: "event-mcp-owned",
        timezone: "Asia/Seoul",
      });
      expect(parsedResult(booking)).toEqual({
        funnel: {
          pageViews: 0,
          bookingsCreated: 0,
          conversionRate: 0,
        },
        byEventType: [],
        timeSeries: [],
        availableSince: null,
        stages: [],
        bySource: [],
        byDevice: [],
        clickedWeekdays: [],
        selectedDateAvailability: [],
        bookedWeekdays: [],
        bookedTimes: [],
      });

      const form = await getFormFunnelAnalytics(pro, {
        period: "30d",
        formId: "form-mcp-owned",
      });
      expect(parsedResult(form)).toEqual({
        funnel: {
          views: 0,
          started: 0,
          completed: 0,
          startRate: 0,
          completionRate: 0,
        },
        byForm: [],
        timeSeries: [],
        availableSince: null,
        stages: [],
        bySource: [],
        byDevice: [],
      });

      expect(await getBookingFunnelAnalytics(pro, {
        period: "30d",
        eventTypeId: "event-mcp-foreign",
        timezone: "Asia/Seoul",
      })).toEqual({
        content: [{ type: "text", text: "Not found" }],
        isError: true,
      });
      expect(await getFormFunnelAnalytics(pro, {
        period: "30d",
        formId: "form-mcp-foreign",
      })).toEqual({
        content: [{ type: "text", text: "Not found" }],
        isError: true,
      });
      expect(await getAnalyticsOverview(free, { period: "30d" })).toEqual({
        content: [{
          type: "text",
          text: "Cannot view analytics because this feature is not available on the workspace plan.",
        }],
        isError: true,
        structuredContent: {
          entitlementError: {
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
        },
      });

      const malformedTimezone = await withToolErrors(
        "get_booking_funnel_analytics",
        pro,
        function bookingTool(input) {
          return getBookingFunnelAnalytics(pro, input);
        },
      )({
        period: "30d",
        eventTypeId: "event-mcp-owned",
        timezone: "Not/A_Zone",
      });
      expect(malformedTimezone.isError).toBe(true);
      expect(malformedTimezone.content[0]?.text).toContain("Invalid input");

      const configured = await configureAnalyticsIntegration(pro, {
        provider: "posthog",
        enabled: true,
        projectKey: "phc_abcdefghijk",
        host: "eu",
      });
      expect(parsedResult(configured)).toEqual({
        integration: {
          provider: "posthog",
          enabled: true,
          projectKey: "phc_abcdefghijk",
          host: "eu",
        },
      });
      expect(await configureAnalyticsIntegration(pro, {
        provider: "posthog",
        enabled: true,
        projectKey: "phc_abcdefghijk",
        host: "https://collector.example.com" as "eu",
      })).toEqual({
        content: [{
          type: "text",
          text: "Invalid analytics integration",
        }],
        isError: true,
      });
      const integrations = await listAnalyticsIntegrations(pro);
      expect(parsedResult(integrations)).toEqual({
        integrations: [
          { provider: "ga4", enabled: false },
          { provider: "meta_pixel", enabled: false },
          {
            provider: "posthog",
            enabled: true,
            projectKey: "phc_abcdefghijk",
            host: "eu",
          },
        ],
      });
      expect(JSON.stringify([
        parsedResult(overview),
        parsedResult(booking),
        parsedResult(form),
      ])).not.toContain("journeyId");
      expect(sql.requests).toHaveLength(13);
    } finally {
      sql.restore();
      testDatabase.close();
    }
  });

  test("registration exposes every analytics tool without projectId inputs", () => {
    const registrations: Array<{
      name: string;
      inputSchema: Record<string, unknown>;
    }> = [];
    const server = {
      registerTool: function registerTool(
        name: string,
        config: { inputSchema: Record<string, unknown> },
      ) {
        registrations.push({ name, inputSchema: config.inputSchema });
      },
    } as unknown as McpServer;
    const context = {} as ToolContext;

    registerAnalyticsTools(server, context);

    expect(registrations.map(function tool(registration) {
      return registration.name;
    })).toEqual([
      "get_analytics_filters",
      "get_analytics_overview",
      "get_booking_funnel_analytics",
      "get_form_funnel_analytics",
      "list_analytics_integrations",
      "configure_analytics_integration",
    ]);
    for (const registration of registrations) {
      expect(registration.inputSchema).not.toHaveProperty("projectId");
    }
    expect(
      registrations.find(function isBookingTool(registration) {
        return registration.name === "get_booking_funnel_analytics";
      })?.inputSchema,
    ).toHaveProperty("timezone");
  });
});

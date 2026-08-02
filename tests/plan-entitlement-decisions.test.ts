import { describe, expect, test } from "bun:test";

import {
  evaluateEntitlement,
} from "../shared/entitlement-decision";
import type {
  EntitlementKey,
  Plan,
} from "../shared/plan-catalog";

interface FiniteResourceCase {
  label: string;
  plan: Plan;
  key: EntitlementKey;
  limit: number;
  scope: "project" | "workspace";
}

const FINITE_RESOURCES: FiniteResourceCase[] = [
  { label: "Free projects", plan: "free", key: "projects", limit: 1, scope: "workspace" },
  { label: "Pro projects", plan: "pro", key: "projects", limit: 5, scope: "workspace" },
  { label: "Business projects", plan: "business", key: "projects", limit: 20, scope: "workspace" },
  { label: "Free forms", plan: "free", key: "forms", limit: 3, scope: "project" },
  { label: "Pro forms", plan: "pro", key: "forms", limit: 20, scope: "project" },
  { label: "Free event types", plan: "free", key: "eventTypes", limit: 3, scope: "project" },
  { label: "Pro event types", plan: "pro", key: "eventTypes", limit: 20, scope: "project" },
  { label: "Free contacts", plan: "free", key: "contacts", limit: 500, scope: "project" },
  { label: "Pro contacts", plan: "pro", key: "contacts", limit: 5_000, scope: "project" },
  { label: "Business contacts", plan: "business", key: "contacts", limit: 10_000, scope: "project" },
  { label: "Free workflows", plan: "free", key: "workflows", limit: 1, scope: "project" },
  { label: "Pro workflows", plan: "pro", key: "workflows", limit: 10, scope: "project" },
  { label: "Free calendars", plan: "free", key: "calendarConnections", limit: 1, scope: "workspace" },
  { label: "Free team members", plan: "free", key: "teamMembers", limit: 0, scope: "workspace" },
];

describe("plan entitlement decisions", function () {
  test("finite resources allow the final slot and block the next persisted row", function () {
    for (const input of FINITE_RESOURCES) {
      if (input.limit > 0) {
        expect(
          evaluateEntitlement({
            plan: input.plan,
            key: input.key,
            used: input.limit - 1,
            amount: 1,
          }),
          input.label,
        ).toMatchObject({
          kind: "resource",
          scope: input.scope,
          allowed: true,
          limit: input.limit,
          hardLimit: input.limit,
        });
      }

      expect(
        evaluateEntitlement({
          plan: input.plan,
          key: input.key,
          used: input.limit,
          amount: 1,
        }),
        input.label,
      ).toMatchObject({
        allowed: false,
        status: "blocked",
        limit: input.limit,
        hardLimit: input.limit,
      });
    }
  });

  test("unlimited paid resources never manufacture a numeric ceiling", function () {
    const cases = [
      ["pro", "calendarConnections"],
      ["pro", "teamMembers"],
      ["business", "forms"],
      ["business", "eventTypes"],
      ["business", "workflows"],
    ] as const;

    for (const [plan, key] of cases) {
      expect(evaluateEntitlement({ plan, key, used: 9_999_999 })).toMatchObject({
        allowed: true,
        status: "available",
        limit: null,
        hardLimit: null,
      });
    }
  });

  test("monthly usage warns at 80 percent, enters grace at 100 percent, and blocks at 110 percent", function () {
    const cases = [
      { plan: "free", key: "formResponses", limit: 500, warning: 400, hard: 550 },
      { plan: "pro", key: "workflowExecutions", limit: 5_000, warning: 4_000, hard: 5_500 },
      { plan: "business", key: "transactionalEmails", limit: 50_000, warning: 40_000, hard: 55_000 },
      { plan: "free", key: "integrationRequests", limit: 10_000, warning: 8_000, hard: 11_000 },
      { plan: "free", key: "enrichments", limit: 5, warning: 4, hard: 6 },
    ] as const;

    for (const input of cases) {
      expect(evaluateEntitlement({
        plan: input.plan,
        key: input.key,
        used: input.warning - 1,
      }).status).toBe("available");
      expect(evaluateEntitlement({
        plan: input.plan,
        key: input.key,
        used: input.warning,
      }).status).toBe("warning");
      expect(evaluateEntitlement({
        plan: input.plan,
        key: input.key,
        used: input.limit,
      }).status).toBe("grace");
      expect(evaluateEntitlement({
        plan: input.plan,
        key: input.key,
        used: input.hard,
      })).toMatchObject({
        allowed: false,
        status: "blocked",
        limit: input.limit,
        hardLimit: input.hard,
      });
    }
  });

  test("storage uses decimal bytes and the same ten-percent grace policy", function () {
    const cases = [
      { plan: "free", limit: 500_000_000, hard: 550_000_000 },
      { plan: "pro", limit: 10_000_000_000, hard: 11_000_000_000 },
      { plan: "business", limit: 50_000_000_000, hard: 55_000_000_000 },
    ] as const;

    for (const input of cases) {
      expect(evaluateEntitlement({
        plan: input.plan,
        key: "storageBytes",
        used: input.hard,
      })).toMatchObject({
        kind: "metered",
        scope: "workspace",
        allowed: false,
        status: "blocked",
        limit: input.limit,
        hardLimit: input.hard,
        resetAt: null,
      });
    }
  });

  test("bookings, API, MCP, widgets, and theme overrides remain available on every plan", function () {
    for (const plan of ["free", "pro", "business"] as const) {
      expect(evaluateEntitlement({ plan, key: "bookings", used: 10_000_000 }))
        .toMatchObject({ allowed: true, limit: null, hardLimit: null });

      for (const key of [
        "apiAccess",
        "mcpAccess",
        "widgets",
        "themeOverrides",
      ] as const) {
        expect(evaluateEntitlement({ plan, key })).toMatchObject({
          enabled: true,
          allowed: true,
          status: "available",
        });
      }
    }
  });

  test("paid customization and analytics preserve their exact feature windows", function () {
    expect(evaluateEntitlement({ plan: "free", key: "customCss" }))
      .toMatchObject({ enabled: false, allowed: false, recommendedPlan: "pro" });
    expect(evaluateEntitlement({ plan: "free", key: "removeBranding" }))
      .toMatchObject({ enabled: false, allowed: false, recommendedPlan: "pro" });
    expect(evaluateEntitlement({ plan: "free", key: "analytics" }))
      .toMatchObject({ enabled: false, allowed: false, recommendedPlan: "pro" });

    expect(evaluateEntitlement({ plan: "pro", key: "analyticsRetentionMonths" }))
      .toMatchObject({ enabled: true, limit: 12 });
    expect(evaluateEntitlement({ plan: "business", key: "analyticsRetentionMonths" }))
      .toMatchObject({ enabled: true, limit: 36 });
  });

  test("upgrade recommendations skip a higher plan that still cannot allow the operation", function () {
    expect(evaluateEntitlement({
      plan: "free",
      key: "contacts",
      used: 5_000,
      amount: 1,
    }).recommendedPlan).toBe("business");

    expect(evaluateEntitlement({
      plan: "free",
      key: "projects",
      used: 5,
      amount: 1,
    }).recommendedPlan).toBe("business");

    expect(evaluateEntitlement({
      plan: "business",
      key: "contacts",
      used: 10_000,
      amount: 1,
    }).recommendedPlan).toBeNull();
  });
});

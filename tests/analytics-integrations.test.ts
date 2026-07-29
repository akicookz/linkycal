import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import * as dbSchema from "../worker/db/schema";
import {
  AnalyticsIntegrationService,
  mergeProjectSettingsPreservingAnalyticsIntegrations,
} from "../worker/services/analytics-integration-service";
import { loadPublicEventTypeAction } from "../worker/lib/public-event-type-actions";
import { loadPublicFormAction } from "../worker/lib/public-form-actions";
import { createTestDb, type TestDatabase } from "./support/test-db";

async function seedProject(
  testDatabase: TestDatabase,
  plan: "free" | "pro" | "business",
): Promise<void> {
  await testDatabase.db.insert(dbSchema.schema.users).values({
    id: "owner-analytics",
    name: "Analytics Owner",
    email: "owner@example.com",
  });
  await testDatabase.db.insert(dbSchema.projects).values({
    id: "project-analytics",
    userId: "owner-analytics",
    name: "Acme",
    slug: "acme",
    settings: JSON.stringify({
      theme: {
        primaryBg: "#1B4332",
      },
      analyticsIntegrations: {
        ga4: {
          enabled: true,
          measurementId: "G-ABCD1234",
        },
        meta_pixel: {
          enabled: false,
          pixelId: "12345678901",
        },
        posthog: {
          enabled: true,
          projectKey: "phc_abcdefghijklmnopqrstuvwxyz",
          host: "eu",
        },
      },
    }),
  });
  await testDatabase.db.insert(dbSchema.subscriptions).values({
    id: "subscription-analytics",
    userId: "owner-analytics",
    plan,
    interval: "monthly",
    status: "active",
  });
  await testDatabase.db.insert(dbSchema.eventTypes).values({
    id: "event-analytics",
    projectId: "project-analytics",
    name: "Intro call",
    slug: "intro-call",
    duration: 30,
    enabled: true,
  });
  await testDatabase.db.insert(dbSchema.forms).values({
    id: "form-analytics",
    projectId: "project-analytics",
    name: "Lead form",
    slug: "lead-form",
    type: "single",
    status: "active",
  });
  await testDatabase.db.insert(dbSchema.formSteps).values({
    id: "step-analytics",
    formId: "form-analytics",
    sortOrder: 0,
    title: "Contact",
  });
}

describe("analytics integration settings", () => {
  test("configuring one provider preserves project theme and every other provider", async () => {
    const testDatabase = createTestDb();
    await seedProject(testDatabase, "pro");
    const service = new AnalyticsIntegrationService(testDatabase.db);

    try {
      const configured = await service.configure("project-analytics", {
        provider: "meta_pixel",
        enabled: true,
        pixelId: "998877665544",
      });
      expect(configured).toEqual({
        provider: "meta_pixel",
        enabled: true,
        pixelId: "998877665544",
      });

      const [project] = await testDatabase.db
        .select({ settings: dbSchema.projects.settings })
        .from(dbSchema.projects)
        .where(eq(dbSchema.projects.id, "project-analytics"))
        .limit(1);
      expect(JSON.parse(project!.settings as string)).toEqual({
        theme: {
          primaryBg: "#1B4332",
        },
        analyticsIntegrations: {
          ga4: {
            enabled: true,
            measurementId: "G-ABCD1234",
          },
          meta_pixel: {
            enabled: true,
            pixelId: "998877665544",
          },
          posthog: {
            enabled: true,
            projectKey: "phc_abcdefghijklmnopqrstuvwxyz",
            host: "eu",
          },
        },
      });
    } finally {
      testDatabase.close();
    }
  });

  test("provider validation rejects bad identifiers, arbitrary hosts, raw scripts, and unknown projects", async () => {
    const testDatabase = createTestDb();
    await seedProject(testDatabase, "pro");
    const service = new AnalyticsIntegrationService(testDatabase.db);

    try {
      const invalidInputs: Array<{ label: string; value: unknown }> = [
        {
          label: "GA4 identifier",
          value: {
            provider: "ga4",
            enabled: true,
            measurementId: "UA-123",
          },
        },
        {
          label: "Meta identifier",
          value: {
            provider: "meta_pixel",
            enabled: true,
            pixelId: "pixel-one",
          },
        },
        {
          label: "PostHog host",
          value: {
            provider: "posthog",
            enabled: true,
            projectKey: "phc_abcdefghijklmnopqrstuvwxyz",
            host: "https://analytics.example.com",
          },
        },
        {
          label: "raw script",
          value: {
            provider: "ga4",
            enabled: false,
            script: "<script>alert(1)</script>",
          },
        },
      ];
      for (const input of invalidInputs) {
        await expect(
          service.configure("project-analytics", input.value),
          input.label,
        ).rejects.toThrow();
      }
      await expect(
        service.configure("missing-project", {
          provider: "ga4",
          enabled: false,
        }),
      ).resolves.toBeNull();
    } finally {
      testDatabase.close();
    }
  });

  test("disabling retains a validated public identifier for later re-enabling", async () => {
    const testDatabase = createTestDb();
    await seedProject(testDatabase, "pro");
    const service = new AnalyticsIntegrationService(testDatabase.db);

    try {
      expect(
        await service.configure("project-analytics", {
          provider: "ga4",
          enabled: false,
        }),
      ).toEqual({
        provider: "ga4",
        enabled: false,
        measurementId: "G-ABCD1234",
      });
    } finally {
      testDatabase.close();
    }
  });

  test("generic project settings cannot mutate the reserved integration subtree", () => {
    expect(
      mergeProjectSettingsPreservingAnalyticsIntegrations(
        {
          theme: { primaryBg: "#1B4332" },
          analyticsIntegrations: {
            ga4: { enabled: true, measurementId: "G-ABCD1234" },
          },
        },
        {
          theme: { primaryBg: "#000000" },
          analyticsIntegrations: {
            ga4: { enabled: false, measurementId: "G-HACKED" },
          },
        },
      ),
    ).toEqual({
      theme: { primaryBg: "#000000" },
      analyticsIntegrations: {
        ga4: { enabled: true, measurementId: "G-ABCD1234" },
      },
    });

    expect(
      mergeProjectSettingsPreservingAnalyticsIntegrations(
        { theme: { primaryBg: "#1B4332" } },
        {
          analyticsIntegrations: {
            posthog: {
              enabled: true,
              projectKey: "phc_should_not_be_created",
            },
          },
        },
      ),
    ).toEqual({});
  });
});

describe("public provider publication", () => {
  test("Free projects expose no providers and strip reserved settings", async () => {
    const testDatabase = createTestDb();
    await seedProject(testDatabase, "free");

    try {
      const booking = await loadPublicEventTypeAction(
        testDatabase.db,
        "acme",
        "intro-call",
      );
      const form = await loadPublicFormAction(
        testDatabase.db,
        "acme",
        "lead-form",
      );

      expect(booking.body.analyticsIntegrations).toEqual([]);
      expect(form.body.analyticsIntegrations).toEqual([]);
      expect(booking.body.project?.settings).toEqual({
        theme: { primaryBg: "#1B4332" },
      });
      expect(form.body.project?.settings).toEqual({
        theme: { primaryBg: "#1B4332" },
      });
    } finally {
      testDatabase.close();
    }
  });

  test("Pro and Business public loaders expose enabled identifiers only", async () => {
    for (const plan of ["pro", "business"] as const) {
      const testDatabase = createTestDb();
      await seedProject(testDatabase, plan);

      try {
        const booking = await loadPublicEventTypeAction(
          testDatabase.db,
          "acme",
          "intro-call",
        );
        const form = await loadPublicFormAction(
          testDatabase.db,
          "acme",
          "lead-form",
        );
        const expected = [
          {
            provider: "ga4",
            enabled: true,
            measurementId: "G-ABCD1234",
          },
          {
            provider: "posthog",
            enabled: true,
            projectKey: "phc_abcdefghijklmnopqrstuvwxyz",
            host: "eu",
          },
        ];
        expect(booking.body.analyticsIntegrations).toEqual(expected);
        expect(form.body.analyticsIntegrations).toEqual(expected);
      } finally {
        testDatabase.close();
      }
    }
  });
});

import { describe, expect, test } from "bun:test";

import {
  writeBookingCreatedAnalytics,
} from "../worker/lib/booking-analytics";
import { createBookingSchema } from "../worker/validation";

const correlation = {
  journeyId: "123e4567-e89b-42d3-a456-426614174000",
  funnelType: "booking",
  source: "widget",
  deviceType: "mobile",
  stageKey: "booking-submit",
  stageLabel: "Submit booking",
  stageKind: "submit",
  stageOrder: 7,
} as const;

describe("server-authoritative booking analytics", () => {
  test("strict booking correlation remains separate from guest and form fields", () => {
    const parsed = createBookingSchema.parse({
      projectSlug: "acme",
      eventTypeSlug: "discovery-call",
      name: "Hanna Guest",
      email: "hanna@example.com",
      startTime: "2026-03-23T13:00:00.000Z",
      timezone: "Europe/Helsinki",
      formFields: { company: "Northstar Oy" },
      analytics: correlation,
    });

    expect(parsed.analytics).toEqual(correlation);
    expect(parsed.formFields).toEqual({ company: "Northstar Oy" });
    expect(
      createBookingSchema.safeParse({
        ...parsed,
        analytics: {
          ...correlation,
          email: "hanna@example.com",
        },
      }).success,
    ).toBe(false);
    expect(
      createBookingSchema.safeParse({
        ...parsed,
        analytics: { ...correlation, funnelType: "form" },
      }).success,
    ).toBe(false);
  });

  test("a real booking success writes one correlated completion without PII", () => {
    const points: AnalyticsEngineDataPoint[] = [];
    const analytics = {
      writeDataPoint: function writeDataPoint(point: AnalyticsEngineDataPoint) {
        points.push(point);
      },
    } as AnalyticsEngineDataset;

    writeBookingCreatedAnalytics(analytics, {
      projectId: "project-acme",
      resourceSlug: "discovery-call",
      correlation,
      country: "FI",
      city: "Helsinki",
    });

    expect(points).toEqual([
      {
        indexes: ["project-acme"],
        blobs: [
          "project-acme",
          "booking_created",
          "discovery-call",
          "",
          "",
          "",
          "",
          "",
          "",
          "FI",
          "Helsinki",
          "widget",
          "",
          correlation.journeyId,
          "booking",
          "booking-complete",
          "Booking created",
          "completion",
          "",
          "mobile",
        ],
        doubles: [1, 8, 0, 0, 0],
      },
    ]);
    expect(JSON.stringify(points)).not.toContain("hanna@example.com");
    expect(JSON.stringify(points)).not.toContain("Northstar Oy");
  });
});

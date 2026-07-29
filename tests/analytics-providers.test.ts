import { describe, expect, test } from "bun:test";

import type {
  AnalyticsIntegrationConfig,
  CanonicalFunnelEvent,
} from "../shared/funnel-analytics";
import {
  buildExternalAnalyticsDispatches,
} from "../src/lib/analytics-providers";

const integrations: AnalyticsIntegrationConfig[] = [
  {
    provider: "ga4",
    enabled: true,
    measurementId: "G-ABCD1234",
  },
  {
    provider: "meta_pixel",
    enabled: true,
    pixelId: "12345678901",
  },
  {
    provider: "posthog",
    enabled: true,
    projectKey: "phc_abcdefghijklmnopqrstuvwxyz",
    host: "eu",
  },
];

function bookingCreatedEvent(): CanonicalFunnelEvent {
  return {
    event: "booking_created",
    projectSlug: "acme",
    resourceSlug: "intro-call",
    journeyId: "123e4567-e89b-42d3-a456-426614174000",
    funnelType: "booking",
    stageKey: "booking-complete",
    stageLabel: "Private customer question",
    stageKind: "completion",
    stageOrder: 8,
    source: "widget",
    deviceType: "mobile",
    slotCount: 3,
    daysAhead: 5,
    durationMinutes: 30,
    context: {
      selectedDate: "2026-08-03",
      weekday: "monday",
      viewerTimezone: "Asia/Seoul",
      offeredSlotStarts: ["09:00", "09:30", "10:00"],
      selectedTime: "09:30",
      availabilityOutcome: "available",
    },
    utmSource: "newsletter",
  };
}

describe("external analytics provider mapping", () => {
  test("GA4, Meta, and PostHog receive canonical safe booking properties", () => {
    const event = {
      ...bookingCreatedEvent(),
      email: "guest@example.com",
      name: "Guest Name",
      answers: { company: "Secret Co" },
      notes: "private",
      rawError: "database stack trace",
    } as CanonicalFunnelEvent;
    const dispatches = buildExternalAnalyticsDispatches(event, integrations);

    expect(dispatches.map(function summarize(dispatch) {
      return {
        provider: dispatch.provider,
        eventName: dispatch.eventName,
      };
    })).toEqual([
      { provider: "ga4", eventName: "linkycal_booking_created" },
      { provider: "meta_pixel", eventName: "Schedule" },
      { provider: "posthog", eventName: "booking_created" },
    ]);
    expect(dispatches[0]?.properties).toEqual({
      resource_slug: "intro-call",
      funnel_type: "booking",
      stage_key: "booking-complete",
      stage_order: 8,
      stage_kind: "completion",
      source: "widget",
      device_type: "mobile",
      slot_count: 3,
      days_ahead: 5,
      duration_minutes: 30,
      selected_date: "2026-08-03",
      weekday: "monday",
      viewer_timezone: "Asia/Seoul",
      offered_slot_starts: ["09:00", "09:30", "10:00"],
      selected_time: "09:30",
      availability_outcome: "available",
      utm_source: "newsletter",
    });
    const serialized = JSON.stringify(dispatches);
    for (const forbidden of [
      "Private customer question",
      "guest@example.com",
      "Guest Name",
      "Secret Co",
      "private",
      "database stack trace",
      "journeyId",
      "123e4567-e89b-42d3-a456-426614174000",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  test("Meta maps successful standalone form completion to Lead", () => {
    const dispatches = buildExternalAnalyticsDispatches(
      {
        ...bookingCreatedEvent(),
        event: "form_completed",
        funnelType: "form",
        resourceSlug: "lead-form",
      },
      integrations,
    );
    expect(
      dispatches.find(function isMeta(dispatch) {
        return dispatch.provider === "meta_pixel";
      })?.eventName,
    ).toBe("Lead");
  });

  test("disabled or incomplete provider configurations produce no dispatch", () => {
    expect(
      buildExternalAnalyticsDispatches(bookingCreatedEvent(), [
        { provider: "ga4", enabled: false, measurementId: "G-ABCD1234" },
        { provider: "meta_pixel", enabled: true },
        { provider: "posthog", enabled: true, host: "us" },
      ]),
    ).toEqual([]);
  });
});

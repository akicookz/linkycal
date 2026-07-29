import { describe, expect, test } from "bun:test";

import {
  ANALYTICS_EVENT_NAMES,
  DETAILED_ANALYTICS_EVENT_NAMES,
  EXISTING_CANONICAL_EVENT_NAMES,
  type CanonicalFunnelEvent,
} from "../shared/funnel-analytics";
import {
  analyticsQuerySchema,
  trackEventRequestSchema,
  trackEventSchema,
} from "../worker/validation";
import {
  writeAnalyticsEvent,
} from "../worker/services/analytics-service";

function detailedBookingEvent(
  overrides: Partial<CanonicalFunnelEvent> = {},
): CanonicalFunnelEvent {
  return {
    event: "booking_availability_shown",
    projectSlug: "acme",
    resourceSlug: "intro-call",
    journeyId: "123e4567-e89b-42d3-a456-426614174000",
    funnelType: "booking",
    stageKey: "booking-availability",
    stageLabel: "Available times",
    stageKind: "availability",
    stageOrder: 3,
    primaryValue: "2026-08-03",
    deviceType: "mobile",
    source: "widget",
    slotCount: 2,
    daysAhead: 5,
    durationMinutes: 30,
    context: {
      selectedDate: "2026-08-03",
      weekday: "monday",
      viewerTimezone: "Asia/Seoul",
      offeredSlotStarts: ["09:00", "09:30"],
      earliestSlot: "09:00",
      latestSlot: "09:30",
      availabilityOutcome: "available",
      stageOutcome: "viewed",
    },
    utmSource: "newsletter",
    ...overrides,
  };
}

describe("canonical analytics event validation", () => {
  test("every existing and detailed canonical event name remains accepted", () => {
    expect(ANALYTICS_EVENT_NAMES).toEqual([
      ...EXISTING_CANONICAL_EVENT_NAMES,
      ...DETAILED_ANALYTICS_EVENT_NAMES,
    ]);

    for (const event of EXISTING_CANONICAL_EVENT_NAMES) {
      const result = trackEventSchema.safeParse({
        event,
        projectSlug: "acme",
      });
      expect(result.success).toBe(true);
    }

    for (const event of DETAILED_ANALYTICS_EVENT_NAMES) {
      expect(
        trackEventSchema.safeParse(detailedBookingEvent({ event })).success,
      ).toBe(true);
    }
  });

  test("safe detailed scheduling context and a bounded batch are accepted", () => {
    expect(trackEventSchema.safeParse(detailedBookingEvent()).success).toBe(
      true,
    );
    expect(
      trackEventRequestSchema.safeParse({
        events: Array.from({ length: 20 }, function createEvent(_, index) {
          return detailedBookingEvent({
            stageKey: `booking-availability-${index}`,
          });
        }),
      }).success,
    ).toBe(true);
  });

  test("unsupported, oversized, malformed, and PII-shaped event data is rejected", () => {
    const invalidCases: Array<{ label: string; value: unknown }> = [
      {
        label: "unknown event",
        value: detailedBookingEvent({ event: "widget_view" as never }),
      },
      {
        label: "malformed journey",
        value: detailedBookingEvent({ journeyId: "visitor-1" }),
      },
      {
        label: "detailed event without journey and stage identity",
        value: {
          event: "booking_time_selected",
          projectSlug: "acme",
        },
      },
      {
        label: "malformed stage key",
        value: detailedBookingEvent({ stageKey: "question key with spaces" }),
      },
      {
        label: "invalid calendar date",
        value: detailedBookingEvent({
          context: {
            ...detailedBookingEvent().context,
            selectedDate: "2026-02-31",
          },
        }),
      },
      {
        label: "invalid local time",
        value: detailedBookingEvent({
          context: {
            ...detailedBookingEvent().context,
            selectedTime: "25:90",
          },
        }),
      },
      {
        label: "too many offered slots",
        value: detailedBookingEvent({
          context: {
            offeredSlotStarts: Array.from(
              { length: 49 },
              function createTime() {
                return "09:00";
              },
            ),
          },
        }),
      },
      {
        label: "oversized label",
        value: detailedBookingEvent({ stageLabel: "x".repeat(161) }),
      },
      {
        label: "unsupported context key",
        value: detailedBookingEvent({
          context: { answer: "confidential" } as never,
        }),
      },
      {
        label: "PII top-level key",
        value: {
          ...detailedBookingEvent(),
          email: "guest@example.com",
        },
      },
      {
        label: "oversized custom params",
        value: detailedBookingEvent({
          params: Object.fromEntries(
            Array.from({ length: 21 }, function createParam(_, index) {
              return [`custom_${index}`, "value"];
            }),
          ),
        }),
      },
      {
        label: "batch beyond the public bound",
        value: {
          events: Array.from({ length: 21 }, function createEvent() {
            return detailedBookingEvent();
          }),
        },
      },
    ];

    for (const invalidCase of invalidCases) {
      expect(
        trackEventRequestSchema.safeParse(invalidCase.value).success,
        invalidCase.label,
      ).toBe(false);
    }
  });
});

describe("analytics query validation", () => {
  test("custom periods require an ordered date range and standard periods reject dates", () => {
    const cases: Array<{
      label: string;
      value: Record<string, string>;
      accepted: boolean;
    }> = [
      {
        label: "custom range",
        value: {
          period: "custom",
          start: "2026-07-01",
          end: "2026-07-29",
          source: "widget",
          deviceType: "tablet",
        },
        accepted: true,
      },
      {
        label: "missing custom end",
        value: { period: "custom", start: "2026-07-01" },
        accepted: false,
      },
      {
        label: "reversed custom range",
        value: {
          period: "custom",
          start: "2026-07-29",
          end: "2026-07-01",
        },
        accepted: false,
      },
      {
        label: "dates on standard period",
        value: {
          period: "30d",
          start: "2026-07-01",
          end: "2026-07-29",
        },
        accepted: false,
      },
    ];

    for (const scenario of cases) {
      expect(
        analyticsQuerySchema.safeParse(scenario.value).success,
        scenario.label,
      ).toBe(scenario.accepted);
    }
  });
});

test("Analytics Engine keeps existing columns and writes detailed fields additively", () => {
  let captured:
    | { indexes?: string[]; blobs?: string[]; doubles?: number[] }
    | undefined;
  const dataset = {
    writeDataPoint: function captureDataPoint(data: {
      indexes?: string[];
      blobs?: string[];
      doubles?: number[];
    }) {
      captured = data;
    },
  } as unknown as AnalyticsEngineDataset;

  writeAnalyticsEvent(dataset, {
    projectId: "project-acme",
    ...detailedBookingEvent(),
    params: { campaign_variant: "spring" },
    country: "KR",
    city: "Seoul",
  });

  expect(captured?.indexes).toEqual(["project-acme"]);
  expect(captured?.blobs?.slice(0, 13)).toEqual([
    "project-acme",
    "booking_availability_shown",
    "intro-call",
    "newsletter",
    "",
    "",
    "",
    "",
    "",
    "KR",
    "Seoul",
    "widget",
    JSON.stringify({
      context: detailedBookingEvent().context,
      params: { campaign_variant: "spring" },
    }),
  ]);
  expect(captured?.blobs?.slice(13)).toEqual([
    "123e4567-e89b-42d3-a456-426614174000",
    "booking",
    "booking-availability",
    "Available times",
    "availability",
    "2026-08-03",
    "mobile",
  ]);
  expect(captured?.doubles).toEqual([1, 3, 2, 5, 30]);
});

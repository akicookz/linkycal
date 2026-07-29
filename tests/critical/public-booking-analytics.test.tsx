import {
  afterEach,
  describe,
  expect,
  test,
} from "bun:test";
import {
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { CanonicalFunnelEvent } from "../../shared/funnel-analytics";
import PublicBooking from "../../src/pages/PublicBooking";
import { classifyBookingFailure } from "../../src/lib/booking-analytics";
import { loadPublicEventTypeAction } from "../../worker/lib/public-event-type-actions";
import { AvailabilityService } from "../../worker/services/availability-service";
import {
  CROSS_TIMEZONE_SLOT_ISO,
  seedBookingDeliveryScenario,
} from "../support/fixtures";
import {
  restoreRealTime,
  setFixedTime,
} from "../support/fixed-time";
import {
  installHttpCapture,
  type CapturedRequest,
} from "../support/http-capture";
import { renderRoute } from "../support/render";
import { createTestDb } from "../support/test-db";

const JOURNEY_ID = "123e4567-e89b-42d3-a456-426614174000";

afterEach(function restoreClock() {
  restoreRealTime();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("public booking funnel analytics", () => {
  test("booking failures collapse to bounded categories without raw errors", () => {
    expect([
      classifyBookingFailure(400),
      classifyBookingFailure(409),
      classifyBookingFailure(429),
      classifyBookingFailure(500),
      classifyBookingFailure(undefined, new TypeError("email leaked here")),
      classifyBookingFailure(undefined, new Error("provider raw error")),
    ]).toEqual([
      "validation",
      "slot_unavailable",
      "rate_limited",
      "server",
      "network",
      "unknown",
    ]);
  });

  test("one booking journey records safe scheduling and attached-form stages in order", async () => {
    setFixedTime("2026-03-20T12:00:00.000Z");
    const testDatabase = createTestDb();
    await seedBookingDeliveryScenario(testDatabase.db);
    const availabilityService = new AvailabilityService(testDatabase.db);
    const events: CanonicalFunnelEvent[] = [];
    const beaconReads: Promise<void>[] = [];
    const originalSendBeacon = navigator.sendBeacon;
    let bookingRequest: CapturedRequest | undefined;
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: function captureBeacon(_url: string | URL, body?: BodyInit | null) {
        if (body instanceof Blob) {
          beaconReads.push(
            body.text().then(function parseEvent(value) {
              events.push(JSON.parse(value) as CanonicalFunnelEvent);
            }),
          );
        }
        return true;
      },
    });
    const http = installHttpCapture([
      {
        method: "GET",
        matches: function matchesEventType(url) {
          return url.pathname ===
            "/api/v1/event-types/acme/discovery-call";
        },
        respond: async function respondEventType(request) {
          const result = await loadPublicEventTypeAction(
            testDatabase.db,
            "acme",
            "discovery-call",
            request.url.searchParams.get("timezone") ?? undefined,
          );
          return jsonResponse(result.body, result.status);
        },
      },
      {
        method: "GET",
        matches: function matchesAvailability(url) {
          return url.pathname === "/api/v1/availability/acme";
        },
        respond: async function respondAvailability(request) {
          const slots = await availabilityService.getAvailableSlots({
            projectSlug: "acme",
            eventTypeSlug:
              request.url.searchParams.get("eventTypeSlug") ?? "",
            date: request.url.searchParams.get("date") ?? "",
            timezone: request.url.searchParams.get("timezone") ?? "",
            now: new Date("2026-03-20T12:00:00.000Z"),
          });
          return jsonResponse({ slots });
        },
      },
      {
        method: "POST",
        matches: function matchesBooking(url) {
          return url.pathname === "/api/v1/bookings";
        },
        respond: function respondBooking(request) {
          bookingRequest = request;
          return jsonResponse({
            booking: {
              id: "booking-hanna",
              status: "confirmed",
            },
          }, 201);
        },
      },
    ]);

    try {
      const user = userEvent.setup();
      renderRoute(
        <PublicBooking viewerTimezone="Europe/Helsinki" />,
        {
          route:
            `/acme/discovery-call?date=2026-03-23&lc_journey=${JOURNEY_ID}`,
          routePattern: "/:projectSlug/:slug",
        },
      );

      const slot = await screen.findByRole("button", {
        name: "3:00 PM - 3:30 PM",
      });
      await user.click(slot);
      await user.click(screen.getByRole("button", { name: /Your details/i }));
      await user.type(screen.getByLabelText(/Name/), "Hanna Guest");
      await user.type(
        screen.getByLabelText(/Email/),
        "hanna@example.com",
      );
      await user.click(screen.getByRole("button", { name: "Next" }));
      await user.type(screen.getByLabelText("Company"), "Northstar Oy");
      await user.click(
        screen.getByRole("button", { name: /Confirm Booking/i }),
      );

      await screen.findByRole("heading", { name: "Booking confirmed!" });
      await waitFor(function bookingWasCaptured() {
        expect(bookingRequest).toBeDefined();
      });
      await Promise.all(beaconReads);

      expect(events.map(function eventName(event) {
        return event.event;
      })).toEqual([
        "page_view",
        "booking_date_selected",
        "booking_availability_shown",
        "booking_time_selected",
        "booking_details_viewed",
        "form_stage_viewed",
        "booking_submit_attempted",
        "form_stage_completed",
      ]);
      expect(events[2]).toMatchObject({
        journeyId: JOURNEY_ID,
        funnelType: "booking",
        source: "direct",
        deviceType: "tablet",
        stageKey: "booking-availability",
        stageLabel: "Available times",
        stageKind: "availability",
        stageOrder: 3,
        primaryValue: "2026-03-23",
        slotCount: 1,
        daysAhead: 3,
        durationMinutes: 30,
        context: {
          selectedDate: "2026-03-23",
          weekday: "monday",
          viewerTimezone: "Europe/Helsinki",
          offeredSlotStarts: ["15:00"],
          earliestSlot: "15:00",
          latestSlot: "15:00",
          availabilityOutcome: "available",
        },
      });
      expect(events[3]).toMatchObject({
        primaryValue: "15:00",
        context: {
          selectedDate: "2026-03-23",
          selectedTime: "15:00",
          viewerTimezone: "Europe/Helsinki",
        },
      });
      expect(JSON.stringify(events)).not.toContain("hanna@example.com");
      expect(JSON.stringify(events)).not.toContain("Northstar Oy");
      expect(bookingRequest!.json).toEqual({
        projectSlug: "acme",
        eventTypeSlug: "discovery-call",
        startTime: CROSS_TIMEZONE_SLOT_ISO,
        name: "Hanna Guest",
        email: "hanna@example.com",
        timezone: "Europe/Helsinki",
        website: "",
        _token: btoa(String(new Date(
          "2026-03-20T12:00:00.000Z",
        ).getTime())),
        formFields: {
          company: "Northstar Oy",
        },
        analytics: {
          journeyId: JOURNEY_ID,
          funnelType: "booking",
          source: "direct",
          deviceType: "tablet",
          stageKey: "booking-submit",
          stageLabel: "Submit booking",
          stageKind: "submit",
          stageOrder: 7,
        },
      });
    } finally {
      Object.defineProperty(navigator, "sendBeacon", {
        configurable: true,
        value: originalSendBeacon,
      });
      http.restore();
      testDatabase.close();
    }
  });
});

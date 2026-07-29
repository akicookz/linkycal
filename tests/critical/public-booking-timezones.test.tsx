import { afterEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import PublicBooking from "../../src/pages/PublicBooking";
import { loadPublicEventTypeAction } from "../../worker/lib/public-event-type-actions";
import { AvailabilityService } from "../../worker/services/availability-service";
import {
  CROSS_TIMEZONE_SLOT_ISO,
  CROSS_TIMEZONE_VIEWERS,
  seedAvailabilityScenario,
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

const ANALYTICS_JOURNEY_ID =
  "123e4567-e89b-42d3-a456-426614174000";

const COMPONENT_VIEWERS = CROSS_TIMEZONE_VIEWERS.filter(function isRequiredViewer(
  viewer,
) {
  return viewer.timezone !== "Asia/Seoul" &&
    viewer.timezone !== "Pacific/Pago_Pago";
});

afterEach(function restoreClock() {
  restoreRealTime();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("public booking renders and submits the same instant across timezones", () => {
  for (const scenario of COMPONENT_VIEWERS) {
    test(`${scenario.timezone} sees and books the organizer's real slot`, async () => {
      setFixedTime("2026-03-20T12:00:00.000Z");
      const testDatabase = createTestDb();
      await seedAvailabilityScenario(testDatabase.db);
      const availabilityService = new AvailabilityService(testDatabase.db);
      let bookingRequest: CapturedRequest | undefined;
      const http = installHttpCapture([
        {
          method: "GET",
          matches: function matchesEventType(url) {
            return url.pathname ===
              "/api/v1/event-types/acme/discovery-call";
          },
          respond: async function respondEventType(request) {
            expect(
              Object.fromEntries(request.url.searchParams),
            ).toEqual({ timezone: scenario.timezone });
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
            });
          },
        },
      ]);

      try {
        const user = userEvent.setup();
        renderRoute(
          <PublicBooking viewerTimezone={scenario.timezone} />,
          {
            route:
              `/acme/discovery-call?lc_journey=${ANALYTICS_JOURNEY_ID}`,
            routePattern: "/:projectSlug/:slug",
          },
        );

        const calendarDay = await screen.findByRole("button", {
          name: String(Number(scenario.date.slice(-2))),
        });
        expect(calendarDay).toHaveProperty("disabled", false);
        await user.click(calendarDay);

        const slot = await screen.findByRole("button", {
          name: `${scenario.startLabel} - ${scenario.endLabel}`,
        });
        const availabilityRequests = http.requestsFor(
          "GET",
          "/api/v1/availability/acme",
        );
        const selectedDateRequests = availabilityRequests.filter(
          function matchesSelectedDate(request) {
            return request.url.searchParams.get("date") === scenario.date;
          },
        );
        expect(selectedDateRequests).toHaveLength(1);
        expect(
          Object.fromEntries(selectedDateRequests[0]!.url.searchParams),
        ).toEqual({
          date: scenario.date,
          timezone: scenario.timezone,
          eventTypeSlug: "discovery-call",
        });
        if (scenario.timezone === "Pacific/Kiritimati") {
          expect(
            screen.queryByText("No available times on this date"),
          ).toBeNull();
        }

        await user.click(slot);
        await user.click(screen.getByRole("button", { name: /Your details/i }));
        expect(
          screen.getByText(
            new RegExp(
              `${scenario.startLabel} - ${scenario.endLabel}`,
            ),
          ),
        ).toBeTruthy();
        await user.type(screen.getByLabelText(/Name/), "Hanna Guest");
        await user.type(
          screen.getByLabelText(/Email/),
          "hanna@example.com",
        );
        await user.click(
          screen.getByRole("button", { name: /Confirm Booking/i }),
        );

        await screen.findByRole("heading", { name: "Booking confirmed!" });
        await waitFor(function bookingWasCaptured() {
          expect(bookingRequest).toBeDefined();
        });
        expect(bookingRequest!.json).toEqual({
          projectSlug: "acme",
          eventTypeSlug: "discovery-call",
          startTime: CROSS_TIMEZONE_SLOT_ISO,
          name: "Hanna Guest",
          email: "hanna@example.com",
          timezone: scenario.timezone,
          website: "",
          _token: btoa(String(new Date(
            "2026-03-20T12:00:00.000Z",
          ).getTime())),
          analytics: {
            journeyId: ANALYTICS_JOURNEY_ID,
            funnelType: "booking",
            source: "direct",
            deviceType: "tablet",
            stageKey: "booking-submit",
            stageLabel: "Submit booking",
            stageKind: "submit",
            stageOrder: 6,
          },
        });
      } finally {
        http.restore();
        testDatabase.close();
      }
    });
  }
});

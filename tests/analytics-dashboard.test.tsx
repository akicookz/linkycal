import { afterEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Analytics from "../src/pages/Analytics";
import {
  installHttpCapture,
  type HttpCapture,
} from "./support/http-capture";
import { renderRoute } from "./support/render";

const PROJECT_ID = "project-1";

let http: HttpCapture | undefined;

afterEach(function restoreHttp() {
  http?.restore();
  http = undefined;
});

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
}

function installAnalyticsApi(): HttpCapture {
  http = installHttpCapture([
    {
      method: "GET",
      matches: (url) => url.pathname === `/api/projects/${PROJECT_ID}/entitlements`,
      respond: () => json({ planLimits: { analytics: true } }),
    },
    {
      method: "GET",
      matches: (url) => url.pathname === `/api/projects/${PROJECT_ID}/analytics/filters`,
      respond: () => json({
        utmSources: ["newsletter"],
        utmMediums: [],
        utmCampaigns: [],
        sources: ["direct", "widget"],
        deviceTypes: ["mobile", "desktop"],
        eventTypes: [
          { id: "event-1", slug: "discovery-call", name: "Discovery call" },
        ],
        forms: [
          { id: "form-1", slug: "lead-qualifier", name: "Lead qualifier" },
        ],
      }),
    },
    {
      method: "GET",
      matches: (url) => url.pathname === `/api/projects/${PROJECT_ID}/analytics/overview`,
      respond: () => json({
        totals: { views: 210, conversions: 80, conversionRate: 38.1, uniqueSources: 2 },
        timeSeries: [],
        topSources: [],
        topCountries: [],
      }),
    },
    {
      method: "GET",
      matches: (url) => url.pathname === `/api/projects/${PROJECT_ID}/analytics/bookings`,
      respond: (request) => json({
        funnel: { pageViews: 120, bookingsCreated: 27, conversionRate: 22.5 },
        byEventType: [{ slug: "discovery-call", views: 120, bookings: 27, rate: 22.5 }],
        timeSeries: [],
        availableSince: request.url.searchParams.get("resourceSlug")
          ? "2026-07-29T08:01:00.000Z"
          : null,
        stages: [],
        bySource: [{ source: "direct", visitors: 92 }],
        byDevice: [{ deviceType: "mobile", visitors: 71 }],
        clickedWeekdays: [],
        selectedDateAvailability: [],
        bookedWeekdays: [],
        bookedTimes: [],
      }),
    },
    {
      method: "GET",
      matches: (url) => url.pathname === `/api/projects/${PROJECT_ID}/analytics/forms`,
      respond: (request) => json({
        funnel: {
          views: 90,
          started: 70,
          completed: 53,
          startRate: 77.8,
          completionRate: 75.7,
        },
        byForm: [
          {
            slug: "lead-qualifier",
            views: 90,
            started: 70,
            completed: 53,
            completionRate: 75.7,
          },
        ],
        timeSeries: [],
        availableSince: request.url.searchParams.get("resourceSlug")
          ? "2026-07-29T08:01:00.000Z"
          : null,
        stages: [],
        bySource: [{ source: "widget", visitors: 58 }],
        byDevice: [{ deviceType: "desktop", visitors: 48 }],
      }),
    },
  ]);
  return http;
}

function renderAnalytics(): void {
  renderRoute(<Analytics />, {
    route: `/app/projects/${PROJECT_ID}/analytics`,
    routePattern: "/app/projects/:projectId/analytics",
  });
}

describe("analytics dashboard", function () {
  test("resource, source, device, and custom dates are sent as exact report filters", async function () {
    const capture = installAnalyticsApi();
    const user = userEvent.setup();
    renderAnalytics();

    await user.click(await screen.findByRole("tab", { name: "Bookings" }));
    await user.click(await screen.findByLabelText("Event type"));
    await user.click(await screen.findByRole("option", { name: "Discovery call" }));
    await user.click(screen.getByLabelText("Traffic source"));
    await user.click(await screen.findByRole("option", { name: "Widget" }));
    await user.click(screen.getByLabelText("Device type"));
    await user.click(await screen.findByRole("option", { name: "Mobile" }));
    await user.click(screen.getByLabelText("Period"));
    await user.click(await screen.findByRole("option", { name: "Custom dates" }));

    await user.type(screen.getByLabelText("Start date"), "2026-07-01");
    await user.type(screen.getByLabelText("End date"), "2026-07-29");
    const expectedTimezone =
      Intl.DateTimeFormat().resolvedOptions().timeZone;

    await waitFor(function exactFiltersWereQueried() {
      const selected = capture
        .requestsFor("GET", `/api/projects/${PROJECT_ID}/analytics/bookings`)
        .find(function matches(request) {
          return request.url.searchParams.get("period") === "custom" &&
            request.url.searchParams.get("start") === "2026-07-01" &&
            request.url.searchParams.get("end") === "2026-07-29" &&
            request.url.searchParams.get("resourceSlug") === "discovery-call" &&
            request.url.searchParams.get("source") === "widget" &&
            request.url.searchParams.get("deviceType") === "mobile" &&
            request.url.searchParams.get("timezone") === expectedTimezone;
        });
      expect(selected).toBeTruthy();
    });
  });
});

import { afterEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Analytics from "../src/pages/Analytics";
import type { FunnelStageReport } from "../shared/funnel-analytics";
import {
  installHttpCapture,
  type HttpCapture,
} from "./support/http-capture";
import { renderRoute } from "./support/render";

const PROJECT_ID = "project-1";

const bookingStages: FunnelStageReport[] = [
  {
    key: "page",
    label: "Booking page",
    kind: "page",
    order: 0,
    visitors: 120,
    continued: 86,
    continuationRate: 71.7,
    dropOffs: 34,
    dropOffRate: 28.3,
  },
  {
    key: "date",
    label: "Choose a date",
    kind: "date",
    order: 1,
    visitors: 86,
    continued: 72,
    continuationRate: 83.7,
    dropOffs: 14,
    dropOffRate: 16.3,
    contextBreakdowns: {
      selectedDates: [{ value: "2026-08-04", visitors: 31 }],
    },
  },
  {
    key: "availability",
    label: "Available times",
    kind: "availability",
    order: 2,
    visitors: 72,
    continued: 52,
    continuationRate: 72.2,
    dropOffs: 20,
    dropOffRate: 27.8,
    contextBreakdowns: {
      availabilityOutcomes: [
        { value: "available", visitors: 61 },
        { value: "none", visitors: 11 },
      ],
      offeredTimes: [
        { value: "09:00", visitors: 42 },
        { value: "10:30", visitors: 36 },
      ],
    },
  },
  {
    key: "time",
    label: "Choose a time",
    kind: "time",
    order: 3,
    visitors: 52,
    continued: 41,
    continuationRate: 78.8,
    dropOffs: 11,
    dropOffRate: 21.2,
    contextBreakdowns: {
      selectedTimes: [{ value: "09:00", visitors: 19 }],
    },
  },
  {
    key: "details",
    label: "Your details",
    kind: "details",
    order: 4,
    visitors: 41,
    continued: 34,
    continuationRate: 82.9,
    dropOffs: 7,
    dropOffRate: 17.1,
  },
  {
    key: "attached-form",
    label: "Tell us more",
    kind: "question",
    order: 5,
    visitors: 34,
    continued: 30,
    continuationRate: 88.2,
    dropOffs: 4,
    dropOffRate: 11.8,
  },
  {
    key: "submit",
    label: "Confirm booking",
    kind: "submit",
    order: 6,
    visitors: 30,
    continued: 27,
    continuationRate: 90,
    dropOffs: 3,
    dropOffRate: 10,
    contextBreakdowns: {
      submitFailures: [
        { value: "slot_unavailable", visitors: 2 },
        { value: "validation", visitors: 1 },
      ],
    },
  },
  {
    key: "completion",
    label: "Booking confirmed",
    kind: "completion",
    order: 7,
    visitors: 27,
    continued: 27,
    continuationRate: 100,
    dropOffs: 0,
    dropOffRate: 0,
  },
];

const formStages: FunnelStageReport[] = [
  {
    key: "welcome",
    label: "Welcome",
    kind: "statement",
    order: 0,
    visitors: 90,
    continued: 70,
    continuationRate: 77.8,
    dropOffs: 20,
    dropOffRate: 22.2,
    skipped: 4,
  },
  {
    key: "company-size",
    label: "How large is your company?",
    kind: "question",
    order: 1,
    visitors: 70,
    continued: 53,
    continuationRate: 75.7,
    dropOffs: 17,
    dropOffRate: 24.3,
    skipped: 8,
    contextBreakdowns: {
      validationFailures: [{ value: "required", visitors: 7 }],
    },
  },
  {
    key: "completion",
    label: "Form submitted",
    kind: "completion",
    order: 2,
    visitors: 53,
    continued: 53,
    continuationRate: 100,
    dropOffs: 0,
    dropOffRate: 0,
  },
];

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
        stages: request.url.searchParams.get("resourceSlug") ? bookingStages : [],
        bySource: [{ source: "direct", visitors: 92 }],
        byDevice: [{ deviceType: "mobile", visitors: 71 }],
        failures: [{ category: "slot_unavailable", count: 2 }],
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
        stages: request.url.searchParams.get("resourceSlug") ? formStages : [],
        bySource: [{ source: "widget", visitors: 58 }],
        byDevice: [{ deviceType: "desktop", visitors: 48 }],
        failures: [{ category: "validation", count: 7 }],
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
  test("selected event type shows every booking stage, journey counts instead of rates, and booking context", async function () {
    const capture = installAnalyticsApi();
    const user = userEvent.setup();
    renderAnalytics();

    await user.click(await screen.findByRole("tab", { name: "Bookings" }));
    await user.click(await screen.findByLabelText("Event type"));
    await user.click(await screen.findByRole("option", { name: "Discovery call" }));

    expect(await screen.findByText("Booking page")).toBeTruthy();
    expect(screen.getByText("Tell us more")).toBeTruthy();
    expect(screen.getByText("Booking confirmed")).toBeTruthy();
    const bookingPageStage = screen.getByRole("group", {
      name: "Booking page funnel stage",
    });
    expect(within(bookingPageStage).getByText("86")).toBeTruthy();
    expect(within(bookingPageStage).getByText("34")).toBeTruthy();
    expect(screen.getByText("Jul 29, 2026")).toBeTruthy();
    expect(screen.getByText("2026-08-04")).toBeTruthy();
    expect(screen.getAllByText("09:00").length).toBeGreaterThan(0);
    expect(screen.getByText("No availability")).toBeTruthy();
    expect(screen.getByText("Slot unavailable")).toBeTruthy();

    await waitFor(function selectedResourceWasQueried() {
      const selected = capture
        .requestsFor("GET", `/api/projects/${PROJECT_ID}/analytics/bookings`)
        .find((request) => request.url.searchParams.get("resourceSlug") === "discovery-call");
      expect(selected).toBeTruthy();
    });
  });

  test("selected form shows question-level skips and safe validation failures", async function () {
    installAnalyticsApi();
    const user = userEvent.setup();
    renderAnalytics();

    await user.click(await screen.findByRole("tab", { name: "Forms" }));
    await user.click(await screen.findByLabelText("Form"));
    await user.click(await screen.findByRole("option", { name: "Lead qualifier" }));

    expect(await screen.findByText("How large is your company?")).toBeTruthy();
    expect(screen.getByText("8 skipped")).toBeTruthy();
    expect(screen.getByText("Required")).toBeTruthy();
    expect(screen.queryByText(/answer/i)).toBeNull();
  });

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

    await waitFor(function exactFiltersWereQueried() {
      const selected = capture
        .requestsFor("GET", `/api/projects/${PROJECT_ID}/analytics/bookings`)
        .find(function matches(request) {
          return request.url.searchParams.get("period") === "custom" &&
            request.url.searchParams.get("start") === "2026-07-01" &&
            request.url.searchParams.get("end") === "2026-07-29" &&
            request.url.searchParams.get("resourceSlug") === "discovery-call" &&
            request.url.searchParams.get("source") === "widget" &&
            request.url.searchParams.get("deviceType") === "mobile";
        });
      expect(selected).toBeTruthy();
    });
  });
});

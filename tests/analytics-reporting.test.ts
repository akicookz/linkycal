import {
  afterEach,
  describe,
  expect,
  test,
} from "bun:test";

import {
  aggregateDetailedFunnel,
  queryBookings,
  type DetailedAnalyticsRow,
} from "../worker/services/analytics-service";
import * as dbSchema from "../worker/db/schema";
import {
  getAnalyticsFiltersAction,
  getBookingAnalyticsAction,
  getFormAnalyticsAction,
} from "../worker/lib/analytics-actions";
import { PLAN_LIMITS } from "../worker/lib/plan-limits";
import {
  installHttpCapture,
} from "./support/http-capture";
import { createTestDb } from "./support/test-db";

const FIRST_JOURNEY = "123e4567-e89b-42d3-a456-426614174000";
const SECOND_JOURNEY = "123e4567-e89b-42d3-a456-426614174001";

function row(
  journeyId: string,
  event: DetailedAnalyticsRow["event"],
  stageKey: string,
  stageLabel: string,
  stageKind: string,
  stageOrder: number,
  overrides: Partial<DetailedAnalyticsRow> = {},
): DetailedAnalyticsRow {
  return {
    timestamp: `2026-07-29T08:${String(stageOrder).padStart(2, "0")}:00.000Z`,
    event,
    context: "",
    journeyId,
    funnelType: "booking",
    stageKey,
    stageLabel,
    stageKind,
    primaryValue: "",
    source: journeyId === FIRST_JOURNEY ? "direct" : "widget",
    deviceType: journeyId === FIRST_JOURNEY ? "desktop" : "mobile",
    stageOrder,
    slotCount: 0,
    daysAhead: 0,
    durationMinutes: 30,
    ...overrides,
  };
}

function bookingRows(): DetailedAnalyticsRow[] {
  const rows: DetailedAnalyticsRow[] = [
    row(FIRST_JOURNEY, "page_view", "booking-view", "Discovery call", "page", 1),
    row(FIRST_JOURNEY, "page_view", "booking-view", "Discovery call", "page", 1),
    row(SECOND_JOURNEY, "page_view", "booking-view", "Discovery call", "page", 1),
    row(FIRST_JOURNEY, "booking_date_selected", "booking-date", "Date selected", "date", 2, {
      context: JSON.stringify({
        context: {
          selectedDate: "2026-08-03",
          weekday: "monday",
        },
      }),
    }),
    row(SECOND_JOURNEY, "booking_date_selected", "booking-date", "Date selected", "date", 2, {
      context: JSON.stringify({
        context: { selectedDate: "2026-08-03" },
      }),
    }),
    row(FIRST_JOURNEY, "booking_availability_shown", "booking-availability", "Available times", "availability", 3, {
      context: JSON.stringify({
        context: {
          selectedDate: "2026-08-03",
          offeredSlotStarts: ["15:00", "15:30"],
          availabilityOutcome: "available",
        },
      }),
      slotCount: 2,
    }),
    row(SECOND_JOURNEY, "booking_availability_shown", "booking-availability", "Available times", "availability", 3, {
      context: JSON.stringify({
        context: {
          selectedDate: "2026-08-03",
          offeredSlotStarts: [],
          availabilityOutcome: "none",
        },
      }),
    }),
    row(SECOND_JOURNEY, "booking_availability_shown", "booking-availability", "Available times", "availability", 3, {
      context: JSON.stringify({
        context: {
          selectedDate: "2026-08-03",
          offeredSlotStarts: ["15:00"],
          availabilityOutcome: "available",
        },
      }),
      slotCount: 1,
    }),
    row(FIRST_JOURNEY, "booking_time_selected", "booking-time", "Time selected", "time", 4, {
      context: JSON.stringify({
        context: { selectedTime: "15:00" },
      }),
    }),
    row(SECOND_JOURNEY, "booking_time_selected", "booking-time", "Time selected", "time", 4, {
      context: JSON.stringify({
        context: { selectedTime: "15:30" },
      }),
    }),
    row(FIRST_JOURNEY, "booking_details_viewed", "booking-details", "Guest details", "details", 5),
    row(SECOND_JOURNEY, "booking_details_viewed", "booking-details", "Guest details", "details", 5),
    row(FIRST_JOURNEY, "form_stage_viewed", "field-company", "Company", "question", 6),
    row(FIRST_JOURNEY, "form_stage_completed", "field-company", "Company", "question", 6),
    row(FIRST_JOURNEY, "form_stage_validation_failed", "field-company", "Company", "question", 6, {
      context: JSON.stringify({
        context: {
          stageOutcome: "validation_failed",
          failureCategory: "validation",
        },
      }),
    }),
    row(FIRST_JOURNEY, "form_stage_validation_failed", "field-company", "Company", "question", 6, {
      context: JSON.stringify({
        context: {
          stageOutcome: "validation_failed",
          failureCategory: "validation",
        },
      }),
    }),
    row(SECOND_JOURNEY, "form_stage_skipped", "field-company", "Company", "question", 6, {
      context: JSON.stringify({
        context: { stageOutcome: "skipped" },
      }),
    }),
    row(FIRST_JOURNEY, "booking_submit_attempted", "booking-submit", "Submit booking", "submit", 7),
    row(SECOND_JOURNEY, "booking_submit_attempted", "booking-submit", "Submit booking", "submit", 7),
    row(SECOND_JOURNEY, "booking_submit_failed", "booking-submit", "Submit booking", "submit", 7, {
      context: JSON.stringify({
        context: { failureCategory: "server" },
      }),
    }),
    row(SECOND_JOURNEY, "booking_submit_failed", "booking-submit", "Submit booking", "submit", 7, {
      context: JSON.stringify({
        context: { failureCategory: "server" },
      }),
    }),
    row(FIRST_JOURNEY, "booking_created", "booking-complete", "Booking created", "completion", 8),
    {
      ...row("", "page_view", "booking-view", "Old page view", "page", 1),
      timestamp: "2026-07-01T00:00:00.000Z",
    },
    row(FIRST_JOURNEY, "page_view", "booking-view", "Discovery call", "page", 1, {
      context: "{not-json",
    }),
  ];
  return rows;
}

afterEach(function restoreFetch() {
  // Each HTTP capture owns restoration in its test's finally block.
});

describe("unique-journey detailed funnel reporting", () => {
  test("repeated events, conditional skips, old rows, and malformed context produce safe exact drop-offs", () => {
    const report = aggregateDetailedFunnel(bookingRows());

    expect(report.availableSince).toBe("2026-07-29T08:01:00.000Z");
    expect(report.bySource).toEqual([
      { source: "direct", visitors: 1 },
      { source: "widget", visitors: 1 },
    ]);
    expect(report.byDevice).toEqual([
      { deviceType: "desktop", visitors: 1 },
      { deviceType: "mobile", visitors: 1 },
    ]);
    expect(report.failures).toEqual([
      { category: "validation", count: 1 },
      { category: "server", count: 1 },
    ]);
    expect(report.stages.map(function summarize(stage) {
      return {
        key: stage.key,
        visitors: stage.visitors,
        continued: stage.continued,
        dropOffs: stage.dropOffs,
        skipped: stage.skipped,
      };
    })).toEqual([
      { key: "booking-view", visitors: 2, continued: 2, dropOffs: 0, skipped: 0 },
      { key: "booking-date", visitors: 2, continued: 2, dropOffs: 0, skipped: 0 },
      { key: "booking-availability", visitors: 2, continued: 2, dropOffs: 0, skipped: 0 },
      { key: "booking-time", visitors: 2, continued: 2, dropOffs: 0, skipped: 0 },
      { key: "booking-details", visitors: 2, continued: 2, dropOffs: 0, skipped: 0 },
      { key: "field-company", visitors: 1, continued: 1, dropOffs: 0, skipped: 1 },
      { key: "booking-submit", visitors: 2, continued: 1, dropOffs: 1, skipped: 0 },
      { key: "booking-complete", visitors: 1, continued: 1, dropOffs: 0, skipped: 0 },
    ]);

    const availability = report.stages[2]!;
    expect(availability.contextBreakdowns).toEqual({
      selectedDates: [{ value: "2026-08-03", visitors: 2 }],
      availabilityOutcomes: [
        { value: "available", visitors: 2 },
        { value: "none", visitors: 1 },
      ],
      offeredTimes: [
        { value: "15:00", visitors: 2 },
        { value: "15:30", visitors: 1 },
      ],
    });
    expect(report.stages[3]!.contextBreakdowns).toEqual({
      selectedTimes: [
        { value: "15:00", visitors: 1 },
        { value: "15:30", visitors: 1 },
      ],
    });
    expect(report.stages[5]!.contextBreakdowns).toEqual({
      validationFailures: [{ value: "Company", visitors: 1 }],
    });
    expect(report.stages[6]!.contextBreakdowns).toEqual({
      submitFailures: [{ value: "server", visitors: 1 }],
    });
    expect(JSON.stringify(report)).not.toContain(FIRST_JOURNEY);
    expect(JSON.stringify(report)).not.toContain(SECOND_JOURNEY);
  });

  test("existing booking aggregates stay unchanged while detailed SQL honors every filter", async () => {
    const sqlBodies: string[] = [];
    const http = installHttpCapture([
      {
        method: "POST",
        matches: function matchesAnalyticsSql(url) {
          return url.pathname.endsWith("/analytics_engine/sql");
        },
        respond: function respondAnalyticsSql(request) {
          sqlBodies.push(request.text);
          if (request.text.includes("blob14 AS journeyId")) {
            return new Response(JSON.stringify({
              data: bookingRows(),
              meta: {},
              rows: bookingRows().length,
            }));
          }
          if (request.text.includes("blob3 AS slug")) {
            return new Response(JSON.stringify({
              data: [
                { slug: "discovery-call", event: "page_view", count: 9 },
                { slug: "discovery-call", event: "booking_created", count: 3 },
              ],
              meta: {},
              rows: 2,
            }));
          }
          if (request.text.includes("formatDateTime")) {
            return new Response(JSON.stringify({
              data: [
                { date: "2026-07-29", event: "page_view", count: 9 },
                { date: "2026-07-29", event: "booking_created", count: 3 },
              ],
              meta: {},
              rows: 2,
            }));
          }
          return new Response(JSON.stringify({
            data: [
              { event: "page_view", count: 9 },
              { event: "booking_created", count: 3 },
            ],
            meta: {},
            rows: 2,
          }));
        },
      },
    ]);

    try {
      const report = await queryBookings("account-1", "token-1", {
        projectId: "project-acme",
        period: "custom",
        start: "2026-07-01",
        end: "2026-07-31",
        resourceSlug: "discovery-call",
        utmSource: "partner's-list",
        source: "widget",
        deviceType: "mobile",
      });

      expect(report.funnel).toEqual({
        pageViews: 9,
        bookingsCreated: 3,
        conversionRate: 33.33333333333333,
      });
      expect(report.byEventType).toEqual([
        {
          slug: "discovery-call",
          views: 9,
          bookings: 3,
          rate: 33.33333333333333,
        },
      ]);
      expect(report.timeSeries).toEqual([
        { date: "2026-07-29", views: 9, bookings: 3 },
      ]);
      expect(report.stages).toHaveLength(8);
      expect(sqlBodies).toHaveLength(4);
      for (const sql of sqlBodies) {
        expect(sql).toContain("blob1 = 'project-acme'");
        expect(sql).toContain("timestamp >= '2026-07-01'");
        expect(sql).toContain("timestamp < '2026-08-01'");
        expect(sql).toContain("blob3 = 'discovery-call'");
        expect(sql).toContain("blob4 = 'partner''s-list'");
        expect(sql).toContain("blob12 = 'widget'");
        expect(sql).toContain("blob20 = 'mobile'");
      }
      expect(
        sqlBodies.some(function isDetailed(sql) {
          return sql.includes("blob14 != ''") &&
            sql.includes("blob15 = 'booking'");
        }),
      ).toBe(true);
      expect(JSON.stringify(report)).not.toContain(FIRST_JOURNEY);
    } finally {
      http.restore();
    }
  });

  test("resource ownership fails closed before Analytics Engine and filters expose only project catalogs", async () => {
    const testDatabase = createTestDb();
    await testDatabase.db.insert(dbSchema.schema.users).values({
      id: "owner-reporting",
      name: "Reporting owner",
      email: "reporting@example.com",
    });
    await testDatabase.db.insert(dbSchema.projects).values([
      {
        id: "project-reporting",
        userId: "owner-reporting",
        name: "Reporting",
        slug: "reporting",
      },
      {
        id: "project-private",
        userId: "owner-reporting",
        name: "Private",
        slug: "private",
      },
    ]);
    await testDatabase.db.insert(dbSchema.eventTypes).values([
      {
        id: "event-owned",
        projectId: "project-reporting",
        name: "Owned call",
        slug: "owned-call",
        duration: 30,
      },
      {
        id: "event-private",
        projectId: "project-private",
        name: "Private call",
        slug: "private-call",
        duration: 30,
      },
    ]);
    await testDatabase.db.insert(dbSchema.forms).values([
      {
        id: "form-owned",
        projectId: "project-reporting",
        name: "Owned form",
        slug: "owned-form",
      },
      {
        id: "form-private",
        projectId: "project-private",
        name: "Private form",
        slug: "private-form",
      },
    ]);
    const originalFetch = globalThis.fetch;
    let analyticsQueries = 0;
    globalThis.fetch = async function rejectUnexpectedQuery() {
      analyticsQueries += 1;
      throw new Error("Analytics Engine must not be queried");
    };

    try {
      const input = {
        db: testDatabase.db,
        env: {
          CF_ACCOUNT_ID: "account-1",
          WAE_API_TOKEN: "token-1",
        },
        projectId: "project-reporting",
        planLimits: PLAN_LIMITS.pro,
        query: {
          period: "30d" as const,
          resourceSlug: "private-call",
        },
      };
      const crossProjectBooking = await getBookingAnalyticsAction(input);
      const missingBooking = await getBookingAnalyticsAction({
        ...input,
        query: { period: "30d", resourceSlug: "missing-call" },
      });
      const crossProjectForm = await getFormAnalyticsAction({
        ...input,
        query: { period: "30d", resourceSlug: "private-form" },
      });

      expect(crossProjectBooking).toEqual(missingBooking);
      expect(crossProjectBooking).toEqual({
        ok: true,
        status: 200,
        body: {
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
          failures: [],
        },
      });
      expect(crossProjectForm).toEqual({
        ok: true,
        status: 200,
        body: {
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
          failures: [],
        },
      });
      expect(analyticsQueries).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }

    const filterHttp = installHttpCapture([
      {
        method: "POST",
        matches: function matchesAnalyticsSql(url) {
          return url.pathname.endsWith("/analytics_engine/sql");
        },
        respond: function respondFilters(request) {
          const value = request.text.includes("blob4")
            ? "partner"
            : request.text.includes("blob5")
              ? "email"
              : request.text.includes("blob6")
                ? "launch"
                : request.text.includes("blob12")
                  ? "widget"
                  : "mobile";
          return new Response(JSON.stringify({
            data: [{ val: value }],
            meta: {},
            rows: 1,
          }));
        },
      },
    ]);
    try {
      const filters = await getAnalyticsFiltersAction({
        db: testDatabase.db,
        env: {
          CF_ACCOUNT_ID: "account-1",
          WAE_API_TOKEN: "token-1",
        },
        projectId: "project-reporting",
        planLimits: PLAN_LIMITS.pro,
      });
      expect(filters).toEqual({
        ok: true,
        status: 200,
        body: {
          utmSources: ["partner"],
          utmMediums: ["email"],
          utmCampaigns: ["launch"],
          sources: ["widget"],
          deviceTypes: ["mobile"],
          eventTypes: [
            {
              id: "event-owned",
              slug: "owned-call",
              name: "Owned call",
            },
          ],
          forms: [
            {
              id: "form-owned",
              slug: "owned-form",
              name: "Owned form",
            },
          ],
        },
      });
      expect(filterHttp.requests).toHaveLength(5);
    } finally {
      filterHttp.restore();
      testDatabase.close();
    }
  });
});

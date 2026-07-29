import { describe, expect, test } from "bun:test";

import type { CanonicalFunnelEvent } from "../shared/funnel-analytics";
import {
  createFunnelAnalyticsDispatcher,
  detectAnalyticsDeviceType,
  type FunnelAnalyticsDependencies,
} from "../src/lib/funnel-analytics";
import {
  addWidgetAnalyticsParams,
} from "../widget/shared/api";

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: function clear() {
      values.clear();
    },
    getItem: function getItem(key) {
      return values.get(key) ?? null;
    },
    key: function key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem: function removeItem(key) {
      values.delete(key);
    },
    setItem: function setItem(key, value) {
      values.set(key, value);
    },
  };
}

function createDependencies(
  events: CanonicalFunnelEvent[],
  providerEvents: CanonicalFunnelEvent[] = [],
): FunnelAnalyticsDependencies {
  return {
    storage: createMemoryStorage(),
    randomUUID: function randomUUID() {
      return "123e4567-e89b-42d3-a456-426614174000";
    },
    viewportWidth: 390,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    coarsePointer: true,
    send: function send(event) {
      events.push(event);
    },
    dispatchProviders: function dispatchProviders(event) {
      providerEvents.push(event);
    },
  };
}

describe("funnel analytics dispatcher", () => {
  test("one resource journey carries source, device, UTM, and referrer without prefill data", () => {
    const events: CanonicalFunnelEvent[] = [];
    const providerEvents: CanonicalFunnelEvent[] = [];
    const dependencies = createDependencies(events, providerEvents);
    const dispatcher = createFunnelAnalyticsDispatcher(
      {
        projectSlug: "acme",
        resourceSlug: "intro-call",
        funnelType: "booking",
        search:
          "?lc_source=widget&lc_journey=123e4567-e89b-42d3-a456-426614174000&utm_source=newsletter&utm_campaign=spring&email=guest%40example.com",
        referrer: "https://publisher.example/article",
      },
      dependencies,
    );

    dispatcher.emit({
      event: "booking_time_selected",
      stageKey: "booking-time",
      stageLabel: "Time selected",
      stageKind: "time",
      stageOrder: 4,
      primaryValue: "09:30",
      context: { selectedTime: "09:30" },
    });

    expect(dispatcher.journeyId).toBe(
      "123e4567-e89b-42d3-a456-426614174000",
    );
    expect(events).toEqual([
      {
        event: "booking_time_selected",
        projectSlug: "acme",
        resourceSlug: "intro-call",
        journeyId: "123e4567-e89b-42d3-a456-426614174000",
        funnelType: "booking",
        source: "widget",
        deviceType: "mobile",
        utmSource: "newsletter",
        utmCampaign: "spring",
        referrer: "https://publisher.example/article",
        stageKey: "booking-time",
        stageLabel: "Time selected",
        stageKind: "time",
        stageOrder: 4,
        primaryValue: "09:30",
        context: { selectedTime: "09:30" },
      },
    ]);
    expect(JSON.stringify(events)).not.toContain("guest@example.com");
    expect(providerEvents).toEqual(events);
  });

  test("view and completion events dedupe while safe failure events may repeat", () => {
    const events: CanonicalFunnelEvent[] = [];
    const dispatcher = createFunnelAnalyticsDispatcher(
      {
        projectSlug: "acme",
        resourceSlug: "lead-form",
        funnelType: "form",
      },
      createDependencies(events),
    );
    const viewed = {
      event: "form_stage_viewed" as const,
      stageKey: "field-company",
      stageLabel: "Company",
      stageKind: "question" as const,
      stageOrder: 1,
    };
    const completed = {
      ...viewed,
      event: "form_stage_completed" as const,
    };
    const failed = {
      ...viewed,
      event: "form_stage_validation_failed" as const,
      context: {
        stageOutcome: "validation_failed" as const,
        failureCategory: "validation" as const,
      },
    };

    dispatcher.emit(viewed);
    dispatcher.emit(viewed);
    dispatcher.emit(completed);
    dispatcher.emit(completed);
    dispatcher.emit(failed);
    dispatcher.emit(failed);

    expect(events.map(function eventName(event) {
      return event.event;
    })).toEqual([
      "form_stage_viewed",
      "form_stage_completed",
      "form_stage_validation_failed",
      "form_stage_validation_failed",
    ]);
  });

  test("telemetry and provider exceptions never escape or block one another", () => {
    let providerCalls = 0;
    const dispatcher = createFunnelAnalyticsDispatcher(
      {
        projectSlug: "acme",
        resourceSlug: "intro-call",
        funnelType: "booking",
      },
      {
        ...createDependencies([]),
        send: function throwFromTransport() {
          throw new Error("transport offline");
        },
        dispatchProviders: function throwFromProvider() {
          providerCalls += 1;
          throw new Error("provider offline");
        },
      },
    );

    expect(function emitFailureIsolated() {
      dispatcher.emit({
        event: "booking_submit_failed",
        stageKey: "booking-submit",
        stageLabel: "Submit booking",
        stageKind: "submit",
        stageOrder: 7,
        context: { failureCategory: "network" },
      });
    }).not.toThrow();
    expect(providerCalls).toBe(1);
  });

  test("stored journeys are stable per project, funnel, and resource", () => {
    const storage = createMemoryStorage();
    let generated = 0;
    const dependencies: FunnelAnalyticsDependencies = {
      ...createDependencies([]),
      storage,
      randomUUID: function randomUUID() {
        generated += 1;
        return generated === 1
          ? "123e4567-e89b-42d3-a456-426614174000"
          : "123e4567-e89b-42d3-a456-426614174001";
      },
    };
    const first = createFunnelAnalyticsDispatcher(
      {
        projectSlug: "acme",
        resourceSlug: "intro-call",
        funnelType: "booking",
      },
      dependencies,
    );
    const sameResource = createFunnelAnalyticsDispatcher(
      {
        projectSlug: "acme",
        resourceSlug: "intro-call",
        funnelType: "booking",
      },
      dependencies,
    );
    const anotherResource = createFunnelAnalyticsDispatcher(
      {
        projectSlug: "acme",
        resourceSlug: "sales-call",
        funnelType: "booking",
      },
      dependencies,
    );

    expect(sameResource.journeyId).toBe(first.journeyId);
    expect(anotherResource.journeyId).toBe(
      "123e4567-e89b-42d3-a456-426614174001",
    );
  });
});

test("device classification uses stable mobile, tablet, and desktop boundaries", () => {
  expect(
    detectAnalyticsDeviceType({
      viewportWidth: 390,
      userAgent: "iPhone",
      coarsePointer: true,
    }),
  ).toBe("mobile");
  expect(
    detectAnalyticsDeviceType({
      viewportWidth: 900,
      userAgent: "iPad",
      coarsePointer: true,
    }),
  ).toBe("tablet");
  expect(
    detectAnalyticsDeviceType({
      viewportWidth: 1440,
      userAgent: "Macintosh",
      coarsePointer: false,
    }),
  ).toBe("desktop");
});

test("widget URLs hand one journey and widget source to the iframe", () => {
  const url = new URL("https://linkycal.com/acme/lead-form?utm_source=partner");
  addWidgetAnalyticsParams(url, {
    projectSlug: "acme",
    resourceSlug: "lead-form",
    funnelType: "form",
    storage: createMemoryStorage(),
    randomUUID: function randomUUID() {
      return "123e4567-e89b-42d3-a456-426614174000";
    },
  });

  expect(Object.fromEntries(url.searchParams)).toEqual({
    utm_source: "partner",
    lc_source: "widget",
    lc_journey: "123e4567-e89b-42d3-a456-426614174000",
  });
});


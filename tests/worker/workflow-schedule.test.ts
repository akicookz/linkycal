import { describe, expect, test } from "bun:test";
import {
  computeNextRunAt,
  parseWorkflowTriggerConfig,
} from "../../worker/lib/workflow-schedule";

describe("computeNextRunAt", () => {
  test("returns null without a schedule", () => {
    expect(computeNextRunAt(null)).toBeNull();
    expect(computeNextRunAt(undefined)).toBeNull();
  });

  test("hourly fires at the next top of the hour", () => {
    const from = new Date("2026-06-12T10:17:30Z");
    const next = computeNextRunAt({ frequency: "hourly" }, from);
    expect(next?.toISOString()).toBe("2026-06-12T11:00:00.000Z");
  });

  test("hourly from an exact hour boundary moves to the following hour", () => {
    const from = new Date("2026-06-12T10:00:00Z");
    const next = computeNextRunAt({ frequency: "hourly" }, from);
    expect(next?.toISOString()).toBe("2026-06-12T11:00:00.000Z");
  });

  test("daily fires today when the time has not passed yet", () => {
    const from = new Date("2026-06-12T06:00:00Z");
    const next = computeNextRunAt(
      { frequency: "daily", time: "09:00", timezone: "UTC" },
      from,
    );
    expect(next?.toISOString()).toBe("2026-06-12T09:00:00.000Z");
  });

  test("daily rolls to tomorrow when the time already passed", () => {
    const from = new Date("2026-06-12T09:00:00Z");
    const next = computeNextRunAt(
      { frequency: "daily", time: "09:00", timezone: "UTC" },
      from,
    );
    expect(next?.toISOString()).toBe("2026-06-13T09:00:00.000Z");
  });

  test("daily respects the configured timezone", () => {
    // 09:00 in New York (EDT, UTC-4) is 13:00 UTC
    const from = new Date("2026-06-12T00:00:00Z");
    const next = computeNextRunAt(
      { frequency: "daily", time: "09:00", timezone: "America/New_York" },
      from,
    );
    expect(next?.toISOString()).toBe("2026-06-12T13:00:00.000Z");
  });

  test("weekly fires on the configured weekday", () => {
    // 2026-06-12 is a Friday; next Monday is 2026-06-15
    const from = new Date("2026-06-12T12:00:00Z");
    const next = computeNextRunAt(
      { frequency: "weekly", dayOfWeek: 1, time: "08:00", timezone: "UTC" },
      from,
    );
    expect(next?.toISOString()).toBe("2026-06-15T08:00:00.000Z");
  });

  test("weekly rolls a full week when today's occurrence already passed", () => {
    // Friday after 08:00 with target Friday → next Friday
    const from = new Date("2026-06-12T12:00:00Z");
    const next = computeNextRunAt(
      { frequency: "weekly", dayOfWeek: 5, time: "08:00", timezone: "UTC" },
      from,
    );
    expect(next?.toISOString()).toBe("2026-06-19T08:00:00.000Z");
  });

  test("monthly fires later this month when possible", () => {
    const from = new Date("2026-06-12T00:00:00Z");
    const next = computeNextRunAt(
      { frequency: "monthly", dayOfMonth: 15, time: "10:00", timezone: "UTC" },
      from,
    );
    expect(next?.toISOString()).toBe("2026-06-15T10:00:00.000Z");
  });

  test("monthly rolls to the next month and across years", () => {
    const juneNext = computeNextRunAt(
      { frequency: "monthly", dayOfMonth: 1, time: "10:00", timezone: "UTC" },
      new Date("2026-06-12T00:00:00Z"),
    );
    expect(juneNext?.toISOString()).toBe("2026-07-01T10:00:00.000Z");

    const decemberNext = computeNextRunAt(
      { frequency: "monthly", dayOfMonth: 1, time: "10:00", timezone: "UTC" },
      new Date("2026-12-15T00:00:00Z"),
    );
    expect(decemberNext?.toISOString()).toBe("2027-01-01T10:00:00.000Z");
  });

  test("invalid timezone yields null instead of throwing", () => {
    const next = computeNextRunAt(
      { frequency: "daily", time: "09:00", timezone: "Not/AZone" },
      new Date("2026-06-12T00:00:00Z"),
    );
    expect(next).toBeNull();
  });
});

describe("parseWorkflowTriggerConfig", () => {
  test("parses an object config", () => {
    const config = parseWorkflowTriggerConfig({
      schedule: { frequency: "daily", time: "09:00", timezone: "UTC" },
      contactFilter: { tagIds: ["t1", "t2"], matchAllTags: true },
    });
    expect(config?.schedule?.frequency).toBe("daily");
    expect(config?.contactFilter?.tagIds).toEqual(["t1", "t2"]);
    expect(config?.contactFilter?.matchAllTags).toBe(true);
  });

  test("parses a JSON string config", () => {
    const config = parseWorkflowTriggerConfig(
      JSON.stringify({ contactFilter: { tagIds: ["t1"] } }),
    );
    expect(config?.contactFilter?.tagIds).toEqual(["t1"]);
    expect(config?.schedule).toBeUndefined();
  });

  test("drops invalid frequency and non-string tag ids", () => {
    const config = parseWorkflowTriggerConfig({
      schedule: { frequency: "yearly" },
      contactFilter: { tagIds: ["t1", 42, null] },
    });
    expect(config?.schedule).toBeUndefined();
    expect(config?.contactFilter?.tagIds).toEqual(["t1"]);
  });

  test("returns null for malformed input", () => {
    expect(parseWorkflowTriggerConfig("not json")).toBeNull();
    expect(parseWorkflowTriggerConfig(null)).toBeNull();
    expect(parseWorkflowTriggerConfig([1, 2])).toBeNull();
  });
});

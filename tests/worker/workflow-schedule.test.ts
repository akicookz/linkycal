import { describe, expect, test } from "bun:test";
import {
  computeNextRunAt,
  parseWorkflowTriggerConfig,
} from "../../worker/lib/workflow-schedule";

describe("computeNextRunAt", () => {

  test("daily respects the configured timezone", () => {
    // 09:00 in New York (EDT, UTC-4) is 13:00 UTC
    const from = new Date("2026-06-12T00:00:00Z");
    const next = computeNextRunAt(
      { frequency: "daily", time: "09:00", timezone: "America/New_York" },
      from,
    );
    expect(next?.toISOString()).toBe("2026-06-12T13:00:00.000Z");
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
});

describe("parseWorkflowTriggerConfig", () => {
});

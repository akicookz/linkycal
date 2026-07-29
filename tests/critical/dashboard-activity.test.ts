import { afterEach, describe, expect, test } from "bun:test";

import { getRelativeTime } from "../../src/components/ActivityCard";
import {
  restoreRealTime,
  setFixedTime,
} from "../support/fixed-time";

afterEach(function restoreClock() {
  restoreRealTime();
});

describe("dashboard booking activity labels", function () {
  test("bookings switch from elapsed hours to calendar dates after 24 hours", function () {
    setFixedTime("2026-07-29T12:00:00");

    const cases = [
      {
        name: "inside the relative window",
        start: "2026-07-28T11:31:00",
        end: "2026-07-28T12:01:00",
        want: "11:31 AM (23h 59m ago)",
      },
      {
        name: "at the absolute boundary",
        start: "2026-07-28T11:30:00",
        end: "2026-07-28T12:00:00",
        want: "Jul 28, 11:30 AM",
      },
      {
        name: "from a different year",
        start: "2025-12-31T08:30:00",
        end: "2025-12-31T09:00:00",
        want: "Dec 31, 2025, 8:30 AM",
      },
    ] as const;

    for (const scenario of cases) {
      expect(
        getRelativeTime(scenario.start, scenario.end).label,
        scenario.name,
      ).toBe(scenario.want);
    }
  });
});

import { describe, expect, test } from "bun:test";

import {
  formatDateInTimezone,
  formatTimeInTimezone,
  getDayOfWeekForDate,
  getScheduleDatesForViewerDay,
  getUtcRangeForLocalDate,
  getViewerAvailableWeekdays,
  localTimeToUtc,
} from "../../worker/lib/timezone";

describe("worker timezone helpers", () => {
  test("returns a 23-hour range for Europe/Berlin spring-forward day", () => {
    const range = getUtcRangeForLocalDate("2026-03-29", "Europe/Berlin");

    expect(range.start.toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-03-29T22:00:00.000Z");
    expect((range.end.getTime() - range.start.getTime()) / 36e5).toBe(23);
  });

  test("returns a 25-hour range for Europe/Berlin fall-back day", () => {
    const range = getUtcRangeForLocalDate("2026-10-25", "Europe/Berlin");

    expect(range.start.toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-10-25T23:00:00.000Z");
    expect((range.end.getTime() - range.start.getTime()) / 36e5).toBe(25);
  });

  test("round-trips a Berlin spring-forward post-shift time", () => {
    const utc = localTimeToUtc("2026-03-29", "03:00", "Europe/Berlin");

    expect(utc.toISOString()).toBe("2026-03-29T01:00:00.000Z");
    expect(formatDateInTimezone(utc, "Europe/Berlin")).toBe("2026-03-29");
    expect(formatTimeInTimezone(utc, "Europe/Berlin")).toBe("03:00");
  });

  test("round-trips a New York spring-forward post-shift time", () => {
    const utc = localTimeToUtc("2026-03-08", "03:00", "America/New_York");

    expect(utc.toISOString()).toBe("2026-03-08T07:00:00.000Z");
    expect(formatDateInTimezone(utc, "America/New_York")).toBe("2026-03-08");
    expect(formatTimeInTimezone(utc, "America/New_York")).toBe("03:00");
  });

  test("treats 24:00 as next-day midnight in the target timezone", () => {
    const utc = localTimeToUtc("2026-11-01", "24:00", "America/New_York");

    expect(formatDateInTimezone(utc, "America/New_York")).toBe("2026-11-02");
    expect(formatTimeInTimezone(utc, "America/New_York")).toBe("00:00");
  });

  test("computes viewer-day overlaps for Europe, Asia, and North America", () => {
    const berlinRange = getUtcRangeForLocalDate("2026-03-29", "Europe/Berlin");
    const newYorkRange = getUtcRangeForLocalDate(
      "2026-11-01",
      "America/New_York",
    );

    expect(getScheduleDatesForViewerDay(berlinRange, "Asia/Seoul")).toEqual([
      "2026-03-29",
      "2026-03-30",
    ]);
    expect(
      getScheduleDatesForViewerDay(berlinRange, "America/New_York"),
    ).toEqual(["2026-03-28", "2026-03-29"]);
    expect(getScheduleDatesForViewerDay(newYorkRange, "Europe/Berlin")).toEqual(
      ["2026-11-01", "2026-11-02"],
    );
  });

  test("keeps weekday detection aligned with Sunday-based backend numbering", () => {
    expect(getDayOfWeekForDate("2026-03-29", "Europe/Berlin")).toBe(0);
    expect(getDayOfWeekForDate("2026-03-30", "Asia/Seoul")).toBe(1);
  });
});

describe("getViewerAvailableWeekdays", () => {
  // Mid-week, off-DST reference so the computed reference week is stable.
  const NOW = new Date("2026-04-22T12:00:00Z");

  test("shifts NY Mon/Tue/Fri 16:00–22:00 into Tokyo Tue/Wed/Sat", () => {
    const rules = [
      { dayOfWeek: 1, startTime: "16:00", endTime: "22:00" },
      { dayOfWeek: 2, startTime: "16:00", endTime: "22:00" },
      { dayOfWeek: 5, startTime: "16:00", endTime: "22:00" },
    ];

    expect(
      getViewerAvailableWeekdays(rules, "America/New_York", "Asia/Tokyo", NOW),
    ).toEqual([2, 3, 6]);
  });

  test("is the identity when viewer shares the schedule timezone", () => {
    const rules = [
      { dayOfWeek: 1, startTime: "16:00", endTime: "22:00" },
      { dayOfWeek: 2, startTime: "16:00", endTime: "22:00" },
      { dayOfWeek: 5, startTime: "16:00", endTime: "22:00" },
    ];

    expect(
      getViewerAvailableWeekdays(
        rules,
        "America/New_York",
        "America/New_York",
        NOW,
      ),
    ).toEqual([1, 2, 5]);
  });

  test("covers two viewer weekdays when a window straddles midnight after the shift", () => {
    // UTC Mon 10:30–13:30 → Auckland (NZST, +12 post-2026-04-05) Mon 22:30 – Tue 01:30.
    const rules = [{ dayOfWeek: 1, startTime: "10:30", endTime: "13:30" }];

    expect(
      getViewerAvailableWeekdays(rules, "UTC", "Pacific/Auckland", NOW),
    ).toEqual([1, 2]);
  });

  test("24:00 end time does not leak into the next weekday", () => {
    // NY Mon 22:00–24:00 → Tokyo Tue 11:00–13:00; endInclusive (end − 1ms) stays on Tuesday.
    const rules = [{ dayOfWeek: 1, startTime: "22:00", endTime: "24:00" }];

    expect(
      getViewerAvailableWeekdays(rules, "America/New_York", "Asia/Tokyo", NOW),
    ).toEqual([2]);
  });

  test("returns empty array when no rules", () => {
    expect(
      getViewerAvailableWeekdays([], "America/New_York", "Asia/Tokyo", NOW),
    ).toEqual([]);
  });
});

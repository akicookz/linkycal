import { describe, expect, test } from "bun:test";

import {
  formatDateInTimezone,
  formatTimeInTimezone,
} from "../../worker/lib/timezone";
import { buildSlotsForWindow } from "../../worker/services/availability-service";

describe("availability slot generation", () => {
  test("skips the missing spring-forward hour in Europe/Berlin", () => {
    const slots = buildSlotsForWindow({
      scheduleDate: "2026-03-29",
      window: { startTime: "01:00", endTime: "04:00" },
      scheduleTimezone: "Europe/Berlin",
      duration: 30,
    });

    const localTimes = slots.map((slot) => ({
      date: formatDateInTimezone(slot.start, "Europe/Berlin"),
      time: formatTimeInTimezone(slot.start, "Europe/Berlin"),
    }));

    expect(localTimes).toEqual([
      { date: "2026-03-29", time: "01:00" },
      { date: "2026-03-29", time: "01:30" },
      { date: "2026-03-29", time: "03:00" },
      { date: "2026-03-29", time: "03:30" },
    ]);
  });

  test("includes the repeated fall-back hour in America/New_York", () => {
    const slots = buildSlotsForWindow({
      scheduleDate: "2026-11-01",
      window: { startTime: "00:00", endTime: "03:00" },
      scheduleTimezone: "America/New_York",
      duration: 60,
    });

    const localTimes = slots.map((slot) => ({
      date: formatDateInTimezone(slot.start, "America/New_York"),
      time: formatTimeInTimezone(slot.start, "America/New_York"),
      iso: slot.start.toISOString(),
    }));

    expect(localTimes).toEqual([
      {
        date: "2026-11-01",
        time: "00:00",
        iso: "2026-11-01T04:00:00.000Z",
      },
      {
        date: "2026-11-01",
        time: "01:00",
        iso: "2026-11-01T05:00:00.000Z",
      },
      {
        date: "2026-11-01",
        time: "01:00",
        iso: "2026-11-01T06:00:00.000Z",
      },
      {
        date: "2026-11-01",
        time: "02:00",
        iso: "2026-11-01T07:00:00.000Z",
      },
    ]);
  });

  test("handles 24:00 as the end of day when generating slots", () => {
    const slots = buildSlotsForWindow({
      scheduleDate: "2026-03-30",
      window: { startTime: "23:00", endTime: "24:00" },
      scheduleTimezone: "Asia/Seoul",
      duration: 30,
    });

    expect(slots.map((slot) => slot.start.toISOString())).toEqual([
      "2026-03-30T14:00:00.000Z",
      "2026-03-30T14:30:00.000Z",
    ]);
  });
});

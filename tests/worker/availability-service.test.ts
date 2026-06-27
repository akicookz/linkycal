import { describe, expect, test } from "bun:test";

import {
  formatDateInTimezone,
  formatTimeInTimezone,
  getDayOfWeekForDate,
} from "../../worker/lib/timezone";
import {
  AvailabilityService,
  buildSlotsForWindow,
} from "../../worker/services/availability-service";
import * as dbSchema from "../../worker/db/schema";
import { createTestDb } from "./mcp-test-db";

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

type BookingStatus = "confirmed" | "pending" | "cancelled" | "rescheduled" | "declined";

// Seeds one project/schedule/rule/event-type. The schedule is UTC and open
// 09:00–17:00 on the weekday of a date ~60 days out, so generated slots are
// always in the future regardless of when the suite runs.
async function seedEventType(opts: {
  maxPerDay?: number | null;
  maxPerWeek?: number | null;
  weekStart?: "monday" | "sunday";
}) {
  const db = createTestDb();
  await db.insert(dbSchema.schema.users).values({
    id: "u1",
    name: "U",
    email: "u@example.com",
  });
  await db.insert(dbSchema.projects).values({
    id: "p1",
    userId: "u1",
    name: "P",
    slug: "p1",
  });
  await db.insert(dbSchema.schedules).values({
    id: "s1",
    projectId: "p1",
    name: "S",
    timezone: "UTC",
  });
  const base = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  const dateStr = formatDateInTimezone(base, "UTC");
  const dayOfWeek = getDayOfWeekForDate(dateStr, "UTC");
  await db.insert(dbSchema.availabilityRules).values({
    id: "r1",
    scheduleId: "s1",
    dayOfWeek,
    startTime: "09:00",
    endTime: "17:00",
  });
  await db.insert(dbSchema.eventTypes).values({
    id: "et1",
    projectId: "p1",
    name: "Call",
    slug: "call",
    duration: 30,
    scheduleId: "s1",
    maxPerDay: opts.maxPerDay ?? null,
    maxPerWeek: opts.maxPerWeek ?? null,
    weekStart: opts.weekStart ?? "monday",
  });
  return { db, dateStr };
}

function bookingAt(id: string, dateStr: string, hour: number, status: BookingStatus) {
  const start = new Date(`${dateStr}T${String(hour).padStart(2, "0")}:00:00.000Z`);
  return {
    id,
    eventTypeId: "et1",
    name: "G",
    email: "g@example.com",
    startTime: start,
    endTime: new Date(start.getTime() + 30 * 60 * 1000),
    timezone: "UTC",
    status,
  };
}

async function slotsFor(db: ReturnType<typeof createTestDb>, dateStr: string) {
  return new AvailabilityService(db).getAvailableSlots({
    projectSlug: "p1",
    eventTypeSlug: "call",
    date: dateStr,
    timezone: "UTC",
  });
}

describe("AvailabilityService booking limits", () => {
  test("no limits set → slots are returned", async () => {
    const { db, dateStr } = await seedEventType({});
    expect((await slotsFor(db, dateStr)).length).toBeGreaterThan(0);
  });

  test("daily cap gates the day once pending+confirmed reach the limit", async () => {
    const { db, dateStr } = await seedEventType({ maxPerDay: 2 });
    await db.insert(dbSchema.bookings).values([
      bookingAt("b1", dateStr, 9, "confirmed"),
      bookingAt("b2", dateStr, 10, "pending"),
    ]);
    expect(await slotsFor(db, dateStr)).toEqual([]);
  });

  test("daily cap ignores declined/cancelled/rescheduled", async () => {
    const { db, dateStr } = await seedEventType({ maxPerDay: 2 });
    await db.insert(dbSchema.bookings).values([
      bookingAt("b1", dateStr, 9, "confirmed"),
      bookingAt("b2", dateStr, 11, "declined"),
      bookingAt("b3", dateStr, 12, "cancelled"),
      bookingAt("b4", dateStr, 13, "rescheduled"),
    ]);
    // Only the confirmed one counts (1 < 2), so the day stays open.
    expect((await slotsFor(db, dateStr)).length).toBeGreaterThan(0);
  });

  test("daily cap stays open while below the limit", async () => {
    const { db, dateStr } = await seedEventType({ maxPerDay: 3 });
    await db.insert(dbSchema.bookings).values([
      bookingAt("b1", dateStr, 9, "confirmed"),
    ]);
    expect((await slotsFor(db, dateStr)).length).toBeGreaterThan(0);
  });

  test("weekly cap gates the week once the limit is reached", async () => {
    const { db, dateStr } = await seedEventType({ maxPerWeek: 2 });
    await db.insert(dbSchema.bookings).values([
      bookingAt("b1", dateStr, 9, "confirmed"),
      bookingAt("b2", dateStr, 10, "pending"),
    ]);
    expect(await slotsFor(db, dateStr)).toEqual([]);
  });
});

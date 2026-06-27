import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import * as dbSchema from "../../worker/db/schema";
import { createBookingAction } from "../../worker/lib/booking-actions";
import type { BookingActionDeps } from "../../worker/lib/booking-actions";
import type { AppEnv } from "../../worker/types";
import { formatDateInTimezone, getDayOfWeekForDate } from "../../worker/lib/timezone";
import { createTestDb } from "./mcp-test-db";

const realFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = (async () =>
    new Response("{}", { status: 200 })) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

async function seed(opts: { maxPerDay?: number | null; maxPerWeek?: number | null }) {
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
  const dateStr = formatDateInTimezone(
    new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    "UTC",
  );
  await db.insert(dbSchema.availabilityRules).values({
    id: "r1",
    scheduleId: "s1",
    dayOfWeek: getDayOfWeekForDate(dateStr, "UTC"),
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
    weekStart: "monday",
  });
  const deps: BookingActionDeps = {
    db,
    env: { RESEND_API_KEY: "re_test" } as AppEnv,
    waitUntil: () => {},
  };
  return { db, dateStr, deps };
}

function bookingRow(id: string, dateStr: string, hour: number, status: string) {
  const start = new Date(`${dateStr}T${String(hour).padStart(2, "0")}:00:00.000Z`);
  return {
    id,
    eventTypeId: "et1",
    name: "G",
    email: "g@example.com",
    startTime: start,
    endTime: new Date(start.getTime() + 30 * 60 * 1000),
    timezone: "UTC",
    status: status as "confirmed",
  };
}

describe("createBookingAction enforces booking limits", () => {
  test("returns 'This day is fully booked' when the daily cap is met", async () => {
    const { db, dateStr, deps } = await seed({ maxPerDay: 1 });
    await db.insert(dbSchema.bookings).values(bookingRow("b1", dateStr, 9, "confirmed"));
    const result = await createBookingAction(deps, {
      projectSlug: "p1",
      eventTypeSlug: "call",
      name: "New Guest",
      email: "new@example.com",
      startTime: `${dateStr}T10:00:00.000Z`,
      timezone: "UTC",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toBe("This day is fully booked");
    }
  });

  test("returns 'This week is fully booked' when the weekly cap is met", async () => {
    const { db, dateStr, deps } = await seed({ maxPerWeek: 1 });
    await db.insert(dbSchema.bookings).values(bookingRow("b1", dateStr, 9, "confirmed"));
    const result = await createBookingAction(deps, {
      projectSlug: "p1",
      eventTypeSlug: "call",
      name: "New Guest",
      email: "new@example.com",
      startTime: `${dateStr}T10:00:00.000Z`,
      timezone: "UTC",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toBe("This week is fully booked");
    }
  });

  test("allows the booking when below the cap", async () => {
    const { dateStr, deps } = await seed({ maxPerDay: 2 });
    const result = await createBookingAction(deps, {
      projectSlug: "p1",
      eventTypeSlug: "call",
      name: "New Guest",
      email: "new@example.com",
      startTime: `${dateStr}T10:00:00.000Z`,
      timezone: "UTC",
    });
    expect(result.ok).toBe(true);
  });
});

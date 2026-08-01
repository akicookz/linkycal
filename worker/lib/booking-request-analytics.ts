import { and, eq, gte, lt } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { formatInTimeZone } from "date-fns-tz";

import type { BookingAnalyticsBreakdowns } from "../../shared/funnel-analytics";
import * as dbSchema from "../db/schema";
import { getUtcRangeForLocalDate } from "./timezone";

export interface BookingRequestAnalyticsInput {
  db: DrizzleD1Database<Record<string, unknown>>;
  projectId: string;
  period: "7d" | "30d" | "90d" | "custom";
  start?: string;
  end?: string;
  resourceSlug?: string;
  timezone: string;
  now?: Date;
}

const WEEKDAY_ORDER = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function weekdayOrder(weekday: string): number {
  const index = WEEKDAY_ORDER.indexOf(
    weekday as (typeof WEEKDAY_ORDER)[number],
  );
  return index === -1 ? WEEKDAY_ORDER.length : index;
}

export async function queryBookingRequestAnalytics(
  input: BookingRequestAnalyticsInput,
): Promise<Pick<
  BookingAnalyticsBreakdowns,
  "bookedWeekdays" | "bookedTimes"
>> {
  const conditions = [eq(dbSchema.eventTypes.projectId, input.projectId)];
  if (input.resourceSlug) {
    conditions.push(eq(dbSchema.eventTypes.slug, input.resourceSlug));
  }

  if (input.period === "custom" && input.start && input.end) {
    const start = getUtcRangeForLocalDate(
      input.start,
      input.timezone,
    ).start;
    const end = getUtcRangeForLocalDate(input.end, input.timezone).end;
    conditions.push(gte(dbSchema.bookings.createdAt, start));
    conditions.push(lt(dbSchema.bookings.createdAt, end));
  } else {
    const days = input.period === "7d" ? 7 : input.period === "30d" ? 30 : 90;
    const now = input.now ?? new Date();
    conditions.push(gte(
      dbSchema.bookings.createdAt,
      new Date(now.getTime() - days * 86_400_000),
    ));
  }

  const bookings = await input.db
    .select({ startTime: dbSchema.bookings.startTime })
    .from(dbSchema.bookings)
    .innerJoin(
      dbSchema.eventTypes,
      eq(dbSchema.bookings.eventTypeId, dbSchema.eventTypes.id),
    )
    .where(and(...conditions));
  const weekdayCounts = new Map<string, number>();
  const timeCounts = new Map<string, number>();

  for (const booking of bookings) {
    const weekday = formatInTimeZone(
      booking.startTime,
      input.timezone,
      "EEEE",
    );
    const time = formatInTimeZone(
      booking.startTime,
      input.timezone,
      "HH:mm",
    );
    weekdayCounts.set(weekday, (weekdayCounts.get(weekday) ?? 0) + 1);
    timeCounts.set(time, (timeCounts.get(time) ?? 0) + 1);
  }

  return {
    bookedWeekdays: [...weekdayCounts.entries()]
      .map(function bookedWeekday([weekday, count]) {
        return { weekday, bookings: count };
      })
      .sort(function sortBookedWeekdays(left, right) {
        return right.bookings - left.bookings ||
          weekdayOrder(left.weekday) - weekdayOrder(right.weekday);
      }),
    bookedTimes: [...timeCounts.entries()]
      .map(function bookedTime([time, count]) {
        return { time, bookings: count };
      })
      .sort(function sortBookedTimes(left, right) {
        return right.bookings - left.bookings || left.time.localeCompare(right.time);
      }),
  };
}

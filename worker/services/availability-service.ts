import type { DrizzleD1Database } from "drizzle-orm/d1";
import { eq, and, gte, lte } from "drizzle-orm";
import * as dbSchema from "../db/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GetAvailableSlotsParams {
  projectSlug: string;
  eventTypeSlug: string;
  date: string; // YYYY-MM-DD
  timezone: string;
  externalBusySlots?: Array<{ start: string; end: string }>;
}

interface TimeSlot {
  start: string; // ISO 8601
  end: string; // ISO 8601
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class AvailabilityService {
  constructor(private db: DrizzleD1Database<Record<string, unknown>>) {}

  // ─── Get Available Slots ──────────────────────────────────────────────────

  async getAvailableSlots(params: GetAvailableSlotsParams): Promise<TimeSlot[]> {
    const { projectSlug, eventTypeSlug, date, timezone } = params;

    // 1. Look up project by slug
    const projectRows = await this.db
      .select()
      .from(dbSchema.projects)
      .where(eq(dbSchema.projects.slug, projectSlug))
      .limit(1);

    const project = projectRows[0];
    if (!project) return [];

    // 2. Look up event type by (projectId, slug)
    const eventTypeRows = await this.db
      .select()
      .from(dbSchema.eventTypes)
      .where(
        and(
          eq(dbSchema.eventTypes.projectId, project.id),
          eq(dbSchema.eventTypes.slug, eventTypeSlug),
        ),
      )
      .limit(1);

    const eventType = eventTypeRows[0];
    if (!eventType || !eventType.enabled) return [];

    // 3. Get the event type's own schedule, or fall back to project default
    let schedule: typeof dbSchema.schedules.$inferSelect | undefined;

    if (eventType.scheduleId) {
      const etScheduleRows = await this.db
        .select()
        .from(dbSchema.schedules)
        .where(eq(dbSchema.schedules.id, eventType.scheduleId))
        .limit(1);
      schedule = etScheduleRows[0];
    }

    // Fall back to project default schedule
    if (!schedule) {
      const scheduleRows = await this.db
        .select()
        .from(dbSchema.schedules)
        .where(
          and(
            eq(dbSchema.schedules.projectId, project.id),
            eq(dbSchema.schedules.isDefault, true),
          ),
        )
        .limit(1);
      schedule = scheduleRows[0];
    }

    // Fall back to first schedule
    if (!schedule) {
      const fallbackRows = await this.db
        .select()
        .from(dbSchema.schedules)
        .where(eq(dbSchema.schedules.projectId, project.id))
        .limit(1);
      schedule = fallbackRows[0];
    }

    if (!schedule) return [];

    // 4. Get availability rules for that schedule
    const rules = await this.db
      .select()
      .from(dbSchema.availabilityRules)
      .where(eq(dbSchema.availabilityRules.scheduleId, schedule.id));

    if (rules.length === 0) return [];

    // 5. Get schedule overrides for the requested date
    const overrides = await this.db
      .select()
      .from(dbSchema.scheduleOverrides)
      .where(
        and(
          eq(dbSchema.scheduleOverrides.scheduleId, schedule.id),
          eq(dbSchema.scheduleOverrides.date, date),
        ),
      );

    // 6. Get existing confirmed bookings for the event type on that date
    const dayStart = new Date(date + "T00:00:00Z");
    const dayEnd = new Date(date + "T23:59:59Z");

    const existingBookings = await this.db
      .select()
      .from(dbSchema.bookings)
      .where(
        and(
          eq(dbSchema.bookings.eventTypeId, eventType.id),
          eq(dbSchema.bookings.status, "confirmed"),
          gte(dbSchema.bookings.startTime, dayStart),
          lte(dbSchema.bookings.startTime, dayEnd),
        ),
      );

    // 7. Generate time slots
    return this.generateSlots({
      date,
      timezone,
      scheduleTz: schedule.timezone,
      rules,
      overrides,
      existingBookings,
      duration: eventType.duration,
      bufferBefore: eventType.bufferBefore,
      bufferAfter: eventType.bufferAfter,
      maxPerDay: eventType.maxPerDay,
      externalBusySlots: params.externalBusySlots,
    });
  }

  // ─── Check Conflict ───────────────────────────────────────────────────────

  checkConflict(
    startTime: Date,
    endTime: Date,
    existingBookings: Array<{ startTime: Date; endTime: Date }>,
  ): boolean {
    return existingBookings.some((booking) => {
      return startTime < booking.endTime && endTime > booking.startTime;
    });
  }

  // ─── Private: Generate Slots ──────────────────────────────────────────────

  private generateSlots(params: {
    date: string;
    timezone: string;
    scheduleTz: string;
    rules: dbSchema.AvailabilityRuleRow[];
    overrides: dbSchema.ScheduleOverrideRow[];
    existingBookings: dbSchema.BookingRow[];
    duration: number;
    bufferBefore: number;
    bufferAfter: number;
    maxPerDay: number | null;
    externalBusySlots?: Array<{ start: string; end: string }>;
  }): TimeSlot[] {
    const {
      date,
      scheduleTz,
      rules,
      overrides,
      existingBookings,
      duration,
      bufferBefore,
      bufferAfter,
      maxPerDay,
      externalBusySlots,
    } = params;

    // a. Parse the requested date and get dayOfWeek
    const dayOfWeek = getDayOfWeekForDate(date, scheduleTz);

    // b. Check for overrides on this date
    const override = overrides[0];

    // c. If blocked, return empty
    if (override?.isBlocked) return [];

    // d. Determine availability windows
    let windows: Array<{ startTime: string; endTime: string }>;

    if (override?.startTime && override?.endTime) {
      // Use override custom times instead of rules
      windows = [{ startTime: override.startTime, endTime: override.endTime }];
    } else {
      // Filter rules for this day of week
      const dayRules = rules.filter((r) => r.dayOfWeek === dayOfWeek);
      if (dayRules.length === 0) return [];
      windows = dayRules.map((r) => ({
        startTime: r.startTime,
        endTime: r.endTime,
      }));
    }

    // e. Generate slots at `duration` minute intervals for each window
    const slots: TimeSlot[] = [];
    const now = new Date();

    for (const window of windows) {
      const windowStartMinutes = timeToMinutes(window.startTime);
      const windowEndMinutes = timeToMinutes(window.endTime);

      let cursor = windowStartMinutes;

      while (cursor + duration <= windowEndMinutes) {
        const slotStartMinutes = cursor;
        const slotEndMinutes = cursor + duration;

        // Build UTC timestamps from schedule timezone local times
        const slotStart = localTimeToUtc(date, minutesToTime(slotStartMinutes), scheduleTz);
        const slotEnd = localTimeToUtc(date, minutesToTime(slotEndMinutes), scheduleTz);

        // f. Apply buffer for conflict checking
        const bufferedStart = new Date(slotStart.getTime() - bufferBefore * 60 * 1000);
        const bufferedEnd = new Date(slotEnd.getTime() + bufferAfter * 60 * 1000);

        // g. Check for conflicts with existing bookings + external busy slots
        const allBusySlots = existingBookings.map((b) => ({
          startTime: new Date(b.startTime),
          endTime: new Date(b.endTime),
        }));

        if (externalBusySlots) {
          for (const slot of externalBusySlots) {
            allBusySlots.push({
              startTime: new Date(slot.start),
              endTime: new Date(slot.end),
            });
          }
        }

        const hasConflict = this.checkConflict(
          bufferedStart,
          bufferedEnd,
          allBusySlots,
        );

        if (!hasConflict) {
          // h. Filter out slots in the past
          if (slotStart > now) {
            slots.push({
              start: slotStart.toISOString(),
              end: slotEnd.toISOString(),
            });
          }
        }

        cursor += duration;
      }
    }

    // i. If maxPerDay is set, limit the number of slots
    if (maxPerDay !== null && slots.length > maxPerDay) {
      return slots.slice(0, maxPerDay);
    }

    return slots;
  }
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Convert "HH:mm" to minutes since midnight.
 */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Convert minutes since midnight back to "HH:mm".
 */
function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/**
 * Get the day of week (0=Sunday, 6=Saturday) for a YYYY-MM-DD date
 * interpreted in the given timezone.
 */
function getDayOfWeekForDate(dateStr: string, timezone: string): number {
  const d = new Date(`${dateStr}T12:00:00`);
  const formatter = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: timezone,
  });
  const weekday = formatter.format(d);
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return dayMap[weekday] ?? 0;
}

/**
 * Convert a local time in a timezone to a UTC Date.
 *
 * Strategy: construct a UTC guess, then use Intl.DateTimeFormat to determine
 * the offset between UTC and the target timezone, and adjust accordingly.
 *
 * NOTE: Timezone support uses Intl.DateTimeFormat which works in Cloudflare Workers.
 * For full IANA timezone support with DST transitions, this approach is sufficient.
 */
function localToUtc(
  dateStr: string,
  hours: number,
  minutes: number,
  timezone: string,
): number {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const isoStr = `${dateStr}T${pad(hours)}:${pad(minutes)}:00`;

  const utcGuess = new Date(isoStr + "Z").getTime();

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date(utcGuess));
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "0";

  const localAtUtcGuess = new Date(
    `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}Z`,
  ).getTime();

  const offsetMs = localAtUtcGuess - utcGuess;
  return utcGuess - offsetMs;
}

/**
 * Convert a local time string ("HH:mm") on a given date in a timezone to a UTC Date.
 */
function localTimeToUtc(dateStr: string, timeStr: string, timezone: string): Date {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return new Date(localToUtc(dateStr, hours, minutes, timezone));
}

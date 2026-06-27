import type { DrizzleD1Database } from "drizzle-orm/d1";
import { and, eq, gt, gte, inArray, lt } from "drizzle-orm";
import * as dbSchema from "../db/schema";
import {
  getDayOfWeekForDate,
  getScheduleDatesForViewerDay,
  getUtcRangeForLocalDate,
  getWeekRangeForLocalDate,
  localTimeToUtc,
} from "../lib/timezone";

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

interface SlotWindow {
  startTime: string;
  endTime: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class AvailabilityService {
  constructor(private db: DrizzleD1Database<Record<string, unknown>>) {}

  // ─── Resolve Schedule ─────────────────────────────────────────────────────

  async resolveSchedule(
    projectId: string,
    eventType: dbSchema.EventTypeRow,
  ): Promise<dbSchema.ScheduleRow | undefined> {
    if (eventType.scheduleId) {
      const rows = await this.db
        .select()
        .from(dbSchema.schedules)
        .where(eq(dbSchema.schedules.id, eventType.scheduleId))
        .limit(1);
      if (rows[0]) return rows[0];
    }

    const defaultRows = await this.db
      .select()
      .from(dbSchema.schedules)
      .where(
        and(
          eq(dbSchema.schedules.projectId, projectId),
          eq(dbSchema.schedules.isDefault, true),
        ),
      )
      .limit(1);
    if (defaultRows[0]) return defaultRows[0];

    const fallbackRows = await this.db
      .select()
      .from(dbSchema.schedules)
      .where(eq(dbSchema.schedules.projectId, projectId))
      .limit(1);
    return fallbackRows[0];
  }

  // ─── Count Bookings In Range ──────────────────────────────────────────────

  async countBookingsInRange(
    eventTypeId: string,
    start: Date,
    end: Date,
  ): Promise<number> {
    const rows = await this.db
      .select({ id: dbSchema.bookings.id })
      .from(dbSchema.bookings)
      .where(
        and(
          eq(dbSchema.bookings.eventTypeId, eventTypeId),
          inArray(dbSchema.bookings.status, ["pending", "confirmed"]),
          gte(dbSchema.bookings.startTime, start),
          lt(dbSchema.bookings.startTime, end),
        ),
      );
    return rows.length;
  }

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

    // 3. Resolve the schedule (event-type's own → project default → first)
    const schedule = await this.resolveSchedule(project.id, eventType);
    if (!schedule) return [];

    // 4. Get availability rules for that schedule
    const rules = await this.db
      .select()
      .from(dbSchema.availabilityRules)
      .where(eq(dbSchema.availabilityRules.scheduleId, schedule.id));

    if (rules.length === 0) return [];

    const viewerDayRange = getUtcRangeForLocalDate(date, timezone);
    const conflictRange = {
      start: new Date(
        viewerDayRange.start.getTime() - eventType.bufferBefore * 60 * 1000,
      ),
      end: new Date(
        viewerDayRange.end.getTime() +
          (eventType.duration + eventType.bufferAfter) * 60 * 1000,
      ),
    };
    const scheduleDates = getScheduleDatesForViewerDay(
      viewerDayRange,
      schedule.timezone,
    );

    // 5. Get schedule overrides for every schedule-local day that overlaps the viewer day
    const overrides = await this.db
      .select()
      .from(dbSchema.scheduleOverrides)
      .where(
        and(
          eq(dbSchema.scheduleOverrides.scheduleId, schedule.id),
          inArray(dbSchema.scheduleOverrides.date, scheduleDates),
        ),
      );

    // 6. Get existing confirmed bookings that could overlap slots on the viewer-selected day
    const existingBookings = await this.db
      .select()
      .from(dbSchema.bookings)
      .where(
        and(
          eq(dbSchema.bookings.eventTypeId, eventType.id),
          eq(dbSchema.bookings.status, "confirmed"),
          lt(dbSchema.bookings.startTime, conflictRange.end),
          gt(dbSchema.bookings.endTime, conflictRange.start),
        ),
      );

    // 6b. Gate any schedule-tz day/week that has hit its booking cap.
    const blockedScheduleDates = new Set<string>();
    if (eventType.maxPerDay !== null || eventType.maxPerWeek !== null) {
      const weekStart = eventType.weekStart === "sunday" ? "sunday" : "monday";
      for (const scheduleDate of scheduleDates) {
        if (eventType.maxPerDay !== null) {
          const dayRange = getUtcRangeForLocalDate(scheduleDate, schedule.timezone);
          const dayCount = await this.countBookingsInRange(
            eventType.id,
            dayRange.start,
            dayRange.end,
          );
          if (dayCount >= eventType.maxPerDay) {
            blockedScheduleDates.add(scheduleDate);
            continue;
          }
        }
        if (eventType.maxPerWeek !== null) {
          const weekRange = getWeekRangeForLocalDate(
            scheduleDate,
            schedule.timezone,
            weekStart,
          );
          const weekCount = await this.countBookingsInRange(
            eventType.id,
            weekRange.start,
            weekRange.end,
          );
          if (weekCount >= eventType.maxPerWeek) {
            blockedScheduleDates.add(scheduleDate);
          }
        }
      }
    }

    // 7. Generate time slots
    return this.generateSlots({
      viewerDayStart: viewerDayRange.start,
      viewerDayEnd: viewerDayRange.end,
      scheduleDates,
      scheduleTz: schedule.timezone,
      rules,
      overrides,
      existingBookings,
      duration: eventType.duration,
      bufferBefore: eventType.bufferBefore,
      bufferAfter: eventType.bufferAfter,
      blockedScheduleDates,
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
    viewerDayStart: Date;
    viewerDayEnd: Date;
    scheduleDates: string[];
    scheduleTz: string;
    rules: dbSchema.AvailabilityRuleRow[];
    overrides: dbSchema.ScheduleOverrideRow[];
    existingBookings: dbSchema.BookingRow[];
    duration: number;
    bufferBefore: number;
    bufferAfter: number;
    blockedScheduleDates: Set<string>;
    externalBusySlots?: Array<{ start: string; end: string }>;
  }): TimeSlot[] {
    const {
      viewerDayStart,
      viewerDayEnd,
      scheduleDates,
      scheduleTz,
      rules,
      overrides,
      existingBookings,
      duration,
      bufferBefore,
      bufferAfter,
      blockedScheduleDates,
      externalBusySlots,
    } = params;

    const slots: TimeSlot[] = [];
    const now = new Date();
    const allBusySlots = existingBookings.map((booking) => ({
      startTime: new Date(booking.startTime),
      endTime: new Date(booking.endTime),
    }));

    if (externalBusySlots) {
      for (const slot of externalBusySlots) {
        allBusySlots.push({
          startTime: new Date(slot.start),
          endTime: new Date(slot.end),
        });
      }
    }

    const overridesByDate = new Map(
      overrides.map((override) => [override.date, override]),
    );

    for (const scheduleDate of scheduleDates) {
      if (blockedScheduleDates.has(scheduleDate)) continue;
      const dayOfWeek = getDayOfWeekForDate(scheduleDate, scheduleTz);
      const override = overridesByDate.get(scheduleDate);

      if (override?.isBlocked) continue;

      let windows: Array<{ startTime: string; endTime: string }>;

      if (override?.startTime && override?.endTime) {
        windows = [{ startTime: override.startTime, endTime: override.endTime }];
      } else {
        const dayRules = rules.filter((rule) => rule.dayOfWeek === dayOfWeek);
        if (dayRules.length === 0) continue;
        windows = dayRules.map((rule) => ({
          startTime: rule.startTime,
          endTime: rule.endTime,
        }));
      }

      for (const window of windows) {
        const windowSlots = buildSlotsForWindow({
          scheduleDate,
          window,
          scheduleTimezone: scheduleTz,
          duration,
        });

        for (const { start: slotStart, end: slotEnd } of windowSlots) {
          const bufferedStart = new Date(
            slotStart.getTime() - bufferBefore * 60 * 1000,
          );
          const bufferedEnd = new Date(
            slotEnd.getTime() + bufferAfter * 60 * 1000,
          );
          const hasConflict = this.checkConflict(
            bufferedStart,
            bufferedEnd,
            allBusySlots,
          );

          if (
            !hasConflict &&
            slotStart > now &&
            slotStart >= viewerDayStart &&
            slotStart < viewerDayEnd
          ) {
            slots.push({
              start: slotStart.toISOString(),
              end: slotEnd.toISOString(),
            });
          }
        }
      }
    }

    slots.sort((left, right) => left.start.localeCompare(right.start));

    return slots;
  }
}

export function buildSlotsForWindow(params: {
  scheduleDate: string;
  window: SlotWindow;
  scheduleTimezone: string;
  duration: number;
}): Array<{ start: Date; end: Date }> {
  const windowStart = localTimeToUtc(
    params.scheduleDate,
    params.window.startTime,
    params.scheduleTimezone,
  );
  const windowEnd = localTimeToUtc(
    params.scheduleDate,
    params.window.endTime,
    params.scheduleTimezone,
  );
  const slots: Array<{ start: Date; end: Date }> = [];
  let slotStart = windowStart;

  while (
    slotStart.getTime() + params.duration * 60 * 1000 <= windowEnd.getTime()
  ) {
    slots.push({
      start: slotStart,
      end: new Date(slotStart.getTime() + params.duration * 60 * 1000),
    });
    slotStart = new Date(slotStart.getTime() + params.duration * 60 * 1000);
  }

  return slots;
}

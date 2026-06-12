import {
  formatDateInTimezone,
  getDayOfWeekForDate,
  localTimeToUtc,
  shiftDateString,
} from "./timezone";

// ─── Trigger Config Types ────────────────────────────────────────────────────
// Stored in workflows.trigger_config (JSON). `schedule` drives the scheduled
// trigger; `contactFilter` selects which contacts a scheduled/manual run fans
// out to (null = single run with no contact, empty tagIds = all contacts).

export interface WorkflowScheduleConfig {
  frequency: "hourly" | "daily" | "weekly" | "monthly";
  time?: string; // "HH:MM" wall-clock time, used by daily/weekly/monthly
  dayOfWeek?: number; // 0 (Sunday) – 6 (Saturday), used by weekly
  dayOfMonth?: number; // 1–28, used by monthly
  timezone?: string; // IANA zone the wall-clock time is interpreted in
}

export interface WorkflowContactFilter {
  tagIds: string[];
  matchAllTags?: boolean;
}

export interface WorkflowTriggerConfig {
  schedule?: WorkflowScheduleConfig | null;
  contactFilter?: WorkflowContactFilter | null;
}

const DEFAULT_TIME = "09:00";
const FREQUENCIES = new Set(["hourly", "daily", "weekly", "monthly"]);

export function parseWorkflowTriggerConfig(
  raw: unknown,
): WorkflowTriggerConfig | null {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!isRecord(value)) return null;

  const config: WorkflowTriggerConfig = {};

  const schedule = value.schedule;
  if (
    isRecord(schedule) &&
    typeof schedule.frequency === "string" &&
    FREQUENCIES.has(schedule.frequency)
  ) {
    config.schedule = {
      frequency: schedule.frequency as WorkflowScheduleConfig["frequency"],
      time: typeof schedule.time === "string" ? schedule.time : undefined,
      dayOfWeek:
        typeof schedule.dayOfWeek === "number" ? schedule.dayOfWeek : undefined,
      dayOfMonth:
        typeof schedule.dayOfMonth === "number" ? schedule.dayOfMonth : undefined,
      timezone:
        typeof schedule.timezone === "string" ? schedule.timezone : undefined,
    };
  }

  const filter = value.contactFilter;
  if (isRecord(filter) && Array.isArray(filter.tagIds)) {
    config.contactFilter = {
      tagIds: filter.tagIds.filter((id): id is string => typeof id === "string"),
      matchAllTags: filter.matchAllTags === true,
    };
  }

  return config;
}

/**
 * Compute the next UTC instant a schedule should fire strictly after `from`.
 * Returns null when the schedule is missing or its timezone is invalid.
 */
export function computeNextRunAt(
  schedule: WorkflowScheduleConfig | null | undefined,
  from: Date = new Date(),
): Date | null {
  if (!schedule) return null;

  try {
    if (schedule.frequency === "hourly") {
      const HOUR_MS = 3_600_000;
      return new Date(Math.floor(from.getTime() / HOUR_MS) * HOUR_MS + HOUR_MS);
    }

    const timezone = schedule.timezone || "UTC";
    const time = schedule.time || DEFAULT_TIME;
    const todayLocal = formatDateInTimezone(from, timezone);

    switch (schedule.frequency) {
      case "daily": {
        const candidate = localTimeToUtc(todayLocal, time, timezone);
        if (candidate.getTime() > from.getTime()) return candidate;
        return localTimeToUtc(shiftDateString(todayLocal, 1), time, timezone);
      }

      case "weekly": {
        const targetDay = clamp(schedule.dayOfWeek ?? 1, 0, 6);
        const todayDay = getDayOfWeekForDate(todayLocal, timezone);
        const daysAhead = (targetDay - todayDay + 7) % 7;
        const candidate = localTimeToUtc(
          shiftDateString(todayLocal, daysAhead),
          time,
          timezone,
        );
        if (candidate.getTime() > from.getTime()) return candidate;
        return localTimeToUtc(
          shiftDateString(todayLocal, daysAhead + 7),
          time,
          timezone,
        );
      }

      case "monthly": {
        const targetDay = clamp(schedule.dayOfMonth ?? 1, 1, 28);
        const [year, month] = todayLocal.split("-").map(Number);
        const thisMonth = monthDateString(year, month, targetDay);
        const candidate = localTimeToUtc(thisMonth, time, timezone);
        if (candidate.getTime() > from.getTime()) return candidate;
        const nextYear = month === 12 ? year + 1 : year;
        const nextMonth = month === 12 ? 1 : month + 1;
        return localTimeToUtc(
          monthDateString(nextYear, nextMonth, targetDay),
          time,
          timezone,
        );
      }

      default:
        return null;
    }
  } catch {
    // Invalid timezone or time string — leave the workflow unscheduled rather
    // than crashing the cron handler.
    return null;
  }
}

function monthDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

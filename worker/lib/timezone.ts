import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export function formatDateInTimezone(date: Date, timezone: string): string {
  return formatInTimeZone(date, timezone, "yyyy-MM-dd");
}

export function formatTimeInTimezone(date: Date, timezone: string): string {
  return formatInTimeZone(date, timezone, "HH:mm");
}

export function getDayOfWeekForDate(dateStr: string, timezone: string): number {
  const isoWeekday = Number(
    formatInTimeZone(localTimeToUtc(dateStr, "12:00", timezone), timezone, "i"),
  );
  return isoWeekday % 7;
}

export function getUtcRangeForLocalDate(
  dateStr: string,
  timezone: string,
): { start: Date; end: Date } {
  return {
    start: localTimeToUtc(dateStr, "00:00", timezone),
    end: localTimeToUtc(shiftDateString(dateStr, 1), "00:00", timezone),
  };
}

export function getScheduleDatesForViewerDay(
  viewerDayRange: { start: Date; end: Date },
  scheduleTimezone: string,
): string[] {
  return Array.from(
    new Set([
      formatDateInTimezone(viewerDayRange.start, scheduleTimezone),
      formatDateInTimezone(
        new Date(viewerDayRange.end.getTime() - 1),
        scheduleTimezone,
      ),
    ]),
  ).sort();
}

export function localTimeToUtc(
  dateStr: string,
  timeStr: string,
  timezone: string,
): Date {
  const { adjustedDateStr, adjustedTimeStr } = normalizeDateTime(dateStr, timeStr);
  return fromZonedTime(`${adjustedDateStr}T${adjustedTimeStr}:00`, timezone);
}

export function shiftDateString(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalizeDateTime(
  dateStr: string,
  timeStr: string,
): { adjustedDateStr: string; adjustedTimeStr: string } {
  if (timeStr === "24:00") {
    return {
      adjustedDateStr: shiftDateString(dateStr, 1),
      adjustedTimeStr: "00:00",
    };
  }

  return {
    adjustedDateStr: dateStr,
    adjustedTimeStr: timeStr,
  };
}

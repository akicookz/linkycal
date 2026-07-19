export function offsetMinutesForTimeZone(
  deadlineIso: string,
  timeZone: string,
): number | null {
  const deadline = new Date(deadlineIso);
  if (!Number.isFinite(deadline.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(deadline);
    const values = Object.fromEntries(
      parts
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)]),
    );
    const year = values.year;
    const month = values.month;
    const day = values.day;
    const hour = values.hour;
    const minute = values.minute;
    const second = values.second;
    if (
      year === undefined ||
      month === undefined ||
      day === undefined ||
      hour === undefined ||
      minute === undefined ||
      second === undefined
    ) {
      return null;
    }
    const representedAsUtc = Date.UTC(
      year,
      month - 1,
      day,
      hour,
      minute,
      second,
    );
    return Math.round((representedAsUtc - deadline.getTime()) / 60_000);
  } catch {
    return null;
  }
}

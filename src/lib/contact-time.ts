const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

function parseTimestamp(value: string | undefined): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function pluralize(value: number, unit: "minute" | "hour" | "day"): string {
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatTimeInStage(
  enteredAt: string | undefined,
  now: Date,
): string | null {
  const enteredAtMs = parseTimestamp(enteredAt);
  if (enteredAtMs === null) return null;
  const elapsedMs = Math.max(0, now.getTime() - enteredAtMs);
  if (elapsedMs < HOUR_MS) return "<1h in stage";
  if (elapsedMs < DAY_MS) {
    return `${Math.floor(elapsedMs / HOUR_MS)}h in stage`;
  }
  return `${Math.floor(elapsedMs / DAY_MS)}d in stage`;
}

export function formatNextActionRelative(
  deadline: string,
  now: Date,
): string | null {
  const deadlineMs = parseTimestamp(deadline);
  if (deadlineMs === null) return null;
  const diffMs = deadlineMs - now.getTime();
  const absoluteMs = Math.abs(diffMs);
  if (absoluteMs < 60_000) return "Due now";

  let distance: string;
  if (absoluteMs < HOUR_MS) {
    distance = pluralize(Math.floor(absoluteMs / 60_000), "minute");
  } else if (absoluteMs < DAY_MS) {
    distance = pluralize(Math.floor(absoluteMs / HOUR_MS), "hour");
  } else {
    distance = pluralize(Math.floor(absoluteMs / DAY_MS), "day");
  }

  return diffMs < 0 ? `Overdue by ${distance}` : `Due in ${distance}`;
}

export function formatNextActionRelativeCompact(
  deadline: string,
  now: Date,
): string | null {
  const deadlineMs = parseTimestamp(deadline);
  if (deadlineMs === null) return null;
  const diffMs = deadlineMs - now.getTime();
  const absoluteMs = Math.abs(diffMs);
  if (absoluteMs < 60_000) return "Due now";

  let distance: string;
  if (absoluteMs < HOUR_MS) {
    distance = `${Math.floor(absoluteMs / 60_000)}m`;
  } else if (absoluteMs < DAY_MS) {
    distance = `${Math.floor(absoluteMs / HOUR_MS)}h`;
  } else {
    distance = `${Math.floor(absoluteMs / DAY_MS)}d`;
  }

  return diffMs < 0 ? `Overdue by ${distance}` : `Due in ${distance}`;
}

export function nextActionTimingClass(
  deadline: string,
  now: Date,
): string {
  const deadlineMs = parseTimestamp(deadline);
  if (deadlineMs === null) return "text-muted-foreground";
  const diffMs = deadlineMs - now.getTime();
  if (diffMs <= HOUR_MS) return "text-destructive";
  if (diffMs < DAY_MS) return "text-amber-700";
  return "text-primary";
}

export function formatNextActionDeadline(deadline: string): string | null {
  const deadlineMs = parseTimestamp(deadline);
  if (deadlineMs === null) return null;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(deadlineMs));
}

export function toDatetimeLocalValue(isoValue: string): string {
  const date = new Date(isoValue);
  if (!Number.isFinite(date.getTime())) return "";
  return [
    date.getFullYear(),
    "-",
    padDatePart(date.getMonth() + 1),
    "-",
    padDatePart(date.getDate()),
    "T",
    padDatePart(date.getHours()),
    ":",
    padDatePart(date.getMinutes()),
  ].join("");
}

export function datetimeLocalToIso(localValue: string): string | null {
  if (!localValue) return null;
  const date = new Date(localValue);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

function previewFormatter(timeZone: string, includeZone: boolean) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h12",
    ...(includeZone ? { timeZoneName: "short" as const } : {}),
  });
}

function formatDeadlinePreview(
  formatter: Intl.DateTimeFormat,
  deadline: Date,
): string {
  return formatter
    .formatToParts(deadline)
    .map((part) =>
      part.type === "literal" && part.value.includes(" at ")
        ? part.value.replace(" at ", ", ")
        : part.value,
    )
    .join("");
}

export function formatDeadlineAtOffset(
  deadlineIso: string,
  timezoneOffsetMinutes: number,
  timezoneLabel: string,
): string | null {
  const deadlineMs = parseTimestamp(deadlineIso);
  if (deadlineMs === null || !Number.isFinite(timezoneOffsetMinutes)) return null;
  const shifted = new Date(deadlineMs + timezoneOffsetMinutes * 60_000);
  if (!Number.isFinite(shifted.getTime())) return null;
  return `${formatDeadlinePreview(previewFormatter("UTC", false), shifted)} ${timezoneLabel}`;
}

export function formatDeadlineInTimeZone(
  deadlineIso: string,
  timeZone: string,
): string | null {
  const deadlineMs = parseTimestamp(deadlineIso);
  if (deadlineMs === null) return null;
  try {
    return formatDeadlinePreview(
      previewFormatter(timeZone, true),
      new Date(deadlineMs),
    );
  } catch {
    return null;
  }
}

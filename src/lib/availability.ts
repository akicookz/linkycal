export interface AvailabilityBlock {
  startTime: string;
  endTime: string;
}

export interface DayAvailabilityConfig {
  enabled: boolean;
  blocks: AvailabilityBlock[];
}

export interface AvailabilityRuleValue {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface TimeOption {
  value: string;
  label: string;
}

export const WEEKDAY_LABELS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const UI_DAY_INDEX_TO_BACKEND_DAY_OF_WEEK = [1, 2, 3, 4, 5, 6, 0] as const;
const BACKEND_DAY_OF_WEEK_TO_UI_DAY_INDEX = [6, 0, 1, 2, 3, 4, 5] as const;
const DEFAULT_START_TIME = "09:00";
const DEFAULT_END_TIME = "17:00";
const MINUTES_PER_DAY = 24 * 60;
const FIFTEEN_MINUTES = 15;

export const START_TIME_OPTIONS = buildStartTimeOptions();
export const END_TIME_OPTIONS = buildEndTimeOptions();

export function uiDayIndexToBackendDayOfWeek(
  dayIndex: number,
): number | null {
  return UI_DAY_INDEX_TO_BACKEND_DAY_OF_WEEK[dayIndex] ?? null;
}

export function backendDayOfWeekToUiDayIndex(
  dayOfWeek: number,
): number | null {
  return BACKEND_DAY_OF_WEEK_TO_UI_DAY_INDEX[dayOfWeek] ?? null;
}

export function createDefaultAvailabilityBlock(): AvailabilityBlock {
  return {
    startTime: DEFAULT_START_TIME,
    endTime: DEFAULT_END_TIME,
  };
}

export function defaultDayConfigs(): DayAvailabilityConfig[] {
  return WEEKDAY_LABELS.map((_, index) => ({
    enabled: index < 5,
    blocks: index < 5 ? [createDefaultAvailabilityBlock()] : [],
  }));
}

export function normalizeTimeValue(time: string): string {
  const trimmedTime = time.trim();

  if (trimmedTime === "24:00" || trimmedTime === "24:00:00") {
    return "24:00";
  }

  const match = trimmedTime.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return trimmedTime;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return trimmedTime;
  }

  if (hours === 24 && minutes === 0) {
    return "24:00";
  }

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return trimmedTime;
  }

  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}`;
}

export function parseTimeToMinutes(time: string): number {
  if (time === "24:00") return MINUTES_PER_DAY;

  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(minutes: number): string {
  if (minutes === MINUTES_PER_DAY) return "24:00";

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins
    .toString()
    .padStart(2, "0")}`;
}

export function getTimeOptions(params: {
  minMinutes: number;
  maxMinutes: number;
  includeMidnight: boolean;
}): TimeOption[] {
  const options = params.includeMidnight
    ? END_TIME_OPTIONS
    : START_TIME_OPTIONS;

  return options.filter((option) => {
    const minutes = parseTimeToMinutes(option.value);
    return minutes >= params.minMinutes && minutes <= params.maxMinutes;
  });
}

export function getTimeOptionLabel(time: string): string {
  const normalizedTime = normalizeTimeValue(time);

  return (
    END_TIME_OPTIONS.find((option) => option.value === normalizedTime)?.label ??
    normalizedTime
  );
}

export function rulesToDayConfigs(
  rules: AvailabilityRuleValue[],
): DayAvailabilityConfig[] {
  const configs = WEEKDAY_LABELS.map<DayAvailabilityConfig>(() => ({
    enabled: false,
    blocks: [],
  }));

  for (const rule of rules) {
    const dayIndex = backendDayOfWeekToUiDayIndex(rule.dayOfWeek);
    if (dayIndex === null) continue;

    configs[dayIndex].blocks.push({
      startTime: normalizeTimeValue(rule.startTime),
      endTime: normalizeTimeValue(rule.endTime),
    });
  }

  return configs.map((config) => ({
    enabled: config.blocks.length > 0,
    blocks: [...config.blocks].sort(
      (left, right) =>
        parseTimeToMinutes(left.startTime) - parseTimeToMinutes(right.startTime),
    ),
  }));
}

export function dayConfigsToRules(
  dayConfigs: DayAvailabilityConfig[],
): AvailabilityRuleValue[] {
  return dayConfigs.flatMap((config, dayIndex) => {
    if (!config.enabled || config.blocks.length === 0) return [];

    const dayOfWeek = uiDayIndexToBackendDayOfWeek(dayIndex);
    if (dayOfWeek === null) return [];

    return [...config.blocks]
      .sort(
        (left, right) =>
          parseTimeToMinutes(left.startTime) -
          parseTimeToMinutes(right.startTime),
      )
      .map((block) => ({
        dayOfWeek,
        startTime: normalizeTimeValue(block.startTime),
        endTime: normalizeTimeValue(block.endTime),
      }));
  });
}

function buildStartTimeOptions(): TimeOption[] {
  const options: TimeOption[] = [];

  for (let minutes = 0; minutes < MINUTES_PER_DAY; minutes += FIFTEEN_MINUTES) {
    const value = minutesToTime(minutes);
    options.push({
      value,
      label: formatTimeOptionLabel(minutes),
    });
  }

  return options;
}

function buildEndTimeOptions(): TimeOption[] {
  return [
    ...buildStartTimeOptions(),
    {
      value: "24:00",
      label: "12:00 AM",
    },
  ];
}

function formatTimeOptionLabel(minutes: number): string {
  const normalizedHours = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  const isPm = normalizedHours >= 12;
  const hours = normalizedHours % 12 || 12;
  const suffix = isPm ? "PM" : "AM";

  return `${hours.toString().padStart(2, "0")}:${mins
    .toString()
    .padStart(2, "0")} ${suffix}`;
}

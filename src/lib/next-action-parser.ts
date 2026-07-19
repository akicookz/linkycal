import type { ParsingComponents } from "chrono-node/en";

import { offsetMinutesForTimeZone } from "@/lib/timezone";

export interface ParsedNextAction {
  actionText: string;
  deadlineIso: string;
  matchedDateText: string;
  timezoneLabel: string;
  timezoneOffsetMinutes: number;
  assumedTime: boolean;
}

export type NextActionParseResult =
  | { status: "valid"; value: ParsedNextAction }
  | { status: "empty" }
  | { status: "missing_action" }
  | { status: "missing_deadline" }
  | { status: "ambiguous"; matches: string[] }
  | { status: "past_deadline" }
  | { status: "invalid_deadline" };

export interface NextActionParserContext {
  now: Date;
  timeZone?: string;
}

interface ReplacementRange {
  start: number;
  end: number;
}

interface NormalizedSentence {
  text: string;
  replacements: ReplacementRange[];
}

function validTimeZone(value: string | undefined): string {
  if (!value) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return value;
  } catch {
    return "UTC";
  }
}

function cleanActionText(sentence: string, start: number, end: number): string {
  const before = sentence
    .slice(0, start)
    .replace(/(?:\s|[,;:–—-])*(?:by|on|at|before)\s*$/i, "");
  const after = sentence
    .slice(end)
    .replace(/^\s*[,;:–—-]?\s*/, "");
  return `${before} ${after}`
    .replace(/\s+/g, " ")
    .replace(/^[,;:–—-]+|[,;:–—-]+$/g, "")
    .trim();
}

function replaceSameWidth(
  input: string,
  pattern: RegExp,
  replacementFor: (match: RegExpMatchArray) => string,
  replacements: ReplacementRange[],
): string {
  let output = input;
  for (const match of input.matchAll(pattern)) {
    const start = match.index;
    const replacement = replacementFor(match);
    if (replacement.length > match[0].length) continue;
    output =
      output.slice(0, start) +
      replacement.padEnd(match[0].length, " ") +
      output.slice(start + match[0].length);
    replacements.push({ start, end: start + match[0].length });
  }
  return output;
}

function normalizeSentence(sentence: string): NormalizedSentence {
  const replacements: ReplacementRange[] = [];
  let text = replaceSameWidth(
    sentence,
    /\bnext\s+week\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi,
    (match) => `${match[1]} next week`,
    replacements,
  );
  text = replaceSameWidth(
    text,
    /\b(?:EOD|end\s+of\s+day|COB|close\s+of\s+business)\b/gi,
    () => "5pm",
    replacements,
  );
  text = replaceSameWidth(
    text,
    /\bEastern\s+time\b/gi,
    () => "ET",
    replacements,
  );
  text = replaceSameWidth(
    text,
    /\bPacific\s+time\b/gi,
    () => "PT",
    replacements,
  );
  return { text, replacements };
}

function originalRange(
  start: number,
  end: number,
  replacements: ReplacementRange[],
): ReplacementRange {
  let originalStart = start;
  let originalEnd = end;
  for (const replacement of replacements) {
    if (originalStart < replacement.end && originalEnd > replacement.start) {
      originalStart = Math.min(originalStart, replacement.start);
      originalEnd = Math.max(originalEnd, replacement.end);
    }
  }
  return { start: originalStart, end: originalEnd };
}

function explicitTimezoneLabel(text: string): string | null {
  return (
    text.match(
      /\b(?:(?:UTC|GMT)[+-]\d{1,2}(?::\d{2})?|EST|EDT|ET|Eastern\s+time|PST|PDT|PT|Pacific\s+time|UTC|GMT)\b/i,
    )?.[0] ?? null
  );
}

function wallClockSignatureInTimeZone(
  deadline: Date,
  timeZone: string,
): string | null {
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
    const values = new Map(
      parts
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)]),
    );
    const signatureParts = [
      "year",
      "month",
      "day",
      "hour",
      "minute",
      "second",
    ] as const;
    const signature = signatureParts.map((part) => values.get(part));
    if (signature.some((value) => value === undefined)) return null;
    return signature.join("|");
  } catch {
    return null;
  }
}

function wallClockSignatureFromUtc(timestamp: number): string {
  const deadline = new Date(timestamp);
  return [
    deadline.getUTCFullYear(),
    deadline.getUTCMonth() + 1,
    deadline.getUTCDate(),
    deadline.getUTCHours(),
    deadline.getUTCMinutes(),
    deadline.getUTCSeconds(),
  ].join("|");
}

function dateFromWallClockInTimeZone(
  wallClockAsUtc: number,
  initialDeadline: Date,
  timeZone: string,
): Date | null {
  const dayMs = 86_400_000;
  const sampleTimestamps = [
    initialDeadline.getTime(),
    wallClockAsUtc - dayMs * 2,
    wallClockAsUtc - dayMs,
    wallClockAsUtc,
    wallClockAsUtc + dayMs,
    wallClockAsUtc + dayMs * 2,
  ];
  const offsets = new Set<number>();
  for (const timestamp of sampleTimestamps) {
    const offset = offsetMinutesForTimeZone(
      new Date(timestamp).toISOString(),
      timeZone,
    );
    if (offset !== null) offsets.add(offset);
  }

  const intendedSignature = wallClockSignatureFromUtc(wallClockAsUtc);
  const candidates = Array.from(offsets)
    .map((offset) => new Date(wallClockAsUtc - offset * 60_000))
    .filter(
      (candidate) =>
        wallClockSignatureInTimeZone(candidate, timeZone) === intendedSignature,
    )
    .sort((left, right) => left.getTime() - right.getTime());
  return candidates[0] ?? null;
}

export async function parseNextActionSentence(
  sentence: string,
  context: NextActionParserContext,
): Promise<NextActionParseResult> {
  if (!sentence.trim()) return { status: "empty" };

  const timeZone = validTimeZone(context.timeZone);
  const referenceTimezoneOffset =
    offsetMinutesForTimeZone(context.now.toISOString(), timeZone) ?? 0;
  const { casual } = await import("chrono-node/en");
  const normalized = normalizeSentence(sentence);
  const results = casual.parse(
    normalized.text,
    { instant: context.now, timezone: referenceTimezoneOffset },
    { forwardDate: true },
  );
  if (results.length === 0) return { status: "missing_deadline" };

  const ranges = results.map((result) =>
    originalRange(
      result.index,
      result.index + result.text.length,
      normalized.replacements,
    ),
  );
  if (ranges.length > 1) {
    return {
      status: "ambiguous",
      matches: ranges.map((range) =>
        sentence.slice(range.start, range.end).trim(),
      ),
    };
  }

  const result = results[0];
  const range = ranges[0];
  const components = result.start as ParsingComponents;
  const assumedTime = !components.isCertain("hour");
  if (assumedTime) {
    components.assign("hour", 17);
    components.assign("minute", 0);
    components.assign("second", 0);
    components.assign("millisecond", 0);
  }

  const parsedDeadline = components.date();
  const hasExplicitTimezone = components.isCertain("timezoneOffset");
  const wallClockAsUtc = Date.UTC(
    components.get("year") ?? 0,
    (components.get("month") ?? 1) - 1,
    components.get("day") ?? 1,
    components.get("hour") ?? 0,
    components.get("minute") ?? 0,
    components.get("second") ?? 0,
    components.get("millisecond") ?? 0,
  );
  const deadline = hasExplicitTimezone
    ? parsedDeadline
    : dateFromWallClockInTimeZone(
        wallClockAsUtc,
        parsedDeadline,
        timeZone,
      );
  if (!deadline) return { status: "invalid_deadline" };
  if (deadline.getTime() <= context.now.getTime()) {
    return { status: "past_deadline" };
  }

  const matchedDateText = sentence.slice(range.start, range.end).trim();
  const actionText = cleanActionText(sentence, range.start, range.end);
  if (!actionText) return { status: "missing_action" };

  const timezoneOffsetMinutes = hasExplicitTimezone
    ? (components.get("timezoneOffset") ?? 0)
    : (offsetMinutesForTimeZone(deadline.toISOString(), timeZone) ??
      referenceTimezoneOffset);
  const timezoneLabel = explicitTimezoneLabel(matchedDateText) ?? timeZone;

  return {
    status: "valid",
    value: {
      actionText,
      deadlineIso: deadline.toISOString(),
      matchedDateText,
      timezoneLabel,
      timezoneOffsetMinutes,
      assumedTime,
    },
  };
}

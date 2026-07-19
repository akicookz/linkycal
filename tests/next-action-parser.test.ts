import { describe, expect, test } from "bun:test";

import { parseNextActionSentence } from "../src/lib/next-action-parser";

const SEOUL_CONTEXT = {
  now: new Date("2026-07-19T00:00:00.000Z"),
  timeZone: "Asia/Seoul",
};

describe("parseNextActionSentence", () => {
  test("extracts an action and explicit browser-local deadline", async () => {
    const result = await parseNextActionSentence(
      "Call Atul next Tuesday at 3pm",
      SEOUL_CONTEXT,
    );

    expect(result).toEqual({
      status: "valid",
      value: {
        actionText: "Call Atul",
        deadlineIso: "2026-07-21T06:00:00.000Z",
        matchedDateText: "next Tuesday at 3pm",
        timezoneLabel: "Asia/Seoul",
        timezoneOffsetMinutes: 540,
        assumedTime: false,
      },
    });
  });

  test("returns empty and missing-deadline states without guessing", async () => {
    expect(await parseNextActionSentence("   ", SEOUL_CONTEXT)).toEqual({
      status: "empty",
    });
    expect(
      await parseNextActionSentence("Call Atul", SEOUL_CONTEXT),
    ).toEqual({ status: "missing_deadline" });
  });

  test("normalizes next-week weekday ordering and fixed EST", async () => {
    const result = await parseNextActionSentence(
      "Follow up by next week Friday at 5pm EST",
      SEOUL_CONTEXT,
    );
    expect(result).toMatchObject({
      status: "valid",
      value: {
        actionText: "Follow up",
        deadlineIso: "2026-07-24T22:00:00.000Z",
        matchedDateText: "next week Friday at 5pm EST",
        timezoneLabel: "EST",
        timezoneOffsetMinutes: -300,
        assumedTime: false,
      },
    });
  });

  test("normalizes EOD and keeps ET daylight-aware", async () => {
    const result = await parseNextActionSentence(
      "Send proposal Friday EOD ET",
      SEOUL_CONTEXT,
    );
    expect(result).toMatchObject({
      status: "valid",
      value: {
        actionText: "Send proposal",
        deadlineIso: "2026-07-24T21:00:00.000Z",
        matchedDateText: "Friday EOD ET",
        timezoneLabel: "ET",
        timezoneOffsetMinutes: -240,
        assumedTime: false,
      },
    });
  });

  test("supports business aliases and fixed versus daylight-aware Pacific time", async () => {
    const cases = [
      {
        sentence: "Send proposal Friday COB PST",
        deadlineIso: "2026-07-25T01:00:00.000Z",
        label: "PST",
        offset: -480,
      },
      {
        sentence: "Send proposal Friday close of business PT",
        deadlineIso: "2026-07-25T00:00:00.000Z",
        label: "PT",
        offset: -420,
      },
    ];

    for (const item of cases) {
      const result = await parseNextActionSentence(item.sentence, SEOUL_CONTEXT);
      expect(result).toMatchObject({
        status: "valid",
        value: {
          actionText: "Send proposal",
          deadlineIso: item.deadlineIso,
          timezoneLabel: item.label,
          timezoneOffsetMinutes: item.offset,
        },
      });
    }
  });

  test("parses an absolute date with a named time", async () => {
    const result = await parseNextActionSentence(
      "Review contract August 4 at noon",
      SEOUL_CONTEXT,
    );
    expect(result).toMatchObject({
      status: "valid",
      value: {
        actionText: "Review contract",
        deadlineIso: "2026-08-04T03:00:00.000Z",
        assumedTime: false,
      },
    });
  });

  test("preserves an explicit numeric UTC offset", async () => {
    const result = await parseNextActionSentence(
      "Call Atul Friday at 5pm UTC+05:30",
      SEOUL_CONTEXT,
    );
    expect(result).toMatchObject({
      status: "valid",
      value: {
        deadlineIso: "2026-07-24T11:30:00.000Z",
        timezoneLabel: "UTC+05:30",
        timezoneOffsetMinutes: 330,
      },
    });
  });

  test("defaults a date-only deadline to 5pm and exposes the assumption", async () => {
    const result = await parseNextActionSentence(
      "Email quote in 3 days",
      SEOUL_CONTEXT,
    );
    expect(result).toMatchObject({
      status: "valid",
      value: {
        actionText: "Email quote",
        deadlineIso: "2026-07-22T08:00:00.000Z",
        assumedTime: true,
      },
    });
  });

  test("cleans a deadline at the beginning of the sentence", async () => {
    const result = await parseNextActionSentence(
      "By Friday at 5pm, call Atul",
      SEOUL_CONTEXT,
    );
    expect(result).toMatchObject({
      status: "valid",
      value: { actionText: "call Atul" },
    });
  });

  test("rejects missing actions, past deadlines, and multiple dates", async () => {
    expect(
      await parseNextActionSentence("Tomorrow at 3pm", SEOUL_CONTEXT),
    ).toEqual({ status: "missing_action" });
    expect(
      await parseNextActionSentence(
        "Call Atul yesterday at 3pm",
        SEOUL_CONTEXT,
      ),
    ).toEqual({ status: "past_deadline" });
    expect(
      await parseNextActionSentence(
        "Call Atul Monday and email them Friday",
        SEOUL_CONTEXT,
      ),
    ).toEqual({
      status: "ambiguous",
      matches: ["Monday", "Friday"],
    });
  });

  test("falls back to UTC when the supplied browser timezone is invalid", async () => {
    const result = await parseNextActionSentence("Call Atul tomorrow at noon", {
      ...SEOUL_CONTEXT,
      timeZone: "Not/A_Timezone",
    });
    expect(result).toMatchObject({
      status: "valid",
      value: { timezoneLabel: "UTC", timezoneOffsetMinutes: 0 },
    });
  });

  test("uses the deadline-date browser offset across a DST transition", async () => {
    const result = await parseNextActionSentence("Call Atul March 9 at 5pm", {
      now: new Date("2026-03-01T17:00:00.000Z"),
      timeZone: "America/New_York",
    });

    expect(result).toMatchObject({
      status: "valid",
      value: {
        deadlineIso: "2026-03-09T21:00:00.000Z",
        timezoneLabel: "America/New_York",
        timezoneOffsetMinutes: -240,
      },
    });
  });
});

import { expect, test } from "bun:test";

import { parseNextActionSentence } from "../src/lib/next-action-parser";

test("parses the requested next-action sentence", async () => {
  const result = await parseNextActionSentence(
    "Follow up by next week Friday at 5pm EST",
    {
      now: new Date("2026-07-19T00:00:00.000Z"),
      timeZone: "Asia/Seoul",
    },
  );

  expect(result).toEqual({
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

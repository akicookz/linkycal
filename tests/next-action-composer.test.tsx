/// <reference lib="dom" />

import { expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { NextActionComposer } from "../src/components/NextActionComposer";
import type { NextActionParseResult } from "../src/lib/next-action-parser";

const VALID_RESULT: NextActionParseResult = {
  status: "valid",
  value: {
    actionText: "Call Atul",
    deadlineIso: "2026-07-24T22:00:00.000Z",
    matchedDateText: "next week Friday at 5pm EST",
    timezoneLabel: "EST",
    timezoneOffsetMinutes: -300,
    assumedTime: false,
  },
};

test("previews and saves one natural-language sentence", async () => {
  const onSave = mock(() => undefined);
  render(
    <NextActionComposer
      initialAction={null}
      pending={false}
      error={null}
      browserTimeZone="Asia/Seoul"
      referenceNow={() => new Date("2026-07-19T00:00:00.000Z")}
      parseDelayMs={0}
      parseSentence={() => Promise.resolve(VALID_RESULT)}
      onSave={onSave}
      onCancel={() => undefined}
    />,
  );

  const sentence = screen.getByLabelText("What should happen, and when?");
  fireEvent.change(sentence, {
    target: { value: "Call Atul by next week Friday at 5pm EST" },
  });

  expect(await screen.findByText("Call Atul")).not.toBeNull();
  expect(screen.getByText("Fri, Jul 24, 5:00 PM EST")).not.toBeNull();
  fireEvent.keyDown(sentence, { key: "Enter" });

  await waitFor(() => {
    expect(onSave).toHaveBeenCalledWith({
      text: "Call Atul",
      deadline: "2026-07-24T22:00:00.000Z",
    });
  });
});

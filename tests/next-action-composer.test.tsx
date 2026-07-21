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

  expect(
    await screen.findByText(
      "Deadline in your time: Sat, Jul 25, 7:00 AM GMT+9",
    ),
  ).not.toBeNull();
  const deadlineButton = screen.getByRole("button", {
    name: /deadline selected/i,
  });
  expect(deadlineButton.getAttribute("data-deadline-selected")).toBe("true");
  expect(screen.queryByText("Call Atul")).toBeNull();
  expect(screen.queryByText("Fri, Jul 24, 5:00 PM EST")).toBeNull();
  expect(screen.queryByText("time assumed")).toBeNull();
  fireEvent.keyDown(sentence, { key: "Enter" });

  await waitFor(() => {
    expect(onSave).toHaveBeenCalledWith({
      text: "Call Atul",
      deadline: "2026-07-24T22:00:00.000Z",
    });
  });
});

test("saves an action without requiring a deadline", async () => {
  const onSave = mock(() => undefined);
  render(
    <NextActionComposer
      initialAction={null}
      pending={false}
      error={null}
      browserTimeZone="Asia/Seoul"
      referenceNow={() => new Date("2026-07-19T00:00:00.000Z")}
      parseDelayMs={0}
      parseSentence={() => Promise.resolve({ status: "missing_deadline" })}
      onSave={onSave}
      onCancel={() => undefined}
    />,
  );

  const sentence = screen.getByLabelText("What should happen, and when?");
  fireEvent.change(sentence, { target: { value: "Follow up" } });

  await waitFor(() => {
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
  expect(screen.queryByText("Add a deadline or choose it manually.")).toBeNull();
  expect(screen.queryByText("Choose date manually")).toBeNull();
  expect(
    screen
      .getByRole("button", { name: /add deadline/i })
      .getAttribute("data-deadline-selected"),
  ).toBe("false");

  fireEvent.keyDown(sentence, { key: "Enter" });

  await waitFor(() => {
    expect(onSave).toHaveBeenCalledWith({
      text: "Follow up",
      deadline: null,
    });
  });
});

test("keeps a persisted deadline authoritative during action edits", async () => {
  const onSave = mock(() => undefined);
  render(
    <NextActionComposer
      initialAction={{
        text: "Follow up",
        deadline: "2026-07-24T22:00:00.000Z",
      }}
      pending={false}
      error={null}
      browserTimeZone="Asia/Seoul"
      referenceNow={() => new Date("2026-07-19T00:00:00.000Z")}
      parseDelayMs={0}
      parseSentence={() =>
        Promise.resolve({
          status: "ambiguous",
          matches: ["Tuesday", "Wednesday"],
        })
      }
      onSave={onSave}
      onCancel={() => undefined}
    />,
  );

  fireEvent.change(screen.getByLabelText("What should happen, and when?"), {
    target: { value: "Follow up after Tuesday or Wednesday" },
  });

  await waitFor(() => {
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
  expect(screen.queryByText("Choose one deadline.")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onSave).toHaveBeenCalledWith({
    text: "Follow up after Tuesday or Wednesday",
    deadline: "2026-07-24T22:00:00.000Z",
  });
});

test("Escape closes the deadline picker before cancelling the composer", async () => {
  const onCancel = mock(() => undefined);
  render(
    <NextActionComposer
      initialAction={null}
      pending={false}
      error={null}
      onSave={() => undefined}
      onCancel={onCancel}
    />,
  );

  const deadlineButton = screen.getByRole("button", { name: "Add deadline" });
  fireEvent.click(deadlineButton);
  expect(await screen.findByLabelText("Deadline (your time)")).not.toBeNull();

  fireEvent.keyDown(deadlineButton, { key: "Escape" });
  await waitFor(() => {
    expect(screen.queryByLabelText("Deadline (your time)")).toBeNull();
  });
  expect(onCancel).not.toHaveBeenCalled();

  fireEvent.keyDown(deadlineButton, { key: "Escape" });
  expect(onCancel).toHaveBeenCalledTimes(1);
});

/// <reference lib="dom" />

import { describe, expect, mock, test } from "bun:test";
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

function validParser(): Promise<NextActionParseResult> {
  return Promise.resolve(VALID_RESULT);
}

interface DeferredResult {
  promise: Promise<NextActionParseResult>;
  resolve: (result: NextActionParseResult) => void;
}

function deferredResult(): DeferredResult {
  let resolve!: (result: NextActionParseResult) => void;
  const promise = new Promise<NextActionParseResult>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

describe("NextActionComposer", () => {
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
        parseSentence={validParser}
        onSave={onSave}
        onCancel={() => undefined}
      />,
    );

    const sentence = screen.getByLabelText("What should happen, and when?");
    fireEvent.change(sentence, {
      target: { value: "Call Atul by next week Friday at 5pm EST" },
    });
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    expect(await screen.findByText("Call Atul")).not.toBeNull();
    expect(screen.getByText("Fri, Jul 24, 5:00 PM EST")).not.toBeNull();
    expect(screen.getByText(/Sat, Jul 25, 7:00 AM/)).not.toBeNull();

    fireEvent.keyDown(sentence, { key: "Enter" });
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        text: "Call Atul",
        deadline: "2026-07-24T22:00:00.000Z",
      });
    });
  });

  test("shows assumptions and allows structured correction", async () => {
    const assumedParser = mock(() =>
      Promise.resolve({
        status: "valid",
        value: {
          ...VALID_RESULT.value,
          assumedTime: true,
        },
      } satisfies NextActionParseResult),
    );
    render(
      <NextActionComposer
        initialAction={null}
        pending={false}
        error={null}
        browserTimeZone="Asia/Seoul"
        parseDelayMs={0}
        parseSentence={assumedParser}
        onSave={() => undefined}
        onCancel={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText("What should happen, and when?"), {
      target: { value: "Call Atul next Friday" },
    });
    expect(await screen.findByText("time assumed")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Edit action/i }));
    expect(screen.getByLabelText("Action")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Edit deadline/i }));
    expect(screen.getByLabelText("Deadline (your time)")).not.toBeNull();
  });

  test("blocks ambiguous input and keeps mutation errors visible", async () => {
    const ambiguousParser = mock(() =>
      Promise.resolve({
        status: "ambiguous",
        matches: ["Monday", "Friday"],
      } satisfies NextActionParseResult),
    );
    render(
      <NextActionComposer
        initialAction={null}
        pending={false}
        error="Failed to update next action."
        browserTimeZone="Asia/Seoul"
        parseDelayMs={0}
        parseSentence={ambiguousParser}
        onSave={() => undefined}
        onCancel={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText("What should happen, and when?"), {
      target: { value: "Call Monday and email Friday" },
    });
    expect(await screen.findByText("Choose one deadline.")).not.toBeNull();
    expect(screen.getByText("Failed to update next action.")).not.toBeNull();
    expect(screen.getByRole("status").textContent).toContain(
      "Choose one deadline.",
    );
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    expect(screen.getByLabelText("Action")).not.toBeNull();
    expect(screen.getByLabelText("Deadline (your time)")).not.toBeNull();
  });

  test("does not retain a stale valid deadline after the sentence becomes invalid", async () => {
    const parser = mock((sentence: string) =>
      Promise.resolve(
        sentence.includes("Friday")
          ? VALID_RESULT
          : ({ status: "missing_deadline" } satisfies NextActionParseResult),
      ),
    );
    render(
      <NextActionComposer
        initialAction={null}
        pending={false}
        error={null}
        browserTimeZone="Asia/Seoul"
        parseDelayMs={0}
        parseSentence={parser}
        onSave={() => undefined}
        onCancel={() => undefined}
      />,
    );

    const sentence = screen.getByLabelText("What should happen, and when?");
    fireEvent.change(sentence, { target: { value: "Call Atul Friday" } });
    expect(await screen.findByText("Call Atul")).not.toBeNull();

    fireEvent.change(sentence, { target: { value: "Call Atul" } });
    expect(
      await screen.findByText("Add a deadline or choose it manually."),
    ).not.toBeNull();
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    fireEvent.change(sentence, { target: { value: "Call Atul Friday" } });
    expect(await screen.findByText("Call Atul")).not.toBeNull();
    fireEvent.change(sentence, { target: { value: "" } });
    await waitFor(() => {
      expect(
        (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
    });
  });

  test("ignores a late parser result from an older sentence", async () => {
    const first = deferredResult();
    const second = deferredResult();
    const parser = mock((sentence: string) =>
      sentence.includes("first") ? first.promise : second.promise,
    );
    render(
      <NextActionComposer
        initialAction={null}
        pending={false}
        error={null}
        browserTimeZone="Asia/Seoul"
        parseDelayMs={0}
        parseSentence={parser}
        onSave={() => undefined}
        onCancel={() => undefined}
      />,
    );

    const sentence = screen.getByLabelText("What should happen, and when?");
    fireEvent.change(sentence, { target: { value: "Call first Friday" } });
    await waitFor(() => expect(parser).toHaveBeenCalledTimes(1));
    fireEvent.change(sentence, { target: { value: "Call second Friday" } });
    await waitFor(() => expect(parser).toHaveBeenCalledTimes(2));

    second.resolve({
      status: "valid",
      value: {
        ...VALID_RESULT.value,
        actionText: "Call second",
      },
    });
    expect(await screen.findByText("Call second")).not.toBeNull();

    first.resolve({
      status: "valid",
      value: {
        ...VALID_RESULT.value,
        actionText: "Call first",
      },
    });
    await waitFor(() => {
      expect(screen.queryByText("Call first")).toBeNull();
      expect(screen.getByText("Call second")).not.toBeNull();
    });
  });

  test("offers manual deadline entry for an incomplete sentence", async () => {
    const missingDeadlineParser = mock(() =>
      Promise.resolve({
        status: "missing_deadline",
      } satisfies NextActionParseResult),
    );
    render(
      <NextActionComposer
        initialAction={null}
        pending={false}
        error={null}
        browserTimeZone="Asia/Seoul"
        parseDelayMs={0}
        parseSentence={missingDeadlineParser}
        onSave={() => undefined}
        onCancel={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText("What should happen, and when?"), {
      target: { value: "Call Atul" },
    });
    expect(
      await screen.findByText("Add a deadline or choose it manually."),
    ).not.toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Choose date manually" }),
    );

    expect((screen.getByLabelText("Action") as HTMLInputElement).value).toBe(
      "Call Atul",
    );
    expect(screen.getByLabelText("Deadline (your time)")).not.toBeNull();
  });

  test("opens an existing action in structured mode", () => {
    render(
      <NextActionComposer
        initialAction={{
          text: "Send proposal",
          deadline: "2026-07-24T22:00:00.000Z",
        }}
        pending={false}
        error={null}
        browserTimeZone="Asia/Seoul"
        onSave={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(screen.queryByLabelText("What should happen, and when?")).toBeNull();
    expect(
      (screen.getByLabelText("Action") as HTMLInputElement).value,
    ).toBe("Send proposal");
    expect(screen.getByLabelText("Deadline (your time)")).not.toBeNull();
  });

  test("cancels on Escape and falls back when parsing cannot load", async () => {
    const onCancel = mock(() => undefined);
    const failedParser = mock(() => Promise.reject(new Error("load failed")));
    render(
      <NextActionComposer
        initialAction={null}
        pending={false}
        error={null}
        browserTimeZone="Asia/Seoul"
        parseDelayMs={0}
        parseSentence={failedParser}
        onSave={() => undefined}
        onCancel={onCancel}
      />,
    );

    const sentence = screen.getByLabelText("What should happen, and when?");
    fireEvent.keyDown(sentence, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.change(sentence, { target: { value: "Call Atul tomorrow" } });
    expect(await screen.findByLabelText("Action")).not.toBeNull();
    expect(screen.getByLabelText("Deadline (your time)")).not.toBeNull();
  });

  test("shows parsing progress and swaps the pending save icon", async () => {
    const parsingResult = deferredResult();
    const parser = mock(() => parsingResult.promise);
    const { rerender } = render(
      <NextActionComposer
        initialAction={null}
        pending={false}
        error={null}
        browserTimeZone="Asia/Seoul"
        parseDelayMs={0}
        parseSentence={parser}
        onSave={() => undefined}
        onCancel={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText("What should happen, and when?"), {
      target: { value: "Call Atul Friday" },
    });
    expect(await screen.findByText("Understanding deadline…")).not.toBeNull();
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    parsingResult.resolve(VALID_RESULT);
    expect(await screen.findByText("Call Atul")).not.toBeNull();
    rerender(
      <NextActionComposer
        initialAction={null}
        pending={true}
        error={null}
        browserTimeZone="Asia/Seoul"
        parseDelayMs={0}
        parseSentence={parser}
        onSave={() => undefined}
        onCancel={() => undefined}
      />,
    );

    const saveButton = screen.getByRole("button", {
      name: "Save",
    }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
    expect(saveButton.querySelector(".animate-spin")).not.toBeNull();
    expect(
      (screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

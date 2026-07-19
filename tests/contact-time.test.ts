import { describe, expect, test } from "bun:test";

import {
  datetimeLocalToIso,
  formatNextActionDeadline,
  formatNextActionRelative,
  formatTimeInStage,
  toDatetimeLocalValue,
} from "../src/lib/contact-time";

describe("formatTimeInStage", () => {
  const now = new Date("2026-07-19T12:00:00.000Z");

  test("formats less than one hour", () => {
    expect(formatTimeInStage("2026-07-19T11:30:00.000Z", now)).toBe(
      "<1h in stage",
    );
  });

  test("floors elapsed hours below one day", () => {
    expect(formatTimeInStage("2026-07-19T05:15:00.000Z", now)).toBe(
      "6h in stage",
    );
  });

  test("floors elapsed days at one day or more", () => {
    expect(formatTimeInStage("2026-07-16T11:00:00.000Z", now)).toBe(
      "3d in stage",
    );
  });

  test("returns null for absent or invalid timestamps", () => {
    expect(formatTimeInStage(undefined, now)).toBeNull();
    expect(formatTimeInStage("not-a-date", now)).toBeNull();
  });
});

describe("formatNextActionRelative", () => {
  const now = new Date("2026-07-19T12:00:00.000Z");

  test("formats future deadlines", () => {
    expect(
      formatNextActionRelative("2026-07-19T16:00:00.000Z", now),
    ).toBe("Due in 4 hours");
    expect(
      formatNextActionRelative("2026-07-21T12:00:00.000Z", now),
    ).toBe("Due in 2 days");
  });

  test("formats overdue deadlines", () => {
    expect(
      formatNextActionRelative("2026-07-19T10:00:00.000Z", now),
    ).toBe("Overdue by 2 hours");
    expect(
      formatNextActionRelative("2026-07-17T12:00:00.000Z", now),
    ).toBe("Overdue by 2 days");
  });

  test("handles due-now and invalid timestamps", () => {
    expect(
      formatNextActionRelative("2026-07-19T12:00:00.000Z", now),
    ).toBe("Due now");
    expect(formatNextActionRelative("not-a-date", now)).toBeNull();
  });
});

describe("formatNextActionDeadline", () => {
  test("renders the exact deadline in browser-local date and time", () => {
    const deadline = "2026-07-25T14:30:00.000Z";

    expect(formatNextActionDeadline(deadline)).toBe(
      new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(deadline)),
    );
  });

  test("returns null for an invalid deadline", () => {
    expect(formatNextActionDeadline("not-a-date")).toBeNull();
  });
});

describe("datetime-local conversion", () => {
  test("round-trips a minute-precision UTC deadline through browser local time", () => {
    const deadline = "2026-07-25T14:30:00.000Z";
    const local = toDatetimeLocalValue(deadline);

    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(datetimeLocalToIso(local)).toBe(deadline);
  });

  test("returns null for invalid local or ISO values", () => {
    expect(toDatetimeLocalValue("not-a-date")).toBe("");
    expect(datetimeLocalToIso("")).toBeNull();
    expect(datetimeLocalToIso("not-a-date")).toBeNull();
  });
});

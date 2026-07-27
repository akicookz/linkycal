import { describe, expect, test } from "bun:test";

import {
  createEventTypeSchema,
  updateEventTypeSchema,
} from "../../worker/validation";

describe("event type limit validation", () => {
  test.each([
    [
      "rejects maxPerDay below 1",
      () =>
        createEventTypeSchema.safeParse({
          name: "Call",
          slug: "call",
          maxPerDay: 0,
        }).success,
      false,
    ],
    [
      "rejects maxPerWeek below 1",
      () =>
        createEventTypeSchema.safeParse({
          name: "Call",
          slug: "call",
          maxPerWeek: 0,
        }).success,
      false,
    ],
    [
      "rejects an unknown weekStart",
      () => updateEventTypeSchema.safeParse({ weekStart: "tuesday" }).success,
      false,
    ],
    [
      "accepts the lower limit boundary",
      () =>
        createEventTypeSchema.safeParse({
          name: "Call",
          slug: "call",
          maxPerDay: 1,
          maxPerWeek: 1,
        }).success,
      true,
    ],
    [
      "accepts a Monday week start",
      () => updateEventTypeSchema.safeParse({ weekStart: "monday" }).success,
      true,
    ],
    [
      "accepts a Sunday week start",
      () => updateEventTypeSchema.safeParse({ weekStart: "sunday" }).success,
      true,
    ],
  ] as const)("%s", (_label, parse, expected) => {
    expect(parse()).toBe(expected);
  });
});

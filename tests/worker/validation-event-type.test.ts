import { describe, expect, test } from "bun:test";

import {
  createEventTypeSchema,
  updateEventTypeSchema,
} from "../../worker/validation";

describe("event type limit validation", () => {

  test("rejects maxPerWeek below 1", () => {
    expect(() =>
      createEventTypeSchema.parse({ name: "Call", slug: "call", maxPerWeek: 0 }),
    ).toThrow();
  });

  test("rejects an unknown weekStart value", () => {
    expect(() =>
      updateEventTypeSchema.parse({ weekStart: "tuesday" }),
    ).toThrow();
  });
});

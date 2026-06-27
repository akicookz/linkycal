import { describe, expect, test } from "bun:test";

import {
  createEventTypeSchema,
  updateEventTypeSchema,
} from "../../worker/validation";

describe("event type limit validation", () => {
  test("create defaults weekStart to monday and limits to undefined", () => {
    const parsed = createEventTypeSchema.parse({ name: "Call", slug: "call" });
    expect(parsed.weekStart).toBe("monday");
    expect(parsed.maxPerWeek).toBeUndefined();
  });

  test("create accepts maxPerWeek and weekStart", () => {
    const parsed = createEventTypeSchema.parse({
      name: "Call",
      slug: "call",
      maxPerWeek: 5,
      weekStart: "sunday",
    });
    expect(parsed.maxPerWeek).toBe(5);
    expect(parsed.weekStart).toBe("sunday");
  });

  test("create accepts null maxPerWeek (unlimited)", () => {
    const parsed = createEventTypeSchema.parse({
      name: "Call",
      slug: "call",
      maxPerWeek: null,
    });
    expect(parsed.maxPerWeek).toBeNull();
  });

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

  test("update allows clearing maxPerWeek with null", () => {
    const parsed = updateEventTypeSchema.parse({ maxPerWeek: null });
    expect(parsed.maxPerWeek).toBeNull();
  });
});

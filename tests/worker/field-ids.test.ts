import { describe, expect, test } from "bun:test";

import {
  getUniqueFieldId,
  normalizeToFieldId,
} from "../../worker/lib/field-ids";

describe("field ID helpers", () => {
  test("normalizes labels into underscore-separated field IDs", () => {
    expect(normalizeToFieldId("Primary Email Address")).toBe(
      "primary_email_address",
    );
    expect(normalizeToFieldId("  Company Name!  ")).toBe("company_name");
  });

  test("dedupes normalized field IDs across a form", () => {
    expect(
      getUniqueFieldId("Email", ["full_name", "email", "company"]),
    ).toBe("email_2");
    expect(
      getUniqueFieldId("Email", ["full_name", "email", "email_2", "company"]),
    ).toBe("email_3");
  });

  test("keeps the current field ID when its normalized label still matches", () => {
    expect(
      getUniqueFieldId("Email", ["email", "email_2", "company"], "email_2"),
    ).toBe("email_2");
  });
});

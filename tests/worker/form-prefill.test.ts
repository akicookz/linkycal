import { describe, expect, test } from "bun:test";

import {
  buildBookingPrefill,
  prefillFromQuery,
  type FormPrefillField,
} from "../../src/lib/form-prefill";

function textField(id: string, overrides: Partial<FormPrefillField> = {}): FormPrefillField {
  return { id, type: "text", ...overrides };
}

describe("prefillFromQuery", () => {

  test("file type is never prefilled", () => {
    const fields: FormPrefillField[] = [{ id: "upload", type: "file" }];
    expect(prefillFromQuery(fields, { upload: "https://x/y.pdf" })).toEqual({});
  });
});

describe("buildBookingPrefill", () => {
  test("fills form values by field id and guests from reserved params", () => {
    const result = buildBookingPrefill({
      fields: [textField("company")],
      query: {
        company: "Acme",
        name: "Ada Lovelace",
        email: "ada@example.com",
        notes: "Runs late",
      },
    });
    expect(result.formValues).toEqual({ company: "Acme" });
    expect(result.guestName).toBe("Ada Lovelace");
    expect(result.guestEmail).toBe("ada@example.com");
    expect(result.guestNotes).toBe("Runs late");
  });

  test("a form field with a reserved id wins the collision", () => {
    const result = buildBookingPrefill({
      fields: [textField("name")],
      query: { name: "Ada Lovelace" },
    });
    expect(result.formValues).toEqual({ name: "Ada Lovelace" });
    expect(result.guestName).toBeUndefined();
  });

  test("a mapped field that collides with a reserved id still seeds the guest", () => {
    const result = buildBookingPrefill({
      fields: [textField("name")],
      query: { name: "Ada Lovelace" },
      nameFieldId: "name",
    });
    expect(result.guestName).toBe("Ada Lovelace");
  });

  test("prefilled mapped fields seed guests and beat reserved params", () => {
    const result = buildBookingPrefill({
      fields: [textField("full-name"), textField("work-email", { type: "email" })],
      query: {
        "full-name": "Grace Hopper",
        "work-email": "grace@example.com",
        name: "Someone Else",
      },
      nameFieldId: "full-name",
      emailFieldId: "work-email",
    });
    expect(result.guestName).toBe("Grace Hopper");
    expect(result.guestEmail).toBe("grace@example.com");
  });

  test("blank reserved params are ignored", () => {
    const result = buildBookingPrefill({
      fields: [],
      query: { name: "   ", notes: "" },
    });
    expect(result.guestName).toBeUndefined();
    expect(result.guestNotes).toBeUndefined();
  });

  test("blank mapped-field values fall back to reserved params", () => {
    const result = buildBookingPrefill({
      fields: [textField("full-name")],
      query: { "full-name": "   ", name: "Ada Lovelace" },
      nameFieldId: "full-name",
    });
    expect(result.guestName).toBe("Ada Lovelace");
  });
});

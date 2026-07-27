import { describe, expect, test } from "bun:test";

import {
  buildBookingPrefill,
  prefillFromQuery,
  type FormPrefillField,
} from "../../src/lib/form-prefill";

function textField(id: string, overrides: Partial<FormPrefillField> = {}): FormPrefillField {
  return { id, type: "text", ...overrides };
}

describe("form prefill policy", () => {
  test("applies file, reserved-key, mapping, and blank-value precedence", () => {
    expect([
      "file type",
      prefillFromQuery(
        [{ id: "upload", type: "file" }],
        { upload: "https://x/y.pdf" },
      ),
    ]).toEqual(["file type", {}]);

    const reserved = buildBookingPrefill({
      fields: [textField("company")],
      query: {
        company: "Acme",
        name: "Ada Lovelace",
        email: "ada@example.com",
        notes: "Runs late",
      },
    });
    expect([
      "reserved params",
      reserved.formValues,
      reserved.guestName,
      reserved.guestEmail,
      reserved.guestNotes,
    ]).toEqual([
      "reserved params",
      { company: "Acme" },
      "Ada Lovelace",
      "ada@example.com",
      "Runs late",
    ]);

    const collision = buildBookingPrefill({
      fields: [textField("name")],
      query: { name: "Ada Lovelace" },
    });
    expect([
      "reserved field collision",
      collision.formValues,
      collision.guestName,
    ]).toEqual([
      "reserved field collision",
      { name: "Ada Lovelace" },
      undefined,
    ]);

    const mappedCollision = buildBookingPrefill({
      fields: [textField("name")],
      query: { name: "Ada Lovelace" },
      nameFieldId: "name",
    });
    expect(["mapped reserved field", mappedCollision.guestName]).toEqual([
      "mapped reserved field",
      "Ada Lovelace",
    ]);

    const mapped = buildBookingPrefill({
      fields: [
        textField("full-name"),
        textField("work-email", { type: "email" }),
      ],
      query: {
        "full-name": "Grace Hopper",
        "work-email": "grace@example.com",
        name: "Someone Else",
      },
      nameFieldId: "full-name",
      emailFieldId: "work-email",
    });
    expect([
      "mapped precedence",
      mapped.guestName,
      mapped.guestEmail,
    ]).toEqual([
      "mapped precedence",
      "Grace Hopper",
      "grace@example.com",
    ]);

    const blankReserved = buildBookingPrefill({
      fields: [],
      query: { name: "   ", notes: "" },
    });
    const blankMapped = buildBookingPrefill({
      fields: [textField("full-name")],
      query: { "full-name": "   ", name: "Ada Lovelace" },
      nameFieldId: "full-name",
    });
    expect([
      "blank values",
      blankReserved.guestName,
      blankReserved.guestNotes,
      blankMapped.guestName,
    ]).toEqual(["blank values", undefined, undefined, "Ada Lovelace"]);
  });
});

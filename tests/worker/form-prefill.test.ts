import { describe, expect, test } from "bun:test";

import {
  prefillFromQuery,
  parseQueryString,
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

describe("parseQueryString", () => {
});

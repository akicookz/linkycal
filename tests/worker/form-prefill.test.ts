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
  test("maps matching param to field id by default", () => {
    const fields = [textField("full_name"), textField("company_type")];
    const out = prefillFromQuery(fields, { full_name: "Ada", company_type: "saas" });
    expect(out).toEqual({ full_name: "Ada", company_type: "saas" });
  });

  test("ignores params with no matching field", () => {
    const fields = [textField("full_name")];
    const out = prefillFromQuery(fields, { random: "xyz" });
    expect(out).toEqual({});
  });

  test("queryParam override takes precedence over field id", () => {
    const fields = [textField("email", { queryParam: "e" })];
    const out = prefillFromQuery(fields, { e: "a@b.com", email: "other@b.com" });
    expect(out).toEqual({ email: "a@b.com" });
  });

  test("select field only accepts matching option value", () => {
    const fields: FormPrefillField[] = [
      {
        id: "plan",
        type: "select",
        options: [
          { label: "Pro", value: "pro" },
          { label: "Free", value: "free" },
        ],
      },
    ];
    expect(prefillFromQuery(fields, { plan: "pro" })).toEqual({ plan: "pro" });
    expect(prefillFromQuery(fields, { plan: "nope" })).toEqual({});
  });

  test("multi_select accepts comma-separated and repeated values", () => {
    const fields: FormPrefillField[] = [
      {
        id: "tags",
        type: "multi_select",
        options: [
          { label: "A", value: "a" },
          { label: "B", value: "b" },
          { label: "C", value: "c" },
        ],
      },
    ];
    expect(prefillFromQuery(fields, { tags: "a,c" })).toEqual({ tags: "a,c" });
    expect(prefillFromQuery(fields, { tags: ["a", "b"] })).toEqual({ tags: "a,b" });
    expect(prefillFromQuery(fields, { tags: "a,garbage" })).toEqual({ tags: "a" });
    expect(prefillFromQuery(fields, { tags: "garbage" })).toEqual({});
  });

  test("single checkbox coerces truthy/falsy strings", () => {
    const fields: FormPrefillField[] = [{ id: "opt_in", type: "checkbox" }];
    expect(prefillFromQuery(fields, { opt_in: "true" })).toEqual({ opt_in: "true" });
    expect(prefillFromQuery(fields, { opt_in: "1" })).toEqual({ opt_in: "true" });
    expect(prefillFromQuery(fields, { opt_in: "no" })).toEqual({ opt_in: "false" });
  });

  test("rating clamps to 1-5 integer", () => {
    const fields: FormPrefillField[] = [{ id: "score", type: "rating" }];
    expect(prefillFromQuery(fields, { score: "3" })).toEqual({ score: "3" });
    expect(prefillFromQuery(fields, { score: "9" })).toEqual({});
    expect(prefillFromQuery(fields, { score: "abc" })).toEqual({});
  });

  test("file type is never prefilled", () => {
    const fields: FormPrefillField[] = [{ id: "upload", type: "file" }];
    expect(prefillFromQuery(fields, { upload: "https://x/y.pdf" })).toEqual({});
  });
});

describe("parseQueryString", () => {
  test("single value returns string", () => {
    expect(parseQueryString("?foo=bar")).toEqual({ foo: "bar" });
  });

  test("repeated keys return arrays", () => {
    expect(parseQueryString("?tags=a&tags=b")).toEqual({ tags: ["a", "b"] });
  });

  test("empty search returns empty object", () => {
    expect(parseQueryString("")).toEqual({});
  });
});

import { describe, expect, test } from "bun:test";

import { applyTagSelection } from "../src/lib/workflow-step-config";

const tags = [
  { id: "tag_lead", name: "Lead" },
  { id: "tag_customer", name: "Customer" },
];

describe("applyTagSelection", () => {
  // Regression: the tag Select handler used to call set() twice in a row, each
  // spreading the same stale config, so the tagName write clobbered the tagId
  // write and the step was saved with { tagId: "", tagName: "Lead" }. That made
  // the workflow fail at run time with "add_tag: missing 'tagId' in config".
  test("sets tagId and tagName together in one config object", () => {
    const next = applyTagSelection({ tagId: "", inputs: [] }, "tag_lead", tags);

    expect(next.tagId).toBe("tag_lead");
    expect(next.tagName).toBe("Lead");
  });

  test("preserves other config keys", () => {
    const next = applyTagSelection(
      { tagId: "", inputs: [{ key: "email" }], foo: 1 },
      "tag_customer",
      tags,
    );

    expect(next.inputs).toEqual([{ key: "email" }]);
    expect(next.foo).toBe(1);
    expect(next.tagId).toBe("tag_customer");
    expect(next.tagName).toBe("Customer");
  });

  test("still records the tagId when the tag is not in the list", () => {
    const next = applyTagSelection({ tagId: "" }, "tag_unknown", tags);

    expect(next.tagId).toBe("tag_unknown");
  });
});

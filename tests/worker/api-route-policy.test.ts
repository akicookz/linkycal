import { describe, expect, test } from "bun:test";

import { projectRouteAccess } from "../../worker/lib/api-route-policy";

describe("project API route policy", () => {
  test("classifies representative API-key and session-only routes", () => {
    expect(
      projectRouteAccess("GET", "/api/projects/project-a/contacts"),
    ).toBe("apiKey");
    expect(projectRouteAccess("DELETE", "/api/projects/project-a")).toBe(
      "sessionOnly",
    );
    expect(
      projectRouteAccess("GET", "/api/projects/project-a/unknown"),
    ).toBe("unclassified");
  });
});

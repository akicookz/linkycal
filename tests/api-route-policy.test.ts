import { describe, expect, test } from "bun:test";

import { projectRouteAccess } from "../worker/lib/api-route-policy";
import { requiredProjectPermission } from "../worker/lib/team-access";

describe("MCP connection route policy", function () {
  test("project connection administration is session-only and never accepts API keys", function () {
    expect(
      projectRouteAccess(
        "GET",
        "/api/projects/project-a/mcp-connections",
      ),
    ).toBe("sessionOnly");
    expect(
      projectRouteAccess(
        "DELETE",
        "/api/projects/project-a/mcp-connections/connection-a",
      ),
    ).toBe("sessionOnly");
    expect(
      requiredProjectPermission(
        "GET",
        "/api/projects/project-a/mcp-connections",
      ),
    ).toBe("project:api_keys");
    expect(
      requiredProjectPermission(
        "DELETE",
        "/api/projects/project-a/mcp-connections/connection-a",
      ),
    ).toBe("project:api_keys");
  });

  test("the consent context API is not classified as a project API-key route", function () {
    expect(
      projectRouteAccess("GET", "/api/oauth/mcp/authorization"),
    ).toBe("unclassified");
    expect(
      projectRouteAccess("POST", "/api/oauth/mcp/authorization"),
    ).toBe("unclassified");
  });
});

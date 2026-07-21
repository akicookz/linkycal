import { describe, expect, test } from "bun:test";

import { authorizeApiKeyProjectRequest } from "../../worker/lib/project-api-access";

describe("project API key authorization", () => {
  test("allows a matching entitled key on an API-key route", () => {
    expect(
      authorizeApiKeyProjectRequest({
        apiKeyProjectId: "project-a",
        routeProjectId: "project-a",
        routeAccess: "apiKey",
        apiAccess: true,
      }),
    ).toBeNull();
  });

  test("rejects a key for another project", () => {
    expect(
      authorizeApiKeyProjectRequest({
        apiKeyProjectId: "project-b",
        routeProjectId: "project-a",
        routeAccess: "apiKey",
        apiAccess: true,
      }),
    ).toMatchObject({
      status: 403,
      code: "api_key_project_mismatch",
    });
  });

  test("rejects a session-only route", () => {
    expect(
      authorizeApiKeyProjectRequest({
        apiKeyProjectId: "project-a",
        routeProjectId: "project-a",
        routeAccess: "sessionOnly",
        apiAccess: true,
      }),
    ).toMatchObject({
      status: 403,
      code: "api_key_route_forbidden",
    });
  });

  test("rejects an unclassified route", () => {
    expect(
      authorizeApiKeyProjectRequest({
        apiKeyProjectId: "project-a",
        routeProjectId: "project-a",
        routeAccess: "unclassified",
        apiAccess: true,
      }),
    ).toMatchObject({
      status: 403,
      code: "api_key_route_forbidden",
    });
  });

  test("rejects a project without current API entitlement", () => {
    expect(
      authorizeApiKeyProjectRequest({
        apiKeyProjectId: "project-a",
        routeProjectId: "project-a",
        routeAccess: "apiKey",
        apiAccess: false,
      }),
    ).toMatchObject({
      status: 403,
      code: "api_access_unavailable",
    });
  });
});

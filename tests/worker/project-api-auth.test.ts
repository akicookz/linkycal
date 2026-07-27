import { describe, expect, test } from "bun:test";

import { authorizeApiKeyProjectRequest } from "../../worker/lib/project-api-access";

describe("project API key authorization", () => {
  test("enforces the complete fail-closed API-key policy", () => {
    const cases = [
      {
        name: "matching entitled key on API-key route",
        input: {
          apiKeyProjectId: "project-a",
          routeProjectId: "project-a",
          routeAccess: "apiKey" as const,
          apiAccess: true,
        },
        expected: null,
      },
      {
        name: "key for another project",
        input: {
          apiKeyProjectId: "project-b",
          routeProjectId: "project-a",
          routeAccess: "apiKey" as const,
          apiAccess: true,
        },
        expected: {
          status: 403,
          code: "api_key_project_mismatch",
        },
      },
      {
        name: "session-only route",
        input: {
          apiKeyProjectId: "project-a",
          routeProjectId: "project-a",
          routeAccess: "sessionOnly" as const,
          apiAccess: true,
        },
        expected: {
          status: 403,
          code: "api_key_route_forbidden",
        },
      },
      {
        name: "unclassified route",
        input: {
          apiKeyProjectId: "project-a",
          routeProjectId: "project-a",
          routeAccess: "unclassified" as const,
          apiAccess: true,
        },
        expected: {
          status: 403,
          code: "api_key_route_forbidden",
        },
      },
      {
        name: "project without current API entitlement",
        input: {
          apiKeyProjectId: "project-a",
          routeProjectId: "project-a",
          routeAccess: "apiKey" as const,
          apiAccess: false,
        },
        expected: {
          status: 403,
          code: "api_access_unavailable",
        },
      },
    ];

    for (const { name, input, expected } of cases) {
      const result = authorizeApiKeyProjectRequest(input);
      expect([
        name,
        result
          ? { status: result.status, code: result.code }
          : null,
      ]).toEqual([name, expected]);
    }
  });
});

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PROJECT_API_KEY_ROUTES,
  PROJECT_SESSION_ONLY_ROUTES,
  projectRouteAccess,
} from "../../worker/lib/api-route-policy";

interface SourceRoute {
  method: string;
  path: string;
}

function extractProjectRoutes(): SourceRoute[] {
  const source = readFileSync(
    join(import.meta.dir, "../../worker/index.ts"),
    "utf8",
  );
  const routePattern =
    /\.(get|post|put|patch|delete|all)\(\s*"(\/api\/projects\/[^"\n]+)"/gs;
  return Array.from(source.matchAll(routePattern), (match) => ({
    method: match[1].toUpperCase(),
    path: match[2],
  }));
}

function materializePath(path: string): string {
  return path
    .replace(/:[^/{}]+\{[^}]+\}/g, "sample")
    .replace(/:[^/]+/g, "sample");
}

function routeKey(route: SourceRoute): string {
  return `${route.method} ${route.path}`;
}

describe("project API route policy", () => {
  test("classifies representative API-key and session-only routes", () => {
    expect(
      projectRouteAccess("GET", "/api/projects/project-a/contacts"),
    ).toBe("apiKey");
    expect(
      projectRouteAccess(
        "PATCH",
        "/api/projects/project-a/bookings/booking-a/cancel",
      ),
    ).toBe("apiKey");
    expect(
      projectRouteAccess(
        "PUT",
        "/api/projects/project-a/event-types/event-a/calendars",
      ),
    ).toBe("apiKey");
    expect(
      projectRouteAccess(
        "GET",
        "/api/projects/project-a/contacts/contact-a/activities",
      ),
    ).toBe("apiKey");
    expect(
      projectRouteAccess(
        "GET",
        "/api/projects/project-a/workflows/workflow-a/runs/run-a",
      ),
    ).toBe("apiKey");
    expect(
      projectRouteAccess("GET", "/api/projects/project-a/tags/tag-a"),
    ).toBe("apiKey");
    expect(
      projectRouteAccess(
        "PUT",
        "/api/projects/project-a/contacts/contact-a/tags/tag-a",
      ),
    ).toBe("apiKey");
    expect(projectRouteAccess("DELETE", "/api/projects/project-a")).toBe(
      "sessionOnly",
    );
    expect(
      projectRouteAccess("GET", "/api/projects/project-a/api-keys"),
    ).toBe("sessionOnly");
    expect(
      projectRouteAccess("POST", "/api/projects/project-a/calendar/connect"),
    ).toBe("sessionOnly");
    expect(
      projectRouteAccess("GET", "/api/projects/project-a/unknown"),
    ).toBe("unclassified");
  });

  test("classifies every registered nested project route exactly once", () => {
    const sourceRoutes = extractProjectRoutes();
    const policyRoutes = [
      ...PROJECT_API_KEY_ROUTES,
      ...PROJECT_SESSION_ONLY_ROUTES,
    ];
    const sourceKeys = sourceRoutes.map(routeKey);
    const policyKeys = policyRoutes.map(routeKey);

    expect(sourceRoutes.length).toBeGreaterThan(80);
    expect(new Set(sourceKeys).size).toBe(sourceKeys.length);
    expect(new Set(policyKeys).size).toBe(policyKeys.length);
    expect(new Set(policyKeys)).toEqual(new Set(sourceKeys));

    for (const route of sourceRoutes) {
      expect(
        projectRouteAccess(route.method, materializePath(route.path)),
      ).not.toBe("unclassified");
    }
  });
});

import { describe, expect, test } from "bun:test";

import { PROJECT_API_KEY_ROUTES } from "../../worker/lib/api-route-policy";
import {
  generateApiArtifacts,
  toOpenApiPath,
} from "../../scripts/generate-api-docs";

async function loadArtifacts() {
  const source = await Bun.file(
    new URL("../../worker/index.ts", import.meta.url),
  ).text();
  return generateApiArtifacts(source);
}

describe("generated API documentation", () => {
  test("publishes OpenAPI 3.1 with the intended security model", async () => {
    const { openApi } = await loadArtifacts();

    expect(openApi.openapi).toBe("3.1.0");
    expect(openApi.components.securitySchemes.bearerAuth).toEqual({
      type: "http",
      scheme: "bearer",
      bearerFormat: "lc_live_...",
    });
    expect(
      openApi.paths["/api/projects/{projectId}/contacts"].get.security,
    ).toEqual([{ bearerAuth: [] }]);
    expect(
      openApi.paths["/api/v1/availability/{projectSlug}"].get.security,
    ).toEqual([]);
    expect(JSON.stringify(openApi)).not.toContain("session_cookie");
  });

  test("documents every API-key-enabled project operation", async () => {
    const { openApi } = await loadArtifacts();

    for (const route of PROJECT_API_KEY_ROUTES) {
      const path = toOpenApiPath(route.path);
      const operation = openApi.paths[path]?.[route.method.toLowerCase()];
      expect(operation, `${route.method} ${route.path}`).toBeDefined();
      expect(operation.security, `${route.method} ${route.path}`).toEqual([
        { bearerAuth: [] },
      ]);
    }
  });

  test("classifies every registered API route in the audit", async () => {
    const { auditRows, routes } = await loadArtifacts();
    const auditKeys = auditRows.map((row) => `${row.method} ${row.path}`);
    const routeKeys = routes.map((route) => `${route.method} ${route.path}`);

    expect(routes.length).toBeGreaterThan(130);
    expect(new Set(auditKeys)).toEqual(new Set(routeKeys));
    expect(auditRows.every((row) => row.auth.length > 0)).toBe(true);
  });

  test("checked-in artifacts equal deterministic generation", async () => {
    const { openApiJson, auditMarkdown } = await loadArtifacts();
    const checkedOpenApi = await Bun.file("public/openapi.json").text();
    const checkedAudit = await Bun.file("docs/api-endpoint-audit.md").text();

    expect(checkedOpenApi).toBe(openApiJson);
    expect(checkedAudit).toBe(auditMarkdown);
  });
});

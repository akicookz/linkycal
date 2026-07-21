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

  test("human and agent docs describe the implemented authentication surface", async () => {
    const documentationPaths = [
      "src/pages/Docs.tsx",
      "src/pages/ApiKeys.tsx",
      "src/pages/FeaturePage.tsx",
      "src/components/marketing/MarketingSections.tsx",
      "src/lib/prompts.ts",
      "public/llms.txt",
    ];
    const documentation = (
      await Promise.all(
        documentationPaths.map((path) => Bun.file(path).text()),
      )
    ).join("\n");
    const docsPage = await Bun.file("src/pages/Docs.tsx").text();
    const prompts = await Bun.file("src/lib/prompts.ts").text();
    const apiKeyPage = await Bun.file("src/pages/ApiKeys.tsx").text();

    expect(documentation).not.toContain("Cookie: session=");
    expect(docsPage).toContain("Authorization: Bearer lc_live_");
    expect(docsPage).toContain('href="/openapi.json"');
    expect(docsPage).toContain('href="/llms.txt"');
    expect(docsPage).toContain("Anonymous visitor endpoints");
    expect(docsPage).toContain(
      "Never put an API key in visitor-side code",
    );

    for (const domain of [
      "Project settings",
      "Event types",
      "Schedules and availability",
      "Bookings",
      "Forms and responses",
      "Contacts, tags, and views",
      "Workflows",
      "Activity",
      "Analytics",
      "Calendar configuration",
    ]) {
      expect(docsPage, domain).toContain(domain);
    }

    expect(docsPage).toContain(
      "Project creation and deletion, members, API-key management, billing, and OAuth connections are dashboard-only",
    );
    expect(docsPage).toContain("ambiguous_credentials");
    expect(docsPage).toContain("invalid_api_key");
    expect(docsPage).toContain("api_key_project_mismatch");
    expect(docsPage).toContain("api_access_unavailable");
    expect(prompts).not.toContain("Authorization: Bearer YOUR_API_KEY");
    expect(apiKeyPage).toContain("/api/projects/YOUR_PROJECT_ID/contacts");
    expect(documentation).toContain("2026-");
    expect(apiKeyPage).not.toMatch(/2025-\d{2}-\d{2}/);
  });
});

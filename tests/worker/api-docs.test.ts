import { describe, expect, test } from "bun:test";

import { PROJECT_API_KEY_ROUTES } from "../../worker/lib/api-route-policy";
import { API_REFERENCE_SECTIONS } from "../../src/lib/api-reference";
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

function normalizePathParameters(path: string): string {
  return path.replace(/:[^/]+/g, ":parameter");
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

    const humanReferenceKeys = API_REFERENCE_SECTIONS.flatMap((section) =>
      section.operations
        .filter((operation) => operation.path.startsWith("/api/projects/"))
        .map(
          (operation) =>
            `${operation.method} ${normalizePathParameters(operation.path)}`,
        ),
    );
    const projectRouteKeys = PROJECT_API_KEY_ROUTES.map(
      (route) => `${route.method} ${normalizePathParameters(route.path)}`,
    );
    expect(new Set(humanReferenceKeys)).toEqual(new Set(projectRouteKeys));
  });

  test("publishes explicit Tags and paginated contact contracts", async () => {
    const { openApi } = await loadArtifacts();
    const collection = openApi.paths["/api/projects/{projectId}/tags"];
    const resource =
      openApi.paths["/api/projects/{projectId}/tags/{tagId}"];
    const assignment =
      openApi.paths[
        "/api/projects/{projectId}/contacts/{contactId}/tags/{tagId}"
      ];

    expect(collection.get.tags).toEqual(["Tags"]);
    expect(collection.get.parameters?.map((parameter) => parameter.name)).toEqual([
      "projectId",
      "search",
      "limit",
      "cursor",
    ]);
    expect(collection.post.requestBody).toEqual(
      expect.objectContaining({
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/CreateTagRequest" },
          },
        },
      }),
    );
    expect(resource.get.responses["200"]).toBeDefined();
    expect(resource.patch.requestBody).toEqual(
      expect.objectContaining({ required: true }),
    );
    expect(resource.delete.responses["409"]).toBeDefined();
    expect(assignment.put.requestBody).toBeUndefined();
    expect(assignment.put.responses["200"]).toBeDefined();
    expect(openApi.components.schemas.Tag).toBeDefined();
    expect(openApi.components.schemas.TagListResponse).toBeDefined();
    expect(openApi.components.schemas.TagAssignmentResponse).toBeDefined();

    const contacts =
      openApi.paths["/api/projects/{projectId}/contacts"].get;
    const activities =
      openApi.paths[
        "/api/projects/{projectId}/contacts/{contactId}/activities"
      ].get;
    expect(contacts.parameters?.map((parameter) => parameter.name)).toEqual([
      "projectId",
      "search",
      "tagId",
      "tagIds",
      "matchAllTags",
      "stageTagId",
      "excludeStageTagIds",
      "activityType",
      "activitySinceDays",
      "noActivitySinceDays",
      "bookingStatus",
      "limit",
      "offset",
    ]);
    expect(contacts.responses["200"]).toEqual(
      expect.objectContaining({ description: "Contact page" }),
    );
    expect(activities.parameters?.map((parameter) => parameter.name)).toEqual([
      "projectId",
      "contactId",
      "category",
      "limit",
      "cursor",
    ]);
    expect(activities.responses["200"]).toEqual(
      expect.objectContaining({ description: "Contact activity page" }),
    );
    expect(openApi.components.schemas.ContactListResponse).toBeDefined();
    expect(openApi.components.schemas.ContactActivityPage).toBeDefined();
  });

  test("classifies every registered API route in the audit", async () => {
    const { auditRows, routes } = await loadArtifacts();
    const auditKeys = auditRows.map((row) => `${row.method} ${row.path}`);
    const routeKeys = routes.map((route) => `${route.method} ${route.path}`);

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

  test("documentation exposes the public API authentication entry points", async () => {
    const docsPage = await Bun.file("src/pages/Docs.tsx").text();

    expect(docsPage).not.toContain("Cookie: session=");
    expect(docsPage).toContain("Authorization: Bearer lc_live_");
    expect(docsPage).toContain('href="/openapi.json"');
    expect(docsPage).toContain('href="/llms.txt"');
  });
});

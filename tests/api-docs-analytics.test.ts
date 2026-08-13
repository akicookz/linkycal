import { describe, expect, test } from "bun:test";

import {
  MCP_TOOL_COUNT,
  MCP_TOOL_GROUPS,
  PUBLIC_API_OPERATIONS,
} from "../scripts/api-docs-catalog";
import {
  findStaleGeneratedArtifacts,
  generateApiArtifacts,
  generatedArtifactFiles,
} from "../scripts/generate-api-docs";
import { MCP_TOOL_SCOPES } from "../shared/mcp-tools";

describe("generated detailed analytics documentation", function () {
  test("OpenAPI publishes all analytics reports, filters, integrations, and anonymous event bounds", async function () {
    const source = await Bun.file("worker/index.ts").text();
    const artifacts = generateApiArtifacts(source);
    const paths = artifacts.openApi.paths;

    const analyticsPaths = [
      "/api/projects/{projectId}/analytics/filters",
      "/api/projects/{projectId}/analytics/overview",
      "/api/projects/{projectId}/analytics/bookings",
      "/api/projects/{projectId}/analytics/forms",
      "/api/projects/{projectId}/analytics/integrations",
      "/api/projects/{projectId}/analytics/integrations/{provider}",
    ];
    for (const path of analyticsPaths) {
      expect(paths[path], path).toBeTruthy();
    }

    const bookings = paths[
      "/api/projects/{projectId}/analytics/bookings"
    ]?.get;
    expect(
      bookings?.parameters?.map((parameter) => parameter.name),
    ).toEqual([
      "projectId",
      "period",
      "start",
      "end",
      "resourceSlug",
      "utmSource",
      "utmMedium",
      "utmCampaign",
      "source",
      "deviceType",
      "timezone",
    ]);
    expect(
      bookings?.parameters?.find(function timezoneParameter(parameter) {
        return parameter.name === "timezone";
      })?.required,
    ).toBe(true);
    expect(
      (
        bookings?.responses["200"] as {
          content: {
            "application/json": { schema: { $ref: string } };
          };
        }
      ).content["application/json"].schema.$ref,
    ).toBe("#/components/schemas/BookingAnalyticsResponse");

    const integrationPut = paths[
      "/api/projects/{projectId}/analytics/integrations/{provider}"
    ]?.put;
    expect(integrationPut?.requestBody).toEqual({
      required: true,
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/ConfigureAnalyticsIntegrationRequest",
          },
        },
      },
    });

    const tracking = paths["/api/v1/t"]?.post;
    expect(tracking?.requestBody).toEqual({
      required: true,
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/AnonymousAnalyticsEventsRequest",
          },
        },
      },
    });
    expect(tracking?.responses["204"]).toEqual({
      description: "Events accepted",
    });

    const schemas = artifacts.openApi.components.schemas as Record<
      string,
      Record<string, unknown>
    >;
    expect(schemas.FunnelStageReport).toBeTruthy();
    expect(schemas.FunnelContextBreakdowns).toBeUndefined();
    expect(schemas.AnalyticsFiltersResponse).toBeTruthy();
    expect(schemas.ConfigureAnalyticsIntegrationRequest).toBeTruthy();
    expect(schemas.AnonymousAnalyticsEventsRequest).toMatchObject({
      oneOf: [
        { $ref: "#/components/schemas/AnonymousAnalyticsEvent" },
        {
          type: "array",
          minItems: 1,
          maxItems: 20,
          items: { $ref: "#/components/schemas/AnonymousAnalyticsEvent" },
        },
      ],
    });

    const bookingResponse = schemas.BookingAnalyticsResponse as {
      allOf: Array<{
        properties?: Record<string, unknown>;
      }>;
    };
    expect(Object.keys(bookingResponse.allOf[1]?.properties ?? {})).toEqual([
      "funnel",
      "byEventType",
      "timeSeries",
      "clickedWeekdays",
      "selectedDateAvailability",
      "bookedWeekdays",
      "bookedTimes",
    ]);

    const analyticsContext = schemas.AnonymousAnalyticsEventContext as {
      properties: Record<string, unknown>;
    };
    expect(Object.keys(analyticsContext.properties)).toEqual([
      "selectedDateUtc",
      "fieldType",
      "required",
      "stageOutcome",
    ]);
    for (const removedProperty of [
      "selectedDate",
      "weekday",
      "viewerTimezone",
      "offeredSlotStarts",
      "earliestSlot",
      "latestSlot",
      "availabilityOutcome",
      "selectedTime",
      "failureCategory",
    ]) {
      expect(analyticsContext.properties).not.toHaveProperty(removedProperty);
    }
  });

  test("the public catalogs compute the complete MCP inventory including all analytics tools", async function () {
    expect(MCP_TOOL_COUNT).toBe(92);
    expect(
      MCP_TOOL_GROUPS.find((group) => group.scope === "read")?.tools.filter(
        (tool) => tool.includes("analytics"),
      ),
    ).toEqual([
      "get_analytics_filters",
      "get_analytics_overview",
      "get_booking_funnel_analytics",
      "get_form_funnel_analytics",
      "list_analytics_integrations",
    ]);
    expect(
      MCP_TOOL_GROUPS.find((group) => group.scope === "write")?.tools.filter(
        (tool) => tool.includes("analytics"),
      ),
    ).toEqual([
      "configure_analytics_integration",
    ]);
    expect(
      PUBLIC_API_OPERATIONS.filter((operation) =>
        operation.path.includes("/analytics/"),
      ).map((operation) => `${operation.method} ${operation.path}`),
    ).toEqual([
      "GET /api/projects/:projectId/analytics/filters",
      "GET /api/projects/:projectId/analytics/overview",
      "GET /api/projects/:projectId/analytics/bookings",
      "GET /api/projects/:projectId/analytics/forms",
      "GET /api/projects/:projectId/analytics/integrations",
      "PUT /api/projects/:projectId/analytics/integrations/:provider",
    ]);

    const source = await Bun.file("worker/index.ts").text();
    const artifacts = generateApiArtifacts(source);
    expect(artifacts.llmsText).toContain("92 tools");
    expect(artifacts.llmsText).toContain("### Read tools");
    expect(artifacts.llmsText).toContain("### Write tools");
    expect(artifacts.llmsText).toContain(
      "list_event_types -> get_available_slots -> create_booking",
    );
    expect(artifacts.llmsText).toContain("https://linkycal.com/docs");
    expect(artifacts.llmsText).toContain("https://linkycal.com/openapi.json");
    expect(artifacts.llmsText).toContain("get_booking_funnel_analytics");
    expect(artifacts.llmsText).toContain("configure_analytics_integration");
    expect(artifacts.llmsText).toContain(
      "Detailed reports and provider configuration require Pro or Business",
    );
    expect(artifacts.llmsText).toContain(
      "never contain names, emails, raw answers, journey IDs, IP addresses, or raw errors",
    );
  });

  test("MCP is published as OAuth while REST management remains API-key authenticated", async function () {
    const source = await Bun.file("worker/index.ts").text();
    const artifacts = generateApiArtifacts(source);
    const documentedTools = MCP_TOOL_GROUPS.flatMap(function tools(group) {
      return group.tools;
    });

    expect(new Set(documentedTools)).toEqual(
      new Set(Object.keys(MCP_TOOL_SCOPES)),
    );
    expect(
      PUBLIC_API_OPERATIONS.find(function mcpOperation(operation) {
        return operation.path === "/api/mcp";
      })?.auth,
    ).toBe("oauth");

    expect(artifacts.openApi.components.securitySchemes.mcpOAuth).toEqual({
      type: "oauth2",
      flows: {
        authorizationCode: {
          authorizationUrl: "https://linkycal.com/oauth/authorize",
          tokenUrl: "https://linkycal.com/oauth/token",
          scopes: {
            read: "Read project data through MCP tools.",
            write: "Create and update project data through MCP tools.",
            offline_access: "Refresh MCP access without another sign-in.",
          },
        },
      },
    });
    expect(artifacts.openApi.paths["/api/mcp"]?.post?.security).toEqual([
      { mcpOAuth: ["read", "write"] },
    ]);
    expect(
      artifacts.openApi.paths["/api/mcp"]?.post?.security,
    ).not.toContainEqual({ bearerAuth: [] });

    const mcpAudit = artifacts.auditRows.find(function mcpRow(row) {
      return row.path === "/api/mcp";
    });
    expect(mcpAudit).toMatchObject({
      method: "POST",
      auth: "OAuth",
      apiKeySupport: "No",
      sessionSupport: "No",
      documented: true,
    });

    expect(artifacts.llmsText).toContain(
      "Connect to https://linkycal.com/api/mcp and complete OAuth in the browser",
    );
    expect(artifacts.llmsText).not.toContain(
      "MCP use a project-scoped API key",
    );
    expect(artifacts.llmsText).not.toContain(
      "Auth: project API key as a Bearer token",
    );
    expect(artifacts.llmsText).toContain(
      "Authorization: Bearer lc_live_...",
    );
  });

  test("endpoint audit marks both provider routes session-or-API-key", async function () {
    const source = await Bun.file("worker/index.ts").text();
    const artifacts = generateApiArtifacts(source);
    const integrationRows = artifacts.auditRows.filter((row) =>
      row.path.includes("/analytics/integrations"),
    );

    expect(
      integrationRows.map((row) => ({
        method: row.method,
        auth: row.auth,
        documented: row.documented,
      })),
    ).toEqual([
      { method: "GET", auth: "Session or API key", documented: true },
      { method: "PUT", auth: "Session or API key", documented: true },
    ]);
  });

  test("docs check reports drift across OpenAPI, audit, and llms artifacts", async function () {
    const source = await Bun.file("worker/index.ts").text();
    const artifacts = generateApiArtifacts(source);
    const expectedFiles = generatedArtifactFiles(artifacts);

    const stale = await findStaleGeneratedArtifacts(
      artifacts,
      async function readGeneratedFile(path) {
        if (path === "public/openapi.json") return '{"stale":true}\n';
        return expectedFiles[path] ?? null;
      },
    );

    expect(stale).toEqual(["public/openapi.json"]);
    expect(Object.keys(expectedFiles)).toEqual([
      "public/openapi.json",
      "docs/api-endpoint-audit.md",
      "public/llms.txt",
    ]);
  });
});

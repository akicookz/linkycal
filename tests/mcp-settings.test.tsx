import { afterEach, describe, expect, test } from "bun:test";
import {
  screen,
  waitFor,
  waitForElementToBeRemoved,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ApiKeys from "../src/pages/ApiKeys";
import {
  installHttpCapture,
  type HttpCapture,
} from "./support/http-capture";
import { renderRoute } from "./support/render";

const PROJECT_ID = "project-mcp-settings";

interface SettingsApiOptions {
  emptyConnections?: boolean;
  rejectRevoke?: boolean;
  holdRevoke?: boolean;
}

interface InstalledSettingsApi {
  capture: HttpCapture;
  releaseRevoke(): void;
}

let http: HttpCapture | undefined;

afterEach(function restoreHttp() {
  http?.restore();
  http = undefined;
});

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function installSettingsApi(
  options: SettingsApiOptions = {},
): InstalledSettingsApi {
  let connectionRevoked = false;
  let apiKeyDeleted = false;
  let releaseRevoke = function noRevokeGate() {};
  const revokeGate = options.holdRevoke
    ? new Promise<void>(function waitForRelease(resolve) {
        releaseRevoke = resolve;
      })
    : Promise.resolve();

  http = installHttpCapture([
    {
      method: "GET",
      matches: (url) =>
        url.pathname ===
        `/api/projects/${PROJECT_ID}/mcp-connections`,
      respond: () =>
        json({
          connections:
            options.emptyConnections || connectionRevoked
              ? []
              : [
                  {
                    id: "connection-claude",
                    clientName: "Claude Desktop",
                    scopes: ["read", "write"],
                    createdAt: "2026-07-23T12:00:00.000Z",
                    authorizedBy: {
                      name: "Ada Admin",
                      email: "ada@example.com",
                    },
                  },
                ],
        }),
    },
    {
      method: "DELETE",
      matches: (url) =>
        url.pathname ===
        `/api/projects/${PROJECT_ID}/mcp-connections/connection-claude`,
      respond: async () => {
        await revokeGate;
        if (options.rejectRevoke) {
          return json({ error: "Connection could not be revoked" }, 500);
        }
        connectionRevoked = true;
        return json({ success: true });
      },
    },
    {
      method: "GET",
      matches: (url) =>
        url.pathname === `/api/projects/${PROJECT_ID}/api-keys`,
      respond: () =>
        json({
          apiKeys: apiKeyDeleted
            ? []
            : [
                {
                  id: "rest-key-1",
                  prefix: "lc_live_abcd1234",
                  label: "Backend",
                  lastUsedAt: null,
                  createdAt: "2026-07-20T12:00:00.000Z",
                },
              ],
        }),
    },
    {
      method: "POST",
      matches: (url) =>
        url.pathname === `/api/projects/${PROJECT_ID}/api-keys`,
      respond: () =>
        json(
          {
            apiKey: {
              id: "rest-key-created",
              key: "lc_live_secret_once",
              prefix: "lc_live_secret",
              label: "Automation",
            },
          },
          201,
        ),
    },
    {
      method: "DELETE",
      matches: (url) =>
        url.pathname ===
        `/api/projects/${PROJECT_ID}/api-keys/rest-key-1`,
      respond: () => {
        apiKeyDeleted = true;
        return json({ success: true });
      },
    },
  ]);

  return { capture: http, releaseRevoke };
}

function renderSettings(): void {
  renderRoute(<ApiKeys />, {
    route: `/app/projects/${PROJECT_ID}/api-keys`,
    routePattern: "/app/projects/:projectId/api-keys",
  });
}

describe("MCP and REST API settings", function () {
  test("connected clients show scope, date, authorizer, and an explicit revoke action", async function () {
    installSettingsApi();
    renderSettings();

    expect(await screen.findByText("Claude Desktop")).toBeTruthy();
    expect(screen.getByText("read, write")).toBeTruthy();
    expect(screen.getByText(/Connected Jul 23, 2026/)).toBeTruthy();
    expect(screen.getByText(/Ada Admin/)).toBeTruthy();
    expect(screen.getByText(/ada@example.com/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Revoke" })).toBeTruthy();
  });

  test("revoke keeps the connection visible until provider invalidation succeeds", async function () {
    const { capture, releaseRevoke } = installSettingsApi({ holdRevoke: true });
    const user = userEvent.setup();
    renderSettings();

    await user.click(await screen.findByRole("button", { name: "Revoke" }));
    await user.click(screen.getByRole("button", { name: "Revoke access" }));

    expect(screen.getByText("Claude Desktop")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Revoking..." }),
    ).toBeTruthy();
    const connectedCardTitle = screen.getByText("Connected MCP clients");
    releaseRevoke();

    await waitForElementToBeRemoved(connectedCardTitle);
    expect(
      capture.requestsFor(
        "DELETE",
        `/api/projects/${PROJECT_ID}/mcp-connections/connection-claude`,
      ),
    ).toHaveLength(1);
  });

  test("failed provider revocation leaves the row and shows the safe server error", async function () {
    installSettingsApi({ rejectRevoke: true });
    const user = userEvent.setup();
    renderSettings();

    await user.click(await screen.findByRole("button", { name: "Revoke" }));
    await user.click(screen.getByRole("button", { name: "Revoke access" }));

    expect(
      await screen.findByText("Connection could not be revoked"),
    ).toBeTruthy();
    expect(screen.getByText("Claude Desktop")).toBeTruthy();
  });

  test("projects without connections omit the client card but retain setup and API keys", async function () {
    installSettingsApi({ emptyConnections: true });
    renderSettings();

    expect(await screen.findByText("Backend")).toBeTruthy();
    expect(screen.queryByText("Connected MCP clients")).toBeNull();
    expect(
      screen.getByRole("region", { name: "Connect a client" }),
    ).toBeTruthy();
    expect(screen.getByText("API keys")).toBeTruthy();
    expect(screen.queryByText("REST API keys")).toBeNull();
  });

  test("all client tabs use OAuth-only setup at the canonical MCP URL", async function () {
    installSettingsApi({ emptyConnections: true });
    const user = userEvent.setup();
    renderSettings();
    const mcpUrl = `${window.location.origin}/api/mcp`;

    expect(
      await screen.findByText(
        `claude mcp add --transport http linkycal ${mcpUrl}`,
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "ChatGPT" }));
    expect(screen.getByText(/Apps & Connectors/)).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Cursor" }));
    expect(screen.getByText(/Tools & MCP/)).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Lovable" }));
    expect(screen.getByText(/Personal connectors/)).toBeTruthy();

    const instructions = within(
      screen.getByRole("region", { name: "Connect a client" }),
    );
    expect(instructions.getAllByText(mcpUrl).length).toBeGreaterThan(0);
    expect(instructions.queryByText(/YOUR_API_KEY/)).toBeNull();
    expect(instructions.queryByText(/Authorization: Bearer/)).toBeNull();
  });

  test("REST keys retain create, copy-once, list, delete, and bearer-header journeys", async function () {
    const { capture } = installSettingsApi();
    const user = userEvent.setup();
    renderSettings();

    expect(await screen.findByText("Backend")).toBeTruthy();
    expect(
      screen.getByText("Authorization: Bearer YOUR_API_KEY", { exact: false }),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Create API key" }));
    await user.type(screen.getByLabelText("Label (optional)"), "Automation");
    await user.click(screen.getByRole("button", { name: "Create key" }));
    expect(await screen.findByText("lc_live_secret_once")).toBeTruthy();
    expect(
      capture.requestsFor("POST", `/api/projects/${PROJECT_ID}/api-keys`)[0]
        ?.json,
    ).toEqual({ label: "Automation" });

    await user.click(screen.getByRole("button", { name: "Done" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete key" }));
    await waitFor(function keyWasDeleted() {
      expect(
        capture.requestsFor(
          "DELETE",
          `/api/projects/${PROJECT_ID}/api-keys/rest-key-1`,
        ),
      ).toHaveLength(1);
    });
  });
});

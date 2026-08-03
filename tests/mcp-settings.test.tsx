import { afterEach, describe, expect, test } from "bun:test";
import {
  screen,
  waitFor,
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
            connectionRevoked
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
  test("revoke refreshes the connection registry only after provider invalidation succeeds", async function () {
    const { capture, releaseRevoke } = installSettingsApi({ holdRevoke: true });
    const user = userEvent.setup();
    renderSettings();

    const revokeButton = await screen.findByRole("button", { name: "Revoke" });
    await user.click(revokeButton);
    await user.click(screen.getByRole("button", { name: "Revoke access" }));

    screen.getByRole("button", { name: "Revoking..." });
    expect(
      capture.requestsFor(
        "GET",
        `/api/projects/${PROJECT_ID}/mcp-connections`,
      ),
    ).toHaveLength(1);
    releaseRevoke();

    await waitFor(function connectionRegistryWasRefreshed() {
      expect(
        capture.requestsFor(
          "GET",
          `/api/projects/${PROJECT_ID}/mcp-connections`,
        ),
      ).toHaveLength(2);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      capture.requestsFor(
        "DELETE",
        `/api/projects/${PROJECT_ID}/mcp-connections/connection-claude`,
      ),
    ).toHaveLength(1);
  });

  test("failed provider revocation does not refresh the connection registry", async function () {
    const { capture } = installSettingsApi({ rejectRevoke: true });
    const user = userEvent.setup();
    renderSettings();

    await user.click(await screen.findByRole("button", { name: "Revoke" }));
    await user.click(screen.getByRole("button", { name: "Revoke access" }));

    await screen.findByRole("alert");
    expect(
      capture.requestsFor(
        "DELETE",
        `/api/projects/${PROJECT_ID}/mcp-connections/connection-claude`,
      ),
    ).toHaveLength(1);
    expect(
      capture.requestsFor(
        "GET",
        `/api/projects/${PROJECT_ID}/mcp-connections`,
      ),
    ).toHaveLength(1);
  });

  test("API key creation and deletion send the exact structured mutations", async function () {
    const { capture } = installSettingsApi();
    const user = userEvent.setup();
    renderSettings();

    await user.click(await screen.findByRole("button", { name: "Create API key" }));
    await user.type(screen.getByLabelText("Label (optional)"), "Automation");
    await user.click(screen.getByRole("button", { name: "Create key" }));
    await screen.findByRole("button", { name: "Done" });
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

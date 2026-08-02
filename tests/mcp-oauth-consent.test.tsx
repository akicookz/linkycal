import { afterEach, describe, expect, test } from "bun:test";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { authRedirectPath } from "../src/lib/auth-redirect";
import OAuthAuthorize from "../src/pages/OAuthAuthorize";
import {
  installHttpCapture,
  type HttpCapture,
} from "./support/http-capture";
import { renderRoute } from "./support/render";

const OAUTH_QUERY =
  "?client_id=claude-client&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback&response_type=code&code_challenge=challenge&code_challenge_method=S256&resource=https%3A%2F%2Flinkycal.com%2Fapi%2Fmcp&scope=read%20write%20offline_access&state=state-123";

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

function installConsentApi(
  options: { rejectContext?: boolean; holdApproval?: boolean } = {},
): { capture: HttpCapture; releaseApproval(): void } {
  let releaseApproval = function noApprovalGate() {};
  const approvalGate = options.holdApproval
    ? new Promise<void>(function waitForRelease(resolve) {
        releaseApproval = resolve;
      })
    : Promise.resolve();
  http = installHttpCapture([
    {
      method: "GET",
      matches: (url) =>
        url.pathname === "/api/oauth/mcp/authorization" &&
        url.search === OAUTH_QUERY,
      respond: () =>
        options.rejectContext
          ? json({ error: "provider detail that must stay hidden" }, 400)
          : json({
              authorization: {
                clientName: "Claude Desktop",
                scopes: ["read", "write", "offline_access"],
                projects: [
                  { id: "project-a", name: "Acme" },
                  { id: "project-b", name: "Studio" },
                ],
              },
            }),
    },
    {
      method: "POST",
      matches: (url) =>
        url.pathname === "/api/oauth/mcp/authorization" &&
        url.search === OAUTH_QUERY,
      respond: async (request) => {
        const decision = request.json as { decision: string };
        if (decision.decision === "approve") await approvalGate;
        return json({
          redirectTo:
            decision.decision === "deny"
              ? "https://client.example/callback?error=access_denied&state=state-123"
              : "https://client.example/callback?code=server-code&state=state-123",
        });
      },
    },
  ]);
  return { capture: http, releaseApproval };
}

function renderConsent(onRedirect: (url: string) => void): void {
  renderRoute(<OAuthAuthorize onRedirect={onRedirect} />, {
    route: `/oauth/authorize${OAUTH_QUERY}`,
    routePattern: "/oauth/authorize",
  });
}

describe("MCP OAuth consent", function () {
  test("renders the requesting client, eligible projects, and requested permissions", async function () {
    installConsentApi();
    renderConsent(function ignoreRedirect() {});

    expect(await screen.findByText("Claude Desktop")).toBeTruthy();
    expect(screen.getByRole("option", { name: "Acme" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Studio" })).toBeTruthy();
    expect(screen.getByText("Read your LinkyCal data")).toBeTruthy();
    expect(screen.getByText("Create and update LinkyCal data")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Allow access" }),
    ).toBeTruthy();
  });

  test("approval sends only the selected project and follows only the server redirect", async function () {
    const { capture, releaseApproval } = installConsentApi({
      holdApproval: true,
    });
    const redirects: string[] = [];
    renderConsent(function recordRedirect(url) {
      redirects.push(url);
    });

    fireEvent.change(await screen.findByLabelText("LinkyCal project"), {
      target: { value: "project-b" },
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Allow access" }));

    expect(
      await screen.findByRole("button", { name: "Allowing..." }),
    ).toBeTruthy();
    releaseApproval();
    await waitFor(function approvalCompleted() {
      expect(capture.requestsFor("POST", "/api/oauth/mcp/authorization"))
        .toHaveLength(1);
      expect(
        capture.requestsFor("POST", "/api/oauth/mcp/authorization")[0]?.json,
      ).toEqual({ decision: "approve", projectId: "project-b" });
      expect(redirects).toEqual([
        "https://client.example/callback?code=server-code&state=state-123",
      ]);
    });
  });

  test("cancel sends only denial and follows the validated server redirect", async function () {
    const { capture } = installConsentApi();
    const redirects: string[] = [];
    const user = userEvent.setup();
    renderConsent(function recordRedirect(url) {
      redirects.push(url);
    });

    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(function denialCompleted() {
      expect(
        capture.requestsFor("POST", "/api/oauth/mcp/authorization")[0]?.json,
      ).toEqual({ decision: "deny" });
      expect(redirects).toEqual([
        "https://client.example/callback?error=access_denied&state=state-123",
      ]);
    });
  });

  test("an invalid or expired request renders safe local guidance", async function () {
    installConsentApi({ rejectContext: true });
    renderConsent(function ignoreRedirect() {});

    expect(
      await screen.findByText("This authorization request is invalid or expired."),
    ).toBeTruthy();
    expect(
      screen.queryByText("provider detail that must stay hidden"),
    ).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  test("signed-out consent preserves path, query, redirect URI, state, resource, and PKCE", function () {
    const redirect = authRedirectPath(
      { pathname: "/oauth/authorize", search: OAUTH_QUERY },
      true,
    );
    const landing = new URL(redirect, "https://linkycal.com");

    expect(landing.searchParams.get("show_auth")).toBe("true");
    expect(landing.searchParams.get("redirect")).toBe(
      `/oauth/authorize${OAUTH_QUERY}`,
    );
  });
});

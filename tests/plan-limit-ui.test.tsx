import { afterEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Contacts from "../src/pages/Contacts";
import Team from "../src/pages/Team";
import {
  installHttpCapture,
  type HttpCapture,
} from "./support/http-capture";
import { renderRoute } from "./support/render";

const PROJECT_ID = "project-plan-limit";
let http: HttpCapture | undefined;

afterEach(function restoreHttp() {
  http?.restore();
  http = undefined;
});

describe("plan-limit UI across creation surfaces", () => {
  test("contact creation opens the shared upgrade dialog from the structured response", async () => {
    const capture = installHttpCapture([
      jsonRoute("GET", `/api/projects/${PROJECT_ID}/contacts`, {
        contacts: [],
        total: 0,
      }),
      jsonRoute("GET", `/api/projects/${PROJECT_ID}/tags`, { tags: [] }),
      jsonRoute("GET", `/api/projects/${PROJECT_ID}/contact-views`, {
        views: [],
      }),
      jsonRoute("POST", `/api/projects/${PROJECT_ID}/contacts`,
        entitlementFailure("contacts", 500, 500)),
      jsonRoute("GET", `/api/projects/${PROJECT_ID}/entitlements`, {
        billing: { canManageBilling: true, teamId: "team-plan-limit" },
        entitlements: {},
      }),
    ]);
    http = capture;
    renderRoute(<Contacts />, {
      route: `/app/projects/${PROJECT_ID}/contacts`,
      routePattern: "/app/projects/:projectId/contacts",
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Add Contact/i }));
    await user.type(screen.getByLabelText("Name *"), "Overflow Contact");
    await user.click(screen.getByRole("button", { name: /Create Contact/i }));

    await screen.findByRole("button", { name: /View plans/i });
    expect(
      capture.requestsFor("POST", `/api/projects/${PROJECT_ID}/contacts`)
        .map((request) => request.json),
    ).toEqual([{ name: "Overflow Contact" }]);
  });

  test("team invitation opens the same upgrade dialog instead of a generic error", async () => {
    const capture = installHttpCapture([
      jsonRoute("GET", `/api/projects/${PROJECT_ID}`, {
        project: {
          id: PROJECT_ID,
          name: "Plan Project",
          teamId: "team-plan-limit",
        },
      }),
      jsonRoute("GET", `/api/projects/${PROJECT_ID}/members`, {
        members: [],
        planLimits: { maxTeamMembers: -1 },
      }),
      jsonRoute("POST", "/api/teams/team-plan-limit/invites",
        entitlementFailure("teamMembers", 1, 1)),
      jsonRoute("GET", `/api/projects/${PROJECT_ID}/entitlements`, {
        billing: { canManageBilling: true, teamId: "team-plan-limit" },
        entitlements: {},
      }),
    ]);
    http = capture;
    renderRoute(<Team />, {
      route: `/app/projects/${PROJECT_ID}/team`,
      routePattern: "/app/projects/:projectId/team",
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /^Invite$/i }));
    await user.type(screen.getByLabelText("Email"), "teammate@example.com");
    await user.click(screen.getByRole("button", { name: /Send invite/i }));

    await screen.findByRole("button", { name: /View plans/i });
    await waitFor(function inviteWasSentOnce() {
      expect(
        capture.requestsFor("POST", "/api/teams/team-plan-limit/invites")
          .map((request) => request.json),
      ).toEqual([{
        email: "teammate@example.com",
        teamRole: "member",
        projectId: PROJECT_ID,
        projectRole: "editor",
      }]);
    });
  });
});

function jsonRoute(method: string, pathname: string, body: unknown) {
  return {
    method,
    matches: (url: URL) => url.pathname === pathname,
    respond: () => Response.json(body, {
      status: isFailure(body) ? 403 : 200,
    }),
  };
}

function entitlementFailure(
  entitlement: "contacts" | "teamMembers",
  used: number,
  limit: number,
) {
  return {
    error: "This workspace has reached its plan limit.",
    code: "plan_resource_limit_reached",
    entitlement,
    scope: entitlement === "contacts" ? "project" : "workspace",
    used,
    limit,
    hardLimit: limit,
    resetAt: null,
    recommendedPlan: "pro",
  };
}

function isFailure(body: unknown): boolean {
  return !!body && typeof body === "object" &&
    "code" in body &&
    (body as { code?: string }).code === "plan_resource_limit_reached";
}

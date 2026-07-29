import { afterEach, describe, expect, test } from "bun:test";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Settings from "../src/pages/Settings";
import {
  installHttpCapture,
  type HttpCapture,
} from "./support/http-capture";
import { renderRoute } from "./support/render";

const PROJECT_ID = "project-settings";
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

function installSettingsApi(input: {
  analytics: boolean;
  rejectProviderSave?: boolean;
}): HttpCapture {
  http = installHttpCapture([
    {
      method: "GET",
      matches: (url) => url.pathname === `/api/projects/${PROJECT_ID}`,
      respond: () => json({
        project: {
          id: PROJECT_ID,
          name: "Acme",
          slug: "acme",
          timezone: "America/New_York",
          settings: { theme: { primaryBg: "#1B4332" } },
          createdAt: "2026-07-01T00:00:00.000Z",
        },
      }),
    },
    {
      method: "GET",
      matches: (url) =>
        url.pathname ===
        `/api/projects/${PROJECT_ID}/calendar/connections`,
      respond: () => json({ connections: [] }),
    },
    {
      method: "GET",
      matches: (url) =>
        url.pathname === `/api/projects/${PROJECT_ID}/entitlements`,
      respond: () => json({
        planLimits: { analytics: input.analytics },
        billing: { canManageBilling: true },
      }),
    },
    {
      method: "GET",
      matches: (url) =>
        url.pathname ===
        `/api/projects/${PROJECT_ID}/analytics/integrations`,
      respond: () => json({
        integrations: [
          {
            provider: "ga4",
            enabled: true,
            measurementId: "G-ABCD1234",
          },
          {
            provider: "meta_pixel",
            enabled: false,
            pixelId: "998877665544",
          },
          {
            provider: "posthog",
            enabled: true,
            projectKey: "phc_abcdefghijklmnopqrstuvwxyz",
            host: "eu",
          },
        ],
      }),
    },
    {
      method: "PUT",
      matches: (url) =>
        url.pathname.startsWith(
          `/api/projects/${PROJECT_ID}/analytics/integrations/`,
        ),
      respond: (request) => {
        if (input.rejectProviderSave) {
          return json(
            { error: "Analytics requires a Pro or Business plan" },
            403,
          );
        }
        return json({
          integration: {
            provider: request.url.pathname.split("/").at(-1),
            ...(request.json as Record<string, unknown>),
          },
        });
      },
    },
  ]);
  return http;
}

function renderSettings(): void {
  renderRoute(<Settings />, {
    route: `/app/projects/${PROJECT_ID}/settings`,
    routePattern: "/app/projects/:projectId/settings",
  });
}

describe("analytics provider settings", function () {
  test("Pro renders local provider icons, normalized fields, toggle cards, and PostHog region", async function () {
    installSettingsApi({ analytics: true });
    renderSettings();

    expect(
      await screen.findByRole("img", { name: "Google Analytics" }),
    ).toBeTruthy();
    expect(screen.getByRole("img", { name: "Meta Pixel" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "PostHog" })).toBeTruthy();
    expect(
      (screen.getByLabelText(
        "Google Analytics measurement ID",
      ) as HTMLInputElement).value,
    ).toBe("G-ABCD1234");
    expect(
      (screen.getByLabelText("Meta Pixel ID") as HTMLInputElement).value,
    ).toBe("998877665544");
    expect(
      (screen.getByLabelText("PostHog project key") as HTMLInputElement).value,
    ).toBe("phc_abcdefghijklmnopqrstuvwxyz");
    expect(screen.getByText("Project key")).toBeTruthy();
    expect(
      screen
        .getByRole("switch", { name: "Enable Google Analytics" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen
        .getByRole("switch", { name: "Enable Meta Pixel" })
        .getAttribute("aria-checked"),
    ).toBe("false");
    expect(screen.getByLabelText("PostHog region").textContent).toContain(
      "🇪🇺 EU",
    );
    expect(
      screen.getByRole("button", { name: "Save Google Analytics" }),
    ).toBeTruthy();
  });

  test("saving one provider uses only its dedicated structured route", async function () {
    const capture = installSettingsApi({ analytics: true });
    const user = userEvent.setup();
    renderSettings();

    const input = await screen.findByLabelText(
      "Google Analytics measurement ID",
    );
    fireEvent.change(input, { target: { value: "G-NEW12345" } });
    await user.click(
      screen.getByRole("button", { name: "Save Google Analytics" }),
    );

    await waitFor(function providerWasSaved() {
      const requests = capture.requestsFor(
        "PUT",
        `/api/projects/${PROJECT_ID}/analytics/integrations/ga4`,
      );
      expect(requests).toHaveLength(1);
      expect(requests[0]?.json).toEqual({
        enabled: true,
        measurementId: "G-NEW12345",
      });
      expect(JSON.stringify(requests[0]?.json)).not.toContain("theme");
      expect(JSON.stringify(requests[0]?.json)).not.toContain("posthog");
    });
  });

  test("Free locks all provider controls, offers upgrade, and sends no integration request", async function () {
    const capture = installSettingsApi({ analytics: false });
    renderSettings();

    expect(await screen.findByText("Google Analytics")).toBeTruthy();
    expect(screen.getByText("Meta Pixel")).toBeTruthy();
    expect(screen.getByText("PostHog")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Upgrade to configure analytics" }),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Google Analytics measurement ID")).toBeNull();
    expect(
      capture.requestsFor(
        "GET",
        `/api/projects/${PROJECT_ID}/analytics/integrations`,
      ),
    ).toHaveLength(0);
    expect(
      capture.requests.filter((request) => request.method === "PUT"),
    ).toHaveLength(0);
  });

  test("server entitlement changes remain authoritative and surface a provider error", async function () {
    installSettingsApi({ analytics: true, rejectProviderSave: true });
    const user = userEvent.setup();
    renderSettings();

    await user.click(
      await screen.findByRole("button", {
        name: "Save Google Analytics",
      }),
    );

    expect(
      await screen.findByText("Analytics requires a Pro or Business plan"),
    ).toBeTruthy();
  });
});

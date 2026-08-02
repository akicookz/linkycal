import { afterEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";

import { UpgradeDialog } from "../src/components/UpgradeDialog";
import {
  EntitlementRequestError,
  readEntitlementError,
} from "../src/lib/entitlement-errors";
import { renderRoute } from "./support/render";

const originalFetch = globalThis.fetch;

afterEach(function restoreFetch() {
  globalThis.fetch = originalFetch;
});

describe("structured plan-limit UI", () => {
  test("parses the server contract without falling back to message matching", async function () {
    const response = new Response(JSON.stringify({
      error: "Cannot create a form because this workspace has reached its plan limit.",
      code: "plan_resource_limit_reached",
      entitlement: "forms",
      scope: "project",
      used: 3,
      limit: 3,
      hardLimit: 3,
      resetAt: null,
      recommendedPlan: "pro",
    }), { status: 403 });

    const error = await readEntitlementError(response);
    expect(error).toBeInstanceOf(EntitlementRequestError);
    expect(error?.decision).toMatchObject({
      key: "forms",
      kind: "resource",
      status: "blocked",
      used: 3,
      limit: 3,
      recommendedPlan: "pro",
    });
  });

  test("members without billing permission cannot open plan selection", async function () {
    globalThis.fetch = async function fetchEntitlements() {
      return Response.json({
        billing: {
          teamId: "team-1",
          ownerUserId: "owner-1",
          canManageBilling: false,
        },
        entitlements: {},
      });
    } as typeof fetch;

    renderRoute(
      <UpgradeDialog
        open
        onClose={() => undefined}
        projectId="project-1"
        actionLabel="create another form"
        decision={{
          key: "forms",
          kind: "resource",
          scope: "project",
          enabled: true,
          allowed: false,
          status: "blocked",
          used: 3,
          limit: 3,
          hardLimit: 3,
          periodStart: null,
          resetAt: null,
          recommendedPlan: "pro",
        }}
      />,
      { route: "/app/projects/project-1/forms", routePattern: "*" },
    );

    await waitFor(function billingActionIsDisabled() {
      const billingAction = screen.getByRole("button", {
        name: /View plans/i,
      }) as HTMLButtonElement;
      expect(billingAction.disabled).toBe(true);
    });
  });
});

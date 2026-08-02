import { describe, expect, test } from "bun:test";

import type { EntitlementDecision } from "../shared/plan-catalog";
import {
  applyEntitlementEnforcement,
  parseEntitlementModeConfig,
  resolveEnforcementMode,
} from "../worker/lib/entitlement-mode";

const blockedContact: EntitlementDecision = {
  key: "contacts",
  kind: "resource",
  scope: "project",
  enabled: true,
  allowed: false,
  status: "blocked",
  used: 500,
  limit: 500,
  hardLimit: 500,
  periodStart: null,
  resetAt: null,
  recommendedPlan: "pro",
};

describe("entitlement enforcement rollout", () => {
  test("global observe allows a denied decision and logs only structured metadata", () => {
    const logs: unknown[] = [];
    const result = applyEntitlementEnforcement(blockedContact, {
      env: { ENTITLEMENT_ENFORCEMENT_MODE: "observe" },
      workspace: { type: "team", id: "team-1" },
      projectId: "project-1",
      plan: "free",
      channel: "rest",
      operationId: "request-1",
      log: (entry) => logs.push(entry),
    });

    expect(result.allowed).toBe(true);
    expect(result.status).toBe("blocked");
    expect(logs).toEqual([{
      event: "entitlement_observed_denial",
      workspaceType: "team",
      workspaceId: "team-1",
      projectId: "project-1",
      plan: "free",
      key: "contacts",
      status: "blocked",
      used: 500,
      limit: 500,
      hardLimit: 500,
      channel: "rest",
      operationId: "request-1",
    }]);
  });

  test("global enforce blocks except for explicitly observed keys", () => {
    const env = {
      ENTITLEMENT_ENFORCEMENT_MODE: "enforce",
      ENTITLEMENT_OBSERVE_KEYS: "storageBytes,transactionalEmails",
    };
    expect(resolveEnforcementMode(env, "storageBytes")).toBe("observe");
    expect(resolveEnforcementMode(env, "transactionalEmails")).toBe("observe");
    expect(resolveEnforcementMode(env, "contacts")).toBe("enforce");
    expect(resolveEnforcementMode(env, "workflowExecutions")).toBe("enforce");
    expect(applyEntitlementEnforcement(blockedContact, {
      env,
      workspace: { type: "personal", id: "user-1" },
      projectId: "project-1",
      plan: "free",
      channel: "rest",
    }).allowed).toBe(false);
  });

  test("unknown mode and override keys fail configuration validation", () => {
    expect(() => parseEntitlementModeConfig({
      ENTITLEMENT_ENFORCEMENT_MODE: "sometimes",
    })).toThrow(/observe or enforce/i);
    expect(() => parseEntitlementModeConfig({
      ENTITLEMENT_ENFORCEMENT_MODE: "enforce",
      ENTITLEMENT_OBSERVE_KEYS: "storageBytes,secrets",
    })).toThrow(/secrets/);
  });
});

import { evaluateEntitlement } from "../../shared/entitlement-decision";
import type {
  EntitlementDecision,
  EntitlementKey,
} from "../../shared/plan-catalog";
import type { ProjectEntitlements } from "./entitlements";
import {
  applyEntitlementEnforcement,
  type EntitlementModeEnv,
} from "./entitlement-mode";

export function publicFeatureDecision(
  resolved: ProjectEntitlements,
  projectId: string,
  key: EntitlementKey,
  env: EntitlementModeEnv | undefined,
  channel: string,
): EntitlementDecision {
  const decision = evaluateEntitlement({
    plan: resolved.subscription.plan,
    key,
  });
  if (!env || decision.allowed) return decision;
  return applyEntitlementEnforcement(decision, {
    env,
    workspace: resolved.workspace,
    projectId,
    plan: resolved.subscription.plan,
    channel,
  });
}

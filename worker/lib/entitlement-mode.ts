import {
  ENTITLEMENT_METADATA,
  type EntitlementDecision,
  type EntitlementKey,
  type Plan,
} from "../../shared/plan-catalog";

export type EntitlementEnforcementMode = "observe" | "enforce";

export interface EntitlementModeEnv {
  ENTITLEMENT_ENFORCEMENT_MODE?: string;
  ENTITLEMENT_OBSERVE_KEYS?: string;
}

interface EntitlementLogWorkspace {
  type: "personal" | "team";
  id: string;
}

interface ApplyEntitlementEnforcementInput {
  env: EntitlementModeEnv;
  workspace: EntitlementLogWorkspace;
  projectId: string | null;
  plan: Plan;
  channel: string;
  operationId?: string;
  log?: (entry: Record<string, unknown>) => void;
}

interface EntitlementModeConfig {
  mode: EntitlementEnforcementMode;
  observeKeys: Set<EntitlementKey>;
}

export function parseEntitlementModeConfig(
  env: EntitlementModeEnv,
): EntitlementModeConfig {
  const configuredMode = env.ENTITLEMENT_ENFORCEMENT_MODE?.trim() || "enforce";
  if (configuredMode !== "observe" && configuredMode !== "enforce") {
    throw new Error(
      "ENTITLEMENT_ENFORCEMENT_MODE must be observe or enforce",
    );
  }

  const observeKeys = new Set<EntitlementKey>();
  for (const rawKey of (env.ENTITLEMENT_OBSERVE_KEYS ?? "").split(",")) {
    const key = rawKey.trim();
    if (!key) continue;
    if (!Object.prototype.hasOwnProperty.call(ENTITLEMENT_METADATA, key)) {
      throw new Error(`Unknown entitlement observe key: ${key}`);
    }
    observeKeys.add(key as EntitlementKey);
  }
  return { mode: configuredMode, observeKeys };
}

export function resolveEnforcementMode(
  env: EntitlementModeEnv,
  key: EntitlementKey,
): EntitlementEnforcementMode {
  if (key === "bookings") return "observe";
  const config = parseEntitlementModeConfig(env);
  return config.mode === "observe" || config.observeKeys.has(key)
    ? "observe"
    : "enforce";
}

export function applyEntitlementEnforcement(
  decision: EntitlementDecision,
  input: ApplyEntitlementEnforcementInput,
): EntitlementDecision {
  if (decision.allowed) return decision;
  const mode = resolveEnforcementMode(input.env, decision.key);
  const entry = {
    event: mode === "observe"
      ? "entitlement_observed_denial"
      : "entitlement_enforced_denial",
    workspaceType: input.workspace.type,
    workspaceId: input.workspace.id,
    projectId: input.projectId,
    plan: input.plan,
    key: decision.key,
    status: decision.status,
    used: decision.used,
    limit: decision.limit,
    hardLimit: decision.hardLimit,
    channel: input.channel,
    ...(input.operationId ? { operationId: input.operationId } : {}),
  };
  (input.log ?? console.info)(entry);
  return mode === "observe" ? { ...decision, allowed: true } : decision;
}

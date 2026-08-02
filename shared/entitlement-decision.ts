import {
  ENTITLEMENT_METADATA,
  PLAN_CATALOG,
  PLAN_ORDER,
  type EntitlementDecision,
  type EntitlementKey,
  type Plan,
} from "./plan-catalog";

interface EvaluateEntitlementInput {
  plan: Plan;
  key: EntitlementKey;
  used?: number;
  amount?: number;
  periodStart?: Date | string | null;
  resetAt?: Date | string | null;
}

export function evaluateEntitlement(
  input: EvaluateEntitlementInput,
): EntitlementDecision {
  const metadata = ENTITLEMENT_METADATA[input.key];
  const definition = PLAN_CATALOG[input.plan].entitlements[input.key];
  const used = input.used ?? 0;
  const amount = input.amount ?? 1;

  if (metadata.kind === "feature") {
    return {
      key: input.key,
      kind: metadata.kind,
      scope: metadata.scope,
      enabled: definition.enabled,
      allowed: definition.enabled,
      status: definition.enabled ? "available" : "unavailable",
      used: null,
      limit: definition.limit,
      hardLimit: definition.limit,
      periodStart: null,
      resetAt: null,
      recommendedPlan: definition.enabled
        ? null
        : findRecommendedPlan(input.plan, input.key, used, amount),
    };
  }

  if (definition.limit === null) {
    return {
      key: input.key,
      kind: metadata.kind,
      scope: metadata.scope,
      enabled: definition.enabled,
      allowed: true,
      status: "available",
      used,
      limit: null,
      hardLimit: null,
      periodStart: toIso(input.periodStart),
      resetAt: metadata.key === "storageBytes" ? null : toIso(input.resetAt),
      recommendedPlan: null,
    };
  }

  const limit = definition.limit;
  const hardLimit = metadata.grace
    ? limit + Math.ceil(limit / 10)
    : limit;
  const warningAt = Math.ceil((limit * 4) / 5);
  const allowed = definition.enabled && used + amount <= hardLimit;
  let status: EntitlementDecision["status"] = "available";

  if (!definition.enabled || !allowed || used >= hardLimit) {
    status = "blocked";
  } else if (metadata.grace && used >= limit) {
    status = "grace";
  } else if (used >= warningAt) {
    status = "warning";
  }

  return {
    key: input.key,
    kind: metadata.kind,
    scope: metadata.scope,
    enabled: definition.enabled,
    allowed,
    status,
    used,
    limit,
    hardLimit,
    periodStart: metadata.kind === "metered"
      ? toIso(input.periodStart)
      : null,
    resetAt:
      metadata.kind === "metered" && metadata.key !== "storageBytes"
        ? toIso(input.resetAt)
        : null,
    recommendedPlan: allowed
      ? null
      : findRecommendedPlan(input.plan, input.key, used, amount),
  };
}

function findRecommendedPlan(
  currentPlan: Plan,
  key: EntitlementKey,
  used: number,
  amount: number,
): "pro" | "business" | null {
  const currentIndex = PLAN_ORDER.indexOf(currentPlan);
  for (const candidate of PLAN_ORDER.slice(currentIndex + 1)) {
    if (canPlanAllow(candidate, key, used, amount)) {
      return candidate === "free" ? null : candidate;
    }
  }
  return null;
}

function canPlanAllow(
  plan: Plan,
  key: EntitlementKey,
  used: number,
  amount: number,
): boolean {
  const metadata = ENTITLEMENT_METADATA[key];
  const definition = PLAN_CATALOG[plan].entitlements[key];
  if (!definition.enabled) return false;
  if (metadata.kind === "feature" || definition.limit === null) return true;

  const hardLimit = metadata.grace
    ? definition.limit + Math.ceil(definition.limit / 10)
    : definition.limit;
  return used + amount <= hardLimit;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

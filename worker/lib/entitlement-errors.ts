import type {
  EntitlementDecision,
  EntitlementKey,
  EntitlementScope,
} from "../../shared/plan-catalog";

export interface EntitlementErrorBody {
  error: string;
  code:
    | "plan_feature_unavailable"
    | "plan_resource_limit_reached"
    | "plan_usage_limit_reached";
  entitlement: EntitlementKey;
  scope: EntitlementScope;
  used: number | null;
  limit: number | null;
  hardLimit: number | null;
  resetAt: string | null;
  recommendedPlan: "pro" | "business" | null;
}

export interface EntitlementHttpError {
  status: 403 | 429;
  body: EntitlementErrorBody;
  headers: Record<string, string>;
}

interface McpEntitlementError {
  isError: true;
  content: Array<{ type: "text"; text: string }>;
  structuredContent: { entitlementError: EntitlementErrorBody };
}

export function entitlementError(
  decision: EntitlementDecision,
  actionLabel: string,
): EntitlementHttpError {
  const isUsageLimit = decision.kind === "metered";
  const code = isUsageLimit
    ? "plan_usage_limit_reached"
    : decision.kind === "feature"
      ? "plan_feature_unavailable"
      : "plan_resource_limit_reached";
  const error = isUsageLimit
    ? `Cannot ${actionLabel} because this workspace has reached its monthly limit.`
    : decision.kind === "feature"
      ? `Cannot ${actionLabel} because this feature is not available on the workspace plan.`
      : `Cannot ${actionLabel} because this workspace has reached its plan limit.`;
  const body: EntitlementErrorBody = {
    error,
    code,
    entitlement: decision.key,
    scope: decision.scope,
    used: decision.used,
    limit: decision.limit,
    hardLimit: decision.hardLimit,
    resetAt: decision.resetAt,
    recommendedPlan: decision.recommendedPlan,
  };
  const headers: Record<string, string> = {};

  if (isUsageLimit && decision.resetAt && decision.key !== "storageBytes") {
    const retryAt = new Date(decision.resetAt).getTime();
    const seconds = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
    headers["Retry-After"] = String(seconds);
  }

  return {
    status: isUsageLimit ? 429 : 403,
    body,
    headers,
  };
}

export function mcpEntitlementError(
  decision: EntitlementDecision,
  actionLabel: string,
): McpEntitlementError {
  const { body } = entitlementError(decision, actionLabel);
  return {
    isError: true,
    content: [{ type: "text", text: body.error }],
    structuredContent: { entitlementError: body },
  };
}

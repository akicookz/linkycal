import {
  ENTITLEMENT_METADATA,
  type EntitlementDecision,
  type EntitlementKey,
  type EntitlementScope,
} from "../../shared/plan-catalog";

export type EntitlementErrorCode =
  | "plan_feature_unavailable"
  | "plan_resource_limit_reached"
  | "plan_usage_limit_reached";

export interface EntitlementErrorBody {
  error: string;
  code: EntitlementErrorCode;
  entitlement: EntitlementKey;
  scope: EntitlementScope;
  used: number | null;
  limit: number | null;
  hardLimit: number | null;
  resetAt: string | null;
  recommendedPlan: "pro" | "business" | null;
}

export class EntitlementRequestError extends Error {
  readonly body: EntitlementErrorBody;
  readonly decision: EntitlementDecision;

  constructor(body: EntitlementErrorBody) {
    super(body.error);
    this.name = "EntitlementRequestError";
    this.body = body;
    this.decision = decisionFromEntitlementError(body);
  }
}

export async function readEntitlementError(
  response: Response,
): Promise<EntitlementRequestError | null> {
  const body = await response.json().catch(() => null) as unknown;
  if (!isEntitlementErrorBody(body)) return null;
  return new EntitlementRequestError(body);
}

export function isEntitlementRequestError(
  error: unknown,
): error is EntitlementRequestError {
  return error instanceof EntitlementRequestError;
}

export function decisionFromEntitlementError(
  body: EntitlementErrorBody,
): EntitlementDecision {
  const metadata = ENTITLEMENT_METADATA[body.entitlement];
  return {
    key: body.entitlement,
    kind: metadata.kind,
    scope: body.scope,
    enabled: body.code !== "plan_feature_unavailable",
    allowed: false,
    status: body.code === "plan_feature_unavailable" ? "unavailable" : "blocked",
    used: body.used,
    limit: body.limit,
    hardLimit: body.hardLimit,
    periodStart: null,
    resetAt: body.resetAt,
    recommendedPlan: body.recommendedPlan,
  };
}

function isEntitlementErrorBody(value: unknown): value is EntitlementErrorBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<EntitlementErrorBody>;
  return (
    typeof body.error === "string" &&
    (body.code === "plan_feature_unavailable" ||
      body.code === "plan_resource_limit_reached" ||
      body.code === "plan_usage_limit_reached") &&
    typeof body.entitlement === "string" &&
    Object.prototype.hasOwnProperty.call(ENTITLEMENT_METADATA, body.entitlement) &&
    (body.scope === "project" || body.scope === "workspace")
  );
}

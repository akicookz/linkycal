import { Check, Minus } from "lucide-react";

import {
  ENTITLEMENT_METADATA,
  PLAN_CATALOG,
  PLAN_COMPARISON_GROUPS,
  PLAN_ORDER,
  type EntitlementKey,
  type PlanEntitlementValue,
} from "../../shared/plan-catalog";

export function PlanComparison() {
  return (
    <div className="space-y-6">
      {PLAN_COMPARISON_GROUPS.map(function comparisonGroup(group) {
        return (
          <section
            key={group.id}
            aria-labelledby={`pricing-${group.id}`}
            className="rounded-[20px] bg-white/75 p-4 shadow-[0_18px_50px_-40px_rgba(27,67,50,0.45)] sm:p-6"
          >
            <h2
              id={`pricing-${group.id}`}
              className="mb-4 text-lg font-semibold text-foreground"
            >
              {group.label}
            </h2>
            <div className="space-y-3">
              {group.keys.map(function comparisonRow(key) {
                return (
                  <div
                    key={key}
                    className="grid gap-2 rounded-[16px] bg-muted/45 px-4 py-3 md:grid-cols-[minmax(13rem,1.4fr)_repeat(3,minmax(7rem,1fr))] md:items-center"
                  >
                    <p className="text-sm font-medium">
                      {ENTITLEMENT_METADATA[key].label}
                    </p>
                    <div className="grid grid-cols-3 gap-2 md:contents">
                      {PLAN_ORDER.map(function planValue(plan) {
                        const value = PLAN_CATALOG[plan].entitlements[key];
                        return (
                          <div key={plan} className="min-w-0">
                            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground md:hidden">
                              {PLAN_CATALOG[plan].name}
                            </p>
                            <PlanValue entitlement={key} value={value} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function PlanValue({
  entitlement,
  value,
}: {
  entitlement: EntitlementKey;
  value: PlanEntitlementValue;
}) {
  if (!value.enabled) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <Minus className="size-3.5" />
        Not included
      </span>
    );
  }
  if (ENTITLEMENT_METADATA[entitlement].unit === "boolean") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-brand">
        <Check className="size-3.5" />
        Included
      </span>
    );
  }
  return (
    <span className="text-sm font-semibold tabular-nums">
      {formatPlanValue(entitlement, value)}
    </span>
  );
}

export function formatPlanValue(
  entitlement: EntitlementKey,
  value: PlanEntitlementValue,
): string {
  if (!value.enabled) return "Not included";
  if (value.limit === null) return "Unlimited";
  const metadata = ENTITLEMENT_METADATA[entitlement];
  if (metadata.unit === "bytes") {
    if (value.limit >= 1_000_000_000) return `${value.limit / 1_000_000_000} GB`;
    return `${value.limit / 1_000_000} MB`;
  }
  if (metadata.unit === "months") return `${value.limit} months`;
  return value.limit.toLocaleString("en-US");
}

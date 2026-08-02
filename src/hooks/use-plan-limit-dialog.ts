import { useState } from "react";

import type { EntitlementDecision } from "../../shared/plan-catalog";
import { isEntitlementRequestError } from "@/lib/entitlement-errors";

interface PlanLimitDialogState {
  actionLabel: string;
  decision: EntitlementDecision;
}

export function usePlanLimitDialog() {
  const [state, setState] = useState<PlanLimitDialogState | null>(null);

  function handleEntitlementError(error: unknown, actionLabel: string): boolean {
    if (!isEntitlementRequestError(error)) return false;
    setState({ actionLabel, decision: error.decision });
    return true;
  }

  function closePlanLimitDialog() {
    setState(null);
  }

  return {
    state,
    open: state !== null,
    handleEntitlementError,
    closePlanLimitDialog,
  };
}

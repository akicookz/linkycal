import { useNavigate } from "react-router-dom";
import { CreditCard, Loader, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useEntitlements } from "@/hooks/use-entitlements";
import { UsageMeter } from "@/components/UsageMeter";
import {
  ENTITLEMENT_METADATA,
  PLAN_CATALOG,
  type EntitlementDecision,
  type EntitlementKey,
} from "../../shared/plan-catalog";

interface UpgradeDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  actionLabel: string;
  decision?: EntitlementDecision;
  entitlement?: EntitlementKey;
}

export function UpgradeDialog({
  open,
  onClose,
  projectId,
  actionLabel,
  decision: decisionOverride,
  entitlement,
}: UpgradeDialogProps) {
  const navigate = useNavigate();
  const { data: entitlements, isLoading } = useEntitlements(projectId);

  const canManageBilling = entitlements?.billing.canManageBilling === true;
  const billingHref = entitlements?.billing.teamId
    ? `/app/account/billing?teamId=${entitlements.billing.teamId}`
    : "/app/account/billing";
  const decision = decisionOverride ?? (entitlement
    ? entitlements?.entitlements?.[entitlement]
    : undefined);
  const label = decision ? singularLabel(decision.key) : "Plan";
  const recommendedPlan = decision?.recommendedPlan
    ? PLAN_CATALOG[decision.recommendedPlan]
    : null;
  const recommendedValue = decision && recommendedPlan
    ? recommendedPlan.entitlements[decision.key]
    : null;
  const title = decision?.status === "unavailable"
    ? `${label} requires an upgrade`
    : `${label} limit reached`;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="mx-auto w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center mb-2">
            <LockKeyhole className="h-5 w-5 text-amber-600" />
          </div>
          <DialogTitle className="text-center">{title}</DialogTitle>
          <DialogDescription className="text-center">
            You can’t {actionLabel} on the current workspace plan.
          </DialogDescription>
        </DialogHeader>
        {decision?.used != null && decision.limit != null ? (
          <UsageMeter
            used={decision.used}
            limit={decision.limit}
            hardLimit={decision.hardLimit}
          />
        ) : null}
        <div className="rounded-[16px] bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          {recommendedPlan ? (
            <p>
              {recommendedPlan.name}{" "}
              {recommendedValue?.limit == null
                ? `includes unlimited ${label.toLowerCase()}.`
                : `raises this limit to ${recommendedValue.limit.toLocaleString("en-US")}.`}
            </p>
          ) : (
            <p>
              No higher self-serve plan increases this limit. Reduce usage or
              wait until the next usage period.
            </p>
          )}
          {decision?.resetAt ? (
            <p className="mt-1">
              Usage resets {new Date(decision.resetAt).toLocaleDateString()}.
            </p>
          ) : null}
          {entitlements && !canManageBilling ? (
            <p className="mt-1 font-medium text-foreground">
              Ask a team owner or admin to manage billing.
            </p>
          ) : null}
        </div>
        <DialogFooter className="sm:justify-center gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={isLoading || !canManageBilling}
            onClick={() => {
              onClose();
              navigate(billingHref);
            }}
          >
            {isLoading ? (
              <Loader className="h-4 w-4 animate-spin" />
            ) : canManageBilling ? (
              <CreditCard className="h-4 w-4" />
            ) : (
              <LockKeyhole className="h-4 w-4" />
            )}
            View plans
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function singularLabel(key: EntitlementKey): string {
  const labels: Partial<Record<EntitlementKey, string>> = {
    forms: "Form",
    eventTypes: "Event type",
    contacts: "Contact",
    workflows: "Workflow",
    projects: "Project",
    calendarConnections: "Calendar connection",
    formResponses: "Form response",
    workflowExecutions: "Workflow execution",
    transactionalEmails: "Transactional email",
    integrationRequests: "API + MCP request",
    enrichments: "Enrichment",
    storageBytes: "Storage",
  };
  return labels[key] ?? ENTITLEMENT_METADATA[key].label;
}

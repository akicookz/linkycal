import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, Loader, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface UpgradeDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  feature: string;
  description: string;
}

interface ProjectEntitlements {
  billing: {
    teamId: string | null;
    canManageBilling: boolean;
  };
}

export function UpgradeDialog({ open, onClose, projectId, feature: _feature, description }: UpgradeDialogProps) {
  const navigate = useNavigate();
  const { data: entitlements, isLoading } = useQuery<ProjectEntitlements>({
    queryKey: ["projects", projectId, "entitlements"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/entitlements`);
      if (!res.ok) throw new Error("Failed to fetch entitlements");
      return res.json();
    },
    enabled: open && !!projectId,
  });

  const canManageBilling = entitlements?.billing.canManageBilling === true;
  const billingHref = entitlements?.billing.teamId
    ? `/app/account/billing?teamId=${entitlements.billing.teamId}`
    : "/app/account/billing";
  const dialogDescription =
    entitlements && !canManageBilling
      ? `${description} Ask a team owner or admin to manage billing.`
      : description;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="mx-auto w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center mb-2">
            <Sparkles className="h-5 w-5 text-amber-600" />
          </div>
          <DialogTitle className="text-center">Upgrade your plan</DialogTitle>
          <DialogDescription className="text-center">
            {dialogDescription}
          </DialogDescription>
        </DialogHeader>
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
              <Sparkles className="h-4 w-4" />
            )}
            View Plans
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

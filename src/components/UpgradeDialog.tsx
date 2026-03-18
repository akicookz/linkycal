import { useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
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

export function UpgradeDialog({ open, onClose, projectId, feature: _feature, description }: UpgradeDialogProps) {
  const navigate = useNavigate();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="mx-auto w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center mb-2">
            <Sparkles className="h-5 w-5 text-amber-600" />
          </div>
          <DialogTitle className="text-center">Upgrade your plan</DialogTitle>
          <DialogDescription className="text-center">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onClose();
              navigate("/app/account/billing");
            }}
          >
            View Plans
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

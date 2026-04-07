import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Play, Loader } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Types ───────────────────────────────────────────────────────────────────

type TriggerType =
  | "form_submitted"
  | "booking_created"
  | "booking_pending"
  | "booking_confirmed"
  | "booking_cancelled"
  | "tag_added"
  | "manual";

interface ContactItem {
  id: string;
  name: string;
  email: string | null;
}

interface TagItem {
  id: string;
  name: string;
  color: string;
}

interface WorkflowRunDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  workflowId: string;
  trigger: TriggerType;
  workflowName: string;
  onSuccess?: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function WorkflowRunDialog({
  open,
  onOpenChange,
  projectId,
  workflowId,
  trigger,
  workflowName,
  onSuccess,
}: WorkflowRunDialogProps) {
  const [contactId, setContactId] = useState("");
  const [tagId, setTagId] = useState("");

  const { data: contacts = [] } = useQuery<ContactItem[]>({
    queryKey: ["projects", projectId, "contacts", "workflow-runner"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/contacts`);
      if (!res.ok) throw new Error("Failed to fetch contacts");
      const data = await res.json();
      return (data.contacts ?? []) as ContactItem[];
    },
    enabled: !!projectId && open,
  });

  const { data: tags = [] } = useQuery<TagItem[]>({
    queryKey: ["projects", projectId, "tags"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/tags`);
      if (!res.ok) throw new Error("Failed to fetch tags");
      const data = await res.json();
      return data.tags ?? [];
    },
    enabled: !!projectId && open && trigger === "tag_added",
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, string> = { contactId };
      if (trigger === "tag_added" && tagId) {
        body.tagId = tagId;
      }
      const res = await fetch(
        `/api/projects/${projectId}/workflows/${workflowId}/test`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to run workflow");
      }
      return res.json();
    },
    onSuccess: () => {
      onSuccess?.();
      onOpenChange(false);
      setContactId("");
      setTagId("");
    },
  });

  const canSubmit =
    !!contactId && (trigger !== "tag_added" || !!tagId) && !runMutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val) {
          setContactId("");
          setTagId("");
          runMutation.reset();
        }
        onOpenChange(val);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Test Run</DialogTitle>
          <DialogDescription>
            Execute <span className="font-medium text-foreground">{workflowName}</span>{" "}
            against a contact to test it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="run-contact">Contact</Label>
            <Select value={contactId} onValueChange={setContactId}>
              <SelectTrigger id="run-contact">
                <SelectValue placeholder="Select a contact" />
              </SelectTrigger>
              <SelectContent>
                {contacts.length === 0 && (
                  <SelectItem value="_none" disabled>
                    No contacts available
                  </SelectItem>
                )}
                {contacts.map((contact) => (
                  <SelectItem key={contact.id} value={contact.id}>
                    {contact.name}
                    {contact.email ? ` (${contact.email})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              The workflow will run using this contact's data as context.
            </p>
          </div>

          {trigger === "tag_added" && (
            <div className="space-y-2">
              <Label htmlFor="run-tag">Tag</Label>
              <Select value={tagId} onValueChange={setTagId}>
                <SelectTrigger id="run-tag">
                  <SelectValue placeholder="Select a tag" />
                </SelectTrigger>
                <SelectContent>
                  {tags.length === 0 && (
                    <SelectItem value="_none" disabled>
                      No tags available
                    </SelectItem>
                  )}
                  {tags.map((tag) => (
                    <SelectItem key={tag.id} value={tag.id}>
                      {tag.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {runMutation.isError && (
            <p className="text-sm text-destructive">
              {runMutation.error?.message ?? "Failed to run workflow."}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={runMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => runMutation.mutate()}
            disabled={!canSubmit}
          >
            {runMutation.isPending ? (
              <Loader className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Run Workflow
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

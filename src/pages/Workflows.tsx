import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Plus,
  Zap,
  Trash2,
  Loader,
  AlertCircle,
  FileText,
  CalendarPlus,
  CalendarX,
  CalendarClock,
  CalendarCheck,
  Tag,
  Play,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { queryClient } from "@/lib/query-client";
import {
  workflowTemplates,
  type WorkflowTemplateDefinition,
  type WorkflowTriggerType,
} from "@/lib/workflow-templates";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Workflow {
  id: string;
  projectId: string;
  name: string;
  trigger: WorkflowTriggerType;
  status: "active" | "draft";
  createdAt: string;
  updatedAt: string;
}

interface CreateWorkflowData {
  name: string;
  trigger: Workflow["trigger"];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TRIGGER_OPTIONS = [
  { value: "form_submitted", label: "Form Submitted", icon: FileText },
  { value: "booking_created", label: "Booking Created", icon: CalendarPlus },
  { value: "booking_pending", label: "Booking Pending", icon: CalendarClock },
  { value: "booking_confirmed", label: "Booking Confirmed", icon: CalendarCheck },
  { value: "booking_cancelled", label: "Booking Cancelled", icon: CalendarX },
  { value: "tag_added", label: "Tag Added", icon: Tag },
  { value: "manual", label: "Manual", icon: Play },
] as const;

function getTriggerMeta(trigger: Workflow["trigger"]) {
  return TRIGGER_OPTIONS.find((t) => t.value === trigger) ?? TRIGGER_OPTIONS[0];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const defaultFormData: CreateWorkflowData = {
  name: "",
  trigger: "form_submitted",
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function Workflows() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<CreateWorkflowData>(defaultFormData);

  // ─── Queries ─────────────────────────────────────────────────────────────

  const {
    data: workflowsData,
    isLoading,
    isError,
  } = useQuery<Workflow[]>({
    queryKey: ["projects", projectId, "workflows"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/workflows`);
      if (!res.ok) throw new Error("Failed to fetch workflows");
      const data = await res.json();
      return data.workflows ?? [];
    },
    enabled: !!projectId,
  });

  const workflows = workflowsData ?? [];

  // ─── Mutations ───────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (data: CreateWorkflowData) => {
      const res = await fetch(`/api/projects/${projectId}/workflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create workflow");
      }
      const json = await res.json();
      return json;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "workflows"] });
      closeCreateDialog();
      if (data?.workflow?.id) {
        navigate(`/app/projects/${projectId}/workflows/${data.workflow.id}`);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/projects/${projectId}/workflows/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete workflow");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "workflows"] });
      setDeleteDialogOpen(false);
      setDeletingId(null);
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "draft" | "active" }) => {
      const res = await fetch(`/api/projects/${projectId}/workflows/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update workflow status");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "workflows"] });
    },
  });

  const createFromTemplateMutation = useMutation({
    mutationFn: async (template: WorkflowTemplateDefinition) => {
      const createRes = await fetch(`/api/projects/${projectId}/workflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: template.name,
          trigger: template.trigger,
        }),
      });
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create workflow from template");
      }

      const createJson = await createRes.json();
      const workflow = createJson.workflow as Workflow | undefined;
      if (!workflow?.id) {
        throw new Error("Workflow template creation did not return an ID");
      }

      for (let index = 0; index < template.steps.length; index++) {
        const step = template.steps[index];
        const stepRes = await fetch(
          `/api/projects/${projectId}/workflows/${workflow.id}/steps`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: step.type,
              sortOrder: index,
              config: step.config,
            }),
          },
        );

        if (!stepRes.ok) {
          const err = await stepRes.json().catch(() => ({}));
          throw new Error(err.error || `Failed to create step ${index + 1}`);
        }
      }

      return workflow;
    },
    onSuccess: (workflow) => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "workflows"] });
      setTemplateDialogOpen(false);
      navigate(`/app/projects/${projectId}/workflows/${workflow.id}`);
    },
  });

  // ─── Handlers ────────────────────────────────────────────────────────────

  function openCreateDialog() {
    setFormData(defaultFormData);
    setCreateDialogOpen(true);
  }

  function closeCreateDialog() {
    setCreateDialogOpen(false);
    setFormData(defaultFormData);
  }



  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate(formData);
  }

  return (
    <div>
      <PageHeader title="Workflows" description="Automate actions based on triggers">
        <Button onClick={() => setTemplateDialogOpen(true)} variant="outline" size="sm">
          <Zap className="h-4 w-4" />
          Use Template
        </Button>
        <Button onClick={openCreateDialog} size="sm">
          <Plus className="h-4 w-4" />
          New Workflow
        </Button>
      </PageHeader>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  <Skeleton className="h-5 w-36" />
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-5 w-14" />
                  </div>
                  <Skeleton className="h-4 w-28" />
                  <div className="flex justify-between pt-2">
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="h-8 w-8" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed py-16">
          <AlertCircle className="h-10 w-10 text-destructive mb-4" />
          <p className="text-sm font-medium text-foreground mb-1">
            Failed to load workflows
          </p>
          <p className="text-sm text-muted-foreground">
            Please try refreshing the page.
          </p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !isError && workflows.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed py-16">
          <Zap className="h-10 w-10 text-muted-foreground mb-4" />
          <p className="text-sm font-medium text-foreground mb-1">
            No workflows yet
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            Create a workflow to automate emails, webhooks, and more.
          </p>
          <div className="flex items-center gap-2">
            <Button onClick={() => setTemplateDialogOpen(true)} variant="outline" size="sm">
              <Zap className="h-4 w-4" />
              Use Template
            </Button>
            <Button onClick={openCreateDialog} size="sm">
              <Plus className="h-4 w-4" />
              New Workflow
            </Button>
          </div>
        </div>
      )}

      {/* Workflows Grid */}
      {!isLoading && !isError && workflows.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workflows.map((workflow) => {
            const triggerMeta = getTriggerMeta(workflow.trigger);
            const TriggerIcon = triggerMeta.icon;

            return (
              <Card
                key={workflow.id}
                className="relative transition-all cursor-pointer hover:shadow-md"
                onClick={() => navigate(`/app/projects/${projectId}/workflows/${workflow.id}`)}
              >
                <CardContent>
                  {/* Name + status toggle */}
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-sm font-semibold text-foreground truncate pr-2">
                      {workflow.name}
                    </h3>
                    <Switch
                      checked={workflow.status === "active"}
                      onCheckedChange={(checked) =>
                        toggleStatusMutation.mutate({
                          id: workflow.id,
                          status: checked ? "active" : "draft",
                        })
                      }
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>

                  {/* Badges */}
                  <div className="flex items-center gap-1.5 mb-3">
                    <Badge
                      variant={workflow.status === "active" ? "success" : "secondary"}
                      className="text-[11px] px-2 py-0.5"
                    >
                      {workflow.status}
                    </Badge>
                    <Badge variant="outline" className="text-[11px] px-2 py-0.5 gap-1">
                      <TriggerIcon className="h-3 w-3" />
                      {triggerMeta.label}
                    </Badge>
                  </div>

                  {/* Created date */}
                  <p className="text-xs text-muted-foreground">
                    Created {formatDate(workflow.createdAt)}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Workflow Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Workflow</DialogTitle>
            <DialogDescription>
              Create a new automation workflow triggered by an event.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="workflow-name">Name</Label>
              <Input
                id="workflow-name"
                placeholder="e.g. Send welcome email"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="workflow-trigger">Trigger</Label>
              <Select
                value={formData.trigger}
                onValueChange={(val) =>
                  setFormData((prev) => ({
                    ...prev,
                    trigger: val as Workflow["trigger"],
                  }))
                }
              >
                <SelectTrigger id="workflow-trigger">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <span className="flex items-center gap-2">
                        <opt.icon className="h-3.5 w-3.5" />
                        {opt.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                The event that starts this workflow.
              </p>
            </div>

            {createMutation.isError && (
              <p className="text-sm text-destructive">
                {createMutation.error?.message ?? "Something went wrong."}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={closeCreateDialog}
                disabled={createMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <Loader className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Create Workflow
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Workflow Templates Dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Workflow Templates</DialogTitle>
            <DialogDescription>
              Start from a common workflow and customize the steps afterward.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {workflowTemplates.map((template) => {
              const triggerMeta = getTriggerMeta(template.trigger);
              const TriggerIcon = triggerMeta.icon;

              return (
                <Card key={template.id}>
                  <CardContent className="space-y-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">
                          {template.name}
                        </h3>
                        <Badge variant="outline" className="gap-1">
                          <TriggerIcon className="h-3 w-3" />
                          {triggerMeta.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {template.description}
                      </p>
                    </div>

                    <p className="text-[11px] text-muted-foreground">
                      {template.steps.length} step{template.steps.length === 1 ? "" : "s"}
                    </p>

                    <Button
                      size="sm"
                      onClick={() => createFromTemplateMutation.mutate(template)}
                      disabled={createFromTemplateMutation.isPending}
                    >
                      {createFromTemplateMutation.isPending ? (
                        <Loader className="h-4 w-4 animate-spin" />
                      ) : (
                        <Zap className="h-4 w-4" />
                      )}
                      Use Template
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {createFromTemplateMutation.isError && (
            <p className="text-sm text-destructive">
              {createFromTemplateMutation.error?.message ?? "Failed to create template workflow."}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setTemplateDialogOpen(false)}
              disabled={createFromTemplateMutation.isPending}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Workflow</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this workflow? This action cannot be
              undone and will remove all associated steps and run history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setDeletingId(null);
              }}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deletingId && deleteMutation.mutate(deletingId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

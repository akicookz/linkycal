import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowDown,
  Plus,
  Trash2,
  Loader,
  AlertCircle,
  Mail,
  Tag,
  Clock,
  GitBranch,
  Globe,
  UserCog,
  Zap,
  FileText,
  CalendarPlus,
  CalendarX,
  Play,
  Settings2,
  CheckCircle2,
  XCircle,
  RotateCw,
  RefreshCw,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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

// ─── Types ───────────────────────────────────────────────────────────────────

type TriggerType = "form_submitted" | "booking_created" | "booking_cancelled" | "tag_added" | "manual";
type StepType = "send_email" | "add_tag" | "remove_tag" | "wait" | "condition" | "webhook" | "update_contact";
type RunStatus = "running" | "completed" | "failed";

interface WorkflowStep {
  id: string;
  workflowId: string;
  sortOrder: number;
  type: StepType;
  config: Record<string, unknown> | null;
  createdAt: string;
}

interface WorkflowRun {
  id: string;
  workflowId: string;
  triggerId: string | null;
  status: RunStatus;
  currentStepIndex: number;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}

interface FullWorkflow {
  id: string;
  projectId: string;
  name: string;
  trigger: TriggerType;
  status: "active" | "draft";
  createdAt: string;
  updatedAt: string;
  steps: WorkflowStep[];
}

interface TagItem {
  id: string;
  name: string;
  color: string;
}

// ─── Step Type Definitions ───────────────────────────────────────────────────

const STEP_TYPES = [
  { type: "send_email" as const, label: "Send Email", icon: Mail },
  { type: "add_tag" as const, label: "Add Tag", icon: Tag },
  { type: "remove_tag" as const, label: "Remove Tag", icon: Tag },
  { type: "wait" as const, label: "Wait", icon: Clock },
  { type: "condition" as const, label: "Condition", icon: GitBranch },
  { type: "webhook" as const, label: "Webhook", icon: Globe },
  { type: "update_contact" as const, label: "Update Contact", icon: UserCog },
];

const TRIGGER_META: Record<TriggerType, { label: string; icon: typeof Zap }> = {
  form_submitted: { label: "Form Submitted", icon: FileText },
  booking_created: { label: "Booking Created", icon: CalendarPlus },
  booking_cancelled: { label: "Booking Cancelled", icon: CalendarX },
  tag_added: { label: "Tag Added", icon: Tag },
  manual: { label: "Manual", icon: Play },
};

function getStepMeta(type: StepType) {
  return STEP_TYPES.find((s) => s.type === type) ?? STEP_TYPES[0];
}

function getConfigSummary(type: StepType, config: Record<string, unknown> | null): string {
  if (!config) return "Not configured";
  switch (type) {
    case "send_email": {
      const subject = config.subject as string | undefined;
      return subject ? `Subject: ${subject}` : "Email not configured";
    }
    case "add_tag":
    case "remove_tag": {
      const tagName = config.tagName as string | undefined;
      return tagName ? tagName : "Tag not selected";
    }
    case "wait": {
      const duration = config.duration as number | undefined;
      const unit = (config.unit as string) ?? "minutes";
      return duration ? `${duration} ${unit}` : "Duration not set";
    }
    case "condition": {
      const field = config.field as string | undefined;
      return field ? `If ${field} ...` : "Condition not set";
    }
    case "webhook": {
      const url = config.url as string | undefined;
      const method = (config.method as string) ?? "POST";
      return url ? `${method} ${url}` : "URL not set";
    }
    case "update_contact": {
      const field = config.field as string | undefined;
      return field ? `Update ${field}` : "Field not set";
    }
    default:
      return "Not configured";
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function WorkflowBuilder() {
  const { projectId, workflowId } = useParams<{
    projectId: string;
    workflowId: string;
  }>();
  const navigate = useNavigate();

  const [editingName, setEditingName] = useState("");
  const [addStepDialogOpen, setAddStepDialogOpen] = useState(false);
  const [selectedStepType, setSelectedStepType] = useState<StepType | null>(null);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [stepConfig, setStepConfig] = useState<Record<string, unknown>>({});
  const [deleteStepId, setDeleteStepId] = useState<string | null>(null);
  const [insertIndex, setInsertIndex] = useState<number | null>(null);

  // ─── Fetch workflow ─────────────────────────────────────────────────────

  const {
    data: workflowData,
    isLoading,
    isError,
  } = useQuery<FullWorkflow>({
    queryKey: ["projects", projectId, "workflows", workflowId],
    queryFn: async () => {
      const res = await fetch(
        `/api/projects/${projectId}/workflows/${workflowId}`,
      );
      if (!res.ok) throw new Error("Failed to fetch workflow");
      const data = await res.json();
      return data.workflow ?? data;
    },
    enabled: !!projectId && !!workflowId,
  });

  const workflow = workflowData;
  const steps = workflow?.steps ?? [];

  // ─── Fetch tags (for tag step config) ───────────────────────────────────

  const { data: tags = [] } = useQuery<TagItem[]>({
    queryKey: ["projects", projectId, "tags"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/tags`);
      if (!res.ok) throw new Error("Failed to fetch tags");
      const data = await res.json();
      return data.tags ?? [];
    },
    enabled: !!projectId,
  });

  // tags is directly available from the query above

  // ─── Fetch runs ─────────────────────────────────────────────────────────

  const { data: runs = [] } = useQuery<WorkflowRun[]>({
    queryKey: ["projects", projectId, "workflows", workflowId, "runs"],
    queryFn: async () => {
      const res = await fetch(
        `/api/projects/${projectId}/workflows/${workflowId}/runs?limit=50`,
      );
      if (!res.ok) throw new Error("Failed to fetch runs");
      const data = await res.json();
      return data.runs ?? [];
    },
    enabled: !!projectId && !!workflowId,
  });

  // runs is directly available from the query above

  // Sync editing name
  useEffect(() => {
    if (workflow) {
      setEditingName(workflow.name);
    }
  }, [workflow]);

  // ─── Mutations ───────────────────────────────────────────────────────────

  const invalidateWorkflow = () => {
    queryClient.invalidateQueries({
      queryKey: ["projects", projectId, "workflows", workflowId],
    });
    queryClient.invalidateQueries({
      queryKey: ["projects", projectId, "workflows"],
    });
  };

  const updateWorkflowMutation = useMutation({
    mutationFn: async (data: Partial<{ name: string; status: string; trigger: string }>) => {
      const res = await fetch(
        `/api/projects/${projectId}/workflows/${workflowId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
      );
      if (!res.ok) throw new Error("Failed to update workflow");
      return res.json();
    },
    onSuccess: invalidateWorkflow,
  });

  const addStepMutation = useMutation({
    mutationFn: async (data: { type: StepType; sortOrder?: number; config?: Record<string, unknown> }) => {
      const res = await fetch(
        `/api/projects/${projectId}/workflows/${workflowId}/steps`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
      );
      if (!res.ok) throw new Error("Failed to add step");
      return res.json();
    },
    onSuccess: invalidateWorkflow,
  });

  const updateStepMutation = useMutation({
    mutationFn: async ({ stepId, data }: { stepId: string; data: Record<string, unknown> }) => {
      const res = await fetch(
        `/api/projects/${projectId}/workflows/${workflowId}/steps/${stepId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
      );
      if (!res.ok) throw new Error("Failed to update step");
      return res.json();
    },
    onSuccess: invalidateWorkflow,
  });

  const deleteStepMutation = useMutation({
    mutationFn: async (stepId: string) => {
      const res = await fetch(
        `/api/projects/${projectId}/workflows/${workflowId}/steps/${stepId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Failed to delete step");
    },
    onSuccess: () => {
      invalidateWorkflow();
      setDeleteStepId(null);
    },
  });

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleNameBlur = useCallback(() => {
    if (workflow && editingName !== workflow.name && editingName.trim()) {
      updateWorkflowMutation.mutate({ name: editingName.trim() });
    }
  }, [workflow, editingName, updateWorkflowMutation]);

  function openAddStepDialog(atIndex?: number) {
    setInsertIndex(atIndex ?? null);
    setSelectedStepType(null);
    setStepConfig({});
    setAddStepDialogOpen(true);
  }

  function openEditStepDialog(step: WorkflowStep) {
    setEditingStepId(step.id);
    setSelectedStepType(step.type);
    setStepConfig(step.config ? { ...step.config } : {});
    setAddStepDialogOpen(true);
  }

  function closeStepDialog() {
    setAddStepDialogOpen(false);
    setSelectedStepType(null);
    setEditingStepId(null);
    setStepConfig({});
    setInsertIndex(null);
  }

  function handleSaveStep(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStepType) return;

    if (editingStepId) {
      updateStepMutation.mutate(
        { stepId: editingStepId, data: { type: selectedStepType, config: stepConfig } },
        { onSuccess: () => closeStepDialog() },
      );
    } else {
      addStepMutation.mutate(
        {
          type: selectedStepType,
          sortOrder: insertIndex ?? undefined,
          config: Object.keys(stepConfig).length > 0 ? stepConfig : undefined,
        },
        { onSuccess: () => closeStepDialog() },
      );
    }
  }

  // ─── Render: Loading ────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-8">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-7 w-48" />
        </div>
        <div className="max-w-2xl mx-auto space-y-4">
          <Skeleton className="h-20 w-full rounded-[20px]" />
          <Skeleton className="h-4 w-4 mx-auto" />
          <Skeleton className="h-20 w-full rounded-[20px]" />
          <Skeleton className="h-4 w-4 mx-auto" />
          <Skeleton className="h-20 w-full rounded-[20px]" />
        </div>
      </div>
    );
  }

  // ─── Render: Error ──────────────────────────────────────────────────────

  if (isError || !workflow) {
    return (
      <div>
        <PageHeader title="Workflow Builder" />
        <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed py-16">
          <AlertCircle className="h-10 w-10 text-destructive mb-4" />
          <p className="text-sm font-medium text-foreground mb-1">
            Failed to load workflow
          </p>
          <p className="text-sm text-muted-foreground">
            The workflow may not exist or you don&apos;t have access.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => navigate(`/app/projects/${projectId}/workflows`)}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Workflows
          </Button>
        </div>
      </div>
    );
  }

  const triggerMeta = TRIGGER_META[workflow.trigger];
  const TriggerIcon = triggerMeta.icon;

  // ─── Render: Builder ────────────────────────────────────────────────────

  return (
    <div>
      {/* Top action bar */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2.5 shrink-0"
            onClick={() => navigate(`/app/projects/${projectId}/workflows`)}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="min-w-0">
            <Input
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={handleNameBlur}
              className="h-8 text-lg font-semibold border-transparent bg-transparent px-1 hover:border-border focus-visible:border-border"
            />
          </div>
          <Badge variant="outline" className="shrink-0 gap-1">
            <TriggerIcon className="h-3 w-3" />
            {triggerMeta.label}
          </Badge>
          <Badge
            variant={workflow.status === "active" ? "success" : "secondary"}
            className="shrink-0"
          >
            {workflow.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-2 mr-2">
            <span className="text-xs text-muted-foreground">
              {workflow.status === "active" ? "Active" : "Draft"}
            </span>
            <Switch
              checked={workflow.status === "active"}
              onCheckedChange={(checked) =>
                updateWorkflowMutation.mutate({
                  status: checked ? "active" : "draft",
                })
              }
            />
          </div>
        </div>
      </div>

      <Tabs defaultValue="builder" className="w-full">
        <TabsList>
          <TabsTrigger value="builder">Builder</TabsTrigger>
          <TabsTrigger value="runs">Runs</TabsTrigger>
        </TabsList>

        <TabsContent value="builder">
          <div className="max-w-2xl mx-auto py-6">
            {/* Trigger node */}
            <Card className="border-2 border-primary/20 bg-primary/5">
              <CardContent className="py-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-[12px] bg-primary/10 flex items-center justify-center shrink-0">
                  <TriggerIcon className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Trigger
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    {triggerMeta.label}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Connector + Add Step button */}
            <div className="flex flex-col items-center py-2">
              <ArrowDown className="h-4 w-4 text-muted-foreground" />
              {steps.length === 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => openAddStepDialog(0)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Step
                </Button>
              )}
            </div>

            {/* Steps */}
            {steps
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((step, idx) => {
                const stepMeta = getStepMeta(step.type);
                const StepIcon = stepMeta.icon;
                const summary = getConfigSummary(step.type, step.config as Record<string, unknown> | null);

                return (
                  <div key={step.id}>
                    <Card className="group hover:border-primary/30 transition-colors">
                      <CardContent className="py-4 flex items-center gap-3">
                        <div className="h-10 w-10 rounded-[12px] bg-muted flex items-center justify-center shrink-0">
                          <StepIcon className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground">
                            {stepMeta.label}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {summary}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2.5 text-xs"
                            onClick={() => openEditStepDialog(step)}
                          >
                            <Settings2 className="h-3.5 w-3.5" />
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2.5 text-xs text-destructive hover:text-destructive"
                            onClick={() => setDeleteStepId(step.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Connector + Add Step between steps */}
                    <div className="flex flex-col items-center py-2">
                      <ArrowDown className="h-4 w-4 text-muted-foreground" />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-1 h-7 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => openAddStepDialog(idx + 1)}
                      >
                        <Plus className="h-3 w-3" />
                        Add Step
                      </Button>
                    </div>
                  </div>
                );
              })}

            {/* Final empty state if steps exist but user wants to add more at end */}
            {steps.length > 0 && (
              <div className="flex flex-col items-center rounded-[20px] border border-dashed py-8">
                <Zap className="h-6 w-6 text-muted-foreground mb-2" />
                <p className="text-xs text-muted-foreground">
                  End of workflow
                </p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="runs">
          <div className="max-w-3xl mx-auto py-6">
            {runs.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed py-16">
                <RotateCw className="h-10 w-10 text-muted-foreground mb-4" />
                <p className="text-sm font-medium text-foreground mb-1">
                  No runs yet
                </p>
                <p className="text-sm text-muted-foreground">
                  Runs will appear here once the workflow is triggered.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {runs.map((run) => (
                  <Card key={run.id}>
                    <CardContent className="py-3 flex items-center gap-4">
                      <div className="shrink-0">
                        {run.status === "completed" && (
                          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        )}
                        {run.status === "failed" && (
                          <XCircle className="h-5 w-5 text-destructive" />
                        )}
                        {run.status === "running" && (
                          <Loader className="h-5 w-5 text-blue-600 animate-spin" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <Badge
                            variant={
                              run.status === "completed"
                                ? "success"
                                : run.status === "failed"
                                  ? "destructive"
                                  : "secondary"
                            }
                            className="text-[11px] px-2 py-0"
                          >
                            {run.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            Step {run.currentStepIndex + 1}
                            {steps.length > 0 && ` / ${steps.length}`}
                          </span>
                        </div>
                        {run.error && (
                          <p className="text-xs text-destructive truncate">
                            {run.error}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground">
                          Started {formatDate(run.startedAt)}
                        </p>
                        {run.completedAt && (
                          <p className="text-xs text-muted-foreground">
                            Completed {formatDate(run.completedAt)}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Step Dialog */}
      <Dialog open={addStepDialogOpen} onOpenChange={(open) => !open && closeStepDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingStepId ? "Edit Step" : "Add Step"}
            </DialogTitle>
            <DialogDescription>
              {editingStepId
                ? "Update this step's type and configuration."
                : "Choose a step type and configure it."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveStep} className="space-y-4">
            {/* Step type selection */}
            {!editingStepId && !selectedStepType && (
              <div className="grid grid-cols-2 gap-2">
                {STEP_TYPES.map((st) => (
                  <button
                    key={st.type}
                    type="button"
                    onClick={() => {
                      setSelectedStepType(st.type);
                      setStepConfig({});
                    }}
                    className="flex items-center gap-3 rounded-[16px] border px-3 py-3 text-sm text-left hover:bg-accent transition-colors"
                  >
                    <st.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    {st.label}
                  </button>
                ))}
              </div>
            )}

            {/* Step configuration */}
            {selectedStepType && (
              <>
                <div className="flex items-center gap-2 mb-2">
                  {(() => {
                    const meta = getStepMeta(selectedStepType);
                    const Icon = meta.icon;
                    return (
                      <>
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{meta.label}</span>
                      </>
                    );
                  })()}
                  {!editingStepId && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-7 text-xs"
                      onClick={() => {
                        setSelectedStepType(null);
                        setStepConfig({});
                      }}
                    >
                      <RefreshCw className="h-3 w-3" />
                      Change type
                    </Button>
                  )}
                </div>

                <div className="pt-2" />

                <StepConfigForm
                  type={selectedStepType}
                  config={stepConfig}
                  onChange={setStepConfig}
                  tags={tags}
                />
              </>
            )}

            {(addStepMutation.isError || updateStepMutation.isError) && (
              <p className="text-sm text-destructive">
                Failed to save step. Please try again.
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={closeStepDialog}
                disabled={addStepMutation.isPending || updateStepMutation.isPending}
              >
                Cancel
              </Button>
              {selectedStepType && (
                <Button
                  type="submit"
                  disabled={addStepMutation.isPending || updateStepMutation.isPending}
                >
                  {(addStepMutation.isPending || updateStepMutation.isPending) ? (
                    <Loader className="h-4 w-4 animate-spin" />
                  ) : editingStepId ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  {editingStepId ? "Save Changes" : "Add Step"}
                </Button>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Step Confirmation */}
      <Dialog open={!!deleteStepId} onOpenChange={(open) => !open && setDeleteStepId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Step</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this step from the workflow?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteStepId(null)}
              disabled={deleteStepMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteStepId && deleteStepMutation.mutate(deleteStepId)}
              disabled={deleteStepMutation.isPending}
            >
              {deleteStepMutation.isPending ? (
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

// ─── Step Config Form ────────────────────────────────────────────────────────

function StepConfigForm({
  type,
  config,
  onChange,
  tags,
}: {
  type: StepType;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  tags: TagItem[];
}) {
  function set(key: string, value: unknown) {
    onChange({ ...config, [key]: value });
  }

  switch (type) {
    case "send_email":
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="email-to">To</Label>
            <Input
              id="email-to"
              value={(config.to as string) ?? "{{contact.email}}"}
              onChange={(e) => set("to", e.target.value)}
              placeholder="{{contact.email}}"
            />
            <p className="text-[11px] text-muted-foreground">
              Use {"{{contact.email}}"} for the trigger contact.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email-subject">Subject</Label>
            <Input
              id="email-subject"
              value={(config.subject as string) ?? ""}
              onChange={(e) => set("subject", e.target.value)}
              placeholder="Welcome to our platform"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email-body">Body</Label>
            <textarea
              id="email-body"
              value={(config.body as string) ?? ""}
              onChange={(e) => set("body", e.target.value)}
              placeholder="Hello {{contact.name}},\n\nThank you for..."
              rows={5}
              className="flex w-full rounded-[12px] border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
            />
          </div>
        </div>
      );

    case "add_tag":
    case "remove_tag":
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="tag-select">Tag</Label>
            <Select
              value={(config.tagId as string) ?? ""}
              onValueChange={(val) => {
                const tag = tags.find((t) => t.id === val);
                set("tagId", val);
                if (tag) set("tagName", tag.name);
              }}
            >
              <SelectTrigger id="tag-select">
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
            {tags.length === 0 && (
              <p className="text-[11px] text-muted-foreground">
                Create tags in the Contacts section first.
              </p>
            )}
          </div>
        </div>
      );

    case "wait":
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="wait-duration">Duration</Label>
              <Input
                id="wait-duration"
                type="number"
                min={1}
                value={(config.duration as number) ?? ""}
                onChange={(e) => set("duration", parseInt(e.target.value, 10) || undefined)}
                placeholder="5"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wait-unit">Unit</Label>
              <Select
                value={(config.unit as string) ?? "minutes"}
                onValueChange={(val) => set("unit", val)}
              >
                <SelectTrigger id="wait-unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minutes">Minutes</SelectItem>
                  <SelectItem value="hours">Hours</SelectItem>
                  <SelectItem value="days">Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      );

    case "condition":
      return (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Conditions allow branching logic. This is a placeholder configuration.
          </p>
          <div className="space-y-2">
            <Label htmlFor="condition-field">Field</Label>
            <Input
              id="condition-field"
              value={(config.field as string) ?? ""}
              onChange={(e) => set("field", e.target.value)}
              placeholder="e.g. contact.email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="condition-operator">Operator</Label>
            <Select
              value={(config.operator as string) ?? "equals"}
              onValueChange={(val) => set("operator", val)}
            >
              <SelectTrigger id="condition-operator">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="equals">Equals</SelectItem>
                <SelectItem value="not_equals">Not Equals</SelectItem>
                <SelectItem value="contains">Contains</SelectItem>
                <SelectItem value="not_contains">Not Contains</SelectItem>
                <SelectItem value="exists">Exists</SelectItem>
                <SelectItem value="not_exists">Not Exists</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="condition-value">Value</Label>
            <Input
              id="condition-value"
              value={(config.value as string) ?? ""}
              onChange={(e) => set("value", e.target.value)}
              placeholder="Expected value"
            />
          </div>
        </div>
      );

    case "webhook":
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="webhook-url">URL</Label>
            <Input
              id="webhook-url"
              value={(config.url as string) ?? ""}
              onChange={(e) => set("url", e.target.value)}
              placeholder="https://example.com/webhook"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="webhook-method">Method</Label>
            <Select
              value={(config.method as string) ?? "POST"}
              onValueChange={(val) => set("method", val)}
            >
              <SelectTrigger id="webhook-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GET">GET</SelectItem>
                <SelectItem value="POST">POST</SelectItem>
                <SelectItem value="PUT">PUT</SelectItem>
                <SelectItem value="PATCH">PATCH</SelectItem>
                <SelectItem value="DELETE">DELETE</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="webhook-headers">Headers (JSON)</Label>
            <textarea
              id="webhook-headers"
              value={(config.headers as string) ?? ""}
              onChange={(e) => set("headers", e.target.value)}
              placeholder='{"Content-Type": "application/json"}'
              rows={2}
              className="flex w-full rounded-[12px] border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y font-mono text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="webhook-body">Body</Label>
            <textarea
              id="webhook-body"
              value={(config.body as string) ?? ""}
              onChange={(e) => set("body", e.target.value)}
              placeholder='{"event": "{{trigger.type}}"}'
              rows={3}
              className="flex w-full rounded-[12px] border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y font-mono text-xs"
            />
          </div>
        </div>
      );

    case "update_contact":
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="update-field">Field to Update</Label>
            <Select
              value={(config.field as string) ?? ""}
              onValueChange={(val) => set("field", val)}
            >
              <SelectTrigger id="update-field">
                <SelectValue placeholder="Select field" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="phone">Phone</SelectItem>
                <SelectItem value="notes">Notes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="update-value">Value</Label>
            <Input
              id="update-value"
              value={(config.value as string) ?? ""}
              onChange={(e) => set("value", e.target.value)}
              placeholder="New value or {{template}}"
            />
          </div>
        </div>
      );

    default:
      return null;
  }
}

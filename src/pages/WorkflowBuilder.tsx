import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowDown,
  Plus,
  Trash2,
  Loader,
  AlertCircle,
  Mail,
  Brain,
  Tag,
  Clock,
  GitBranch,
  Globe,
  UserCog,
  Zap,
  FileText,
  CalendarPlus,
  CalendarClock,
  CalendarCheck,
  CalendarX,
  Play,
  Settings2,
  CheckCircle2,
  XCircle,
  RotateCw,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Circle,
  MinusCircle,
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { queryClient } from "@/lib/query-client";
import { VariableInput, VariableTextarea } from "@/components/ui/variable-input";
import { WORKFLOW_VARIABLES } from "@/lib/workflow-variables";
import { WorkflowRunDialog } from "@/components/WorkflowRunDialog";
import {
  WorkflowConditionEditor,
  type WorkflowCondition,
} from "@/components/WorkflowConditionEditor";

// ─── Types ───────────────────────────────────────────────────────────────────

type TriggerType =
  | "form_submitted"
  | "booking_created"
  | "booking_pending"
  | "booking_confirmed"
  | "booking_cancelled"
  | "tag_added"
  | "manual";
type StepType =
  | "send_email"
  | "ai_research"
  | "add_tag"
  | "remove_tag"
  | "wait"
  | "condition"
  | "webhook"
  | "update_contact";
type RunStatus = "running" | "completed" | "failed";

interface WorkflowStep {
  id: string;
  workflowId: string;
  sortOrder: number;
  type: StepType;
  config: Record<string, unknown> | null;
  condition: WorkflowCondition | null;
  createdAt: string;
}

interface StepLogEntry {
  stepIndex: number;
  stepType: string;
  stepLabel: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
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
  stepLogs: StepLogEntry[] | null;
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
  { type: "ai_research" as const, label: "AI Research", icon: Brain },
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
  booking_pending: { label: "Booking Pending", icon: CalendarClock },
  booking_confirmed: { label: "Booking Confirmed", icon: CalendarCheck },
  booking_cancelled: { label: "Booking Cancelled", icon: CalendarX },
  tag_added: { label: "Tag Added", icon: Tag },
  manual: { label: "Manual", icon: Play },
};

function getStepMeta(type: StepType) {
  return STEP_TYPES.find((s) => s.type === type) ?? STEP_TYPES[0];
}

function getDefaultConfig(type: StepType): Record<string, unknown> {
  switch (type) {
    case "send_email":
      return { toList: ["{{contact.email}}"], subject: "", body: "" };
    case "ai_research":
      return { provider: "chatgpt", resultKey: "research", prompt: "" };
    case "wait":
      return { duration: 5, unit: "minutes" };
    case "condition":
      return { field: "", operator: "equals", value: "" };
    case "webhook":
      return { url: "", method: "POST", headers: "", body: "" };
    case "update_contact":
      return { field: "", value: "" };
    case "add_tag":
    case "remove_tag":
      return { tagId: "" };
    default:
      return {};
  }
}

function parseConfig(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw as Record<string, unknown>;
  return null;
}

function getConfigSummary(type: StepType, rawConfig: unknown): string {
  const config = parseConfig(rawConfig);
  if (!config) return "Not configured";
  switch (type) {
    case "send_email": {
      const recipients = Array.isArray(config.toList)
        ? config.toList
        : typeof config.to === "string"
          ? config.to.split(/[\n,;]+/g).filter(Boolean)
          : [];
      if (recipients.length === 0) return "Email not configured";
      return `${recipients.length} recipient${recipients.length === 1 ? "" : "s"}`;
    }
    case "ai_research": {
      const provider = config.provider as string | undefined;
      const resultKey = config.resultKey as string | undefined;
      if (!provider) return "Research not configured";
      return `${provider === "gemini" ? "Gemini" : "ChatGPT"} -> ${resultKey ?? "research"}`;
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
  const [searchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState(searchParams.get("tab") ?? "builder");
  const [editingName, setEditingName] = useState("");
  const [addStepDialogOpen, setAddStepDialogOpen] = useState(false);
  const [selectedStepType, setSelectedStepType] = useState<StepType | null>(null);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [stepConfig, setStepConfig] = useState<Record<string, unknown>>({});
  const [stepCondition, setStepCondition] = useState<WorkflowCondition | null>(null);
  const [deleteStepId, setDeleteStepId] = useState<string | null>(null);
  const [insertIndex, setInsertIndex] = useState<number | null>(null);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [deleteWorkflowDialogOpen, setDeleteWorkflowDialogOpen] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [expandedStepIndices, setExpandedStepIndices] = useState<Set<string>>(new Set());

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
    refetchInterval: (query) => {
      const data = query.state.data as WorkflowRun[] | undefined;
      return data?.some((r) => r.status === "running") ? 3000 : false;
    },
  });

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
    mutationFn: async (data: {
      type: StepType;
      sortOrder?: number;
      config?: Record<string, unknown>;
      condition?: WorkflowCondition | null;
    }) => {
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

  const deleteWorkflowMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/projects/${projectId}/workflows/${workflowId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Failed to delete workflow");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "workflows"],
      });
      navigate(`/app/projects/${projectId}/workflows`);
    },
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
    setStepCondition(null);
    setAddStepDialogOpen(true);
  }

  function openEditStepDialog(step: WorkflowStep) {
    setEditingStepId(step.id);
    setSelectedStepType(step.type);
    const existing = parseConfig(step.config) ?? {};
    // Merge defaults under existing config so missing fields get filled
    setStepConfig({ ...getDefaultConfig(step.type), ...existing });
    setStepCondition(step.condition ?? null);
    setAddStepDialogOpen(true);
  }

  function closeStepDialog() {
    setAddStepDialogOpen(false);
    setSelectedStepType(null);
    setEditingStepId(null);
    setStepConfig({});
    setStepCondition(null);
    setInsertIndex(null);
  }

  function handleSaveStep(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStepType) return;

    if (editingStepId) {
      updateStepMutation.mutate(
        {
          stepId: editingStepId,
          data: {
            type: selectedStepType,
            config: stepConfig,
            condition: stepCondition,
          },
        },
        { onSuccess: () => closeStepDialog() },
      );
    } else {
      addStepMutation.mutate(
        {
          type: selectedStepType,
          sortOrder: insertIndex ?? undefined,
          config: stepConfig,
          condition: stepCondition ?? undefined,
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
          <div className="flex items-center gap-2 shrink-0">
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
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRunDialogOpen(true)}
          >
            <Play className="h-4 w-4" />
            Test Run
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => setDeleteWorkflowDialogOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="builder">Builder</TabsTrigger>
          <TabsTrigger value="runs">Runs</TabsTrigger>
        </TabsList>

        <TabsContent value="builder">
          <div
            className="relative min-h-[60vh] rounded-[20px] bg-muted/20 overflow-hidden"
            style={{
              backgroundImage: "radial-gradient(circle, var(--border) 1px, transparent 1px)",
              backgroundSize: "20px 20px",
            }}
          >
          <div className="max-w-2xl mx-auto py-8 px-4">
            {/* Trigger node */}
            <div className="flex flex-col items-center py-4">
              <TriggerIcon className="h-6 w-6 text-muted-foreground mb-1" />
              <p className="text-xs text-muted-foreground">{triggerMeta.label}</p>
            </div>

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
                const summary = getConfigSummary(step.type, step.config);

                return (
                  <div key={step.id}>
                    <Card className="group hover:border-primary/30 transition-colors">
                      <CardContent className="py-4 flex items-center gap-3">
                        <div className="h-10 w-10 rounded-[12px] bg-muted flex items-center justify-center shrink-0">
                          <StepIcon className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-semibold text-foreground">
                              {stepMeta.label}
                            </p>
                            {step.condition && step.condition.rules.length > 0 && (
                              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                                Conditional
                              </Badge>
                            )}
                          </div>
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
              <div className="flex flex-col items-center py-4">
                <Zap className="h-6 w-6 text-muted-foreground mb-1" />
                <p className="text-xs text-muted-foreground">End of workflow</p>
              </div>
            )}
          </div>
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
              <div className="space-y-3">
                {runs.map((run) => {
                  const isExpanded = expandedRunId === run.id;
                  const stepLogs: StepLogEntry[] = Array.isArray(run.stepLogs) ? run.stepLogs : [];
                  const completedSteps = stepLogs.filter((s) => s.status === "completed").length;

                  return (
                    <div key={run.id}>
                      {/* Run header — click to expand */}
                      <button
                        type="button"
                        onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                        className="w-full flex items-center gap-3 rounded-[16px] bg-muted/50 px-4 py-3 text-left hover:bg-muted/80 transition-colors"
                      >
                        <div className="shrink-0">
                          {run.status === "completed" && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                          {run.status === "failed" && <XCircle className="h-4 w-4 text-destructive" />}
                          {run.status === "running" && <Loader className="h-4 w-4 text-blue-600 animate-spin" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                run.status === "completed" ? "success" : run.status === "failed" ? "destructive" : "secondary"
                              }
                              className="text-[11px] px-2 py-0"
                            >
                              {run.status}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {completedSteps}/{stepLogs.length || steps.length} steps
                            </span>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatDate(run.startedAt)}
                        </span>
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                      </button>

                      {/* Expanded: step timeline */}
                      {isExpanded && (
                        <div className="ml-4 mt-2 mb-1">
                          {stepLogs.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-2 pl-6">
                              No step logs available for this run.
                            </p>
                          ) : (
                            <div className="relative">
                              {/* Vertical timeline line */}
                              <div className="absolute left-[7px] top-3 bottom-3 w-px bg-border" />

                              {stepLogs.map((sl, idx) => {
                                const stepKey = `${run.id}-${idx}`;
                                const isStepExpanded = expandedStepIndices.has(stepKey);

                                return (
                                  <div key={idx} className="relative pl-6 pb-4 last:pb-0">
                                    {/* Timeline dot */}
                                    <div className="absolute left-0 top-0.5">
                                      {sl.status === "completed" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                                      {sl.status === "failed" && <XCircle className="h-3.5 w-3.5 text-destructive" />}
                                      {sl.status === "running" && <Loader className="h-3.5 w-3.5 text-blue-600 animate-spin" />}
                                      {sl.status === "pending" && <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />}
                                      {sl.status === "skipped" && <MinusCircle className="h-3.5 w-3.5 text-muted-foreground/40" />}
                                    </div>

                                    {/* Step content */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setExpandedStepIndices((prev) => {
                                          const next = new Set(prev);
                                          if (next.has(stepKey)) next.delete(stepKey);
                                          else next.add(stepKey);
                                          return next;
                                        });
                                      }}
                                      className="w-full flex items-center gap-2 text-left"
                                    >
                                      <span className={`text-sm font-medium ${sl.status === "skipped" ? "text-muted-foreground/50 line-through" : "text-foreground"}`}>
                                        {sl.stepLabel}
                                      </span>
                                      {sl.startedAt && (
                                        <span className="text-[11px] text-muted-foreground">
                                          {new Date(sl.startedAt).toLocaleTimeString()}
                                          {sl.completedAt && ` → ${new Date(sl.completedAt).toLocaleTimeString()}`}
                                        </span>
                                      )}
                                      {sl.status === "failed" && sl.error && (
                                        <span className="text-[11px] text-destructive truncate max-w-[200px]">
                                          {sl.error}
                                        </span>
                                      )}
                                      {(sl.input || sl.output) && (
                                        isStepExpanded
                                          ? <ChevronDown className="h-3 w-3 text-muted-foreground ml-auto shrink-0" />
                                          : <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto shrink-0" />
                                      )}
                                    </button>

                                    {/* Expanded: input/output */}
                                    {isStepExpanded && (sl.input || sl.output || sl.error) && (
                                      <div className="mt-2 space-y-2">
                                        {sl.input && (
                                          <div className="rounded-[12px] bg-muted/50 p-3">
                                            <p className="text-[11px] font-medium text-muted-foreground mb-1">Input</p>
                                            <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all">
                                              {JSON.stringify(sl.input, null, 2)}
                                            </pre>
                                          </div>
                                        )}
                                        {sl.output && (
                                          <div className="rounded-[12px] bg-muted/50 p-3">
                                            <p className="text-[11px] font-medium text-muted-foreground mb-1">Output</p>
                                            <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all">
                                              {JSON.stringify(sl.output, null, 2)}
                                            </pre>
                                          </div>
                                        )}
                                        {sl.error && (
                                          <div className="rounded-[12px] bg-destructive/5 p-3">
                                            <p className="text-[11px] font-medium text-destructive mb-1">Error</p>
                                            <pre className="text-xs font-mono text-destructive whitespace-pre-wrap break-all">
                                              {sl.error}
                                            </pre>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Test Run Dialog */}
      {projectId && workflowId && workflow && (
        <WorkflowRunDialog
          open={runDialogOpen}
          onOpenChange={setRunDialogOpen}
          projectId={projectId}
          workflowId={workflowId}
          trigger={workflow.trigger}
          workflowName={workflow.name}
          onSuccess={() => {
            queryClient.invalidateQueries({
              queryKey: ["projects", projectId, "workflows", workflowId, "runs"],
            });
            setActiveTab("runs");
          }}
        />
      )}

      {/* Add/Edit Step Sidebar */}
      <Sheet open={addStepDialogOpen} onOpenChange={(open) => !open && closeStepDialog()}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              {editingStepId ? "Edit Step" : "Add Step"}
            </SheetTitle>
            <SheetDescription>
              {editingStepId
                ? "Update this step's type and configuration."
                : "Choose a step type and configure it."}
            </SheetDescription>
          </SheetHeader>

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
                      setStepConfig(getDefaultConfig(st.type));
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

                <div className="pt-3 border-t">
                  <WorkflowConditionEditor
                    condition={stepCondition}
                    onChange={setStepCondition}
                  />
                </div>
              </>
            )}

            {(addStepMutation.isError || updateStepMutation.isError) && (
              <p className="text-sm text-destructive">
                Failed to save step. Please try again.
              </p>
            )}

            <div className="flex justify-end gap-2 pt-4">
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
            </div>
          </form>
        </SheetContent>
      </Sheet>

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

      {/* Delete Workflow Confirmation */}
      <Dialog open={deleteWorkflowDialogOpen} onOpenChange={setDeleteWorkflowDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Workflow</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this workflow? All steps and run
              history will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteWorkflowDialogOpen(false)}
              disabled={deleteWorkflowMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteWorkflowMutation.mutate()}
              disabled={deleteWorkflowMutation.isPending}
            >
              {deleteWorkflowMutation.isPending ? (
                <Loader className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete Workflow
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
            <Label htmlFor="email-to">Recipients</Label>
            <VariableTextarea
              id="email-to"
              variables={WORKFLOW_VARIABLES}
              value={Array.isArray(config.toList) ? config.toList.join("\n") : ((config.to as string) ?? "{{contact.email}}")}
              onValueChange={(val) =>
                set(
                  "toList",
                  val
                    .split(/[\n,;]+/g)
                    .map((entry) => entry.trim())
                    .filter(Boolean),
                )
              }
              placeholder={"{{contact.email}}\nteam@example.com"}
              rows={3}
            />
            <p className="text-[11px] text-muted-foreground">
              Use one recipient per line. Variables like {"{{contact.email}}"} are supported.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email-subject">Subject</Label>
            <VariableInput
              id="email-subject"
              variables={WORKFLOW_VARIABLES}
              value={(config.subject as string) ?? ""}
              onValueChange={(val) => set("subject", val)}
              placeholder="Welcome to our platform"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email-body">Body</Label>
            <VariableTextarea
              id="email-body"
              variables={WORKFLOW_VARIABLES}
              value={(config.body as string) ?? ""}
              onValueChange={(val) => set("body", val)}
              placeholder="Hello {{contact.name}},\n\nThank you for..."
              rows={5}
            />
            <p className="text-[11px] text-muted-foreground">
              Common variables: {"{{contact.name}}"}, {"{{contact.email}}"}, {"{{research.summary}}"}.
            </p>
          </div>
        </div>
      );

    case "ai_research":
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="research-provider">AI Provider</Label>
            <Select
              value={(config.provider as string) ?? "chatgpt"}
              onValueChange={(val) => set("provider", val)}
            >
              <SelectTrigger id="research-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="chatgpt">ChatGPT Research</SelectItem>
                <SelectItem value="gemini">Gemini Research</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="research-result-key">Result Key</Label>
            <Input
              id="research-result-key"
              value={(config.resultKey as string) ?? "research"}
              onChange={(e) => set("resultKey", e.target.value)}
              placeholder="research"
            />
            <p className="text-[11px] text-muted-foreground">
              Stored under contact metadata and available to later steps as {"{{research.*}}"}.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="research-prompt">Research Prompt</Label>
            <VariableTextarea
              id="research-prompt"
              variables={WORKFLOW_VARIABLES}
              value={(config.prompt as string) ?? ""}
              onValueChange={(val) => set("prompt", val)}
              placeholder="Research this contact and company using public web sources. Summarize who they are, what the company does, and any signals that matter for follow-up."
              rows={6}
            />
            <p className="text-[11px] text-muted-foreground">
              The workflow automatically adds contact name and email to the research context.
            </p>
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
            Conditions stop the workflow when they evaluate to false.
          </p>
          <div className="space-y-2">
            <Label htmlFor="condition-field">Field</Label>
            <VariableInput
              id="condition-field"
              variables={WORKFLOW_VARIABLES}
              value={(config.field as string) ?? ""}
              onValueChange={(val) => set("field", val)}
              placeholder="e.g. contact.email or research.company"
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
            <VariableInput
              id="condition-value"
              variables={WORKFLOW_VARIABLES}
              value={(config.value as string) ?? ""}
              onValueChange={(val) => set("value", val)}
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
            <VariableInput
              id="webhook-url"
              variables={WORKFLOW_VARIABLES}
              value={(config.url as string) ?? ""}
              onValueChange={(val) => set("url", val)}
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
            <VariableTextarea
              id="webhook-body"
              variables={WORKFLOW_VARIABLES}
              value={(config.body as string) ?? ""}
              onValueChange={(val) => set("body", val)}
              placeholder='{"contactEmail":"{{contact.email}}","summary":"{{research.summary}}"}'
              rows={3}
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Variables use dot-path syntax, for example {"{{contact.email}}"} or {"{{research.summary}}"}.
            </p>
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
            <VariableInput
              id="update-value"
              variables={WORKFLOW_VARIABLES}
              value={(config.value as string) ?? ""}
              onValueChange={(val) => set("value", val)}
              placeholder="New value or {{research.summary}}"
            />
            <p className="text-[11px] text-muted-foreground">
              Use research fields to copy enrichment output into notes or other contact fields.
            </p>
          </div>
        </div>
      );

    default:
      return null;
  }
}

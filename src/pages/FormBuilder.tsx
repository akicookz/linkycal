import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  Plus,
  Loader2,
  AlertCircle,
  GripVertical,
  Type,
  AlignLeft,
  Mail,
  Phone,
  Hash,
  ChevronDown,
  ListChecks,
  CheckSquare,
  Circle,
  Calendar,
  Clock,
  Upload,
  Star,
  Settings2,
  X,
  Copy,
  ExternalLink,
  Check,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { queryClient } from "@/lib/query-client";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface FormField {
  id: string;
  stepId: string;
  sortOrder: number;
  type: string;
  label: string;
  placeholder: string | null;
  required: boolean;
  validation: unknown;
  options: Array<{ label: string; value: string }> | null;
  createdAt: string;
}

interface FormStep {
  id: string;
  formId: string;
  sortOrder: number;
  title: string | null;
  description: string | null;
  settings: unknown;
  fields: FormField[];
}

interface FullForm {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  type: "multi_step" | "single";
  status: "draft" | "active" | "archived";
  settings: unknown;
  createdAt: string;
  updatedAt: string;
  steps: FormStep[];
}

interface FieldOption {
  label: string;
  value: string;
}

// ─── Field Type Definitions ──────────────────────────────────────────────────

const FIELD_TYPES = [
  { type: "text", label: "Text Input", icon: Type },
  { type: "textarea", label: "Textarea", icon: AlignLeft },
  { type: "email", label: "Email", icon: Mail },
  { type: "phone", label: "Phone", icon: Phone },
  { type: "number", label: "Number", icon: Hash },
  { type: "select", label: "Select", icon: ChevronDown },
  { type: "multi_select", label: "Multi Select", icon: ListChecks },
  { type: "checkbox", label: "Checkbox", icon: CheckSquare },
  { type: "radio", label: "Radio", icon: Circle },
  { type: "date", label: "Date", icon: Calendar },
  { type: "time", label: "Time", icon: Clock },
  { type: "file", label: "File Upload", icon: Upload },
  { type: "rating", label: "Rating", icon: Star },
] as const;

const OPTION_FIELD_TYPES = ["select", "multi_select", "radio", "checkbox"];

function getFieldIcon(type: string) {
  const found = FIELD_TYPES.find((ft) => ft.type === type);
  return found?.icon ?? Type;
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function FormBuilder() {
  const { projectId, formId } = useParams<{
    projectId: string;
    formId: string;
  }>();
  const navigate = useNavigate();

  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [fieldSettingsData, setFieldSettingsData] = useState<{
    label: string;
    placeholder: string;
    required: boolean;
    type: string;
    options: FieldOption[];
  }>({ label: "", placeholder: "", required: false, type: "text", options: [] });

  const [linkCopied, setLinkCopied] = useState(false);

  // Inline-editing state for form name/slug
  const [editingName, setEditingName] = useState<string>("");
  const [editingSlug, setEditingSlug] = useState<string>("");

  // ─── Create mode (no formId) ─────────────────────────────────────────────

  const isCreateMode = !formId;
  const [createDialogOpen, setCreateDialogOpen] = useState(isCreateMode);
  const [createData, setCreateData] = useState({
    name: "",
    slug: "",
    type: "single" as "single" | "multi_step",
  });
  const [createSlugManual, setCreateSlugManual] = useState(false);

  useEffect(() => {
    if (!createSlugManual) {
      setCreateData((prev) => ({ ...prev, slug: generateSlug(prev.name) }));
    }
  }, [createData.name, createSlugManual]);

  const createFormMutation = useMutation({
    mutationFn: async (data: { name: string; slug: string; type: string }) => {
      const res = await fetch(`/api/projects/${projectId}/forms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to create form");
      }
      const json = await res.json();
      return json;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "forms"] });
      setCreateDialogOpen(false);
      if (data?.form?.id) {
        navigate(`/app/projects/${projectId}/forms/${data.form.id}`, {
          replace: true,
        });
      }
    },
  });

  function handleCreateForm(e: React.FormEvent) {
    e.preventDefault();
    createFormMutation.mutate(createData);
  }

  // ─── Fetch full form ────────────────────────────────────────────────────

  const {
    data: formData,
    isLoading,
    isError,
  } = useQuery<FullForm>({
    queryKey: ["projects", projectId, "forms", formId],
    queryFn: async () => {
      const res = await fetch(
        `/api/projects/${projectId}/forms/${formId}`
      );
      if (!res.ok) throw new Error("Failed to fetch form");
      const data = await res.json();
      return data.form ?? data;
    },
    enabled: !!projectId && !!formId,
  });

  const form = formData;
  const steps = form?.steps ?? [];
  const activeStep = steps.find((s) => s.id === activeStepId) ?? steps[0] ?? null;
  const activeFields = activeStep
    ? [...activeStep.fields].sort((a, b) => a.sortOrder - b.sortOrder)
    : [];

  // Sync active step when form loads
  useEffect(() => {
    if (form && steps.length > 0 && !activeStepId) {
      setActiveStepId(steps[0].id);
    }
  }, [form, steps, activeStepId]);

  // Sync editing name/slug when form loads
  useEffect(() => {
    if (form) {
      setEditingName(form.name);
      setEditingSlug(form.slug);
    }
  }, [form]);

  // ─── Optimistic update helpers ────────────────────────────────────────────

  const formQueryKey = ["projects", projectId, "forms", formId];

  function optimisticSetForm(updater: (old: FullForm) => FullForm) {
    queryClient.setQueryData<FullForm>(formQueryKey, (old) =>
      old ? updater(old) : old
    );
  }

  function snapshotForm() {
    return queryClient.getQueryData<FullForm>(formQueryKey);
  }

  function rollback(snapshot: FullForm | undefined) {
    queryClient.setQueryData<FullForm>(formQueryKey, snapshot);
  }

  // ─── Form mutations ─────────────────────────────────────────────────────

  const updateFormMutation = useMutation({
    mutationFn: async (data: Partial<{ name: string; slug: string; status: string }>) => {
      const res = await fetch(
        `/api/projects/${projectId}/forms/${formId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      );
      if (!res.ok) throw new Error("Failed to update form");
      return res.json();
    },
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: formQueryKey });
      const snapshot = snapshotForm();
      optimisticSetForm((old) => ({ ...old, ...data }));
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) rollback(ctx.snapshot);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: formQueryKey });
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "forms"],
      });
    },
  });

  // ─── Step mutations ──────────────────────────────────────────────────────

  const addStepMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/projects/${projectId}/forms/${formId}/steps`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: `Step ${steps.length + 1}`,
          }),
        }
      );
      if (!res.ok) throw new Error("Failed to add step");
      const json = await res.json();
      return json;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: formQueryKey });
      const snapshot = snapshotForm();
      const tempId = `temp-${crypto.randomUUID()}`;
      optimisticSetForm((old) => ({
        ...old,
        steps: [
          ...old.steps,
          {
            id: tempId,
            formId: old.id,
            sortOrder: old.steps.length,
            title: `Step ${old.steps.length + 1}`,
            description: null,
            settings: null,
            fields: [],
          },
        ],
      }));
      setActiveStepId(tempId);
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) rollback(ctx.snapshot);
    },
    onSuccess: (data) => {
      if (data?.step?.id) {
        setActiveStepId(data.step.id);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: formQueryKey });
    },
  });

  const updateStepMutation = useMutation({
    mutationFn: async ({
      stepId,
      data,
    }: {
      stepId: string;
      data: Partial<{ title: string; description: string }>;
    }) => {
      const res = await fetch(
        `/api/projects/${projectId}/forms/${formId}/steps/${stepId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      );
      if (!res.ok) throw new Error("Failed to update step");
      return res.json();
    },
    onMutate: async ({ stepId, data }) => {
      await queryClient.cancelQueries({ queryKey: formQueryKey });
      const snapshot = snapshotForm();
      optimisticSetForm((old) => ({
        ...old,
        steps: old.steps.map((s) =>
          s.id === stepId ? { ...s, ...data } : s
        ),
      }));
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) rollback(ctx.snapshot);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: formQueryKey });
    },
  });

  const deleteStepMutation = useMutation({
    mutationFn: async (stepId: string) => {
      const res = await fetch(
        `/api/projects/${projectId}/forms/${formId}/steps/${stepId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to delete step");
    },
    onMutate: async (stepId) => {
      await queryClient.cancelQueries({ queryKey: formQueryKey });
      const snapshot = snapshotForm();
      optimisticSetForm((old) => ({
        ...old,
        steps: old.steps.filter((s) => s.id !== stepId),
      }));
      if (activeStepId === stepId && steps.length > 1) {
        const remaining = steps.filter((s) => s.id !== stepId);
        setActiveStepId(remaining[0]?.id ?? null);
      }
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) rollback(ctx.snapshot);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: formQueryKey });
    },
  });

  // ─── Field mutations ─────────────────────────────────────────────────────

  const addFieldMutation = useMutation({
    mutationFn: async ({
      stepId,
      type,
      label,
    }: {
      stepId: string;
      type: string;
      label: string;
    }) => {
      const res = await fetch(
        `/api/projects/${projectId}/forms/${formId}/fields`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stepId, type, label }),
        }
      );
      if (!res.ok) throw new Error("Failed to add field");
      return res.json();
    },
    onMutate: async ({ stepId, type, label }) => {
      await queryClient.cancelQueries({ queryKey: formQueryKey });
      const snapshot = snapshotForm();
      const tempId = `temp-${crypto.randomUUID()}`;
      optimisticSetForm((old) => ({
        ...old,
        steps: old.steps.map((s) =>
          s.id === stepId
            ? {
                ...s,
                fields: [
                  ...s.fields,
                  {
                    id: tempId,
                    stepId,
                    sortOrder: s.fields.length,
                    type,
                    label,
                    placeholder: null,
                    required: false,
                    validation: null,
                    options: null,
                    createdAt: new Date().toISOString(),
                  },
                ],
              }
            : s
        ),
      }));
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) rollback(ctx.snapshot);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: formQueryKey });
    },
  });

  const updateFieldMutation = useMutation({
    mutationFn: async ({
      fieldId,
      data,
    }: {
      fieldId: string;
      data: Partial<{
        label: string;
        placeholder: string;
        required: boolean;
        type: string;
        options: FieldOption[];
      }>;
    }) => {
      const res = await fetch(
        `/api/projects/${projectId}/forms/${formId}/fields/${fieldId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      );
      if (!res.ok) throw new Error("Failed to update field");
      return res.json();
    },
    onMutate: async ({ fieldId, data }) => {
      await queryClient.cancelQueries({ queryKey: formQueryKey });
      const snapshot = snapshotForm();
      optimisticSetForm((old) => ({
        ...old,
        steps: old.steps.map((s) => ({
          ...s,
          fields: s.fields.map((f) =>
            f.id === fieldId ? { ...f, ...data } : f
          ),
        })),
      }));
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) rollback(ctx.snapshot);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: formQueryKey });
    },
  });

  const deleteFieldMutation = useMutation({
    mutationFn: async (fieldId: string) => {
      const res = await fetch(
        `/api/projects/${projectId}/forms/${formId}/fields/${fieldId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to delete field");
    },
    onMutate: async (fieldId) => {
      await queryClient.cancelQueries({ queryKey: formQueryKey });
      const snapshot = snapshotForm();
      optimisticSetForm((old) => ({
        ...old,
        steps: old.steps.map((s) => ({
          ...s,
          fields: s.fields.filter((f) => f.id !== fieldId),
        })),
      }));
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) rollback(ctx.snapshot);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: formQueryKey });
    },
  });

  // ─── Inline edit handlers ────────────────────────────────────────────────

  const handleNameBlur = useCallback(() => {
    if (form && editingName !== form.name && editingName.trim()) {
      updateFormMutation.mutate({ name: editingName.trim() });
    }
  }, [form, editingName, updateFormMutation]);

  const handleSlugBlur = useCallback(() => {
    if (form && editingSlug !== form.slug && editingSlug.trim()) {
      updateFormMutation.mutate({ slug: editingSlug.trim() });
    }
  }, [form, editingSlug, updateFormMutation]);

  // ─── Add field from palette ──────────────────────────────────────────────

  function handleAddField(type: string, label: string) {
    if (!activeStep) return;
    addFieldMutation.mutate({ stepId: activeStep.id, type, label });
  }

  // ─── Field settings dialog ──────────────────────────────────────────────

  function toggleFieldSettings(field: FormField) {
    if (editingFieldId === field.id) {
      setEditingFieldId(null);
      return;
    }
    setEditingFieldId(field.id);
    setFieldSettingsData({
      label: field.label,
      placeholder: field.placeholder ?? "",
      required: field.required,
      type: field.type,
      options: field.options ?? [{ label: "", value: "" }],
    });
  }

  function closeFieldSettings() {
    setEditingFieldId(null);
  }

  function handleSaveFieldSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!editingFieldId) return;

    const data: Partial<{
      label: string;
      placeholder: string;
      required: boolean;
      type: string;
      options: FieldOption[];
    }> = {
      label: fieldSettingsData.label,
      placeholder: fieldSettingsData.placeholder || undefined,
      required: fieldSettingsData.required,
      type: fieldSettingsData.type,
    };

    if (OPTION_FIELD_TYPES.includes(fieldSettingsData.type)) {
      data.options = fieldSettingsData.options.filter(
        (o) => o.label.trim() || o.value.trim()
      );
    }

    updateFieldMutation.mutate(
      { fieldId: editingFieldId, data },
      { onSuccess: () => closeFieldSettings() }
    );
  }

  function addOptionRow() {
    setFieldSettingsData((prev) => ({
      ...prev,
      options: [...prev.options, { label: "", value: "" }],
    }));
  }

  function removeOptionRow(index: number) {
    setFieldSettingsData((prev) => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index),
    }));
  }

  function updateOption(index: number, key: "label" | "value", val: string) {
    setFieldSettingsData((prev) => ({
      ...prev,
      options: prev.options.map((o, i) =>
        i === index ? { ...o, [key]: val } : o
      ),
    }));
  }

  // ─── Render: Create mode ─────────────────────────────────────────────────

  if (isCreateMode) {
    return (
      <div>
        <PageHeader title="Form Builder" description="Create a new form" />

        <Dialog
          open={createDialogOpen}
          onOpenChange={(open) => {
            if (!open) navigate(`/app/projects/${projectId}/forms`);
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>New Form</DialogTitle>
              <DialogDescription>
                Create a new form to get started with the builder.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateForm} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="create-name">Name</Label>
                <Input
                  id="create-name"
                  placeholder="e.g. Contact Form"
                  value={createData.name}
                  onChange={(e) =>
                    setCreateData((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-slug">Slug</Label>
                <Input
                  id="create-slug"
                  placeholder="contact-form"
                  value={createData.slug}
                  onChange={(e) => {
                    setCreateSlugManual(true);
                    setCreateData((prev) => ({
                      ...prev,
                      slug: e.target.value,
                    }));
                  }}
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  URL-friendly identifier. Auto-generated from name.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-type">Type</Label>
                <Select
                  value={createData.type}
                  onValueChange={(val) =>
                    setCreateData((prev) => ({
                      ...prev,
                      type: val as "single" | "multi_step",
                    }))
                  }
                >
                  <SelectTrigger id="create-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single Page</SelectItem>
                    <SelectItem value="multi_step">Multi-Step</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {createFormMutation.isError && (
                <p className="text-sm text-destructive">
                  {createFormMutation.error?.message ?? "Something went wrong."}
                </p>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    navigate(`/app/projects/${projectId}/forms`)
                  }
                  disabled={createFormMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createFormMutation.isPending}
                >
                  {createFormMutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Create Form
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ─── Render: Loading ─────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-8">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-7 w-48" />
        </div>
        <div className="grid grid-cols-[240px_1fr] gap-6">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

  // ─── Render: Error ───────────────────────────────────────────────────────

  if (isError || !form) {
    return (
      <div>
        <PageHeader title="Form Builder" />
        <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed py-16">
          <AlertCircle className="h-10 w-10 text-destructive mb-4" />
          <p className="text-sm font-medium text-foreground mb-1">
            Failed to load form
          </p>
          <p className="text-sm text-muted-foreground">
            The form may not exist or you don&apos;t have access.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => navigate(`/app/projects/${projectId}/forms`)}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Forms
          </Button>
        </div>
      </div>
    );
  }

  // ─── Render: Builder ─────────────────────────────────────────────────────

  return (
    <div>
      {/* Top action bar */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => navigate(`/app/projects/${projectId}/forms`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <Input
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={handleNameBlur}
              className="h-8 text-lg font-semibold border-transparent bg-transparent px-1 hover:border-border focus-visible:border-border"
            />
          </div>
          <Badge
            variant={form.status === "active" ? "success" : "secondary"}
            className="shrink-0"
          >
            {form.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const url = `${window.location.origin}/f/${form.slug}`;
              navigator.clipboard.writeText(url);
              setLinkCopied(true);
              setTimeout(() => setLinkCopied(false), 2000);
            }}
          >
            {linkCopied ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {linkCopied ? "Copied!" : "Copy Link"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              window.open(
                `${window.location.origin}/f/${form.slug}`,
                "_blank"
              )
            }
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Preview
          </Button>
          <Button
            size="sm"
            onClick={() => updateFormMutation.mutate({ status: "active" })}
            disabled={form.status === "active" || updateFormMutation.isPending}
          >
            {updateFormMutation.isPending && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            Publish
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-[240px_1fr] gap-6">
        {/* ─── Left Sidebar: Field Palette ─────────────────────────────── */}
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Field Types
              </p>
              {FIELD_TYPES.map((ft) => (
                <button
                  key={ft.type}
                  type="button"
                  onClick={() => handleAddField(ft.type, ft.label)}
                  disabled={!activeStep || addFieldMutation.isPending}
                  className="flex w-full items-center gap-3 rounded-[16px] border px-3 py-2.5 text-sm text-left hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ft.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  {ft.label}
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Form slug */}
          <Card>
            <CardContent className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Form Slug
              </p>
              <Input
                value={editingSlug}
                onChange={(e) => setEditingSlug(e.target.value)}
                onBlur={handleSlugBlur}
                className="h-8 text-xs"
              />
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-2">
                Status
              </p>
              <div className="flex items-center justify-between">
                <span className="text-sm">
                  {form.status === "active" ? "Active" : "Draft"}
                </span>
                <Switch
                  checked={form.status === "active"}
                  onCheckedChange={(checked) =>
                    updateFormMutation.mutate({
                      status: checked ? "active" : "draft",
                    })
                  }
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ─── Main Area ──────────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Step tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {steps
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((step, idx) => (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setActiveStepId(step.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 whitespace-nowrap rounded-[12px] px-3 py-1.5 text-sm font-medium transition-colors",
                    step.id === activeStep?.id
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  )}
                >
                  {step.title || `Step ${idx + 1}`}
                  {steps.length > 1 && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteStepMutation.mutate(step.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.stopPropagation();
                          deleteStepMutation.mutate(step.id);
                        }
                      }}
                      className="ml-1 rounded-full p-0.5 hover:bg-white/20"
                    >
                      <X className="h-3 w-3" />
                    </span>
                  )}
                </button>
              ))}
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 shrink-0"
              onClick={() => addStepMutation.mutate()}
              disabled={addStepMutation.isPending}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Step
            </Button>
          </div>

          {/* Active step content */}
          {activeStep ? (
            <Card>
              <CardContent className="space-y-4">
                {/* Step title & description */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Step Title
                  </Label>
                  <Input
                    value={activeStep.title ?? ""}
                    onChange={() => {}}
                    onBlur={(e) => {
                      if (e.target.value !== (activeStep.title ?? "")) {
                        updateStepMutation.mutate({
                          stepId: activeStep.id,
                          data: { title: e.target.value },
                        });
                      }
                    }}
                    onInput={(e) => {
                      // Controlled via DOM for performance
                      const target = e.target as HTMLInputElement;
                      target.value = target.value;
                    }}
                    defaultValue={activeStep.title ?? ""}
                    key={`step-title-${activeStep.id}`}
                    placeholder="Step title"
                    className="h-9"
                  />
                  <Label className="text-xs text-muted-foreground">
                    Step Description
                  </Label>
                  <Input
                    defaultValue={activeStep.description ?? ""}
                    key={`step-desc-${activeStep.id}`}
                    placeholder="Optional description"
                    className="h-9"
                    onBlur={(e) => {
                      if (
                        e.target.value !== (activeStep.description ?? "")
                      ) {
                        updateStepMutation.mutate({
                          stepId: activeStep.id,
                          data: { description: e.target.value },
                        });
                      }
                    }}
                  />
                </div>

                <Separator />

                {/* Fields list */}
                {activeFields.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Type className="h-8 w-8 text-muted-foreground mb-3" />
                    <p className="text-sm font-medium text-foreground mb-1">
                      No fields yet
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Click a field type from the left panel to add it.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeFields.map((field) => {
                      const FieldIcon = getFieldIcon(field.type);
                      const isExpanded = editingFieldId === field.id;
                      return (
                        <div key={field.id}>
                          <div
                            className={cn(
                              "flex items-center gap-3 border px-3 py-2.5 group hover:border-primary/30 transition-colors",
                              isExpanded
                                ? "rounded-t-[16px] border-primary/30 border-b-transparent"
                                : "rounded-[16px]"
                            )}
                          >
                            <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 cursor-grab" />
                            <FieldIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                            <InlineEditableLabel
                              value={field.label}
                              onSave={(label) =>
                                updateFieldMutation.mutate({
                                  fieldId: field.id,
                                  data: { label },
                                })
                              }
                            />
                            <div className="flex items-center gap-2 ml-auto shrink-0">
                              <Badge
                                variant="secondary"
                                className="text-[10px] px-1.5 py-0"
                              >
                                {field.type}
                              </Badge>
                              <div className="flex items-center gap-1">
                                <span className="text-[11px] text-muted-foreground">
                                  Required
                                </span>
                                <Switch
                                  checked={field.required}
                                  onCheckedChange={(checked) =>
                                    updateFieldMutation.mutate({
                                      fieldId: field.id,
                                      data: { required: checked },
                                    })
                                  }
                                  className="scale-75"
                                />
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => toggleFieldSettings(field)}
                              >
                                <Settings2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() =>
                                  deleteFieldMutation.mutate(field.id)
                                }
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>

                          {/* ─── Inline Field Settings Panel ─── */}
                          {isExpanded && (
                            <div className="rounded-b-[16px] border border-primary/30 bg-muted/30 px-4 py-4">
                              <form
                                onSubmit={handleSaveFieldSettings}
                                className="space-y-4"
                              >
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1.5">
                                    <Label
                                      htmlFor={`field-label-${field.id}`}
                                      className="text-xs"
                                    >
                                      Label
                                    </Label>
                                    <Input
                                      id={`field-label-${field.id}`}
                                      value={fieldSettingsData.label}
                                      onChange={(e) =>
                                        setFieldSettingsData((prev) => ({
                                          ...prev,
                                          label: e.target.value,
                                        }))
                                      }
                                      className="h-8 text-sm"
                                      required
                                    />
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label
                                      htmlFor={`field-placeholder-${field.id}`}
                                      className="text-xs"
                                    >
                                      Placeholder
                                    </Label>
                                    <Input
                                      id={`field-placeholder-${field.id}`}
                                      value={fieldSettingsData.placeholder}
                                      onChange={(e) =>
                                        setFieldSettingsData((prev) => ({
                                          ...prev,
                                          placeholder: e.target.value,
                                        }))
                                      }
                                      className="h-8 text-sm"
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1.5">
                                    <Label
                                      htmlFor={`field-type-${field.id}`}
                                      className="text-xs"
                                    >
                                      Type
                                    </Label>
                                    <Select
                                      value={fieldSettingsData.type}
                                      onValueChange={(val) =>
                                        setFieldSettingsData((prev) => ({
                                          ...prev,
                                          type: val,
                                        }))
                                      }
                                    >
                                      <SelectTrigger
                                        id={`field-type-${field.id}`}
                                        className="h-8 text-sm"
                                      >
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {FIELD_TYPES.map((ft) => (
                                          <SelectItem
                                            key={ft.type}
                                            value={ft.type}
                                          >
                                            {ft.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="flex items-end pb-1">
                                    <div className="flex items-center gap-2">
                                      <Switch
                                        id={`field-required-${field.id}`}
                                        checked={fieldSettingsData.required}
                                        onCheckedChange={(checked) =>
                                          setFieldSettingsData((prev) => ({
                                            ...prev,
                                            required: checked,
                                          }))
                                        }
                                      />
                                      <Label
                                        htmlFor={`field-required-${field.id}`}
                                        className="text-xs"
                                      >
                                        Required
                                      </Label>
                                    </div>
                                  </div>
                                </div>

                                {/* Options for select/multi_select/radio/checkbox */}
                                {OPTION_FIELD_TYPES.includes(
                                  fieldSettingsData.type
                                ) && (
                                  <div className="space-y-2">
                                    <Separator />
                                    <Label className="text-xs">Options</Label>
                                    <div className="space-y-1.5">
                                      {fieldSettingsData.options.map(
                                        (opt, idx) => (
                                          <div
                                            key={idx}
                                            className="flex items-center gap-2"
                                          >
                                            <Input
                                              placeholder="Label"
                                              value={opt.label}
                                              onChange={(e) =>
                                                updateOption(
                                                  idx,
                                                  "label",
                                                  e.target.value
                                                )
                                              }
                                              className="h-7 text-xs"
                                            />
                                            <Input
                                              placeholder="Value"
                                              value={opt.value}
                                              onChange={(e) =>
                                                updateOption(
                                                  idx,
                                                  "value",
                                                  e.target.value
                                                )
                                              }
                                              className="h-7 text-xs"
                                            />
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="icon"
                                              className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                                              onClick={() =>
                                                removeOptionRow(idx)
                                              }
                                              disabled={
                                                fieldSettingsData.options
                                                  .length <= 1
                                              }
                                            >
                                              <X className="h-3 w-3" />
                                            </Button>
                                          </div>
                                        )
                                      )}
                                    </div>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs"
                                      onClick={addOptionRow}
                                    >
                                      <Plus className="h-3 w-3" />
                                      Add Option
                                    </Button>
                                  </div>
                                )}

                                {updateFieldMutation.isError && (
                                  <p className="text-xs text-destructive">
                                    {updateFieldMutation.error?.message ??
                                      "Failed to update field."}
                                  </p>
                                )}

                                <div className="flex items-center gap-2 pt-1">
                                  <Button
                                    type="submit"
                                    size="sm"
                                    className="h-7 text-xs"
                                    disabled={updateFieldMutation.isPending}
                                  >
                                    {updateFieldMutation.isPending && (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    )}
                                    Save
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={closeFieldSettings}
                                    disabled={updateFieldMutation.isPending}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </form>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed min-h-[400px]">
              <p className="text-sm text-muted-foreground mb-3">
                No steps yet. Add a step to start building your form.
              </p>
              <Button
                size="sm"
                onClick={() => addStepMutation.mutate()}
                disabled={addStepMutation.isPending}
              >
                <Plus className="h-4 w-4" />
                Add Step
              </Button>
            </div>
          )}
        </div>
      </div>


    </div>
  );
}

// ─── Inline Editable Label ───────────────────────────────────────────────────

function InlineEditableLabel({
  value,
  onSave,
}: {
  value: string;
  onSave: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  if (!editing) {
    return (
      <button
        type="button"
        className="text-sm font-medium text-foreground text-left truncate hover:underline underline-offset-2 cursor-text min-w-0"
        onClick={() => setEditing(true)}
      >
        {value}
      </button>
    );
  }

  return (
    <Input
      autoFocus
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (localValue.trim() && localValue !== value) {
          onSave(localValue.trim());
        } else {
          setLocalValue(value);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          setLocalValue(value);
          setEditing(false);
        }
      }}
      className="h-7 text-sm px-1 min-w-0"
    />
  );
}

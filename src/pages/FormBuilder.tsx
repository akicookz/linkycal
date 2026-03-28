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
  X,
  Copy,
  ExternalLink,
  Check,
  Globe,
  Trash2,
} from "lucide-react";
import CopyPromptButton from "@/components/CopyPromptButton";
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
  generateFormApiPrompt,
  generateFormEmbedPrompt,
} from "@/lib/prompts";
import { cn, copyToClipboard } from "@/lib/utils";
import { normalizeToFieldId } from "@/lib/constants";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
  status: string;
  settings: unknown;
  createdAt: string;
  updatedAt: string;
  steps: FormStep[];
}

interface FieldOption {
  label: string;
  value: string;
}

interface NativeActionSettings {
  successMode?: "message" | "redirect";
  successMessage?: string;
  redirectUrl?: string;
}

interface FormSettings {
  nativeAction?: NativeActionSettings;
}

const DEFAULT_NATIVE_SUCCESS_MESSAGE = "Your response has been submitted successfully.";

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

// Field icon lookup (used by field type picker in sidebar)
function _getFieldIcon(type: string) {
  const found = FIELD_TYPES.find((ft) => ft.type === type);
  return found?.icon ?? Type;
}
void _getFieldIcon;

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
  // Local options state for auto-save (keyed by field ID)
  const [fieldOptionsState, setFieldOptionsState] = useState<Record<string, FieldOption[]>>({});
  const [autoFocusLastField, setAutoFocusLastField] = useState(false);

  const [linkCopied, setLinkCopied] = useState(false);
  const [promptCopiedId, setPromptCopiedId] = useState<string | null>(null);
  const [actionUrlCopied, setActionUrlCopied] = useState(false);
  const [nativeSuccessMessage, setNativeSuccessMessage] = useState(
    DEFAULT_NATIVE_SUCCESS_MESSAGE,
  );
  const [nativeRedirectUrl, setNativeRedirectUrl] = useState("");

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

  const { data: projects } = useQuery<Array<{ id: string; slug: string }>>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to fetch projects");
      const data = await res.json();
      return data.projects ?? [];
    },
    enabled: !!projectId,
  });

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
  const currentProject = projects?.find((project) => project.id === projectId);


  const steps = form?.steps ?? [];
  const formSettings =
    form?.settings && typeof form.settings === "object"
      ? (form.settings as FormSettings)
      : {};
  const nativeActionSettings = {
    successMode:
      formSettings.nativeAction?.successMode === "redirect"
        ? "redirect"
        : "message",
    successMessage:
      typeof formSettings.nativeAction?.successMessage === "string" &&
      formSettings.nativeAction.successMessage.trim()
        ? formSettings.nativeAction.successMessage
        : DEFAULT_NATIVE_SUCCESS_MESSAGE,
    redirectUrl:
      typeof formSettings.nativeAction?.redirectUrl === "string"
        ? formSettings.nativeAction.redirectUrl
        : "",
  } as const;
  const hasFileFields = steps.some((step) =>
    step.fields.some((field) => field.type === "file")
  );
  const nativeActionUrl = form
    ? `${window.location.origin}/api/public/forms/${form.slug}/submit`
    : "";
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

  useEffect(() => {
    setNativeSuccessMessage(nativeActionSettings.successMessage);
    setNativeRedirectUrl(nativeActionSettings.redirectUrl);
  }, [
    nativeActionSettings.redirectUrl,
    nativeActionSettings.successMessage,
  ]);

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
    mutationFn: async (
      data: Partial<{
        name: string;
        slug: string;
        status: string;
        settings: FormSettings | null;
      }>
    ) => {
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
      setAutoFocusLastField(true);
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

  function markPromptCopied(promptId: string) {
    setPromptCopiedId(promptId);
    setTimeout(() => setPromptCopiedId(null), 2000);
  }

  function handleCopyApiPrompt() {
    if (!form) return;
    const projectSlug = currentProject?.slug ?? projectId ?? "";
    const prompt = generateFormApiPrompt(form, projectSlug, window.location.origin);
    copyToClipboard(prompt);
    markPromptCopied("api");
  }

  function handleCopyEmbedPrompt() {
    if (!form) return;
    const prompt = generateFormEmbedPrompt(form, window.location.origin);
    copyToClipboard(prompt);
    markPromptCopied("embedprompt");
  }

  function buildUpdatedFormSettings(
    patch: Partial<NativeActionSettings>,
  ): FormSettings {
    return {
      ...formSettings,
      nativeAction: {
        ...formSettings.nativeAction,
        ...patch,
      },
    };
  }

  const handleNativeActionModeChange = useCallback(
    (value: "message" | "redirect") => {
      updateFormMutation.mutate({
        settings: buildUpdatedFormSettings({ successMode: value }),
      });
    },
    [formSettings, updateFormMutation],
  );

  const handleNativeSuccessMessageBlur = useCallback(() => {
    const nextMessage =
      nativeSuccessMessage.trim() || DEFAULT_NATIVE_SUCCESS_MESSAGE;
    if (nextMessage !== nativeActionSettings.successMessage) {
      setNativeSuccessMessage(nextMessage);
      updateFormMutation.mutate({
        settings: buildUpdatedFormSettings({ successMessage: nextMessage }),
      });
    }
  }, [
    nativeActionSettings.successMessage,
    nativeSuccessMessage,
    formSettings,
    updateFormMutation,
  ]);

  const handleNativeRedirectUrlBlur = useCallback(() => {
    const nextRedirectUrl = nativeRedirectUrl.trim();
    if (nextRedirectUrl !== nativeActionSettings.redirectUrl) {
      updateFormMutation.mutate({
        settings: buildUpdatedFormSettings({ redirectUrl: nextRedirectUrl }),
      });
    }
  }, [
    nativeActionSettings.redirectUrl,
    nativeRedirectUrl,
    formSettings,
    updateFormMutation,
  ]);

  // ─── Drag and Drop ─────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const reorderFieldsMutation = useMutation({
    mutationFn: async ({ stepId, fieldIds }: { stepId: string; fieldIds: string[] }) => {
      const res = await fetch(
        `/api/projects/${projectId}/forms/${formId}/fields/reorder`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stepId, fieldIds }),
        },
      );
      if (!res.ok) throw new Error("Failed to reorder fields");
      return res.json();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: formQueryKey });
    },
  });

  const reorderStepsMutation = useMutation({
    mutationFn: async ({ stepIds }: { stepIds: string[] }) => {
      const res = await fetch(
        `/api/projects/${projectId}/forms/${formId}/steps/reorder`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stepIds }),
        },
      );
      if (!res.ok) throw new Error("Failed to reorder steps");
      return res.json();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: formQueryKey });
    },
  });

  function handleFieldDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !activeStep) return;

    const oldIndex = activeFields.findIndex((f) => f.id === active.id);
    const newIndex = activeFields.findIndex((f) => f.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(activeFields, oldIndex, newIndex);

    optimisticSetForm((old) => ({
      ...old,
      steps: old.steps.map((s) =>
        s.id === activeStep.id
          ? { ...s, fields: reordered.map((f, i) => ({ ...f, sortOrder: i })) }
          : s,
      ),
    }));

    reorderFieldsMutation.mutate({
      stepId: activeStep.id,
      fieldIds: reordered.map((f) => f.id),
    });
  }

  function handleStepDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = steps.findIndex((s) => s.id === active.id);
    const newIndex = steps.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(steps, oldIndex, newIndex);

    optimisticSetForm((old) => ({
      ...old,
      steps: reordered.map((s, i) => ({ ...s, sortOrder: i })),
    }));

    reorderStepsMutation.mutate({
      stepIds: reordered.map((s) => s.id),
    });
  }

  // ─── Add field from palette ──────────────────────────────────────────────

  function handleAddField(type: string, label: string) {
    if (!activeStep) return;
    addFieldMutation.mutate({ stepId: activeStep.id, type, label });
  }

  // ─── Field options helpers (auto-save) ──────────────────────────────────

  function getFieldOptions(field: FormField): FieldOption[] {
    if (fieldOptionsState[field.id]) {
      const cached = fieldOptionsState[field.id];
      return Array.isArray(cached) ? cached : [{ label: "", value: "" }];
    }
    if (!field.options) return [{ label: "", value: "" }];
    // Handle case where options is a JSON string from the DB
    let parsed = field.options;
    if (typeof parsed === "string") {
      try { parsed = JSON.parse(parsed); } catch { return [{ label: "", value: "" }]; }
    }
    return Array.isArray(parsed) ? parsed as FieldOption[] : [{ label: "", value: "" }];
  }

  function setFieldOptions(fieldId: string, options: FieldOption[]) {
    setFieldOptionsState((prev) => ({ ...prev, [fieldId]: options }));
  }

  function saveFieldOptions(fieldId: string) {
    const options = fieldOptionsState[fieldId];
    if (!options || !Array.isArray(options)) return;
    const filtered = options.filter((o) => o.label.trim() || o.value.trim());
    if (filtered.length === 0) return;
    updateFieldMutation.mutate({ fieldId, data: { options: filtered } });
  }

  function addFieldOption(fieldId: string, field: FormField) {
    const current = getFieldOptions(field);
    const nextNum = current.length + 1;
    const updated = [...current, { label: `Option ${nextNum}`, value: `option_${nextNum}` }];
    setFieldOptions(fieldId, updated);
    // Don't mutate here — saved on blur when user edits the new option label
  }

  function removeFieldOption(fieldId: string, index: number, field: FormField) {
    const current = getFieldOptions(field);
    const updated = current.filter((_, i) => i !== index);
    setFieldOptions(fieldId, updated);
    const filtered = updated.filter((o) => o.label.trim() || o.value.trim());
    updateFieldMutation.mutate({ fieldId, data: { options: filtered } });
  }

  function updateFieldOption(fieldId: string, index: number, val: string) {
    const current = fieldOptionsState[fieldId] ?? [];
    const updated = current.map((o, i) =>
      i === index ? { label: val, value: normalizeToFieldId(val) } : o,
    );
    setFieldOptions(fieldId, updated);
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
            size="sm"
            className="h-8 shrink-0"
            onClick={() => navigate(`/app/projects/${projectId}/forms`)}
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
          <Badge
            variant={form.status === "active" ? "success" : "secondary"}
            className="shrink-0"
          >
            {form.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <CopyPromptButton
            buttonVariant="outline"
            buttonSize="sm"
            items={[
              {
                id: "api",
                label: "Copy API/Form Action Prompt",
                description: "API + native form action guidance for AI agents",
                onClick: handleCopyApiPrompt,
                copied: promptCopiedId === "api",
              },
              {
                id: "embedprompt",
                label: "Copy Embed Prompt",
                description: "Widget embed instructions with docs references",
                onClick: handleCopyEmbedPrompt,
                copied: promptCopiedId === "embedprompt",
              },
            ]}
          />
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
            {updateFormMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Globe className="h-3 w-3" />
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
                  disabled={!activeStep}
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

          <Card>
            <CardContent className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                HTML Action
              </p>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Action URL
                </Label>
                <Input
                  readOnly
                  value={nativeActionUrl}
                  className="h-8 text-xs"
                />
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  navigator.clipboard.writeText(nativeActionUrl);
                  setActionUrlCopied(true);
                  setTimeout(() => setActionUrlCopied(false), 2000);
                }}
              >
                {actionUrlCopied ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {actionUrlCopied ? "Copied Action URL" : "Copy Action URL"}
              </Button>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Success Behavior
                </Label>
                <Select
                  value={nativeActionSettings.successMode}
                  onValueChange={(value: "message" | "redirect") =>
                    handleNativeActionModeChange(value)
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="message">Hosted thank-you page</SelectItem>
                    <SelectItem value="redirect">Redirect to URL</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {nativeActionSettings.successMode === "redirect" ? (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Redirect URL
                  </Label>
                  <Input
                    type="url"
                    value={nativeRedirectUrl}
                    onChange={(e) => setNativeRedirectUrl(e.target.value)}
                    onBlur={handleNativeRedirectUrlBlur}
                    placeholder="https://your-site.com/thanks"
                    className="h-8 text-xs"
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Success Message
                  </Label>
                  <Input
                    value={nativeSuccessMessage}
                    onChange={(e) => setNativeSuccessMessage(e.target.value)}
                    onBlur={handleNativeSuccessMessageBlur}
                    placeholder={DEFAULT_NATIVE_SUCCESS_MESSAGE}
                    className="h-8 text-xs"
                  />
                </div>
              )}

              <p className="text-xs text-muted-foreground leading-relaxed">
                Use form field IDs as your HTML input names when posting directly
                to LinkyCal.
              </p>
              {hasFileFields && (
                <p className="text-xs text-amber-700 leading-relaxed">
                  File fields are not supported on the native HTML action
                  endpoint yet. Use the widget or JSON API for file uploads.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ─── Main Area ──────────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Step tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleStepDragEnd}>
              <SortableContext items={steps.map((s) => s.id)} strategy={horizontalListSortingStrategy}>
                {steps
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((step, idx) => (
                    <SortableStepTab
                      key={step.id}
                      step={step}
                      idx={idx}
                      isActive={step.id === activeStep?.id}
                      showDelete={steps.length > 1}
                      onSelect={() => setActiveStepId(step.id)}
                      onDelete={() => deleteStepMutation.mutate(step.id)}
                    />
                  ))}
              </SortableContext>
            </DndContext>
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
                    defaultValue={activeStep.title ?? ""}
                    key={`step-title-${activeStep.id}`}
                    placeholder="Step title"
                    className="h-9"
                    onBlur={(e) => {
                      if (e.target.value !== (activeStep.title ?? "")) {
                        updateStepMutation.mutate({
                          stepId: activeStep.id,
                          data: { title: e.target.value },
                        });
                      }
                    }}
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
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleFieldDragEnd}>
                    <SortableContext items={activeFields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {activeFields.map((field, fieldIdx) => {
                      const options = getFieldOptions(field);
                      const hasOptions = OPTION_FIELD_TYPES.includes(field.type);
                      const isLastField = fieldIdx === activeFields.length - 1;
                      const shouldAutoFocus = autoFocusLastField && isLastField;
                      return (
                        <SortableFieldCard
                          key={field.id}
                          id={field.id}
                          shouldAutoFocus={shouldAutoFocus}
                          onAutoFocused={() => setAutoFocusLastField(false)}
                        >
                          {(dragHandleProps) => (<>
                          {/* Row 1: Handle + Label + Required + Remove */}
                          <div className="flex items-center gap-3">
                            <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 cursor-grab" {...dragHandleProps} />
                            <InlineEditableLabel
                              value={field.label}
                              autoFocus={shouldAutoFocus}
                              onSave={(label) =>
                                updateFieldMutation.mutate({
                                  fieldId: field.id,
                                  data: { label },
                                })
                              }
                            />
                            <div className="flex items-center gap-3 ml-auto shrink-0">
                              <Select
                                value={field.type}
                                onValueChange={(val) => {
                                  const wasOptionType = OPTION_FIELD_TYPES.includes(field.type);
                                  const isOptionType = OPTION_FIELD_TYPES.includes(val);
                                  const updateData: Record<string, unknown> = { type: val };
                                  if (wasOptionType && !isOptionType) {
                                    updateData.options = null;
                                    setFieldOptionsState((prev) => {
                                      const next = { ...prev };
                                      delete next[field.id];
                                      return next;
                                    });
                                  }
                                if (!wasOptionType && isOptionType) {
                                  const seedOptions = val === "multi_select"
                                    ? [{ label: "Option 1", value: "option_1" }, { label: "Option 2", value: "option_2" }]
                                    : [{ label: "Option 1", value: "option_1" }];
                                  updateData.options = seedOptions;
                                  setFieldOptions(field.id, seedOptions);
                                }
                                // If switching to multi_select and only 1 option, add a second
                                if (wasOptionType && isOptionType && val === "multi_select") {
                                  const currentOpts = fieldOptionsState[field.id] ?? field.options ?? [];
                                  if (currentOpts.length < 2) {
                                    const seedOptions = [...currentOpts, { label: "Option 2", value: "option_2" }];
                                    updateData.options = seedOptions;
                                    setFieldOptions(field.id, seedOptions);
                                  }
                                }
                                  updateFieldMutation.mutate({ fieldId: field.id, data: updateData });
                                }}
                              >
                                <SelectTrigger className="h-6 w-auto text-[10px] px-2 rounded-full bg-secondary border-0 gap-1 shrink-0">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {FIELD_TYPES.map((ft) => (
                                    <SelectItem key={ft.type} value={ft.type}>
                                      {ft.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
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
                                size="sm"
                                className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                                onClick={() =>
                                  deleteFieldMutation.mutate(field.id)
                                }
                                disabled={deleteFieldMutation.isPending && deleteFieldMutation.variables === field.id}
                              >
                                {deleteFieldMutation.isPending && deleteFieldMutation.variables === field.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                                Remove
                              </Button>
                            </div>
                          </div>



                          {/* Row 3: Options (conditional) */}
                          {hasOptions && Array.isArray(options) && options.length > 0 && (() => {
                            const minOptions = field.type === "multi_select" ? 2 : 1;
                            return (
                              <div className="pl-7 mt-4 space-y-1.5 max-w-sm">
                                {options.map((opt, idx) => {
                                  const isLast = idx === options.length - 1;
                                  const canRemove = options.length > minOptions;
                                  return (
                                    <div key={idx} className="flex items-center gap-1.5">
                                      <Input
                                        placeholder={`Option ${idx + 1}`}
                                        value={opt.label}
                                        onChange={(e) =>
                                          updateFieldOption(field.id, idx, e.target.value)
                                        }
                                        onBlur={() => saveFieldOptions(field.id)}
                                        className="h-7 text-xs"
                                      />
                                      {isLast && (
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="h-7 px-2 shrink-0 text-xs"
                                          onClick={() => addFieldOption(field.id, field)}
                                        >
                                          <Plus className="h-3 w-3" />
                                          Add
                                        </Button>
                                      )}
                                      {canRemove && (
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 px-1.5 shrink-0 text-xs text-destructive hover:text-destructive"
                                          onClick={() => removeFieldOption(field.id, idx, field)}
                                        >
                                          <X className="h-3 w-3" />
                                        </Button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </>)}
                        </SortableFieldCard>
                      );
                    })}
                  </div>
                    </SortableContext>
                  </DndContext>
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

// ─── Sortable Field Card ─────────────────────────────────────────────────────

function SortableFieldCard({
  id,
  shouldAutoFocus,
  onAutoFocused,
  children,
}: {
  id: string;
  shouldAutoFocus: boolean;
  onAutoFocused: () => void;
  children: (dragHandleProps: Record<string, unknown>) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        if (shouldAutoFocus && node) onAutoFocused();
      }}
      style={style}
      className="rounded-[16px] border px-3 py-2.5 hover:border-primary/30 transition-colors bg-background"
    >
      {children({ ...listeners, ...attributes })}
    </div>
  );
}

// ─── Sortable Step Tab ───────────────────────────────────────────────────────

function SortableStepTab({
  step,
  idx,
  isActive,
  showDelete,
  onSelect,
  onDelete,
}: {
  step: { id: string; title: string | null };
  idx: number;
  isActive: boolean;
  showDelete: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      type="button"
      onClick={onSelect}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-[12px] px-3 py-1.5 text-sm font-medium transition-colors",
        isActive
          ? "bg-primary text-primary-foreground shadow-sm"
          : "bg-muted text-muted-foreground hover:bg-accent",
      )}
      {...attributes}
      {...listeners}
    >
      {step.title || `Step ${idx + 1}`}
      {showDelete && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation();
              onDelete();
            }
          }}
          className="ml-1 rounded-full p-0.5 hover:bg-white/20"
        >
          <X className="h-3 w-3" />
        </span>
      )}
    </button>
  );
}

// ─── Inline Editable Label ───────────────────────────────────────────────────

function InlineEditableLabel({
  value,
  onSave,
  autoFocus = false,
}: {
  value: string;
  onSave: (value: string) => void;
  autoFocus?: boolean;
}) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <input
      type="text"
      autoFocus={autoFocus}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={() => {
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
          e.currentTarget.blur();
        }
      }}
      className="text-sm font-medium text-foreground bg-transparent border-0 border-b border-dashed border-muted-foreground/30 focus:border-solid focus:border-primary outline-none min-w-0 pb-0.5 w-full max-w-[200px] transition-colors"
    />
  );
}

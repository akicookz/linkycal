import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  Plus,
  Loader,
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
  Settings,
  User,
  Link2,
  PartyPopper,
} from "lucide-react";
import CopyPromptButton from "@/components/CopyPromptButton";
import PageHeader from "@/components/PageHeader";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { useSession } from "@/lib/auth-client";
import { queryClient } from "@/lib/query-client";
import {
  generateFormApiPrompt,
  generateFormEmbedPrompt,
} from "@/lib/prompts";
import { getRenderableRichTextHtml, richTextToPlainText } from "@/lib/rich-text";
import { cn, copyToClipboard } from "@/lib/utils";
import { normalizeToFieldId } from "@/lib/constants";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  useDroppable,
  type CollisionDetection,
  type DragCancelEvent,
  type DragOverEvent,
  type DragStartEvent,
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
  description: string | null;
  placeholder: string | null;
  required: boolean;
  validation: unknown;
  options: Array<{ label: string; value: string }> | null;
  contactMapping: string | null;
  createdAt: string;
}

interface FormStep {
  id: string;
  formId: string;
  sortOrder: number;
  title: string | null;
  description: string | null;
  richDescription: string | null;
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

interface DraftFieldOption extends FieldOption {
  id: string;
}

interface NativeActionSettings {
  successMode?: "message" | "redirect";
  successMessage?: string;
  redirectUrl?: string;
}

interface FormSettings {
  nativeAction?: NativeActionSettings;
  responseNotificationEmail?: string;
}

interface CalendarConnectionAccount {
  connectionId: string;
  email: string;
  calendars: Array<{
    id: string;
    summary: string;
    primary: boolean;
    accessRole: string;
  }>;
}

interface NotificationDestinationOption {
  value: string;
  label: string;
}

const DEFAULT_RESPONSE_NOTIFICATION_DESTINATION = "__owner__";
const STEP_CANVAS_DROPPABLE_ID_PREFIX = "step-canvas:";
const STEP_DROP_TARGET_ID_PREFIX = "step-drop-target:";
const NEW_STEP_DROP_TARGET_ID = "step-drop-target:new";

function isValidEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// ─── Field Type Definitions ──────────────────────────────────────────────────

const FIELD_TYPES = [
  { type: "name", label: "Name", icon: User },
  { type: "text", label: "Text Input", icon: Type },
  { type: "textarea", label: "Textarea", icon: AlignLeft },
  { type: "email", label: "Email", icon: Mail },
  { type: "phone", label: "Phone", icon: Phone },
  { type: "url", label: "URL", icon: Link2 },
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

function isOptionFieldType(type: string): boolean {
  return OPTION_FIELD_TYPES.includes(type);
}

function createDraftFieldOption(option?: Partial<FieldOption>): DraftFieldOption {
  return {
    id: crypto.randomUUID(),
    label: option?.label ?? "",
    value: option?.value ?? "",
  };
}

function parseStoredFieldOptions(options: FormField["options"]): FieldOption[] {
  if (!options) return [];

  let parsed: unknown = options;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter(
      (option): option is FieldOption =>
        !!option &&
        typeof option === "object" &&
        typeof (option as { label?: unknown }).label === "string" &&
        typeof (option as { value?: unknown }).value === "string",
    )
    .map((option) => ({
      label: option.label,
      value: option.value,
    }));
}

function dedupeDraftFieldOptions(
  options: DraftFieldOption[],
): DraftFieldOption[] {
  const seenValues = new Map<string, number>();

  return options.map((option) => {
    const baseValue = option.value.trim();
    if (!baseValue) {
      return { ...option, value: "" };
    }

    const nextCount = (seenValues.get(baseValue) ?? 0) + 1;
    seenValues.set(baseValue, nextCount);

    return {
      ...option,
      value: nextCount === 1 ? baseValue : `${baseValue}_${nextCount}`,
    };
  });
}

function toDraftFieldOptions(options: FieldOption[]): DraftFieldOption[] {
  const source = options.length > 0 ? options : [{ label: "", value: "" }];
  return dedupeDraftFieldOptions(
    source.map((option) => createDraftFieldOption(option)),
  );
}

function toPersistedFieldOptions(options: DraftFieldOption[]): FieldOption[] {
  return options
    .filter((option) => option.label.trim() || option.value.trim())
    .map((option) => ({
      label: option.label.trim(),
      value: option.value.trim(),
    }));
}

function getFieldIcon(type: string) {
  if (type === "completion") return PartyPopper;
  const found = FIELD_TYPES.find((ft) => ft.type === type);
  return found?.icon ?? Type;
}

function sortFields(fields: FormField[]): FormField[] {
  return [...fields].sort((a, b) => a.sortOrder - b.sortOrder);
}

function normalizeFieldOrders(fields: FormField[]): FormField[] {
  return fields.map((field, index) => ({
    ...field,
    sortOrder: index,
  }));
}

function getStepCanvasDroppableId(stepId: string): string {
  return `${STEP_CANVAS_DROPPABLE_ID_PREFIX}${stepId}`;
}

function getStepDropTargetId(stepId: string): string {
  return `${STEP_DROP_TARGET_ID_PREFIX}${stepId}`;
}

function getIdValue(id: string | number | null | undefined): string | null {
  if (id === null || id === undefined) return null;
  return String(id);
}

function isStepDropTargetId(id: string | null): boolean {
  return id?.startsWith(STEP_DROP_TARGET_ID_PREFIX) ?? false;
}

function getStepIdFromDropTargetId(id: string): string | null {
  if (!isStepDropTargetId(id) || id === NEW_STEP_DROP_TARGET_ID) {
    return null;
  }

  return id.slice(STEP_DROP_TARGET_ID_PREFIX.length);
}

function moveFieldBetweenSteps(
  steps: FormStep[],
  fieldId: string,
  targetStepId: string,
  targetIndex?: number,
  updates?: Partial<FormField>,
): FormStep[] {
  let sourceStepId: string | null = null;
  let movingField: FormField | null = null;

  const stepsWithoutField = steps.map((step) => {
    const sortedFields = sortFields(step.fields);
    const fieldIndex = sortedFields.findIndex((field) => field.id === fieldId);
    if (fieldIndex === -1) {
      return {
        ...step,
        fields: sortedFields,
      };
    }

    sourceStepId = step.id;
    movingField = sortedFields[fieldIndex];

    return {
      ...step,
      fields: sortedFields.filter((field) => field.id !== fieldId),
    };
  });

  if (!movingField || !sourceStepId) {
    return steps;
  }

  const fieldToMove = movingField as FormField;

  const targetStep = stepsWithoutField.find((step) => step.id === targetStepId);
  if (!targetStep) {
    return steps;
  }

  const nextField = {
    ...fieldToMove,
    ...(updates ?? {}),
    stepId: targetStepId,
  };
  const nextFields = [...targetStep.fields];
  const insertionIndex = Math.max(
    0,
    Math.min(targetIndex ?? nextFields.length, nextFields.length),
  );
  nextFields.splice(insertionIndex, 0, nextField);

  return stepsWithoutField.map((step) => {
    if (step.id !== sourceStepId && step.id !== targetStepId) {
      return step;
    }

    if (step.id === targetStepId) {
      return {
        ...step,
        fields: normalizeFieldOrders(nextFields).map((field) =>
          field.id === fieldId
            ? { ...field, ...(updates ?? {}), stepId: targetStepId }
            : field,
        ),
      };
    }

    return {
      ...step,
      fields: normalizeFieldOrders(step.fields),
    };
  });
}

function updateFieldInSteps(
  steps: FormStep[],
  fieldId: string,
  data: Partial<FormField> & {
    stepId?: string;
    sortOrder?: number;
  },
): FormStep[] {
  const currentStep = steps.find((step) =>
    (step.fields ?? []).some((field) => field.id === fieldId),
  );
  if (!currentStep) return steps;

  if (data.stepId || data.sortOrder !== undefined) {
    const targetStepId = data.stepId ?? currentStep.id;
    const targetIndex = data.sortOrder;
    return moveFieldBetweenSteps(steps, fieldId, targetStepId, targetIndex, data);
  }

  return steps.map((step) => ({
    ...step,
    fields: step.fields.map((field) =>
      field.id === fieldId ? { ...field, ...data } : field,
    ),
  }));
}

function replaceFieldInSteps(
  steps: FormStep[],
  currentFieldId: string,
  nextField: FormField,
): FormStep[] {
  return steps.map((step) => ({
    ...step,
    fields: step.fields.map((field) =>
      field.id === currentFieldId ? nextField : field,
    ),
  }));
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
  const { data: session } = useSession();

  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  // Local options state for auto-save (keyed by field ID)
  const [fieldOptionsState, setFieldOptionsState] = useState<
    Record<string, DraftFieldOption[]>
  >({});
  const [autoFocusLastField, setAutoFocusLastField] = useState(false);
  const [activeStepTabDragId, setActiveStepTabDragId] = useState<string | null>(
    null,
  );
  const [draggingField, setDraggingField] = useState<FormField | null>(null);
  const [showStepDropTargets, setShowStepDropTargets] = useState(false);
  const [hoveredStepDropTargetId, setHoveredStepDropTargetId] = useState<
    string | null
  >(null);

  const [linkCopied, setLinkCopied] = useState(false);
  const [promptCopiedId, setPromptCopiedId] = useState<string | null>(null);
  const [actionUrlCopied, setActionUrlCopied] = useState(false);

  // Save status tracking (per field/step)
  const [saveStatus, setSaveStatus] = useState<
    Record<string, "saving" | "saved" | "error">
  >({});
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const setSaveStatusFor = useCallback(
    (id: string, status: "saving" | "saved" | "error") => {
      setSaveStatus((prev) => ({ ...prev, [id]: status }));
      if (saveTimers.current[id]) clearTimeout(saveTimers.current[id]);
      if (status === "saved") {
        saveTimers.current[id] = setTimeout(() => {
          setSaveStatus((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        }, 2000);
      }
    },
    [],
  );

  // Toggle state for optional title/description sections
  const [expandedStepTitle, setExpandedStepTitle] = useState<Set<string>>(
    new Set(),
  );
  const [expandedStepDesc, setExpandedStepDesc] = useState<Set<string>>(
    new Set(),
  );
  const [expandedFieldDesc, setExpandedFieldDesc] = useState<Set<string>>(
    new Set(),
  );


  // Inline-editing state for form name/slug
  const [editingName, setEditingName] = useState<string>("");
  const [editingSlug, setEditingSlug] = useState<string>("");
  const [settingsOpen, setSettingsOpen] = useState(false);

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
  const { data: calendarAccounts } = useQuery<{
    accounts: CalendarConnectionAccount[];
  }>({
    queryKey: ["calendar-accounts"],
    queryFn: async () => {
      const res = await fetch("/api/calendar/calendars");
      if (!res.ok) throw new Error("Failed to fetch calendars");
      return res.json();
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
  const sortedSteps = [...steps].sort((a, b) => a.sortOrder - b.sortOrder);
  const formSettings =
    form?.settings && typeof form.settings === "object"
      ? (form.settings as FormSettings)
      : {};
  const ownerEmail = session?.user?.email?.trim() ?? "";
  const responseNotificationEmail =
    typeof formSettings.responseNotificationEmail === "string" &&
    isValidEmailAddress(formSettings.responseNotificationEmail.trim())
      ? formSettings.responseNotificationEmail.trim()
      : "";
  const responseNotificationDestinationValue =
    responseNotificationEmail && responseNotificationEmail !== ownerEmail
      ? responseNotificationEmail
      : DEFAULT_RESPONSE_NOTIFICATION_DESTINATION;
  const responseNotificationOptions = useMemo<NotificationDestinationOption[]>(
    () => {
      const seenEmails = new Set<string>();
      const options: NotificationDestinationOption[] = [
        {
          value: DEFAULT_RESPONSE_NOTIFICATION_DESTINATION,
          label: ownerEmail
            ? `${ownerEmail} (default)`
            : "Project owner email (default)",
        },
      ];

      if (ownerEmail) {
        seenEmails.add(ownerEmail);
      }

      for (const account of calendarAccounts?.accounts ?? []) {
        const email = account.email.trim();
        if (!email || seenEmails.has(email)) continue;
        seenEmails.add(email);
        options.push({ value: email, label: email });
      }

      if (
        responseNotificationEmail &&
        responseNotificationEmail !== ownerEmail &&
        !seenEmails.has(responseNotificationEmail)
      ) {
        options.push({
          value: responseNotificationEmail,
          label: `${responseNotificationEmail} (saved)`,
        });
      }

      return options;
    },
    [calendarAccounts?.accounts, ownerEmail, responseNotificationEmail],
  );
  const hasFileFields = steps.some((step) =>
    (step.fields ?? []).some((field) => field.type === "file")
  );
  const hasCompletionPage = steps.some((step) =>
    (step.fields ?? []).some((field) => field.type === "completion")
  );

  const nativeActionUrl = form
    ? `${window.location.origin}/api/public/forms/${form.slug}/submit`
    : "";
  const activeStep = activeStepId
    ? sortedSteps.find((step) => step.id === activeStepId) ?? null
    : sortedSteps[0] ?? null;
  const activeFields = activeStep ? sortFields(activeStep.fields ?? []) : [];
  const activeStepCanvasDroppableId = activeStep
    ? getStepCanvasDroppableId(activeStep.id)
    : null;
  const fieldDropTargetSteps = draggingField
    ? sortedSteps.filter((step) => step.id !== draggingField.stepId)
    : [];
  // Sync active step when form loads
  useEffect(() => {
    if (form && sortedSteps.length > 0 && !activeStepId) {
      setActiveStepId(sortedSteps[0].id);
    }
  }, [form, sortedSteps, activeStepId]);

  // Sync editing name/slug when form loads
  useEffect(() => {
    if (form) {
      setEditingName(form.name);
      setEditingSlug(form.slug);
    }
  }, [form]);

  useEffect(() => {
    if (!form) {
      setFieldOptionsState((prev) =>
        Object.keys(prev).length === 0 ? prev : {},
      );
      return;
    }

    setFieldOptionsState((prev) => {
      const nextState: Record<string, DraftFieldOption[]> = {};
      let changed = false;

      for (const step of form.steps) {
        for (const field of step.fields) {
          if (!isOptionFieldType(field.type)) continue;

          if (prev[field.id]) {
            nextState[field.id] = prev[field.id];
            continue;
          }

          nextState[field.id] = toDraftFieldOptions(
            parseStoredFieldOptions(field.options),
          );
          changed = true;
        }
      }

      if (!changed && Object.keys(prev).length !== Object.keys(nextState).length) {
        changed = true;
      }

      return changed ? nextState : prev;
    });
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
    mutationFn: async (vars?: { title?: string }) => {
      const res = await fetch(
        `/api/projects/${projectId}/forms/${formId}/steps`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: vars?.title ?? `Step ${steps.length + 1}`,
          }),
        }
      );
      if (!res.ok) throw new Error("Failed to add step");
      const json = await res.json();
      return json;
    },
    onMutate: async (vars) => {
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
            title: vars?.title ?? `Step ${old.steps.length + 1}`,
            description: null,
            richDescription: null,
            settings: null,
            fields: [],
          },
        ],
      }));
      setActiveStepId(tempId);
      return { snapshot, tempId };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) rollback(ctx.snapshot);
      setActiveStepId(ctx?.snapshot?.steps[0]?.id ?? null);
    },
    onSuccess: (data, _variables, ctx) => {
      const step = data?.step as FormStep | undefined;
      if (!step) return;

      const optimisticTempId = (ctx as { tempId?: string } | undefined)?.tempId;

      optimisticSetForm((old) => ({
        ...old,
        steps: old.steps.some((existingStep) => existingStep.id === step.id)
          ? old.steps
          : optimisticTempId && old.steps.some((existingStep) => existingStep.id === optimisticTempId)
            ? old.steps.map((existingStep) =>
              existingStep.id === optimisticTempId ? step : existingStep,
            )
            : [...old.steps, step],
      }));

      setActiveStepId(step.id);
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
      data: Partial<{
        title: string;
        description: string | null;
        richDescription: string | null;
      }>;
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
      setSaveStatusFor(stepId, "saving");
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
    onSuccess: (_data, variables) => {
      setSaveStatusFor(variables.stepId, "saved");
    },
    onError: (_err, vars, ctx) => {
      setSaveStatusFor(vars.stepId, "error");
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
      if (activeStepId === stepId && sortedSteps.length > 1) {
        const remaining = sortedSteps.filter((step) => step.id !== stepId);
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
      description,
    }: {
      stepId: string;
      type: string;
      label: string;
      description?: string;
    }) => {
      const res = await fetch(
        `/api/projects/${projectId}/forms/${formId}/fields`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stepId, type, label, ...(description ? { description } : {}) }),
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
        steps: old.steps.map((step) =>
          step.id === stepId
            ? {
              ...step,
              fields: [
                ...step.fields,
                {
                  id: tempId,
                  stepId,
                  sortOrder: step.fields.length,
                  type,
                  label,
                  description: null,
                  placeholder: null,
                  required: false,
                  validation: null,
                  options: null,
                  contactMapping: null,
                  createdAt: new Date().toISOString(),
                },
              ],
            }
            : step,
        ),
      }));

      return { snapshot, tempId };
    },
    onSuccess: (data, variables, ctx) => {
      const field = data?.field as FormField | undefined;
      if (!field) return;
      const tempId = (ctx as { tempId?: string } | undefined)?.tempId;

      optimisticSetForm((old) => ({
        ...old,
        steps: old.steps.map((step) =>
          step.id === variables.stepId
            ? {
              ...step,
              fields: step.fields.some((existingField) => existingField.id === field.id)
                ? step.fields
                : tempId && step.fields.some((existingField) => existingField.id === tempId)
                  ? step.fields.map((existingField) =>
                    existingField.id === tempId ? field : existingField,
                  )
                  : [...step.fields, field],
            }
            : step,
        ),
      }));

      if (tempId) {
        setFieldOptionsState((prev) => {
          if (!prev[tempId]) return prev;

          const next = { ...prev, [field.id]: prev[tempId] };
          delete next[tempId];
          return next;
        });
      }

      if (isOptionFieldType(field.type)) {
        setFieldOptionsState((prev) =>
          prev[field.id]
            ? prev
            : {
              ...prev,
              [field.id]: toDraftFieldOptions(
                parseStoredFieldOptions(field.options),
              ),
            },
        );
      }
    },
    onError: (_err, _variables, ctx) => {
      if (ctx?.snapshot) rollback(ctx.snapshot);
      const tempId = (ctx as { tempId?: string } | undefined)?.tempId;
      if (tempId) {
        setFieldOptionsState((prev) => {
          if (!prev[tempId]) return prev;

          const next = { ...prev };
          delete next[tempId];
          return next;
        });
      }
      setAutoFocusLastField(false);
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
        description: string | null;
        placeholder: string | null;
        required: boolean;
        type: string;
        options: FieldOption[] | null;
        validation: Record<string, unknown> | null;
        stepId: string;
        sortOrder: number;
        contactMapping: string | null;
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
      setSaveStatusFor(fieldId, "saving");
      await queryClient.cancelQueries({ queryKey: formQueryKey });
      const snapshot = snapshotForm();
      optimisticSetForm((old) => ({
        ...old,
        steps: updateFieldInSteps(old.steps, fieldId, data),
      }));
      return { snapshot };
    },
    onSuccess: (data, variables) => {
      const field = data?.field as FormField | undefined;
      if (!field) {
        setSaveStatusFor(variables.fieldId, "saved");
        return;
      }

      optimisticSetForm((old) => ({
        ...old,
        steps: replaceFieldInSteps(old.steps, variables.fieldId, field),
      }));

      // Track status under the new ID if it changed
      const trackId = field.id !== variables.fieldId ? field.id : variables.fieldId;
      setSaveStatusFor(trackId, "saved");

      if (field.id !== variables.fieldId) {
        setFieldOptionsState((prev) => {
          if (!prev[variables.fieldId]) return prev;

          const next = {
            ...prev,
            [field.id]: prev[variables.fieldId],
          };
          delete next[variables.fieldId];
          return next;
        });
      }
    },
    onError: (_err, vars, ctx) => {
      setSaveStatusFor(vars.fieldId, "error");
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
           fields: (s.fields ?? []).filter((f) => f.id !== fieldId),
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
    patch: Partial<FormSettings>,
  ): FormSettings {
    const nextSettings: FormSettings = {
      ...formSettings,
      ...patch,
      nativeAction:
        formSettings.nativeAction || patch.nativeAction
          ? {
              ...formSettings.nativeAction,
              ...patch.nativeAction,
            }
          : undefined,
    };

    if (!nextSettings.nativeAction) {
      delete nextSettings.nativeAction;
    }

    if (!nextSettings.responseNotificationEmail) {
      delete nextSettings.responseNotificationEmail;
    }

    return nextSettings;
  }

  const handleResponseNotificationDestinationChange = useCallback(
    (value: string) => {
      updateFormMutation.mutate({
        settings: buildUpdatedFormSettings({
          responseNotificationEmail:
            value === DEFAULT_RESPONSE_NOTIFICATION_DESTINATION
              ? undefined
              : value,
        }),
      });
    },
    [updateFormMutation, formSettings],
  );

  // ─── Drag and Drop ─────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  const fieldCollisionDetection = useCallback<CollisionDetection>(
    (args) => {
      const collisions = pointerWithin(args);
      if (collisions.length === 0) {
        return [];
      }

      if (!activeStepCanvasDroppableId) {
        return collisions;
      }

      const focusedCollisions = collisions.filter(
        (collision) => collision.id !== activeStepCanvasDroppableId,
      );

      return focusedCollisions.length > 0 ? focusedCollisions : collisions;
    },
    [activeStepCanvasDroppableId],
  );

  function clearFieldDragState() {
    setDraggingField(null);
    setShowStepDropTargets(false);
    setHoveredStepDropTargetId(null);
  }

  function handleFieldDragStart(event: DragStartEvent) {
    if (!activeStep) return;

    const activeId = getIdValue(event.active.id);
    if (!activeId) return;

    const field = activeFields.find((candidate) => candidate.id === activeId);
    if (!field) return;

    setDraggingField(field);
  }

  function handleFieldDragOver(event: DragOverEvent) {
    const overId = getIdValue(event.over?.id);
    const isInsideActiveStep =
      overId !== null &&
      (overId === activeStepCanvasDroppableId || activeFields.some((field) => field.id === overId));

    setShowStepDropTargets(Boolean(draggingField) && !isInsideActiveStep);

    if (overId === NEW_STEP_DROP_TARGET_ID || isStepDropTargetId(overId)) {
      setHoveredStepDropTargetId(overId);
      return;
    }

    setHoveredStepDropTargetId(null);
  }

  function handleFieldDragCancel(_event: DragCancelEvent) {
    clearFieldDragState();
  }

  async function moveFieldToStep(fieldId: string, targetStepId: string) {
    const sourceStepId = draggingField?.stepId;
    const targetStep = sortedSteps.find((step) => step.id === targetStepId);
    if (!targetStep || !sourceStepId) return;

    setActiveStepId(targetStepId);

    try {
      await updateFieldMutation.mutateAsync({
        fieldId,
        data: {
          stepId: targetStepId,
          sortOrder: targetStep.fields.length,
        },
      });
    } catch {
      setActiveStepId(sourceStepId);
    }
  }

  async function moveFieldToNewStep(fieldId: string) {
    const sourceStepId = draggingField?.stepId;
    if (!sourceStepId) return;

    try {
      const response = await addStepMutation.mutateAsync({});
      const nextStep = response?.step as FormStep | undefined;
      if (!nextStep) {
        throw new Error("Failed to create destination step");
      }

      setActiveStepId(nextStep.id);
      await updateFieldMutation.mutateAsync({
        fieldId,
        data: {
          stepId: nextStep.id,
          sortOrder: 0,
        },
      });
    } catch {
      setActiveStepId(sourceStepId);
    }
  }

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

  async function handleFieldDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const activeId = getIdValue(active.id);
    const overId = getIdValue(over?.id);

    clearFieldDragState();

    if (!activeId || !activeStep) return;

    if (overId === NEW_STEP_DROP_TARGET_ID) {
      await moveFieldToNewStep(activeId);
      return;
    }

    if (overId && isStepDropTargetId(overId)) {
      const targetStepId = getStepIdFromDropTargetId(overId);
      if (targetStepId && targetStepId !== activeStep.id) {
        await moveFieldToStep(activeId, targetStepId);
      }
      return;
    }

    if (!overId || activeId === overId) return;

    const oldIndex = activeFields.findIndex((field) => field.id === activeId);
    const newIndex = activeFields.findIndex((field) => field.id === overId);
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

  function handleStepDragStart(event: DragStartEvent) {
    const activeId = getIdValue(event.active.id);
    setActiveStepTabDragId(activeId);
  }

  function handleStepDragCancel(_event: DragCancelEvent) {
    setActiveStepTabDragId(null);
  }

  function handleStepDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveStepTabDragId(null);
    if (!over || active.id === over.id) return;

    const oldIndex = sortedSteps.findIndex((step) => step.id === active.id);
    const newIndex = sortedSteps.findIndex((step) => step.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(sortedSteps, oldIndex, newIndex);

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
    const targetStepId = activeStepId ?? sortedSteps[0]?.id;
    if (!targetStepId) return;
    addFieldMutation.mutate({ stepId: targetStepId, type, label });
  }

  async function handleAddCompletionPage() {
    const tempStepId = `temp-${crypto.randomUUID()}`;
    const tempFieldId = `temp-${crypto.randomUUID()}`;
    const snapshot = snapshotForm();

    // Optimistic: add step with completion field already present
    optimisticSetForm((old) => ({
      ...old,
      steps: [
        ...old.steps,
        {
          id: tempStepId,
          formId: old.id,
          sortOrder: old.steps.length,
          title: "Completion",
          description: null,
          richDescription: null,
          settings: null,
          fields: [
            {
              id: tempFieldId,
              stepId: tempStepId,
              sortOrder: 0,
              type: "completion",
              label: "Thank you!",
              description: "<p>Your response has been submitted successfully.</p>",
              placeholder: null,
              required: false,
              validation: null,
              options: null,
              contactMapping: null,
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ],
    }));
    setActiveStepId(tempStepId);

    try {
      // Create the step on the server
      const stepRes = await fetch(
        `/api/projects/${projectId}/forms/${formId}/steps`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Completion" }),
        },
      );
      if (!stepRes.ok) throw new Error("Failed to create step");
      const stepJson = await stepRes.json();
      const newStep = stepJson?.step as FormStep | undefined;
      if (!newStep) throw new Error("No step returned");

      // Create the completion field on the server
      const fieldRes = await fetch(
        `/api/projects/${projectId}/forms/${formId}/fields`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stepId: newStep.id,
            type: "completion",
            label: "Thank you!",
            description: "<p>Your response has been submitted successfully.</p>",
          }),
        },
      );
      if (!fieldRes.ok) throw new Error("Failed to create field");

      // Refresh from server
      setActiveStepId(newStep.id);
      queryClient.invalidateQueries({ queryKey: formQueryKey });
    } catch {
      // Rollback on any failure
      if (snapshot) rollback(snapshot);
      setActiveStepId(sortedSteps[0]?.id ?? null);
    }
  }

  // ─── Field options helpers (auto-save) ──────────────────────────────────

  function getFieldOptions(field: FormField): DraftFieldOption[] {
    if (fieldOptionsState[field.id]) {
      const cached = fieldOptionsState[field.id];
      return Array.isArray(cached)
        ? cached
        : toDraftFieldOptions(parseStoredFieldOptions(field.options));
    }

    return toDraftFieldOptions(parseStoredFieldOptions(field.options));
  }

  function setFieldOptions(fieldId: string, options: DraftFieldOption[]) {
    setFieldOptionsState((prev) => ({
      ...prev,
      [fieldId]: dedupeDraftFieldOptions(options),
    }));
  }

  function saveFieldOptions(fieldId: string) {
    const options = fieldOptionsState[fieldId];
    if (!options || !Array.isArray(options)) return;
    const persistedOptions = toPersistedFieldOptions(options);
    const nextOptions =
      persistedOptions.length > 0
        ? options
            .filter((option) => option.label.trim() || option.value.trim())
            .map((option, index) => ({
              ...option,
              label: persistedOptions[index]?.label ?? option.label.trim(),
              value: persistedOptions[index]?.value ?? option.value.trim(),
            }))
        : toDraftFieldOptions([]);

    setFieldOptions(fieldId, nextOptions);

    updateFieldMutation.mutate({
      fieldId,
      data: { options: persistedOptions },
    });
  }

  function addFieldOption(fieldId: string, field: FormField) {
    const current = getFieldOptions(field);
    const nextNum = current.length + 1;
    const updated = [
      ...current,
      createDraftFieldOption({
        label: `Option ${nextNum}`,
        value: `option_${nextNum}`,
      }),
    ];
    setFieldOptions(fieldId, updated);
    // Don't mutate here — saved on blur when user edits the new option label
  }

  function removeFieldOption(fieldId: string, index: number, field: FormField) {
    const current = getFieldOptions(field);
    const updated = current.filter((_, i) => i !== index);
    setFieldOptions(fieldId, updated);
    updateFieldMutation.mutate({
      fieldId,
      data: { options: toPersistedFieldOptions(updated) },
    });
  }

  function updateFieldOption(
    fieldId: string,
    index: number,
    val: string,
    field: FormField,
  ) {
    const current = getFieldOptions(field);
    const updated = current.map((o, i) =>
      i === index
        ? {
          ...o,
          label: val,
          value: val.trim() ? normalizeToFieldId(val) : "",
        }
        : o,
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
                    <Loader className="h-4 w-4 animate-spin" />
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
          <span className="text-lg font-semibold truncate">{form.name}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 shrink-0"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="h-4 w-4" />
            Settings
          </Button>
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
              <Loader className="h-3 w-3 animate-spin" />
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
                  disabled={sortedSteps.length === 0 || activeFields.some((f) => f.type === "completion")}
                  className="flex w-full items-center gap-3 rounded-[16px] border px-3 py-2.5 text-sm text-left hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ft.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  {ft.label}
                </button>
              ))}
              {activeFields.some((f) => f.type === "completion") && (
                <p className="text-[11px] text-muted-foreground px-1">
                  Not available on completion page
                </p>
              )}

              <button
                type="button"
                onClick={handleAddCompletionPage}
                disabled={hasCompletionPage || addStepMutation.isPending}
                className="flex w-full items-center gap-3 rounded-[16px] border px-3 py-2.5 text-sm text-left hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <PartyPopper className="h-4 w-4 text-muted-foreground shrink-0" />
                Completion Page
              </button>
            </CardContent>
          </Card>
        </div>

        {/* ─── Main Area ──────────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Step tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleStepDragStart}
              onDragCancel={handleStepDragCancel}
              onDragEnd={handleStepDragEnd}
            >
              <SortableContext items={sortedSteps.map((step) => step.id)} strategy={horizontalListSortingStrategy}>
                {sortedSteps.map((step, idx) => (
                  <SortableStepTab
                    key={step.id}
                    step={step}
                    idx={idx}
                    isActive={step.id === activeStep?.id}
                    showDelete={sortedSteps.length > 1}
                    onSelect={() => setActiveStepId(step.id)}
                    onDelete={() => deleteStepMutation.mutate(step.id)}
                  />
                ))}
              </SortableContext>
              <DragOverlay>
                {activeStepTabDragId ? (
                  <StepTabShell
                    label={
                      sortedSteps.find((step) => step.id === activeStepTabDragId)?.title ||
                      `Step ${sortedSteps.findIndex((step) => step.id === activeStepTabDragId) + 1}`
                    }
                    isActive
                    isOverlay
                  />
                ) : null}
              </DragOverlay>
            </DndContext>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 shrink-0"
              onClick={() => addStepMutation.mutate({})}
              disabled={addStepMutation.isPending}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Step
            </Button>
          </div>

          {/* Active step content */}
          {activeStep ? (
            <DndContext
              sensors={sensors}
              collisionDetection={fieldCollisionDetection}
              onDragStart={handleFieldDragStart}
              onDragOver={handleFieldDragOver}
              onDragCancel={handleFieldDragCancel}
              onDragEnd={handleFieldDragEnd}
            >
              {showStepDropTargets && (
                <div className="flex min-h-[136px] items-stretch gap-3 overflow-x-auto px-1 pt-1 pb-3">
                  {fieldDropTargetSteps.map((step) => {
                    const stepNumber = sortedSteps.findIndex((candidate) => candidate.id === step.id) + 1;
                    return (
                      <StepDropTarget
                        key={step.id}
                        id={getStepDropTargetId(step.id)}
                        title={step.title || `Step ${stepNumber}`}
                        description="Move question here"
                        isHovered={hoveredStepDropTargetId === getStepDropTargetId(step.id)}
                      />
                    );
                  })}
                  <StepDropTarget
                    id={NEW_STEP_DROP_TARGET_ID}
                    title="New Step"
                    description="Create and move here"
                    isHovered={hoveredStepDropTargetId === NEW_STEP_DROP_TARGET_ID}
                    isNew
                  />
                </div>
              )}

              <StepCanvasDropZone
                id={activeStepCanvasDroppableId ?? getStepCanvasDroppableId(activeStep.id)}
                isDraggingField={Boolean(draggingField)}
                isCrossStepMode={showStepDropTargets}
              >
                <Card>
                  <CardContent className="space-y-4">
                    {/* Step title & description — hidden for completion steps */}
                    {!activeFields.some((f) => f.type === "completion") && (
                    <div className="space-y-2">
                      {/* Toggle buttons for adding title/description */}
                      {!expandedStepTitle.has(activeStep.id) && !activeStep.title ? (
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() =>
                              setExpandedStepTitle((prev) => new Set(prev).add(activeStep.id))
                            }
                          >
                            <Plus className="h-3 w-3 inline mr-0.5 -mt-px" />
                            Add title
                          </button>
                          {!expandedStepDesc.has(activeStep.id) && !activeStep.description && !activeStep.richDescription && (
                            <button
                              type="button"
                              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                              onClick={() =>
                                setExpandedStepDesc((prev) => new Set(prev).add(activeStep.id))
                              }
                            >
                              <Plus className="h-3 w-3 inline mr-0.5 -mt-px" />
                              Add description
                            </button>
                          )}
                        </div>
                      ) : (
                        <InlineEditableLabel
                          key={`step-title-${activeStep.id}`}
                          value={activeStep.title ?? ""}
                          placeholder="Step title..."
                          saveStatus={saveStatus[activeStep.id] ?? null}
                          onSave={(title) =>
                            updateStepMutation.mutate({
                              stepId: activeStep.id,
                              data: { title },
                            })
                          }
                        />
                      )}

                      {/* Description: show button if title is visible but desc is not */}
                      {(expandedStepTitle.has(activeStep.id) || !!activeStep.title) &&
                       !expandedStepDesc.has(activeStep.id) &&
                       !activeStep.description &&
                       !activeStep.richDescription && (
                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() =>
                            setExpandedStepDesc((prev) => new Set(prev).add(activeStep.id))
                          }
                        >
                          <Plus className="h-3 w-3 inline mr-0.5 -mt-px" />
                          Add description
                        </button>
                      )}

                      {(expandedStepDesc.has(activeStep.id) || !!activeStep.description || !!activeStep.richDescription) && (
                        <RichTextEditor
                          key={`step-rich-desc-${activeStep.id}`}
                          value={getRenderableRichTextHtml(
                            activeStep.richDescription,
                            activeStep.description,
                          )}
                          placeholder="Add a short intro, context, or instructions for this step."
                          onSave={(richDescription) => {
                            const currentValue = getRenderableRichTextHtml(
                              activeStep.richDescription,
                              activeStep.description,
                            );
                            const plainDescription =
                              richTextToPlainText(richDescription) || null;
                            if (
                              richDescription !== currentValue ||
                              plainDescription !== (activeStep.description ?? null)
                            ) {
                              updateStepMutation.mutate({
                                stepId: activeStep.id,
                                data: {
                                  description: plainDescription,
                                  richDescription,
                                },
                              });
                            }
                          }}
                        />
                      )}
                    </div>
                    )}

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
                      <SortableContext items={activeFields.map((field) => field.id)} strategy={verticalListSortingStrategy}>
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
                                  {field.type === "completion" ? (
                                    <div className={cn(
                                      "transition-opacity",
                                      saveStatus[field.id] === "saving" && "opacity-50 pointer-events-none",
                                    )}>
                                       {/* Completion field editor */}
                                       <div className="flex items-start gap-3">
                                         <GripVertical className="h-4 w-4 mt-1 text-muted-foreground shrink-0 cursor-grab" {...dragHandleProps} />
                                         <PartyPopper className="h-4 w-4 mt-1 text-primary shrink-0" />
                                         <InlineEditableLabel
                                           value={field.label}
                                           placeholder="Completion title..."
                                           saveStatus={saveStatus[field.id] ?? null}
                                           onSave={(label) =>
                                             updateFieldMutation.mutate({
                                               fieldId: field.id,
                                               data: { label },
                                             })
                                           }
                                         />
                                         <div className="ml-auto shrink-0">
                                           <Button
                                             variant="ghost"
                                             size="sm"
                                             className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                                             onClick={() => deleteFieldMutation.mutate(field.id)}
                                             disabled={deleteFieldMutation.isPending && deleteFieldMutation.variables === field.id}
                                           >
                                             {deleteFieldMutation.isPending && deleteFieldMutation.variables === field.id ? (
                                               <Loader className="h-3.5 w-3.5 animate-spin" />
                                             ) : (
                                               <Trash2 className="h-3.5 w-3.5" />
                                             )}
                                           </Button>
                                         </div>
                                       </div>
                                       <div className="pl-7 mt-2 space-y-3">
                                         {/* Description — collapsible */}
                                         {expandedFieldDesc.has(field.id) || field.description ? (
                                           <RichTextEditor
                                             key={`completion-desc-${field.id}`}
                                             value={field.description ?? ""}
                                             placeholder="Write a thank-you message for your respondents."
                                             onSave={(html) =>
                                               updateFieldMutation.mutate({
                                                 fieldId: field.id,
                                                 data: { description: html },
                                               })
                                             }
                                           />
                                         ) : (
                                           <button
                                             type="button"
                                             className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                             onClick={() =>
                                               setExpandedFieldDesc((prev) => new Set(prev).add(field.id))
                                             }
                                           >
                                             <Plus className="h-3 w-3 inline mr-0.5 -mt-px" />
                                             Add description
                                           </button>
                                         )}
                                         {/* Redirect URL */}
                                         <div className="space-y-1.5">
                                           <span className="text-xs text-muted-foreground">Redirect URL (optional)</span>
                                           <Input
                                             type="url"
                                             defaultValue={
                                               field.validation &&
                                               typeof field.validation === "object" &&
                                               (field.validation as Record<string, unknown>).redirectUrl
                                                 ? String((field.validation as Record<string, unknown>).redirectUrl)
                                                 : ""
                                             }
                                             key={`completion-redirect-${field.id}`}
                                             placeholder="https://your-site.com/thanks"
                                             className="h-8 text-xs"
                                             onBlur={(e) => {
                                               const url = e.target.value.trim();
                                               updateFieldMutation.mutate({
                                                 fieldId: field.id,
                                                 data: {
                                                   validation: url ? { redirectUrl: url } : null,
                                                 },
                                               });
                                             }}
                                           />
                                           <p className="text-xs text-muted-foreground leading-relaxed">
                                             Shows for 5 seconds before redirecting if a URL is set.
                                           </p>
                                         </div>
                                       </div>
                                     </div>
                                   ) : (
                                    <div className={cn(
                                      "transition-opacity",
                                      saveStatus[field.id] === "saving" && "opacity-50 pointer-events-none",
                                    )}>
                                   {/* Row 1: Handle + Label + Type + Required + Remove */}
                                   <div className="flex items-start gap-3">
                                     <GripVertical className="h-4 w-4 mt-1 text-muted-foreground shrink-0 cursor-grab" {...dragHandleProps} />
                                     <InlineEditableLabel
                                       value={field.label}
                                       autoFocus={shouldAutoFocus}
                                       placeholder="Field label..."
                                       saveStatus={saveStatus[field.id] ?? null}
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
                                           const wasOptionType = isOptionFieldType(field.type);
                                           const isOptionType = isOptionFieldType(val);
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
                                               ? toDraftFieldOptions([
                                                 { label: "Option 1", value: "option_1" },
                                                 { label: "Option 2", value: "option_2" },
                                               ])
                                               : toDraftFieldOptions([
                                                 { label: "Option 1", value: "option_1" },
                                               ]);
                                             updateData.options = toPersistedFieldOptions(seedOptions);
                                             setFieldOptions(field.id, seedOptions);
                                           }
                                           if (wasOptionType && isOptionType && val === "multi_select") {
                                             const currentOpts = getFieldOptions(field);
                                             if (currentOpts.length < 2) {
                                               const seedOptions = [
                                                 ...currentOpts,
                                                 createDraftFieldOption({
                                                   label: "Option 2",
                                                   value: "option_2",
                                                 }),
                                               ];
                                               updateData.options = toPersistedFieldOptions(seedOptions);
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
                                       {(field.type === "name" || field.type === "email") && (
                                         <TooltipProvider delayDuration={200}>
                                           <Tooltip>
                                             <TooltipTrigger asChild>
                                               <button
                                                 type="button"
                                                 className={cn(
                                                   "h-6 w-6 rounded-md flex items-center justify-center transition-colors",
                                                   field.contactMapping
                                                     ? "bg-primary text-primary-foreground"
                                                     : "text-muted-foreground hover:text-foreground hover:bg-muted",
                                                 )}
                                                 onClick={() => {
                                                   const newMapping = field.contactMapping
                                                     ? null
                                                     : field.type === "name" ? "name" : "email";
                                                   if (newMapping) {
                                                     optimisticSetForm((old) => ({
                                                       ...old,
                                                       steps: old.steps.map((s) => ({
                                                         ...s,
                                                         fields: s.fields.map((f) =>
                                                           f.id !== field.id && f.contactMapping === newMapping
                                                             ? { ...f, contactMapping: null }
                                                             : f,
                                                         ),
                                                       })),
                                                     }));
                                                   }
                                                   updateFieldMutation.mutate({
                                                     fieldId: field.id,
                                                     data: { contactMapping: newMapping },
                                                   });
                                                 }}
                                               >
                                                 <User className="h-3 w-3" />
                                               </button>
                                             </TooltipTrigger>
                                             <TooltipContent side="bottom" className="max-w-56 text-xs">
                                               {field.contactMapping
                                                 ? `Saved as contact's ${field.type}. Click to unlink.`
                                                 : `Save as contact's ${field.type} for bookings & contacts`}
                                             </TooltipContent>
                                           </Tooltip>
                                         </TooltipProvider>
                                       )}
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
                                           <Loader className="h-3.5 w-3.5 animate-spin" />
                                         ) : (
                                           <Trash2 className="h-3.5 w-3.5" />
                                         )}
                                       </Button>
                                     </div>
                                   </div>

                                   {/* Field description — collapsible */}
                                   <div className="pl-7 mt-2">
                                     {expandedFieldDesc.has(field.id) || field.description ? (
                                       <RichTextEditor
                                         key={`field-desc-${field.id}`}
                                         value={field.description ?? ""}
                                         placeholder="Add a description or helper text"
                                         className="text-xs"
                                         onSave={(html) =>
                                           updateFieldMutation.mutate({
                                             fieldId: field.id,
                                             data: { description: html },
                                           })
                                         }
                                       />
                                     ) : (
                                       <button
                                         type="button"
                                         className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                         onClick={() =>
                                           setExpandedFieldDesc((prev) => new Set(prev).add(field.id))
                                         }
                                       >
                                         <Plus className="h-3 w-3 inline mr-0.5 -mt-px" />
                                         Add description
                                       </button>
                                     )}
                                   </div>

                                   {hasOptions && Array.isArray(options) && options.length > 0 && (() => {
                                     const minOptions = field.type === "multi_select" ? 2 : 1;
                                     return (
                                       <div className="pl-7 mt-4 space-y-1.5 max-w-sm">
                                         {options.map((opt, idx) => {
                                           const isLast = idx === options.length - 1;
                                           const canRemove = options.length > minOptions;
                                           return (
                                             <div key={opt.id} className="flex items-center gap-1.5">
                                               <Input
                                                 placeholder={`Option ${idx + 1}`}
                                                 value={opt.label}
                                                 onChange={(e) =>
                                                   updateFieldOption(field.id, idx, e.target.value, field)
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
                                     </div>
                                   )}
                                </>)}
                              </SortableFieldCard>
                            );
                          })}
                        </div>
                      </SortableContext>
                    )}
                  </CardContent>
                </Card>
              </StepCanvasDropZone>

              <DragOverlay>
                {draggingField ? <FieldDragPreview field={draggingField} /> : null}
              </DragOverlay>
            </DndContext>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed min-h-[400px]">
              <p className="text-sm text-muted-foreground mb-3">
                No steps yet. Add a step to start building your form.
              </p>
              <Button
                size="sm"
                onClick={() => addStepMutation.mutate({})}
                disabled={addStepMutation.isPending}
              >
                <Plus className="h-4 w-4" />
                Add Step
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ─── Settings Dialog ────────────────────────────────────────── */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Form Settings</DialogTitle>
            <DialogDescription>
              Configure your form name, slug, status, notifications, and HTML action settings.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* Form Name */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Form Name</Label>
              <Input
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={handleNameBlur}
                className="h-9"
              />
            </div>

            {/* Form Slug */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Form Slug</Label>
              <Input
                value={editingSlug}
                onChange={(e) => setEditingSlug(e.target.value)}
                onBlur={handleSlugBlur}
                className="h-9"
              />
            </div>

            {/* Status */}
            <div className="flex items-center justify-between rounded-[16px] bg-muted/50 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Status</p>
                <p className="text-xs text-muted-foreground">
                  {form.status === "active"
                    ? "Form is live and accepting responses"
                    : "Form is hidden from respondents"}
                </p>
              </div>
              <Switch
                checked={form.status === "active"}
                onCheckedChange={(checked) =>
                  updateFormMutation.mutate({
                    status: checked ? "active" : "draft",
                  })
                }
              />
            </div>

            {/* Notifications */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Send new response emails to
              </Label>
              <Select
                value={responseNotificationDestinationValue}
                onValueChange={handleResponseNotificationDestinationChange}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {responseNotificationOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground leading-relaxed">
                New inquiry emails for this form will be sent to the selected address.
              </p>
            </div>

            {/* HTML Action */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">HTML Action URL</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={nativeActionUrl}
                    className="h-9 text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
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
                    {actionUrlCopied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Use form field IDs as your HTML input names when posting directly to LinkyCal.
                </p>
              </div>
              {hasFileFields && (
                <p className="text-xs text-amber-700 leading-relaxed">
                  File fields are not supported on the native HTML action endpoint yet.
                  Use the widget or JSON API for file uploads.
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
    opacity: isDragging ? 0.15 : 1,
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

function StepCanvasDropZone({
  id,
  isDraggingField,
  isCrossStepMode,
  children,
}: {
  id: string;
  isDraggingField: boolean;
  isCrossStepMode: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-[24px] transition-all",
        isDraggingField && !isCrossStepMode && "ring-2 ring-primary/15 ring-offset-4 ring-offset-background",
        isOver && !isCrossStepMode && "ring-primary/25",
      )}
    >
      {children}
    </div>
  );
}

function StepDropTarget({
  id,
  title,
  description,
  isHovered,
  isNew = false,
}: {
  id: string;
  title: string;
  description: string;
  isHovered: boolean;
  isNew?: boolean;
}) {
  const { setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex h-[124px] w-[124px] shrink-0 flex-col justify-between rounded-[22px] border border-dashed bg-muted/40 p-3.5 text-left transition-all",
        isHovered
          ? "border-primary bg-primary/8 shadow-sm scale-[1.02]"
          : "border-border/70",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Badge variant={isHovered ? "default" : "secondary"} className="rounded-full px-2 py-0.5 text-[10px]">
          {isNew ? "New Step" : "Step"}
        </Badge>
        {isNew && <Plus className="h-4 w-4 text-muted-foreground" />}
      </div>
      <div className="space-y-1">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
          {title}
        </p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

function FieldDragPreview({ field }: { field: FormField }) {
  const FieldIcon = getFieldIcon(field.type);

  return (
    <div className="w-[min(520px,calc(100vw-3rem))] rounded-[16px] border bg-background px-3 py-2.5 shadow-lg">
      <div className="flex items-center gap-3">
        <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
        <FieldIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="truncate text-sm font-medium text-foreground">
          {field.label}
        </p>
        <Badge variant="secondary" className="ml-auto rounded-full px-2 py-0.5 text-[10px]">
          {FIELD_TYPES.find((entry) => entry.type === field.type)?.label ?? field.type}
        </Badge>
      </div>
    </div>
  );
}

// ─── Sortable Step Tab ───────────────────────────────────────────────────────

function StepTabShell({
  label,
  isActive,
  onSelect,
  onDelete,
  showDelete = false,
  dragHandleProps,
  isOverlay = false,
}: {
  label: string;
  isActive: boolean;
  onSelect?: () => void;
  onDelete?: () => void;
  showDelete?: boolean;
  dragHandleProps?: Record<string, unknown>;
  isOverlay?: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-[14px] border px-2 py-1.5 shadow-sm transition-colors",
        isActive
          ? "border-primary/30 bg-primary/8 text-primary"
          : "border-border bg-background text-foreground",
        isOverlay && "shadow-lg",
      )}
    >
      <span
        className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground cursor-grab active:cursor-grabbing hover:bg-black/5"
        onClick={(event) => event.stopPropagation()}
        {...dragHandleProps}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </span>
      <button
        type="button"
        onClick={onSelect}
        className="whitespace-nowrap text-sm font-medium"
      >
        {label}
      </button>
      {showDelete && onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
          aria-label={`Delete ${label}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

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
    opacity: isDragging ? 0.15 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
    >
      <StepTabShell
        label={step.title || `Step ${idx + 1}`}
        isActive={isActive}
        onSelect={onSelect}
        onDelete={onDelete}
        showDelete={showDelete}
        dragHandleProps={{ ...listeners, ...attributes }}
      />
    </div>
  );
}

// ─── Inline Editable Label ───────────────────────────────────────────────────

function InlineEditableLabel({
  value,
  onSave,
  autoFocus = false,
  placeholder = "Untitled",
  saveStatus,
}: {
  value: string;
  onSave: (value: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
  saveStatus?: "saving" | "saved" | "error" | null;
}) {
  const [localValue, setLocalValue] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Auto-resize textarea to fit content
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [localValue]);

  return (
    <div className="flex-1 min-w-0">
      <textarea
        ref={textareaRef}
        rows={1}
        autoFocus={autoFocus}
        value={localValue}
        placeholder={placeholder}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={() => {
          if (localValue.trim() && localValue !== value) {
            onSave(localValue.trim());
          } else {
            setLocalValue(value);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setLocalValue(value);
            e.currentTarget.blur();
          }
        }}
        className="text-sm font-medium text-foreground bg-transparent border-0 border-b border-dashed border-muted-foreground/30 focus:border-solid focus:border-primary outline-none min-w-0 pb-0.5 w-full transition-colors resize-none overflow-hidden block"
      />
      {saveStatus && (
        <div
          className={cn(
            "flex items-center gap-1 mt-1 text-[11px]",
            saveStatus === "saving" && "text-muted-foreground",
            saveStatus === "saved" && "text-emerald-600",
            saveStatus === "error" && "text-destructive",
          )}
        >
          {saveStatus === "saving" && (
            <>
              <Loader className="h-3 w-3 animate-spin" />
              <span>Saving...</span>
            </>
          )}
          {saveStatus === "saved" && (
            <>
              <Check className="h-3 w-3" />
              <span>Saved</span>
            </>
          )}
          {saveStatus === "error" && (
            <>
              <AlertCircle className="h-3 w-3" />
              <span>Failed to save</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

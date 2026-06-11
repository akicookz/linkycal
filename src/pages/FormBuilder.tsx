import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
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
  Layers,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { FocusedFieldInput } from "@/components/FocusedFieldInput";
import { useSession } from "@/lib/auth-client";
import { queryClient } from "@/lib/query-client";
import {
  generateFormApiPrompt,
  generateFormEmbedPrompt,
} from "@/lib/prompts";
import { sectionShowsFieldsTogether } from "@/lib/form-sections";
import { getRenderableRichTextHtml, richTextToPlainText } from "@/lib/rich-text";
import { cn, copyToClipboard } from "@/lib/utils";
import { normalizeToFieldId } from "@/lib/constants";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type CollisionDetection,
  type DragOverEvent,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  FormConditionEditor,
  type ConditionSourceField,
} from "@/components/FormConditionEditor";
import type { FormCondition } from "@/lib/form-conditions";

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
  visibility?: FormCondition | null;
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
  visibility?: FormCondition | null;
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

type BuilderSelection = { kind: "field" | "step"; id: string } | null;

const DEFAULT_RESPONSE_NOTIFICATION_DESTINATION = "__owner__";
const STEP_SORTABLE_ID_PREFIX = "step:";
const GROUP_DROPPABLE_ID_PREFIX = "group:";

function isValidEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// ─── Field Type Definitions ──────────────────────────────────────────────────

const FIELD_TYPES = [
  { type: "name", label: "Name", icon: User, chipClass: "bg-emerald-100 text-emerald-700" },
  { type: "text", label: "Text Input", icon: Type, chipClass: "bg-sky-100 text-sky-700" },
  { type: "textarea", label: "Textarea", icon: AlignLeft, chipClass: "bg-blue-100 text-blue-700" },
  { type: "email", label: "Email", icon: Mail, chipClass: "bg-amber-100 text-amber-700" },
  { type: "phone", label: "Phone", icon: Phone, chipClass: "bg-lime-100 text-lime-700" },
  { type: "url", label: "URL", icon: Link2, chipClass: "bg-cyan-100 text-cyan-700" },
  { type: "number", label: "Number", icon: Hash, chipClass: "bg-violet-100 text-violet-700" },
  { type: "select", label: "Select", icon: ChevronDown, chipClass: "bg-rose-100 text-rose-700" },
  { type: "multi_select", label: "Multi Select", icon: ListChecks, chipClass: "bg-pink-100 text-pink-700" },
  { type: "checkbox", label: "Checkbox", icon: CheckSquare, chipClass: "bg-teal-100 text-teal-700" },
  { type: "radio", label: "Radio", icon: Circle, chipClass: "bg-orange-100 text-orange-700" },
  { type: "date", label: "Date", icon: Calendar, chipClass: "bg-indigo-100 text-indigo-700" },
  { type: "time", label: "Time", icon: Clock, chipClass: "bg-fuchsia-100 text-fuchsia-700" },
  { type: "file", label: "File Upload", icon: Upload, chipClass: "bg-stone-200 text-stone-700" },
  { type: "rating", label: "Rating", icon: Star, chipClass: "bg-yellow-100 text-yellow-700" },
] as const;

const COMPLETION_TYPE_META = {
  type: "completion",
  label: "Ending",
  icon: PartyPopper,
  chipClass: "bg-emerald-100 text-emerald-700",
} as const;

interface FieldTypeMeta {
  type: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  chipClass: string;
}

function getFieldTypeMeta(type: string): FieldTypeMeta {
  if (type === "completion") return COMPLETION_TYPE_META;
  return FIELD_TYPES.find((ft) => ft.type === type) ?? FIELD_TYPES[1];
}

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

function sortFields(fields: FormField[]): FormField[] {
  return [...fields].sort((a, b) => a.sortOrder - b.sortOrder);
}

function isCompletionOnlyStep(step: FormStep): boolean {
  const fields = step.fields ?? [];
  return fields.length > 0 && fields.every((f) => f.type === "completion");
}

function getIdValue(id: string | number | null | undefined): string | null {
  if (id === null || id === undefined) return null;
  return String(id);
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
    const sortedFields = sortFields(step.fields ?? []);
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
        fields: nextFields.map((field, index) =>
          field.id === fieldId
            ? { ...field, ...(updates ?? {}), stepId: targetStepId, sortOrder: index }
            : { ...field, sortOrder: index },
        ),
      };
    }

    return {
      ...step,
      fields: step.fields.map((field, index) => ({ ...field, sortOrder: index })),
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

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── Component ───────────────────────────────────────────────────────────────

interface FormBuilderProps {
  projectId?: string;
  formId?: string;
  mode?: "live" | "template";
  onboardingFooter?: React.ReactNode;
}

export default function FormBuilder(props: FormBuilderProps = {}) {
  const params = useParams<{
    projectId: string;
    formId: string;
  }>();
  const projectId = props.projectId ?? params.projectId;
  const formId = props.formId ?? params.formId;
  const mode = props.mode ?? "live";
  const isTemplateMode = mode === "template";
  const navigate = useNavigate();
  const { data: session } = useSession();

  // What's selected in the content panel (drives preview + settings panel)
  const [selection, setSelection] = useState<BuilderSelection>(null);
  // Local options state for auto-save (keyed by field ID)
  const [fieldOptionsState, setFieldOptionsState] = useState<
    Record<string, DraftFieldOption[]>
  >({});
  const [autoFocusSelectedLabel, setAutoFocusSelectedLabel] = useState(false);
  // Fields whose (empty) description editor was explicitly opened via
  // "+ Add description" — cleared whenever the selection changes.
  const [expandedFieldDesc, setExpandedFieldDesc] = useState<Set<string>>(
    new Set(),
  );
  // Interactive answers typed into the live preview (never persisted)
  const [previewValues, setPreviewValues] = useState<Record<string, string>>({});

  const [dragging, setDragging] = useState<
    { type: "step" | "field"; id: string } | null
  >(null);
  const dragOriginStepIdRef = useRef<string | null>(null);

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
    type: "multi_step" as "single" | "multi_step",
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
  const contentSteps = sortedSteps.filter((step) => !isCompletionOnlyStep(step));
  const completionSteps = sortedSteps.filter(isCompletionOnlyStep);
  const completionField =
    sortedSteps.flatMap((s) => sortFields(s.fields ?? [])).find((f) => f.type === "completion") ?? null;

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
  const hasCompletionPage = !!completionField;

  const nativeActionUrl = form && currentProject
    ? `${window.location.origin}/api/public/forms/${currentProject.slug}/${form.slug}/submit`
    : "";

  // ─── Selection lookups ───────────────────────────────────────────────────

  function findField(fieldId: string): { field: FormField; step: FormStep } | null {
    for (const step of sortedSteps) {
      const field = (step.fields ?? []).find((f) => f.id === fieldId);
      if (field) return { field, step };
    }
    return null;
  }

  const selectedFieldEntry =
    selection?.kind === "field" ? findField(selection.id) : null;
  const selectedField = selectedFieldEntry?.field ?? null;
  const selectedStep =
    selection?.kind === "step"
      ? sortedSteps.find((s) => s.id === selection.id) ?? null
      : selectedFieldEntry?.step ?? null;

  // Numbering across all non-completion fields, in step order
  const questionNumberByFieldId = useMemo(() => {
    const map: Record<string, number> = {};
    let n = 0;
    for (const step of sortedSteps) {
      for (const field of sortFields(step.fields ?? [])) {
        if (field.type === "completion") continue;
        n += 1;
        map[field.id] = n;
      }
    }
    return map;
  }, [sortedSteps]);
  const totalQuestions = Object.keys(questionNumberByFieldId).length;
  const orderedQuestionFields = sortedSteps.flatMap((step) =>
    sortFields(step.fields ?? []).filter((f) => f.type !== "completion"),
  );

  // ─── Condition source lookups ────────────────────────────────────────────
  //
  // For each field, "earlier fields" = all fields in steps with lower
  // sortOrder + fields in the same step with lower sortOrder.
  // For each step, "earlier fields" = all fields in steps with lower sortOrder.
  const { sourcesByFieldId, sourcesByStepId } = useMemo(() => {
    const stepTitleFor = (step: FormStep) =>
      step.title?.trim() || `Section ${step.sortOrder + 1}`;

    const byStep: Record<string, ConditionSourceField[]> = {};
    for (const step of sortedSteps) {
      const earlier = sortedSteps.filter((s) => s.sortOrder < step.sortOrder);
      byStep[step.id] = earlier.flatMap((s) =>
        sortFields(s.fields ?? [])
          .filter((f) => f.type !== "completion")
          .map((f) => ({
            id: f.id,
            label: f.label,
            type: f.type,
            stepTitle: stepTitleFor(s),
            options: f.options ?? null,
          })),
      );
    }

    const byField: Record<string, ConditionSourceField[]> = {};
    for (const step of sortedSteps) {
      const ownFields = sortFields(step.fields ?? []);
      for (let i = 0; i < ownFields.length; i++) {
        const target = ownFields[i];
        if (target.type === "completion") continue;
        const earlierInStep: ConditionSourceField[] = ownFields
          .slice(0, i)
          .filter((ff) => ff.type !== "completion")
          .map((ff) => ({
            id: ff.id,
            label: ff.label,
            type: ff.type,
            stepTitle: stepTitleFor(step),
            options: ff.options ?? null,
          }));
        byField[target.id] = [...(byStep[step.id] ?? []), ...earlierInStep];
      }
    }

    return { sourcesByFieldId: byField, sourcesByStepId: byStep };
  }, [sortedSteps]);

  // Default selection: first question, else first step
  useEffect(() => {
    if (!form || selection) return;
    const firstField = orderedQuestionFields[0];
    if (firstField) {
      setSelection({ kind: "field", id: firstField.id });
    } else if (sortedSteps.length > 0) {
      setSelection({ kind: "step", id: sortedSteps[0].id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, selection]);

  // Reset selection if the selected item disappeared (delete, visibility, ...)
  useEffect(() => {
    if (!form || !selection) return;
    const exists =
      selection.kind === "field"
        ? !!findField(selection.id)
        : sortedSteps.some((s) => s.id === selection.id);
    if (!exists) setSelection(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, selection, sortedSteps.length]);

  // Clear the autofocus flag once the newly added question's label mounted,
  // and collapse any empty description editors left open on other questions.
  useEffect(() => {
    if (autoFocusSelectedLabel) setAutoFocusSelectedLabel(false);
    setExpandedFieldDesc((prev) => (prev.size === 0 ? prev : new Set()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  // Initialize editing name/slug the first time the form loads. Do NOT re-sync
  // from `form` on every cache update — optimistic mutations change the
  // reference, and re-syncing would overwrite characters the user has just
  // typed into these inputs.
  const hasInitializedEditingFields = useRef(false);
  useEffect(() => {
    if (form && !hasInitializedEditingFields.current) {
      setEditingName(form.name);
      setEditingSlug(form.slug);
      hasInitializedEditingFields.current = true;
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

  // ─── tempId → realId resolvers ───────────────────────────────────────────
  // Optimistic creates hand the UI a `temp-*` id. The cache keeps that id for
  // the lifetime of the page so React keys stay stable and in-progress user
  // edits are never clobbered by a re-mount. Server calls resolve temp → real
  // through the maps below; if a create is still in flight, updates await its
  // resolution promise, so no PUT ever lands on a non-existent temp id.
  const fieldIdMap = useRef<Map<string, string>>(new Map());
  const pendingFieldCreates = useRef<Map<string, Promise<string>>>(new Map());
  const stepIdMap = useRef<Map<string, string>>(new Map());
  const pendingStepCreates = useRef<Map<string, Promise<string>>>(new Map());

  async function resolveFieldId(clientId: string): Promise<string> {
    const mapped = fieldIdMap.current.get(clientId);
    if (mapped) return mapped;
    const pending = pendingFieldCreates.current.get(clientId);
    if (pending) return pending;
    return clientId;
  }

  async function resolveStepId(clientId: string): Promise<string> {
    const mapped = stepIdMap.current.get(clientId);
    if (mapped) return mapped;
    const pending = pendingStepCreates.current.get(clientId);
    if (pending) return pending;
    return clientId;
  }

  // ─── Form mutations ─────────────────────────────────────────────────────

  const updateFormMutation = useMutation({
    mutationFn: async (
      data: Partial<{
        name: string;
        slug: string;
        type: "multi_step" | "single";
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
      // Only invalidate the forms list (used by other pages). We deliberately
      // do NOT invalidate `formQueryKey` — the optimistic update already set
      // the new value, and a background refetch would clobber any in-progress
      // re-edit in the name/slug inputs.
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
          // No default title — sections are labeled "Section N" in the UI,
          // and an untitled section never renders an intro screen.
          body: JSON.stringify(vars?.title ? { title: vars.title } : {}),
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
            title: vars?.title ?? null,
            description: null,
            richDescription: null,
            settings: null,
            fields: [],
          },
        ],
      }));
      setSelection({ kind: "step", id: tempId });

      let resolveCreate!: (realId: string) => void;
      let rejectCreate!: (err: unknown) => void;
      const createPromise = new Promise<string>((res, rej) => {
        resolveCreate = res;
        rejectCreate = rej;
      });
      createPromise.catch(() => {});
      pendingStepCreates.current.set(tempId, createPromise);

      return { snapshot, tempId, resolveCreate, rejectCreate };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.snapshot) rollback(ctx.snapshot);
      setSelection(null);
      if (ctx?.tempId) {
        ctx.rejectCreate(err);
        pendingStepCreates.current.delete(ctx.tempId);
      }
    },
    onSuccess: (data, _variables, ctx) => {
      const step = data?.step as FormStep | undefined;
      const tempId = ctx?.tempId;
      if (!step || !tempId) return;

      // Record mapping; leave the cache alone so the tempId-keyed UI keeps
      // its draft state intact.
      stepIdMap.current.set(tempId, step.id);
      ctx.resolveCreate(step.id);
      pendingStepCreates.current.delete(tempId);
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
        settings: Record<string, unknown> | null;
        visibility: FormCondition | null;
      }>;
    }) => {
      const realStepId = await resolveStepId(stepId);
      const res = await fetch(
        `/api/projects/${projectId}/forms/${formId}/steps/${realStepId}`,
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
  });

  const deleteStepMutation = useMutation({
    mutationFn: async (stepId: string) => {
      const realStepId = await resolveStepId(stepId);
      const res = await fetch(
        `/api/projects/${projectId}/forms/${formId}/steps/${realStepId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to delete step");
    },
    onMutate: async (stepId) => {
      await queryClient.cancelQueries({ queryKey: formQueryKey });
      const snapshot = snapshotForm();
      const removedFieldIds = new Set(
        (sortedSteps.find((s) => s.id === stepId)?.fields ?? []).map((f) => f.id),
      );
      optimisticSetForm((old) => ({
        ...old,
        steps: old.steps.filter((s) => s.id !== stepId),
      }));
      if (
        selection &&
        ((selection.kind === "step" && selection.id === stepId) ||
          (selection.kind === "field" && removedFieldIds.has(selection.id)))
      ) {
        setSelection(null);
      }
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) rollback(ctx.snapshot);
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
      const realStepId = await resolveStepId(stepId);
      const res = await fetch(
        `/api/projects/${projectId}/forms/${formId}/fields`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stepId: realStepId, type, label, ...(description ? { description } : {}) }),
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
      setSelection({ kind: "field", id: tempId });
      setAutoFocusSelectedLabel(true);

      let resolveCreate!: (realId: string) => void;
      let rejectCreate!: (err: unknown) => void;
      const createPromise = new Promise<string>((res, rej) => {
        resolveCreate = res;
        rejectCreate = rej;
      });
      // Swallow unhandled-rejection warnings; awaiters handle errors themselves.
      createPromise.catch(() => {});
      pendingFieldCreates.current.set(tempId, createPromise);

      return { snapshot, tempId, resolveCreate, rejectCreate };
    },
    onSuccess: (data, _variables, ctx) => {
      const field = data?.field as FormField | undefined;
      const tempId = ctx?.tempId;
      if (!field || !tempId) return;

      // Record mapping so future updates/deletes on the temp id resolve to the
      // real id. We intentionally do NOT swap `field.id` in the cache — that
      // would re-key the React row and destroy any draft state the user is
      // currently typing into.
      fieldIdMap.current.set(tempId, field.id);
      ctx.resolveCreate(field.id);
      pendingFieldCreates.current.delete(tempId);

      if (isOptionFieldType(field.type)) {
        setFieldOptionsState((prev) =>
          prev[tempId]
            ? prev
            : {
              ...prev,
              [tempId]: toDraftFieldOptions(
                parseStoredFieldOptions(field.options),
              ),
            },
        );
      }
    },
    onError: (err, _variables, ctx) => {
      if (ctx?.snapshot) rollback(ctx.snapshot);
      if (ctx?.tempId) {
        ctx.rejectCreate(err);
        pendingFieldCreates.current.delete(ctx.tempId);
        setFieldOptionsState((prev) => {
          if (!prev[ctx.tempId]) return prev;
          const next = { ...prev };
          delete next[ctx.tempId];
          return next;
        });
      }
      setAutoFocusSelectedLabel(false);
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
        visibility: FormCondition | null;
      }>;
    }) => {
      const realFieldId = await resolveFieldId(fieldId);
      const payload = data.stepId
        ? { ...data, stepId: await resolveStepId(data.stepId) }
        : data;
      const res = await fetch(
        `/api/projects/${projectId}/forms/${formId}/fields/${realFieldId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
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
    onSuccess: (_data, variables) => {
      // The optimistic state set in onMutate is the source of truth. We
      // deliberately don't overwrite the cache with the server's echo — the
      // user may have typed newer characters between dispatch and response,
      // and re-applying the server field would clobber them.
      setSaveStatusFor(variables.fieldId, "saved");
    },
    onError: (_err, vars, ctx) => {
      setSaveStatusFor(vars.fieldId, "error");
      if (ctx?.snapshot) rollback(ctx.snapshot);
    },
  });

  const deleteFieldMutation = useMutation({
    mutationFn: async (fieldId: string) => {
      const realFieldId = await resolveFieldId(fieldId);
      const res = await fetch(
        `/api/projects/${projectId}/forms/${formId}/fields/${realFieldId}`,
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
      if (selection?.kind === "field" && selection.id === fieldId) {
        setSelection(null);
      }
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) rollback(ctx.snapshot);
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
    const projectSlug = currentProject?.slug ?? projectId ?? "";
    const prompt = generateFormEmbedPrompt(form, projectSlug, window.location.origin);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [updateFormMutation, formSettings],
  );

  // ─── Reorder mutations ───────────────────────────────────────────────────

  const reorderFieldsMutation = useMutation({
    mutationFn: async ({ stepId, fieldIds }: { stepId: string; fieldIds: string[] }) => {
      const [realStepId, ...realFieldIds] = await Promise.all([
        resolveStepId(stepId),
        ...fieldIds.map((id) => resolveFieldId(id)),
      ]);
      const res = await fetch(
        `/api/projects/${projectId}/forms/${formId}/fields/reorder`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stepId: realStepId, fieldIds: realFieldIds }),
        },
      );
      if (!res.ok) throw new Error("Failed to reorder fields");
      return res.json();
    },
  });

  const reorderStepsMutation = useMutation({
    mutationFn: async ({ stepIds }: { stepIds: string[] }) => {
      const realStepIds = await Promise.all(stepIds.map((id) => resolveStepId(id)));
      const res = await fetch(
        `/api/projects/${projectId}/forms/${formId}/steps/reorder`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stepIds: realStepIds }),
        },
      );
      if (!res.ok) throw new Error("Failed to reorder steps");
      return res.json();
    },
  });

  // ─── Drag and Drop ─────────────────────────────────────────────────────
  //
  // One DndContext for the whole content list. Sortable ids are
  // discriminated by prefix: `step:<id>` rows reorder steps, bare field ids
  // reorder questions, and `group:<stepId>` droppables catch fields dropped
  // into a (possibly empty) step.

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const collisionDetection = useCallback<CollisionDetection>(
    (args) => {
      const activeId = getIdValue(args.active.id);
      const isStepDrag = activeId?.startsWith(STEP_SORTABLE_ID_PREFIX) ?? false;
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter((container) => {
          const id = String(container.id);
          return isStepDrag
            ? id.startsWith(STEP_SORTABLE_ID_PREFIX)
            : !id.startsWith(STEP_SORTABLE_ID_PREFIX);
        }),
      });
    },
    [],
  );

  function handleDragStart(event: DragStartEvent) {
    const activeId = getIdValue(event.active.id);
    if (!activeId) return;
    if (activeId.startsWith(STEP_SORTABLE_ID_PREFIX)) {
      setDragging({ type: "step", id: activeId.slice(STEP_SORTABLE_ID_PREFIX.length) });
      return;
    }
    const found = findField(activeId);
    if (!found) return;
    setDragging({ type: "field", id: activeId });
    dragOriginStepIdRef.current = found.step.id;
  }

  function handleDragCancel() {
    setDragging(null);
    dragOriginStepIdRef.current = null;
  }

  function handleDragOver(event: DragOverEvent) {
    if (dragging?.type !== "field") return;
    const overId = getIdValue(event.over?.id);
    if (!overId || overId === dragging.id) return;

    const current = findField(dragging.id);
    if (!current) return;

    let targetStepId: string | null = null;
    let targetIndex: number | undefined;

    if (overId.startsWith(GROUP_DROPPABLE_ID_PREFIX)) {
      targetStepId = overId.slice(GROUP_DROPPABLE_ID_PREFIX.length);
    } else {
      const overFound = findField(overId);
      if (overFound) {
        targetStepId = overFound.step.id;
        targetIndex = sortFields(overFound.step.fields ?? []).findIndex(
          (f) => f.id === overId,
        );
      }
    }

    if (!targetStepId || targetStepId === current.step.id) return;
    const targetStep = sortedSteps.find((s) => s.id === targetStepId);
    if (!targetStep || isCompletionOnlyStep(targetStep)) return;

    const fieldId = dragging.id;
    optimisticSetForm((old) => ({
      ...old,
      steps: moveFieldBetweenSteps(old.steps, fieldId, targetStepId, targetIndex),
    }));
  }

  async function handleDragEnd(event: DragEndEvent) {
    const activeId = getIdValue(event.active.id);
    const overId = getIdValue(event.over?.id);
    const draggingInfo = dragging;
    const originStepId = dragOriginStepIdRef.current;
    setDragging(null);
    dragOriginStepIdRef.current = null;
    if (!activeId || !draggingInfo) return;

    // Step reorder
    if (draggingInfo.type === "step") {
      if (!overId?.startsWith(STEP_SORTABLE_ID_PREFIX)) return;
      const targetStepId = overId.slice(STEP_SORTABLE_ID_PREFIX.length);
      if (targetStepId === draggingInfo.id) return;

      const ids = contentSteps.map((s) => s.id);
      const oldIndex = ids.indexOf(draggingInfo.id);
      const newIndex = ids.indexOf(targetStepId);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(contentSteps, oldIndex, newIndex);
      // Completion steps always stay at the end
      const orderIds = [...reordered, ...completionSteps].map((s) => s.id);

      optimisticSetForm((old) => ({
        ...old,
        steps: old.steps.map((s) => ({ ...s, sortOrder: orderIds.indexOf(s.id) })),
      }));
      reorderStepsMutation.mutate({ stepIds: orderIds });
      return;
    }

    // Field reorder / move
    const current = findField(activeId);
    if (!current) return;
    const finalStepId = current.step.id;
    let finalFields = sortFields(current.step.fields ?? []);
    let orderChanged = false;

    if (
      overId &&
      overId !== activeId &&
      !overId.startsWith(GROUP_DROPPABLE_ID_PREFIX) &&
      !overId.startsWith(STEP_SORTABLE_ID_PREFIX)
    ) {
      const overFound = findField(overId);
      if (overFound && overFound.step.id === finalStepId) {
        const oldIndex = finalFields.findIndex((f) => f.id === activeId);
        const newIndex = finalFields.findIndex((f) => f.id === overId);
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          finalFields = arrayMove(finalFields, oldIndex, newIndex);
          orderChanged = true;
          optimisticSetForm((old) => ({
            ...old,
            steps: old.steps.map((s) =>
              s.id === finalStepId
                ? { ...s, fields: finalFields.map((f, i) => ({ ...f, sortOrder: i })) }
                : s,
            ),
          }));
        }
      }
    }

    const movedAcrossSteps = !!originStepId && originStepId !== finalStepId;
    if (movedAcrossSteps) {
      const sortOrder = Math.max(
        finalFields.findIndex((f) => f.id === activeId),
        0,
      );
      try {
        await updateFieldMutation.mutateAsync({
          fieldId: activeId,
          data: { stepId: finalStepId, sortOrder },
        });
        reorderFieldsMutation.mutate({
          stepId: finalStepId,
          fieldIds: finalFields.map((f) => f.id),
        });
      } catch {
        // updateFieldMutation.onError already rolled back the cache
      }
      return;
    }

    if (orderChanged) {
      reorderFieldsMutation.mutate({
        stepId: finalStepId,
        fieldIds: finalFields.map((f) => f.id),
      });
    }
  }

  // ─── Add content ─────────────────────────────────────────────────────────

  function handleAddField(type: string, label: string) {
    const targetStep =
      (selectedStep && !isCompletionOnlyStep(selectedStep) ? selectedStep : null) ??
      contentSteps[contentSteps.length - 1] ??
      null;
    if (!targetStep) return;
    addFieldMutation.mutate({ stepId: targetStep.id, type, label });
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
    setSelection({ kind: "field", id: tempFieldId });

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
      const fieldJson = await fieldRes.json();
      const newField = fieldJson?.field as FormField | undefined;

      // Record tempId → realId mappings so future edits on this step/field
      // resolve to the server ids. The cache keeps the tempIds so the row
      // doesn't re-mount and any in-progress user typing stays put.
      stepIdMap.current.set(tempStepId, newStep.id);
      if (newField) fieldIdMap.current.set(tempFieldId, newField.id);
    } catch {
      // Rollback on any failure
      if (snapshot) rollback(snapshot);
      setSelection(null);
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

  function handleFieldTypeChange(field: FormField, val: string) {
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
  }

  function handleContactMappingToggle(field: FormField) {
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
  }

  // Canvas description editing: hidden until the question has one (or the
  // user clicks "+ Add description"), Typeform-style.
  function fieldDescriptionEditor(field: FormField) {
    const hasDescription = !!field.description;
    if (!hasDescription && !expandedFieldDesc.has(field.id)) {
      return (
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
      );
    }
    return (
      <RichTextEditor
        key={`field-desc-${field.id}`}
        value={field.description ?? ""}
        placeholder="Add a description (optional)"
        variant="compact"
        autoFocus={!hasDescription}
        onSave={(html) =>
          updateFieldMutation.mutate({
            fieldId: field.id,
            data: { description: html },
          })
        }
      />
    );
  }

  function selectNextQuestion() {
    if (!selectedField) return;
    const index = orderedQuestionFields.findIndex((f) => f.id === selectedField.id);
    const next = orderedQuestionFields[index + 1];
    if (next) {
      setSelection({ kind: "field", id: next.id });
    } else if (completionField) {
      setSelection({ kind: "field", id: completionField.id });
    }
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
                <Label htmlFor="create-type">Experience</Label>
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
                    <SelectItem value="multi_step">
                      Focused — one question at a time
                    </SelectItem>
                    <SelectItem value="single">
                      Classic — all questions on one page
                    </SelectItem>
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
    if (isTemplateMode) {
      return (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      );
    }
    return (
      <div>
        <div className="flex items-center gap-3 mb-8">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-7 w-48" />
        </div>
        <div className="grid grid-cols-[280px_1fr] gap-6">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
          <Skeleton className="h-[540px] w-full rounded-[24px]" />
        </div>
      </div>
    );
  }

  // ─── Render: Error ───────────────────────────────────────────────────────

  if (isError || !form) {
    return (
      <div>
        {!isTemplateMode && <PageHeader title="Form Builder" />}
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

  // ─── Render: Builder panels ──────────────────────────────────────────────

  const addContentPopover = (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          className="h-8 px-2.5"
          disabled={contentSteps.length === 0}
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1.5 max-h-[420px] overflow-y-auto">
        {FIELD_TYPES.map((ft) => (
          <button
            key={ft.type}
            type="button"
            onClick={() => handleAddField(ft.type, ft.label)}
            className="flex w-full items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-sm text-left hover:bg-muted/60 transition-colors"
          >
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px]",
                ft.chipClass,
              )}
            >
              <ft.icon className="h-3.5 w-3.5" />
            </span>
            {ft.label}
          </button>
        ))}
        <button
          type="button"
          onClick={handleAddCompletionPage}
          disabled={hasCompletionPage || addStepMutation.isPending}
          className="flex w-full items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-sm text-left hover:bg-muted/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px]",
              COMPLETION_TYPE_META.chipClass,
            )}
          >
            <PartyPopper className="h-3.5 w-3.5" />
          </span>
          Ending page
        </button>
      </PopoverContent>
    </Popover>
  );

  const contentPanel = (
    <Card className="h-fit">
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Content
          </p>
          {addContentPopover}
        </div>

        {contentSteps.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[16px] border border-dashed py-8 text-center">
            <p className="text-xs text-muted-foreground mb-3 px-3">
              No sections yet. Add a section to start building your form.
            </p>
            <Button
              size="sm"
              onClick={() => addStepMutation.mutate({})}
              disabled={addStepMutation.isPending}
            >
              <Plus className="h-4 w-4" />
              Add Section
            </Button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragCancel={handleDragCancel}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={contentSteps.map((step) => `${STEP_SORTABLE_ID_PREFIX}${step.id}`)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-4">
                {contentSteps.map((step, stepIdx) => (
                  <ContentStepGroup
                    key={step.id}
                    step={step}
                    stepNumber={stepIdx + 1}
                    isGrouped={sectionShowsFieldsTogether(step.settings)}
                    isSelected={selection?.kind === "step" && selection.id === step.id}
                    selectedFieldId={selection?.kind === "field" ? selection.id : null}
                    questionNumberByFieldId={questionNumberByFieldId}
                    onSelectStep={() => setSelection({ kind: "step", id: step.id })}
                    onSelectField={(fieldId) => setSelection({ kind: "field", id: fieldId })}
                    onDeleteStep={
                      contentSteps.length > 1
                        ? () => deleteStepMutation.mutate(step.id)
                        : undefined
                    }
                  />
                ))}
              </div>
            </SortableContext>

            <DragOverlay>
              {dragging?.type === "field" ? (
                (() => {
                  const found = findField(dragging.id);
                  return found ? <FieldDragPreview field={found.field} /> : null;
                })()
              ) : dragging?.type === "step" ? (
                <div className="rounded-[12px] border bg-background px-3 py-2 shadow-lg text-sm font-medium">
                  {sortedSteps.find((s) => s.id === dragging.id)?.title || "Section"}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => addStepMutation.mutate({})}
          disabled={addStepMutation.isPending}
        >
          {addStepMutation.isPending ? (
            <Loader className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          Add Section
        </Button>

        {/* Ending */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Ending
          </p>
          {completionField ? (
            <button
              type="button"
              onClick={() => setSelection({ kind: "field", id: completionField.id })}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-[12px] px-2 py-2 text-left text-sm transition-colors",
                selection?.kind === "field" && selection.id === completionField.id
                  ? "bg-primary/10 text-foreground"
                  : "hover:bg-muted/60",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-9 shrink-0 items-center justify-center rounded-[8px]",
                  COMPLETION_TYPE_META.chipClass,
                )}
              >
                <PartyPopper className="h-3.5 w-3.5" />
              </span>
              <span className="truncate font-medium">{completionField.label}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleAddCompletionPage}
              disabled={addStepMutation.isPending}
              className="flex w-full items-center gap-2.5 rounded-[12px] border border-dashed px-2 py-2 text-left text-sm text-muted-foreground hover:bg-muted/40 transition-colors disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5 ml-1" />
              Add ending page
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );

  // ─── Render: Preview canvas ──────────────────────────────────────────────

  const selectedQuestionNumber = selectedField
    ? questionNumberByFieldId[selectedField.id] ?? null
    : null;
  const selectedSectionIsGrouped =
    !!selectedField &&
    selectedField.type !== "completion" &&
    !!selectedStep &&
    sectionShowsFieldsTogether(selectedStep.settings);
  const selectedSectionFields =
    selectedSectionIsGrouped && selectedStep
      ? sortFields(selectedStep.fields ?? []).filter((f) => f.type !== "completion")
      : [];
  const progressPct =
    selectedQuestionNumber && totalQuestions > 0
      ? Math.round(((selectedQuestionNumber - 1) / totalQuestions) * 100)
      : selectedField?.type === "completion"
        ? 100
        : 0;

  const previewCanvas = (
    <div className="rounded-[24px] border bg-gradient-to-b from-white to-[#f6faf7] relative overflow-hidden min-h-[540px] flex flex-col">
      {/* Progress bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-primary/10">
        <div
          className="h-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12 sm:px-12">
        <div className="w-full max-w-xl mx-auto">
          {selectedField && selectedField.type === "completion" ? (
            <div key={selectedField.id} className="animate-focused-screen space-y-4 text-center flex flex-col items-center">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                <PartyPopper className="h-7 w-7 text-primary" />
              </div>
              <InlineEditableLabel
                key={`completion-label-${selectedField.id}`}
                value={selectedField.label}
                placeholder="Thank you!"
                textClassName="text-2xl sm:text-3xl font-semibold text-center"
                saveStatus={saveStatus[selectedField.id] ?? null}
                onSave={(label) =>
                  updateFieldMutation.mutate({
                    fieldId: selectedField.id,
                    data: { label },
                  })
                }
              />
              <div className="w-full max-w-md mx-auto text-left">
                <RichTextEditor
                  key={`completion-desc-${selectedField.id}`}
                  value={selectedField.description ?? ""}
                  variant="compact"
                  placeholder="Write a thank-you message for your respondents."
                  onSave={(html) =>
                    updateFieldMutation.mutate({
                      fieldId: selectedField.id,
                      data: { description: html },
                    })
                  }
                />
              </div>
            </div>
          ) : selectedField && selectedSectionIsGrouped ? (
            <div
              key={`group-${selectedStep?.id}`}
              className="animate-focused-screen space-y-6"
            >
              <div className="space-y-7">
                {selectedSectionFields.map((field) => {
                  const isSel = field.id === selectedField.id;
                  return (
                    <div
                      key={field.id}
                      onClick={() => {
                        if (!isSel) setSelection({ kind: "field", id: field.id });
                      }}
                      className={cn(
                        "-mx-3 space-y-2 rounded-[16px] px-3 py-2.5 transition-colors",
                        isSel
                          ? "bg-primary/[0.05] ring-1 ring-primary/15"
                          : "cursor-pointer hover:bg-black/[0.025]",
                      )}
                    >
                      {isSel ? (
                        <>
                          <div className="flex items-start gap-2">
                            <span className="text-xl sm:text-2xl font-semibold leading-snug shrink-0">
                              {questionNumberByFieldId[field.id]}.
                            </span>
                            <InlineEditableLabel
                              key={`field-label-${field.id}`}
                              value={field.label}
                              autoFocus={autoFocusSelectedLabel}
                              placeholder="Your question here..."
                              textClassName="text-xl sm:text-2xl font-semibold leading-snug"
                              saveStatus={saveStatus[field.id] ?? null}
                              onSave={(label) =>
                                updateFieldMutation.mutate({
                                  fieldId: field.id,
                                  data: { label },
                                })
                              }
                            />
                          </div>
                          {fieldDescriptionEditor(field)}
                        </>
                      ) : (
                        <>
                          <p className="text-xl sm:text-2xl font-semibold leading-snug">
                            {questionNumberByFieldId[field.id]}.{" "}
                            {field.label || "Untitled question"}
                            {field.required && (
                              <span className="text-destructive ml-1">*</span>
                            )}
                          </p>
                          {field.description && (
                            <div
                              className="text-base text-muted-foreground prose prose-sm max-w-none"
                              dangerouslySetInnerHTML={{ __html: field.description }}
                            />
                          )}
                        </>
                      )}
                      <FocusedFieldInput
                        key={`preview-${field.id}`}
                        field={{
                          id: field.id,
                          type: field.type,
                          label: field.label,
                          description: field.description,
                          placeholder: field.placeholder,
                          required: field.required,
                          options: toPersistedFieldOptions(getFieldOptions(field)),
                        }}
                        value={previewValues[field.id] ?? ""}
                        onChange={(val) =>
                          setPreviewValues((prev) => ({ ...prev, [field.id]: val }))
                        }
                      />
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-3">
                <Button
                  size="lg"
                  className="px-7 text-base glow-surface"
                  onClick={() => {
                    const lastInSection =
                      selectedSectionFields[selectedSectionFields.length - 1];
                    const lastIndex = orderedQuestionFields.findIndex(
                      (f) => f.id === lastInSection?.id,
                    );
                    const next = orderedQuestionFields[lastIndex + 1];
                    if (next) {
                      setSelection({ kind: "field", id: next.id });
                    } else if (completionField) {
                      setSelection({ kind: "field", id: completionField.id });
                    }
                  }}
                >
                  <Check className="h-4 w-4" />
                  OK
                </Button>
                <span className="text-xs text-muted-foreground">
                  press <span className="font-semibold">Enter ↵</span>
                </span>
              </div>
            </div>
          ) : selectedField ? (
            <div key={selectedField.id} className="animate-focused-screen space-y-6">
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-2xl sm:text-3xl font-semibold leading-snug shrink-0">
                    {selectedQuestionNumber}.
                  </span>
                  <InlineEditableLabel
                    key={`field-label-${selectedField.id}`}
                    value={selectedField.label}
                    autoFocus={autoFocusSelectedLabel}
                    placeholder="Your question here..."
                    textClassName="text-2xl sm:text-3xl font-semibold leading-snug"
                    saveStatus={saveStatus[selectedField.id] ?? null}
                    onSave={(label) =>
                      updateFieldMutation.mutate({
                        fieldId: selectedField.id,
                        data: { label },
                      })
                    }
                  />
                </div>
                {fieldDescriptionEditor(selectedField)}
              </div>

              <FocusedFieldInput
                key={`preview-${selectedField.id}`}
                field={{
                  id: selectedField.id,
                  type: selectedField.type,
                  label: selectedField.label,
                  description: selectedField.description,
                  placeholder: selectedField.placeholder,
                  required: selectedField.required,
                  options: toPersistedFieldOptions(getFieldOptions(selectedField)),
                }}
                value={previewValues[selectedField.id] ?? ""}
                onChange={(val) =>
                  setPreviewValues((prev) => ({ ...prev, [selectedField.id]: val }))
                }
                onCommit={() => selectNextQuestion()}
              />

              <div className="flex items-center gap-3">
                <Button
                  size="lg"
                  className="px-7 text-base glow-surface"
                  onClick={selectNextQuestion}
                >
                  <Check className="h-4 w-4" />
                  OK
                </Button>
                <span className="text-xs text-muted-foreground">
                  press <span className="font-semibold">Enter ↵</span>
                </span>
              </div>
            </div>
          ) : selectedStep ? (
            <div key={selectedStep.id} className="animate-focused-screen space-y-5">
              <InlineEditableLabel
                key={`step-title-${selectedStep.id}`}
                value={selectedStep.title ?? ""}
                placeholder="Section title (shown as an intro screen)..."
                textClassName="text-2xl sm:text-3xl font-semibold leading-snug"
                saveStatus={saveStatus[selectedStep.id] ?? null}
                onSave={(title) =>
                  updateStepMutation.mutate({
                    stepId: selectedStep.id,
                    data: { title },
                  })
                }
              />
              <RichTextEditor
                key={`step-rich-desc-${selectedStep.id}`}
                value={getRenderableRichTextHtml(
                  selectedStep.richDescription,
                  selectedStep.description,
                )}
                variant="compact"
                placeholder="Add a short intro, context, or instructions for this section."
                onSave={(richDescription) => {
                  const currentValue = getRenderableRichTextHtml(
                    selectedStep.richDescription,
                    selectedStep.description,
                  );
                  const plainDescription =
                    richTextToPlainText(richDescription) || null;
                  if (
                    richDescription !== currentValue ||
                    plainDescription !== (selectedStep.description ?? null)
                  ) {
                    updateStepMutation.mutate({
                      stepId: selectedStep.id,
                      data: {
                        description: plainDescription,
                        richDescription,
                      },
                    });
                  }
                }}
              />
              <div className="flex items-center gap-3 pt-1">
                <Button size="lg" className="px-7 text-base glow-surface" onClick={() => {
                  const firstField = sortFields(selectedStep.fields ?? []).find((f) => f.type !== "completion");
                  if (firstField) setSelection({ kind: "field", id: firstField.id });
                }}>
                  <ArrowRight className="h-4 w-4" />
                  Continue
                </Button>
                <span className="text-xs text-muted-foreground">
                  press <span className="font-semibold">Enter ↵</span>
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                The intro screen only shows to respondents when the section has
                a title or description.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center">
              Select a question on the left to preview and edit it.
            </p>
          )}
        </div>
      </div>

      {form.type === "single" && (
        <div className="px-6 pb-4">
          <p className="text-[11px] text-muted-foreground text-center">
            This form uses the classic one-page layout. The preview shows the
            focused experience — switch to &quot;Focused&quot; in Settings to
            present one question at a time.
          </p>
        </div>
      )}
    </div>
  );

  // ─── Render: Settings panel ──────────────────────────────────────────────

  const settingsPanel = (
    <Card className="h-fit">
      <CardContent className="space-y-4">
        {selectedField && selectedField.type !== "completion" ? (
          <>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Question Settings
            </p>

            {isTemplateMode && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Question</Label>
                <InlineEditableLabel
                  key={`settings-label-${selectedField.id}`}
                  value={selectedField.label}
                  autoFocus={autoFocusSelectedLabel}
                  placeholder="Your question here..."
                  saveStatus={saveStatus[selectedField.id] ?? null}
                  onSave={(label) =>
                    updateFieldMutation.mutate({
                      fieldId: selectedField.id,
                      data: { label },
                    })
                  }
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select
                value={selectedField.type}
                onValueChange={(val) => handleFieldTypeChange(selectedField, val)}
              >
                <SelectTrigger className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((ft) => (
                    <SelectItem key={ft.type} value={ft.type}>
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            "flex h-5 w-5 items-center justify-center rounded-[6px]",
                            ft.chipClass,
                          )}
                        >
                          <ft.icon className="h-3 w-3" />
                        </span>
                        {ft.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-[16px] bg-muted/50 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Required</p>
                <p className="text-xs text-muted-foreground">
                  Respondents must answer to continue
                </p>
              </div>
              <Switch
                checked={selectedField.required}
                onCheckedChange={(checked) =>
                  updateFieldMutation.mutate({
                    fieldId: selectedField.id,
                    data: { required: checked },
                  })
                }
              />
            </div>

            {(selectedField.type === "name" || selectedField.type === "email") && (
              <div className="flex items-center justify-between rounded-[16px] bg-muted/50 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Save to contact</p>
                  <p className="text-xs text-muted-foreground">
                    Use as the contact&apos;s {selectedField.type}
                  </p>
                </div>
                <Switch
                  checked={!!selectedField.contactMapping}
                  onCheckedChange={() => handleContactMappingToggle(selectedField)}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {isOptionFieldType(selectedField.type) ? "Hint text" : "Placeholder"}
              </Label>
              <Input
                key={`placeholder-${selectedField.id}`}
                defaultValue={selectedField.placeholder ?? ""}
                placeholder={
                  isOptionFieldType(selectedField.type)
                    ? "Optional hint shown under the question"
                    : "Type your answer here..."
                }
                className="h-9 text-sm"
                onBlur={(e) => {
                  const next = e.target.value.trim() || null;
                  if (next !== (selectedField.placeholder ?? null)) {
                    updateFieldMutation.mutate({
                      fieldId: selectedField.id,
                      data: { placeholder: next },
                    });
                  }
                }}
              />
            </div>

            {isOptionFieldType(selectedField.type) && selectedField.type !== "checkbox" && (() => {
              const options = getFieldOptions(selectedField);
              const minOptions = selectedField.type === "multi_select" ? 2 : 1;
              return (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Choices</Label>
                  <div className="space-y-1.5">
                    {options.map((opt, idx) => {
                      const isLast = idx === options.length - 1;
                      const canRemove = options.length > minOptions;
                      return (
                        <div key={opt.id} className="flex items-center gap-1.5">
                          <Input
                            placeholder={`Option ${idx + 1}`}
                            value={opt.label}
                            onChange={(e) =>
                              updateFieldOption(selectedField.id, idx, e.target.value, selectedField)
                            }
                            onBlur={() => saveFieldOptions(selectedField.id)}
                            className="h-8 text-xs"
                          />
                          {isLast && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 px-2 shrink-0 text-xs"
                              onClick={() => addFieldOption(selectedField.id, selectedField)}
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
                              className="h-8 px-1.5 shrink-0 rounded-[8px] bg-muted/70 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => removeFieldOption(selectedField.id, idx, selectedField)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {(sourcesByFieldId[selectedField.id] ?? []).length > 0 && (
              <FormConditionEditor
                title="Show this question when"
                condition={selectedField.visibility ?? null}
                sources={sourcesByFieldId[selectedField.id] ?? []}
                onChange={(next) =>
                  updateFieldMutation.mutate({
                    fieldId: selectedField.id,
                    data: { visibility: next },
                  })
                }
              />
            )}

            <Button
              variant="outline"
              size="sm"
              className="w-full text-destructive hover:text-destructive"
              onClick={() => deleteFieldMutation.mutate(selectedField.id)}
              disabled={
                deleteFieldMutation.isPending &&
                deleteFieldMutation.variables === selectedField.id
              }
            >
              {deleteFieldMutation.isPending &&
              deleteFieldMutation.variables === selectedField.id ? (
                <Loader className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Delete question
            </Button>
          </>
        ) : selectedField && selectedField.type === "completion" ? (
          <>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Ending Settings
            </p>

            {isTemplateMode && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Title</Label>
                <InlineEditableLabel
                  key={`settings-completion-${selectedField.id}`}
                  value={selectedField.label}
                  placeholder="Thank you!"
                  saveStatus={saveStatus[selectedField.id] ?? null}
                  onSave={(label) =>
                    updateFieldMutation.mutate({
                      fieldId: selectedField.id,
                      data: { label },
                    })
                  }
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Redirect URL (optional)
              </Label>
              <Input
                type="url"
                key={`completion-redirect-${selectedField.id}`}
                defaultValue={
                  selectedField.validation &&
                  typeof selectedField.validation === "object" &&
                  (selectedField.validation as Record<string, unknown>).redirectUrl
                    ? String((selectedField.validation as Record<string, unknown>).redirectUrl)
                    : ""
                }
                placeholder="https://your-site.com/thanks"
                className="h-9 text-sm"
                onBlur={(e) => {
                  const url = e.target.value.trim();
                  updateFieldMutation.mutate({
                    fieldId: selectedField.id,
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

            <Button
              variant="outline"
              size="sm"
              className="w-full text-destructive hover:text-destructive"
              onClick={() => {
                const step = findField(selectedField.id)?.step;
                if (step) deleteStepMutation.mutate(step.id);
              }}
              disabled={deleteStepMutation.isPending}
            >
              {deleteStepMutation.isPending ? (
                <Loader className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Delete ending
            </Button>
          </>
        ) : selectedStep ? (
          <>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Section Settings
            </p>

            {isTemplateMode && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Title</Label>
                <InlineEditableLabel
                  key={`settings-step-${selectedStep.id}`}
                  value={selectedStep.title ?? ""}
                  placeholder="Section title..."
                  saveStatus={saveStatus[selectedStep.id] ?? null}
                  onSave={(title) =>
                    updateStepMutation.mutate({
                      stepId: selectedStep.id,
                      data: { title },
                    })
                  }
                />
              </div>
            )}

            <div className="flex items-center justify-between rounded-[16px] bg-muted/50 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Show questions together</p>
                <p className="text-xs text-muted-foreground">
                  All questions on one screen
                </p>
              </div>
              <Switch
                checked={sectionShowsFieldsTogether(selectedStep.settings)}
                onCheckedChange={(checked) => {
                  const current =
                    selectedStep.settings && typeof selectedStep.settings === "object"
                      ? (selectedStep.settings as Record<string, unknown>)
                      : {};
                  updateStepMutation.mutate({
                    stepId: selectedStep.id,
                    data: { settings: { ...current, groupFields: checked } },
                  });
                }}
              />
            </div>

            {(sourcesByStepId[selectedStep.id] ?? []).length > 0 && (
              <FormConditionEditor
                title="Show this section when"
                condition={selectedStep.visibility ?? null}
                sources={sourcesByStepId[selectedStep.id] ?? []}
                onChange={(next) =>
                  updateStepMutation.mutate({
                    stepId: selectedStep.id,
                    data: { visibility: next },
                  })
                }
              />
            )}

            {contentSteps.length > 1 && (
              <Button
                variant="outline"
                size="sm"
                className="w-full text-destructive hover:text-destructive"
                onClick={() => deleteStepMutation.mutate(selectedStep.id)}
                disabled={deleteStepMutation.isPending}
              >
                {deleteStepMutation.isPending ? (
                  <Loader className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Delete section
              </Button>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Select a question to edit its settings.
          </p>
        )}
      </CardContent>
    </Card>
  );

  // ─── Render: Builder ─────────────────────────────────────────────────────

  return (
    <div>
      {/* Top action bar */}
      {!isTemplateMode && (
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
              if (!currentProject) return;
              const url = `${window.location.origin}/${currentProject.slug}/${form.slug}`;
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
            onClick={() => {
              if (!currentProject) return;
              window.open(
                `${window.location.origin}/${currentProject.slug}/${form.slug}`,
                "_blank"
              );
            }}
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
      )}

      {isTemplateMode ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
            {contentPanel}
            {settingsPanel}
          </div>
          {props.onboardingFooter}
        </div>
      ) : (
        <div className="grid gap-5 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_320px]">
          {contentPanel}
          {previewCanvas}
          {settingsPanel}
        </div>
      )}

      {/* ─── Settings Dialog ────────────────────────────────────────── */}
      {!isTemplateMode && (
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
              <p className="text-xs text-muted-foreground leading-relaxed">
                Changing the slug changes the form&apos;s public link. On Pro and
                Business plans, old links automatically redirect to the new one.
              </p>
            </div>

            {/* Experience */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Experience</Label>
              <Select
                value={form.type}
                onValueChange={(val) =>
                  updateFormMutation.mutate({ type: val as "multi_step" | "single" })
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="multi_step">
                    Focused — one question at a time
                  </SelectItem>
                  <SelectItem value="single">
                    Classic — all questions on one page
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Focused presents questions one at a time, Typeform-style, with
                keyboard navigation and smooth transitions.
              </p>
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
      )}

    </div>
  );
}

// ─── Content Step Group ──────────────────────────────────────────────────────

function ContentStepGroup({
  step,
  stepNumber,
  isGrouped,
  isSelected,
  selectedFieldId,
  questionNumberByFieldId,
  onSelectStep,
  onSelectField,
  onDeleteStep,
}: {
  step: FormStep;
  stepNumber: number;
  isGrouped: boolean;
  isSelected: boolean;
  selectedFieldId: string | null;
  questionNumberByFieldId: Record<string, number>;
  onSelectStep: () => void;
  onSelectField: (fieldId: string) => void;
  onDeleteStep?: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `${STEP_SORTABLE_ID_PREFIX}${step.id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const fields = sortFields(step.fields ?? []).filter(
    (f) => f.type !== "completion",
  );

  return (
    <div ref={setNodeRef} style={style} className="space-y-1">
      <div
        className={cn(
          "group/steprow flex items-center gap-1 rounded-[10px] px-1 py-1 transition-colors",
          isSelected ? "bg-primary/10" : "hover:bg-muted/50",
        )}
      >
        <span
          className="flex h-6 w-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
          {...listeners}
          {...attributes}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
        <button
          type="button"
          onClick={onSelectStep}
          className="flex min-w-0 flex-1 items-baseline gap-2 text-left"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground shrink-0">
            Section {stepNumber}
          </span>
          {step.title?.trim() && (
            <span className="truncate text-xs font-medium text-foreground">
              {step.title}
            </span>
          )}
          {isGrouped && (
            <Layers className="h-3 w-3 shrink-0 self-center text-muted-foreground/70" />
          )}
        </button>
        {onDeleteStep && (
          <button
            type="button"
            onClick={onDeleteStep}
            className="rounded-full bg-muted p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label={`Delete section ${stepNumber}`}
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      <StepFieldList
        stepId={step.id}
        fields={fields}
        selectedFieldId={selectedFieldId}
        questionNumberByFieldId={questionNumberByFieldId}
        onSelectField={onSelectField}
      />
    </div>
  );
}

function StepFieldList({
  stepId,
  fields,
  selectedFieldId,
  questionNumberByFieldId,
  onSelectField,
}: {
  stepId: string;
  fields: FormField[];
  selectedFieldId: string | null;
  questionNumberByFieldId: Record<string, number>;
  onSelectField: (fieldId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${GROUP_DROPPABLE_ID_PREFIX}${stepId}`,
  });

  return (
    <SortableContext
      items={fields.map((f) => f.id)}
      strategy={verticalListSortingStrategy}
    >
      <div
        ref={setNodeRef}
        className={cn(
          "space-y-0.5 rounded-[12px] transition-colors",
          isOver && "bg-primary/5",
          fields.length === 0 && "border border-dashed px-2 py-3",
        )}
      >
        {fields.length === 0 ? (
          <p className="text-[11px] text-muted-foreground text-center">
            Drop a question here
          </p>
        ) : (
          fields.map((field) => (
            <ContentFieldRow
              key={field.id}
              field={field}
              questionNumber={questionNumberByFieldId[field.id]}
              isSelected={selectedFieldId === field.id}
              onSelect={() => onSelectField(field.id)}
            />
          ))
        )}
      </div>
    </SortableContext>
  );
}

function ContentFieldRow({
  field,
  questionNumber,
  isSelected,
  onSelect,
}: {
  field: FormField;
  questionNumber: number | undefined;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.25 : 1,
  };

  const meta = getFieldTypeMeta(field.type);
  const Icon = meta.icon;

  return (
    <div ref={setNodeRef} style={style} className="group/fieldrow flex items-center gap-1">
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2.5 rounded-[12px] px-2 py-2 text-left text-sm transition-colors",
          isSelected ? "bg-primary/10" : "hover:bg-muted/60",
        )}
      >
        <span
          className={cn(
            "flex h-7 w-10 shrink-0 items-center justify-center gap-0.5 rounded-[8px]",
            meta.chipClass,
          )}
        >
          <Icon className="h-3 w-3" />
          {questionNumber != null && (
            <span className="text-[10px] font-semibold">{questionNumber}</span>
          )}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">
          {field.label || "Untitled question"}
          {field.required && <span className="text-destructive ml-0.5">*</span>}
        </span>
      </button>
      <span
        className="flex h-6 w-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground/0 transition-colors group-hover/fieldrow:text-muted-foreground/60 active:cursor-grabbing"
        {...listeners}
        {...attributes}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </span>
    </div>
  );
}

function FieldDragPreview({ field }: { field: FormField }) {
  const meta = getFieldTypeMeta(field.type);
  const Icon = meta.icon;

  return (
    <div className="w-[min(260px,calc(100vw-3rem))] rounded-[12px] border bg-background px-2.5 py-2 shadow-lg">
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px]",
            meta.chipClass,
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <p className="truncate text-sm font-medium text-foreground">
          {field.label}
        </p>
        <Badge variant="secondary" className="ml-auto rounded-full px-2 py-0.5 text-[10px]">
          {meta.label}
        </Badge>
      </div>
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
  textClassName,
}: {
  value: string;
  onSave: (value: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
  saveStatus?: "saving" | "saved" | "error" | null;
  textClassName?: string;
}) {
  const [localValue, setLocalValue] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isEditingRef = useRef(false);

  useEffect(() => {
    // Only adopt an external value change when the user isn't actively editing.
    // Otherwise a background cache update (e.g. the server response to a
    // sibling mutation) would wipe the characters they're currently typing.
    if (!isEditingRef.current) setLocalValue(value);
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
        onFocus={() => {
          isEditingRef.current = true;
        }}
        onBlur={() => {
          isEditingRef.current = false;
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
        className={cn(
          "text-sm font-medium text-foreground bg-transparent border-0 border-b border-dashed border-transparent hover:border-muted-foreground/30 focus:border-solid focus:border-primary outline-none min-w-0 pb-0.5 w-full transition-colors resize-none overflow-hidden block",
          textClassName,
        )}
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

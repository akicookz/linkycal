import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { usePostHog } from "@posthog/react";
import {
  Loader,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  Check,
} from "lucide-react";
import { RichTextContent } from "@/components/RichTextContent";
import { Button } from "@/components/ui/button";
import { FormFieldRenderer } from "@/components/FormFieldRenderer";
import {
  FocusedFieldInput,
  isChoiceFieldType,
} from "@/components/FocusedFieldInput";
import { Logo } from "@/components/Logo";
import { SEOHead } from "@/components/SEOHead";
import { cn } from "@/lib/utils";
import { track } from "@/lib/track";
import {
  isFieldVisible,
  isStepVisible,
  type FormCondition,
  type FormConditionField,
} from "@/lib/form-conditions";
import {
  sectionShowsFieldsTogether,
  getSectionImage,
  sectionImageStyle,
  type SectionImage,
  type SectionImageLayout,
} from "@/lib/form-sections";
import { prefillFromQuery, parseQueryString } from "@/lib/form-prefill";

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
  validation: Record<string, unknown> | null;
  options: Array<{ label: string; value: string }> | null;
  visibility?: FormCondition | null;
}

interface FormStep {
  id: string;
  sortOrder: number;
  title: string | null;
  description: string | null;
  richDescription: string | null;
  settings?: unknown;
  visibility?: FormCondition | null;
  fields: FormField[];
}

interface PublicFormData {
  id: string;
  name: string;
  slug: string;
  type: "multi_step" | "single";
  status: string;
  steps: FormStep[];
}

interface BookingTheme {
  primaryBg?: string;
  primaryText?: string;
  backgroundColor?: string;
  textColor?: string;
  borderRadius?: number;
  fontFamily?: string;
  backgroundImage?: string;
  bannerImage?: string;
}

interface ProjectInfo {
  id: string;
  name: string;
  slug: string;
  settings?: { theme?: BookingTheme };
}

// One screen in the focused (one-question-at-a-time) experience. A section's
// title/description becomes a "statement" screen shown before its questions;
// sections with "show questions together" enabled render all their questions
// on a single "group" screen.
type FocusedScreen = {
  key: string;
  stepId: string;
  stepIndex: number;
} & (
  | {
      kind: "statement";
      title: string | null;
      description: string | null;
      richDescription: string | null;
    }
  | { kind: "question"; field: FormField; questionNumber: number }
  | { kind: "group"; fields: FormField[]; firstQuestionNumber: number }
);

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function truncateMetaDescription(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 180) return normalized;
  return `${normalized.slice(0, 177).trimEnd()}...`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PublicForm() {
  const { projectSlug, slug: formSlug } = useParams<{ projectSlug: string; slug: string }>();
  const [searchParams] = useSearchParams();
  const posthog = usePostHog();
  const isEmbedded = searchParams.get("embed") === "1";
  const themeOverride = useMemo<BookingTheme | undefined>(() => {
    const raw = searchParams.get("theme");
    if (!raw) return undefined;
    try {
      return JSON.parse(atob(raw)) as BookingTheme;
    } catch {
      return undefined;
    }
  }, [searchParams]);

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [screenIndex, setScreenIndex] = useState(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [values, setValues] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [responseId, setResponseId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Spam prevention
  const [spamField, setSpamField] = useState("");
  const [formToken] = useState(() => btoa(String(Date.now())));

  const {
    data: formData,
    isLoading,
    isError,
  } = useQuery<{ form: PublicFormData; project: ProjectInfo | null; canHideBranding?: boolean }>({
    queryKey: ["public-form", projectSlug, formSlug],
    queryFn: async () => {
      const res = await fetch(`/api/public/forms/${projectSlug}/${formSlug}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("not_found");
        throw new Error("Failed to load form");
      }
      return res.json();
    },
    enabled: !!projectSlug && !!formSlug,
  });

  const form = formData?.form;
  const project = formData?.project;
  const canHideBranding = formData?.canHideBranding;
  const themeFromProject = project?.settings?.theme;
  const theme = useMemo<BookingTheme | undefined>(() => {
    if (!themeOverride && !themeFromProject) return undefined;
    return { ...(themeFromProject ?? {}), ...(themeOverride ?? {}) };
  }, [themeFromProject, themeOverride]);

  const isFocusedExperience = form?.type === "multi_step";

  const primaryStyle: React.CSSProperties | undefined = (theme?.primaryBg || theme?.borderRadius != null)
    ? {
        ...(theme?.primaryBg ? { backgroundColor: theme.primaryBg, color: theme.primaryText || "#fff", borderColor: theme.primaryBg } : {}),
        ...(theme?.borderRadius != null ? { borderRadius: `${theme.borderRadius}px` } : {}),
      }
    : undefined;
  const outlineStyle: React.CSSProperties | undefined = theme?.borderRadius != null
    ? { borderRadius: `${theme.borderRadius}px` }
    : undefined;

  // ─── Track page view ────────────────────────────────────────────────────

  useEffect(() => {
    if (formSlug && form && project) {
      track("form_view", { projectSlug: project.slug, resourceSlug: formSlug });
    }
  }, [formSlug, form, project]);

  // ─── Apply theme ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!theme) return;
    if (!isEmbedded && theme.backgroundColor) {
      document.body.style.backgroundColor = theme.backgroundColor;
    }

    if (theme.fontFamily && theme.fontFamily !== "Satoshi") {
      const fontUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(theme.fontFamily)}:wght@400;500;600;700&display=swap`;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = fontUrl;
      document.head.appendChild(link);
      return () => {
        document.body.style.backgroundColor = "";
        link.remove();
      };
    }

    return () => { document.body.style.backgroundColor = ""; };
  }, [theme, isEmbedded]);

  // ─── Embed: post height to parent + transparent background ─────────────
  useEffect(() => {
    if (!isEmbedded) return;
    const prevBodyBg = document.body.style.backgroundColor;
    const prevHtmlBg = document.documentElement.style.backgroundColor;
    document.body.style.backgroundColor = "transparent";
    document.documentElement.style.backgroundColor = "transparent";

    let last = 0;
    const sendHeight = () => {
      const h = document.documentElement.scrollHeight;
      if (h !== last) {
        last = h;
        window.parent.postMessage({ type: "lc-height", height: h }, "*");
      }
    };
    sendHeight();
    const ro = new ResizeObserver(sendHeight);
    ro.observe(document.documentElement);
    window.addEventListener("resize", sendHeight);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sendHeight);
      document.body.style.backgroundColor = prevBodyBg;
      document.documentElement.style.backgroundColor = prevHtmlBg;
    };
  }, [isEmbedded]);

  const allSortedSteps = useMemo(
    () => (form?.steps ? [...form.steps].sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [form],
  );
  // Filter out steps that contain a completion field
  const stepsAfterCompletion = useMemo(
    () =>
      allSortedSteps.filter(
        (s) => !(s.fields.length > 0 && s.fields.every((f) => f.type === "completion")),
      ),
    [allSortedSteps],
  );
  // Find the completion field (if any)
  const completionField = useMemo(
    () =>
      allSortedSteps.flatMap((s) => s.fields).find((f) => f.type === "completion") ?? null,
    [allSortedSteps],
  );

  const allFields = useMemo<FormField[]>(
    () => allSortedSteps.flatMap((s) => s.fields),
    [allSortedSteps],
  );
  const fieldsById = useMemo<Record<string, FormConditionField>>(() => {
    const map: Record<string, FormConditionField> = {};
    for (const f of allFields) {
      map[f.id] = {
        id: f.id,
        type: f.type,
        options: f.options,
        visibility: f.visibility ?? null,
      };
    }
    return map;
  }, [allFields]);

  const conditionInputs = useMemo(
    () => ({ values, fieldsById }),
    [values, fieldsById],
  );

  const steps = stepsAfterCompletion.filter((s) =>
    isStepVisible({ visibility: s.visibility ?? null }, conditionInputs),
  );

  function visibleFieldsForStep(step: FormStep | undefined): FormField[] {
    if (!step) return [];
    return [...step.fields]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .filter(
        (f) =>
          f.type !== "completion" &&
          isFieldVisible(
            {
              id: f.id,
              type: f.type,
              options: f.options,
              visibility: f.visibility ?? null,
            },
            conditionInputs,
          ),
      );
  }

  // ─── Classic (single-page) step state ───────────────────────────────────

  const currentStep = steps[currentStepIndex];
  const currentFields = visibleFieldsForStep(currentStep);
  const isLastStep = currentStepIndex === steps.length - 1;
  const isFirstStep = currentStepIndex === 0;

  // ─── Focused experience screens ─────────────────────────────────────────

  const screens: FocusedScreen[] = [];
  if (isFocusedExperience) {
    let questionNumber = 0;
    steps.forEach((step, stepIndex) => {
      // New sections are created untitled, but legacy data carries
      // auto-generated "Step N" / "Section N" titles — that's chrome, not an
      // intro the respondent should see as its own screen.
      const title = step.title?.trim() ?? "";
      const isDefaultTitle = /^(step|section) \d+$/i.test(title);
      const hasIntro = !!(
        step.description?.trim() ||
        step.richDescription?.trim() ||
        (title && !isDefaultTitle)
      );
      if (hasIntro) {
        screens.push({
          kind: "statement",
          key: `statement-${step.id}`,
          stepId: step.id,
          stepIndex,
          title: step.title,
          description: step.description,
          richDescription: step.richDescription,
        });
      }
      const visibleFields = visibleFieldsForStep(step);
      if (sectionShowsFieldsTogether(step.settings)) {
        if (visibleFields.length > 0) {
          screens.push({
            kind: "group",
            key: `group-${step.id}`,
            stepId: step.id,
            stepIndex,
            fields: visibleFields,
            firstQuestionNumber: questionNumber + 1,
          });
          questionNumber += visibleFields.length;
        }
      } else {
        for (const field of visibleFields) {
          questionNumber += 1;
          screens.push({
            kind: "question",
            key: `field-${field.id}`,
            stepId: step.id,
            stepIndex,
            field,
            questionNumber,
          });
        }
      }
    });
  }
  const currentScreen = screens[screenIndex] ?? null;
  const isLastScreen = screenIndex === screens.length - 1;

  // ─── URL prefill (once per form load) ──────────────────────────────────
  const didPrefill = useRef(false);
  useEffect(() => {
    if (!form) return;
    if (didPrefill.current) return;
    didPrefill.current = true;

    const query = parseQueryString(window.location.search);
    const prefilled = prefillFromQuery(
      allFields.map((f) => ({
        id: f.id,
        type: f.type,
        options: f.options,
      })),
      query,
    );
    if (Object.keys(prefilled).length > 0) {
      setValues((prev) => ({ ...prefilled, ...prev }));
    }
  }, [form, allFields]);

  // ─── Clamp indices if visibility shrinks the lists ──────────────────────
  useEffect(() => {
    if (steps.length === 0) return;
    if (currentStepIndex >= steps.length) {
      setCurrentStepIndex(steps.length - 1);
    }
  }, [steps.length, currentStepIndex]);

  useEffect(() => {
    if (screens.length === 0) return;
    if (screenIndex >= screens.length) {
      setScreenIndex(screens.length - 1);
    }
  }, [screens.length, screenIndex]);

  // ─── Clear hidden-field values whenever visibility changes ─────────────
  useEffect(() => {
    const hiddenWithValue: string[] = [];
    for (const f of allFields) {
      if (f.type === "completion") continue;
      if (values[f.id] === undefined) continue;
      const visible = isFieldVisible(
        {
          id: f.id,
          type: f.type,
          options: f.options,
          visibility: f.visibility ?? null,
        },
        conditionInputs,
      );
      if (!visible) hiddenWithValue.push(f.id);
    }
    if (hiddenWithValue.length === 0) return;
    setValues((prev) => {
      const next = { ...prev };
      for (const id of hiddenWithValue) delete next[id];
      return next;
    });
    setFiles((prev) => {
      const next = { ...prev };
      for (const id of hiddenWithValue) delete next[id];
      return next;
    });
  }, [allFields, conditionInputs, values]);

  // Completion redirect — hook must be declared before any early returns
  // so the hook call order stays stable across loading/error/success renders.
  const completionRedirectUrl =
    completionField?.validation &&
    typeof completionField.validation.redirectUrl === "string" &&
    completionField.validation.redirectUrl.trim()
      ? completionField.validation.redirectUrl.trim()
      : null;
  useEffect(() => {
    if (!submitted || !completionRedirectUrl) return;
    const timer = setTimeout(() => {
      window.location.href = completionRedirectUrl;
    }, 5000);
    return () => clearTimeout(timer);
  }, [submitted, completionRedirectUrl]);

  function setValue(fieldId: string, value: string) {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  }

  function setFileValue(fieldId: string, file: File | null) {
    setFiles((prev) => ({ ...prev, [fieldId]: file }));
    setValue(fieldId, file?.name ?? "");
  }

  function validateField(field: FormField): string | null {
    if (field.required && !values[field.id]?.trim()) {
      return "Please fill this in";
    }
    if (
      field.type === "email" &&
      values[field.id]?.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values[field.id])
    ) {
      return "Please enter a valid email";
    }
    return null;
  }

  function validateCurrentStep(): boolean {
    const errors: Record<string, string> = {};
    for (const field of currentFields) {
      const msg = validateField(field);
      if (msg) errors[field.id] = msg;
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function ensureResponseId(): Promise<string> {
    if (responseId) return responseId;
    const res = await fetch(`/api/public/forms/${projectSlug}/${formSlug}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ website: spamField, _token: formToken }),
    });
    if (!res.ok) throw new Error("Failed to start form response");
    const data = await res.json();
    const id = data.response?.id;
    if (!id) throw new Error("No response ID returned");
    setResponseId(id);
    return id;
  }

  async function uploadFieldFile(
    responseId: string,
    field: FormField,
    file: File,
  ): Promise<{ filename: string; fileUrl: string }> {
    const formData = new FormData();
    formData.set("fieldId", field.id);
    formData.set("file", file);

    const res = await fetch(
      `/api/v1/forms/${projectSlug}/${formSlug}/responses/${responseId}/uploads`,
      {
        method: "POST",
        body: formData,
      },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const message =
        typeof data.error === "string" ? data.error : "Failed to upload file";
      throw new Error(message);
    }

    const data = await res.json();
    const upload = data.upload;
    if (
      !upload ||
      typeof upload.filename !== "string" ||
      typeof upload.fileUrl !== "string"
    ) {
      throw new Error("Invalid upload response");
    }

    return {
      filename: upload.filename,
      fileUrl: upload.fileUrl,
    };
  }

  async function submitStepValues(stepIndex: number, complete: boolean): Promise<boolean> {
    setSubmitting(true);
    setError(null);
    try {
      const resId = await ensureResponseId();
      const fields: Array<{
        fieldId: string;
        value: string;
        fileUrl?: string;
      }> = [];

      for (const field of visibleFieldsForStep(steps[stepIndex])) {
        if (field.type === "file") {
          const file = files[field.id];
          if (file) {
            const upload = await uploadFieldFile(resId, field, file);
            fields.push({
              fieldId: field.id,
              value: upload.filename,
              fileUrl: upload.fileUrl,
            });
            continue;
          }
        }

        fields.push({
          fieldId: field.id,
          value: values[field.id] ?? "",
        });
      }

      const res = await fetch(
        `/api/public/forms/${projectSlug}/${formSlug}/responses/${resId}/steps/${stepIndex}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fields, complete }),
        }
      );
      if (!res.ok) throw new Error("Failed to submit");

      if (complete) {
        posthog?.capture("form_submitted", {
          form_slug: formSlug,
          form_name: form?.name,
          total_steps: steps.length,
        });
        setSubmitted(true);
      }
      return true;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Classic step submission ─────────────────────────────────────────────

  async function submitCurrentStep() {
    if (!validateCurrentStep()) return;
    const ok = await submitStepValues(currentStepIndex, isLastStep);
    if (ok && !isLastStep) {
      setCurrentStepIndex((prev) => prev + 1);
    }
  }

  // ─── Focused navigation ──────────────────────────────────────────────────

  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearAutoAdvance() {
    if (autoAdvanceTimer.current) {
      clearTimeout(autoAdvanceTimer.current);
      autoAdvanceTimer.current = null;
    }
  }

  async function goNext() {
    if (submitting || submitted) return;
    clearAutoAdvance();
    const screen = screens[screenIndex];
    if (!screen) return;

    if (screen.kind === "question") {
      const msg = validateField(screen.field);
      if (msg) {
        setFieldErrors({ [screen.field.id]: msg });
        return;
      }
    }
    if (screen.kind === "group") {
      const errors: Record<string, string> = {};
      for (const field of screen.fields) {
        const msg = validateField(field);
        if (msg) errors[field.id] = msg;
      }
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }
    }

    const next = screens[screenIndex + 1];
    const leavingStep = isLastScreen || (next && next.stepIndex !== screen.stepIndex);

    if (leavingStep) {
      const ok = await submitStepValues(screen.stepIndex, isLastScreen);
      if (!ok || isLastScreen) return;
    }

    setDirection("forward");
    setScreenIndex((prev) => Math.min(prev + 1, screens.length - 1));
  }

  function goPrev() {
    if (submitting || submitted || screenIndex === 0) return;
    clearAutoAdvance();
    setDirection("back");
    setScreenIndex((prev) => Math.max(prev - 1, 0));
  }

  // Latest-closure refs so the global keyboard listener and auto-advance
  // timers never act on stale state.
  const goNextRef = useRef(goNext);
  const goPrevRef = useRef(goPrev);
  const currentScreenRef = useRef<FocusedScreen | null>(currentScreen);
  const setValueRef = useRef(setValue);
  const valuesRef = useRef(values);
  useEffect(() => {
    goNextRef.current = goNext;
    goPrevRef.current = goPrev;
    currentScreenRef.current = currentScreen;
    setValueRef.current = setValue;
    valuesRef.current = values;
  });

  function scheduleAutoAdvance() {
    clearAutoAdvance();
    autoAdvanceTimer.current = setTimeout(() => {
      autoAdvanceTimer.current = null;
      goNextRef.current();
    }, 350);
  }

  useEffect(() => () => clearAutoAdvance(), []);

  // ─── Focused keyboard shortcuts ──────────────────────────────────────────

  useEffect(() => {
    if (!isFocusedExperience || submitted) return;

    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inTextInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target?.isContentEditable ?? false);

      // Text inputs handle Enter themselves (FocusedFieldInput onCommit).
      if (e.key === "Enter" && !inTextInput) {
        e.preventDefault();
        goNextRef.current();
        return;
      }

      if (inTextInput) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        goNextRef.current();
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        goPrevRef.current();
        return;
      }

      // Letter shortcuts for choice questions (A, B, C, ...)
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const screen = currentScreenRef.current;
      if (
        screen?.kind !== "question" ||
        !isChoiceFieldType(screen.field.type) ||
        screen.field.type === "checkbox" ||
        !/^[a-z]$/i.test(e.key)
      ) {
        return;
      }
      const optionIndex = e.key.toUpperCase().charCodeAt(0) - 65;
      const option = screen.field.options?.[optionIndex];
      if (!option) return;
      e.preventDefault();

      const field = screen.field;
      if (field.type === "multi_select") {
        const selected = (valuesRef.current[field.id] ?? "").split(",").filter(Boolean);
        const next = selected.includes(option.value)
          ? selected.filter((v) => v !== option.value)
          : [...selected, option.value];
        setValueRef.current(field.id, next.join(","));
        return;
      }
      setValueRef.current(field.id, option.value);
      scheduleAutoAdvance();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocusedExperience, submitted]);

  // ─── Loading / Error States ────────────────────────────────────────────

  if (isLoading) {
    return (
      <PageShell theme={theme} canHideBranding={canHideBranding}>
        <div className="flex items-center justify-center py-20">
          <Loader className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </PageShell>
    );
  }

  if (isError || !form) {
    return (
      <PageShell theme={theme} canHideBranding={canHideBranding}>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertCircle className="h-10 w-10 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-1">Form not found</h2>
          <p className="text-sm text-muted-foreground">
            This form may have been removed or is not yet published.
          </p>
        </div>
      </PageShell>
    );
  }

  const introStep = allSortedSteps.find(
    (step) => step.richDescription?.trim() || step.description?.trim(),
  );
  const introText = introStep?.richDescription
    ? stripHtml(introStep.richDescription)
    : introStep?.description?.trim();
  const seoDescription = truncateMetaDescription(
    introText ||
      `Submit ${form.name}${project?.name ? ` for ${project.name}` : ""}.`,
  );
  const seoImage = theme?.bannerImage || theme?.backgroundImage || "/og-image.png";
  const seoCanonical =
    projectSlug && formSlug ? `/${projectSlug}/${formSlug}` : undefined;
  const seoHead = (
    <SEOHead
      title={form.name}
      description={seoDescription}
      image={seoImage}
      imageAlt={`${form.name} form preview`}
      canonical={seoCanonical}
      noIndex={isEmbedded}
    />
  );

  // ─── Success State ─────────────────────────────────────────────────────

  const completionTitle = completionField?.label || "Thank you!";
  const completionDescription = completionField?.description || null;
  const completionFallbackText = completionField
    ? null
    : "Your response has been submitted successfully.";

  if (submitted) {
    const completionContent = (
      <div className="flex flex-col items-center justify-center text-center animate-focused-screen">
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-5">
          <CheckCircle2 className="h-7 w-7 text-primary" />
        </div>
        <h2
          className={cn(
            "font-semibold mb-2",
            isFocusedExperience ? "text-2xl sm:text-3xl" : "text-xl"
          )}
        >
          {completionTitle}
        </h2>
        {completionDescription ? (
          <div
            className="text-sm text-muted-foreground max-w-sm prose prose-sm"
            dangerouslySetInnerHTML={{ __html: completionDescription }}
          />
        ) : completionFallbackText ? (
          <p className="text-sm text-muted-foreground max-w-sm">
            {completionFallbackText}
          </p>
        ) : null}
        {completionRedirectUrl && (
          <p className="text-xs text-muted-foreground mt-4">Redirecting...</p>
        )}
      </div>
    );

    if (isFocusedExperience) {
      return (
        <FocusedShell
          theme={theme}
          canHideBranding={canHideBranding}
          progressPct={100}
          showNav={false}
        >
          {seoHead}
          {completionContent}
        </FocusedShell>
      );
    }

    return (
      <PageShell theme={theme} canHideBranding={canHideBranding}>
        {seoHead}
        <div className="py-16">{completionContent}</div>
      </PageShell>
    );
  }

  // ─── Focused (one question per screen) Rendering ────────────────────────

  if (isFocusedExperience) {
    const progressPct =
      screens.length > 0 ? Math.round((screenIndex / screens.length) * 100) : 0;

    // The section's image stays pinned for every screen within that section
    // (statement/question/group screens share the same stepId).
    const currentSectionImage = currentScreen
      ? getSectionImage(
          steps.find((s) => s.id === currentScreen.stepId)?.settings,
        )
      : null;

    return (
      <FocusedShell
        theme={theme}
        canHideBranding={canHideBranding}
        progressPct={progressPct}
        showNav
        canPrev={screenIndex > 0 && !submitting}
        canNext={!isLastScreen && !submitting}
        onPrev={goPrev}
        onNext={goNext}
        media={
          currentSectionImage ? <SectionMedia image={currentSectionImage} /> : undefined
        }
        mediaLayout={currentSectionImage?.layout}
      >
        {seoHead}
        <div className="sr-only" aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input
            id="website"
            type="text"
            name="website"
            autoComplete="url"
            tabIndex={-1}
            value={spamField}
            onChange={(e) => setSpamField(e.target.value)}
          />
        </div>

        {currentScreen ? (
          <div
            key={currentScreen.key}
            className="animate-focused-screen"
            style={{ "--screen-from": direction === "forward" ? "48px" : "-48px" } as React.CSSProperties}
          >
            {currentScreen.kind === "statement" ? (
              <div className="space-y-5">
                {currentScreen.title && (
                  <h1 className="text-2xl sm:text-4xl font-semibold leading-snug">
                    {currentScreen.title}
                  </h1>
                )}
                <RichTextContent
                  value={currentScreen.richDescription}
                  fallbackPlainText={currentScreen.description}
                  className="text-base text-muted-foreground"
                />
                <div className="flex items-center gap-3 pt-2">
                  <Button
                    size="lg"
                    onClick={goNext}
                    disabled={submitting}
                    className="px-7 text-base glow-surface"
                    style={primaryStyle}
                  >
                    {submitting ? (
                      <Loader className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowRight className="h-4 w-4" />
                    )}
                    Continue
                  </Button>
                  <span className="hidden sm:inline text-xs text-muted-foreground">
                    press <span className="font-semibold">Enter ↵</span>
                  </span>
                </div>
              </div>
            ) : currentScreen.kind === "group" ? (
              <div className="space-y-6">
                <div className="space-y-9">
                  {currentScreen.fields.map((field, idx) => (
                    <div key={field.id} className="space-y-2.5">
                      <h2 className="text-xl sm:text-2xl font-semibold leading-snug">
                        {currentScreen.firstQuestionNumber + idx}. {field.label}
                        {field.required && (
                          <span className="text-destructive ml-1">*</span>
                        )}
                      </h2>
                      {field.description && (
                        <div
                          className="text-base sm:text-lg text-muted-foreground prose prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ __html: field.description }}
                        />
                      )}
                      <FocusedFieldInput
                        key={field.id}
                        field={field}
                        value={values[field.id] ?? ""}
                        onChange={(val) => setValue(field.id, val)}
                        fileValue={files[field.id] ?? null}
                        onFileChange={(file) => setFileValue(field.id, file)}
                        onCommit={(trigger) => {
                          // No auto-advance on choice — other questions on
                          // this screen may still be unanswered.
                          if (trigger === "enter") goNext();
                        }}
                        autoFocus={idx === 0}
                        error={fieldErrors[field.id]}
                      />
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    size="lg"
                    onClick={goNext}
                    disabled={submitting}
                    className="px-7 text-base glow-surface"
                    style={primaryStyle}
                  >
                    {submitting ? (
                      <Loader className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    {isLastScreen ? "Submit" : "OK"}
                  </Button>
                  <span className="hidden sm:inline text-xs text-muted-foreground">
                    press <span className="font-semibold">Enter ↵</span>
                  </span>
                </div>

                {error && (
                  <p className="text-sm text-destructive flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {error}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                <div className="space-y-2.5">
                  <h1 className="text-2xl sm:text-3xl font-semibold leading-snug">
                    {currentScreen.questionNumber}. {currentScreen.field.label}
                    {currentScreen.field.required && (
                      <span className="text-destructive ml-1">*</span>
                    )}
                  </h1>
                  {currentScreen.field.description && (
                    <div
                      className="text-lg sm:text-xl text-muted-foreground prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: currentScreen.field.description }}
                    />
                  )}
                </div>

                <FocusedFieldInput
                  key={currentScreen.field.id}
                  field={currentScreen.field}
                  value={values[currentScreen.field.id] ?? ""}
                  onChange={(val) => setValue(currentScreen.field.id, val)}
                  fileValue={files[currentScreen.field.id] ?? null}
                  onFileChange={(file) =>
                    setFileValue(currentScreen.field.id, file)
                  }
                  onCommit={(trigger) => {
                    if (trigger === "choice") scheduleAutoAdvance();
                    else goNext();
                  }}
                  autoFocus
                  error={fieldErrors[currentScreen.field.id]}
                />

                <div className="flex items-center gap-3">
                  <Button
                    size="lg"
                    onClick={goNext}
                    disabled={submitting}
                    className="px-7 text-base glow-surface"
                    style={primaryStyle}
                  >
                    {submitting ? (
                      <Loader className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    {isLastScreen ? "Submit" : "OK"}
                  </Button>
                  <span className="hidden sm:inline text-xs text-muted-foreground">
                    press <span className="font-semibold">Enter ↵</span>
                  </span>
                </div>

                {error && (
                  <p className="text-sm text-destructive flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {error}
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center">
            This form doesn&apos;t have any questions yet.
          </p>
        )}
      </FocusedShell>
    );
  }

  // ─── Classic (single page) Rendering ────────────────────────────────────

  const classicSectionImage = getSectionImage(currentStep?.settings);

  return (
    <PageShell
      theme={theme}
      canHideBranding={canHideBranding}
      media={
        classicSectionImage ? <SectionMedia image={classicSectionImage} /> : undefined
      }
      mediaLayout={classicSectionImage?.layout}
    >
      {seoHead}
      <div className="space-y-1.5 mb-7">
        <h1 className="text-lg font-semibold">{form.name}</h1>
        {steps.length > 1 && currentStep?.title && (
          <p className="text-sm text-muted-foreground">{currentStep.title}</p>
        )}
        <RichTextContent
          value={currentStep?.richDescription}
          fallbackPlainText={currentStep?.description}
        />
      </div>

      {/* Step progress indicator */}
      {steps.length > 1 && (
        <div className="flex gap-1.5 mb-7">
          {steps.map((_, idx) => (
            <div
              key={idx}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                idx <= currentStepIndex ? "bg-primary" : "bg-muted"
              )}
            />
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitCurrentStep();
        }}
        className="space-y-5 sm:space-y-6"
      >
        <div className="sr-only" aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input
            id="website"
            type="text"
            name="website"
            autoComplete="url"
            tabIndex={-1}
            value={spamField}
            onChange={(e) => setSpamField(e.target.value)}
          />
        </div>

        {currentFields.map((field) => (
          <FormFieldRenderer
            key={field.id}
            field={field}
            value={values[field.id] ?? ""}
            onChange={(val) => setValue(field.id, val)}
            fileValue={files[field.id] ?? null}
            onFileChange={(file) => setFileValue(field.id, file)}
            error={fieldErrors[field.id]}
            textareaRows={3}
            themeColor={theme?.primaryBg}
            themeTextColor={theme?.primaryText}
            themeRadius={theme?.borderRadius}
          />
        ))}

        {error && (
          <p className="text-sm text-destructive flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" />
            {error}
          </p>
        )}

        <div className="flex items-center gap-3 pt-6">
          {!isFirstStep && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setCurrentStepIndex((prev) => prev - 1)}
              disabled={submitting}
              style={outlineStyle}
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
          )}
          <Button
            type="submit"
            disabled={submitting}
            className="min-w-[100px]"
            style={primaryStyle}
          >
            {submitting ? (
              <><Loader className="h-4 w-4 animate-spin" /> {isLastStep ? "Submitting..." : "Next"}</>
            ) : isLastStep ? (
              <><CheckCircle2 className="h-4 w-4" /> Submit</>
            ) : (
              <>Next <ChevronRight className="h-4 w-4" /></>
            )}
          </Button>
        </div>
      </form>
    </PageShell>
  );
}

// ─── Focused Shell ───────────────────────────────────────────────────────────
//
// Full-bleed Typeform-style canvas: thin progress bar pinned to the top,
// vertically centered question area, navigation chevrons + branding at the
// bottom. Inside an embed it keeps a stable min-height instead of filling
// the viewport so the host iframe doesn't jump between questions.

// Fills its (relative, overflow-hidden) container while honoring the stored
// focal point + zoom. Shared by the focused split and the classic card.
function SectionMedia({ image }: { image: SectionImage }) {
  return (
    <img
      src={image.url}
      alt=""
      draggable={false}
      className="absolute inset-0 h-full w-full select-none"
      style={sectionImageStyle(image)}
    />
  );
}

function FocusedShell({
  children,
  theme,
  canHideBranding,
  progressPct,
  showNav,
  canPrev = false,
  canNext = false,
  onPrev,
  onNext,
  media,
  mediaLayout = "left",
}: {
  children: React.ReactNode;
  theme?: BookingTheme;
  canHideBranding?: boolean;
  progressPct: number;
  showNav: boolean;
  canPrev?: boolean;
  canNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  media?: React.ReactNode;
  mediaLayout?: SectionImageLayout;
}) {
  const [searchParams] = useSearchParams();
  const isEmbedded = searchParams.get("embed") === "1";
  const hideBrandingRequested = searchParams.get("hide_branding") === "1";
  const showBranding = !(hideBrandingRequested && canHideBranding);

  const themeVars = theme?.primaryBg
    ? ({
        ["--primary" as string]: theme.primaryBg,
        ["--primary-foreground" as string]: theme.primaryText || "#ffffff",
        ["--ring" as string]: theme.primaryBg,
      } as React.CSSProperties)
    : undefined;

  const navButtonStyle: React.CSSProperties | undefined = theme?.primaryBg
    ? { backgroundColor: theme.primaryBg, color: theme.primaryText || "#fff" }
    : undefined;

  return (
    <div
      className={cn(
        "flex flex-col relative",
        isEmbedded ? "min-h-[560px]" : "min-h-dvh bg-background"
      )}
      style={{
        ...(themeVars ?? {}),
        backgroundColor: !isEmbedded ? theme?.backgroundColor || undefined : undefined,
        color: theme?.textColor || undefined,
        fontFamily: theme?.fontFamily ? `"${theme.fontFamily}", sans-serif` : undefined,
        ...(!isEmbedded && theme?.backgroundImage
          ? {
              backgroundImage: `url(${theme.backgroundImage})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
            }
          : {}),
      }}
    >
      {/* Progress bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-primary/10 z-10">
        <div
          className="h-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {media && mediaLayout === "top" ? (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="relative w-full h-44 shrink-0 overflow-hidden sm:h-60">
            {media}
          </div>
          <div className="flex-1 flex items-center justify-center px-6 py-12 sm:px-10">
            <div className="w-full max-w-3xl mx-auto">{children}</div>
          </div>
        </div>
      ) : media ? (
        <div
          className={cn(
            "flex-1 flex min-h-0",
            mediaLayout === "right" && "flex-row-reverse",
          )}
        >
          <div className="relative hidden md:block md:w-[44%] shrink-0 overflow-hidden">
            {media}
          </div>
          <div className="flex-1 flex items-center justify-center px-6 py-14 sm:px-10 min-w-0">
            <div className="w-full max-w-3xl mx-auto">{children}</div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center px-6 py-14 sm:px-10">
          <div className="w-full max-w-3xl mx-auto">{children}</div>
        </div>
      )}

      <div className="flex items-center justify-between px-5 pb-4 sm:px-8 sm:pb-5">
        {showBranding ? (
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Powered by <Logo size="xs" />
          </Link>
        ) : (
          <span />
        )}

        {showNav && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onPrev}
              disabled={!canPrev}
              aria-label="Previous question"
              className="flex h-9 w-9 items-center justify-center rounded-l-[10px] bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              style={navButtonStyle}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!canNext}
              aria-label="Next question"
              className="flex h-9 w-9 items-center justify-center rounded-r-[10px] bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              style={navButtonStyle}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page Shell ──────────────────────────────────────────────────────────────

function PageShell({
  children,
  theme,
  canHideBranding,
  media,
  mediaLayout = "left",
}: {
  children: React.ReactNode;
  theme?: BookingTheme;
  canHideBranding?: boolean;
  media?: React.ReactNode;
  mediaLayout?: SectionImageLayout;
}) {
  const [searchParams] = useSearchParams();
  const isEmbedded = searchParams.get("embed") === "1";
  const hideBanner = searchParams.get("hide_banner") === "1";
  // A section image takes over the card layout; suppress the theme banner so we
  // don't stack two images.
  const showBanner = !!theme?.bannerImage && !hideBanner && !media;
  const hideBrandingRequested = searchParams.get("hide_branding") === "1";
  const showBranding = !(hideBrandingRequested && canHideBranding);

  const themeVars = theme?.primaryBg
    ? ({
        ["--primary" as string]: theme.primaryBg,
        ["--primary-foreground" as string]: theme.primaryText || "#ffffff",
        ["--ring" as string]: theme.primaryBg,
      } as React.CSSProperties)
    : undefined;

  const radiusStyle =
    theme?.borderRadius != null
      ? { borderRadius: `${theme.borderRadius}px` }
      : undefined;

  const card = media ? (
    <div className="w-full max-w-[60rem] mx-auto" style={themeVars}>
      <div
        className={cn(
          "overflow-hidden rounded-[20px] bg-card",
          mediaLayout !== "top" && "flex",
          mediaLayout === "right" && "flex-row-reverse",
        )}
        style={radiusStyle}
      >
        {mediaLayout === "top" && (
          <div className="relative h-44 w-full shrink-0 overflow-hidden sm:h-60">
            {media}
          </div>
        )}
        {(mediaLayout === "left" || mediaLayout === "right") && (
          <div className="relative hidden shrink-0 overflow-hidden sm:block sm:w-[42%]">
            {media}
          </div>
        )}
        <div className="min-w-0 flex-1 px-6 py-7 sm:px-10 sm:py-9">{children}</div>
      </div>
    </div>
  ) : (
    <div className="w-full max-w-[60rem] mx-auto" style={themeVars}>
      {showBanner && (
        <div
          className="w-full h-40 sm:h-48 rounded-t-[20px] bg-cover bg-center"
          style={{ backgroundImage: `url(${theme!.bannerImage})` }}
        />
      )}
      <div
        className={cn(
          "bg-card px-6 py-7 sm:px-10 sm:py-9",
          showBanner ? "rounded-b-[20px]" : "rounded-[20px]"
        )}
        style={{
          borderRadius: theme?.borderRadius != null
            ? showBanner
              ? `0 0 ${theme.borderRadius}px ${theme.borderRadius}px`
              : `${theme.borderRadius}px`
            : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );

  const footer = showBranding ? (
    <footer className="py-4 text-center">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Powered by <Logo size="sm" />
      </Link>
    </footer>
  ) : null;

  if (isEmbedded) {
    return (
      <div
        style={{
          color: theme?.textColor || undefined,
          fontFamily: theme?.fontFamily ? `"${theme.fontFamily}", sans-serif` : undefined,
        }}
      >
        {card}
        {footer}
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-background flex flex-col"
      style={{
        backgroundColor: theme?.backgroundColor || undefined,
        color: theme?.textColor || undefined,
        fontFamily: theme?.fontFamily ? `"${theme.fontFamily}", sans-serif` : undefined,
        ...(theme?.backgroundImage ? {
          backgroundImage: `url(${theme.backgroundImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        } : {}),
      }}
    >
      <div className="flex-1 flex items-center justify-center px-5 py-10 sm:px-6 sm:py-14">
        {card}
      </div>
      {footer}
    </div>
  );
}

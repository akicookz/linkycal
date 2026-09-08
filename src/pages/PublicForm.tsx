import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { usePostHog } from "@posthog/react";
import { AlertCircle, CheckCircle2, Loader } from "lucide-react";

import {
  FocusedFormExperienceShell,
  FormExperience,
  FormExperiencePageShell,
  type FormExperienceCheckpoint,
  type FormExperienceTheme,
} from "@/components/FormExperience";
import { SEOHead } from "@/components/SEOHead";
import {
  buildFormExperienceModel,
  getAllFormFields,
  getCompletionField,
  getFocusedQuestionProgress,
  getSortedFormSteps,
  type FormExperienceAnalyticsEvent,
  type FormExperienceAnalyticsStage,
  type FormExperienceForm,
} from "@/lib/form-experience";
import type { AnalyticsIntegrationConfig } from "../../shared/funnel-analytics";
import {
  createFunnelAnalyticsDispatcher,
  type FunnelAnalyticsDispatcher,
} from "@/lib/funnel-analytics";
import {
  hiddenFieldDefaults,
  parseQueryString,
  prefillFromQuery,
} from "@/lib/form-prefill";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProjectInfo {
  id: string;
  name: string;
  slug: string;
  settings?: { theme?: FormExperienceTheme };
}

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
  const analyticsSearch = searchParams.toString();
  const themeOverride = useMemo<FormExperienceTheme | undefined>(() => {
    const raw = searchParams.get("theme");
    if (!raw) return undefined;
    try {
      return JSON.parse(atob(raw)) as FormExperienceTheme;
    } catch {
      return undefined;
    }
  }, [searchParams]);

  const [values, setValues] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [clearedFieldIds, setClearedFieldIds] = useState<string[]>([]);
  const [responseId, setResponseId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentAnalyticsStageRef =
    useRef<FormExperienceAnalyticsStage | null>(null);

  // Spam prevention
  const [spamField, setSpamField] = useState("");
  const [formToken] = useState(() => btoa(String(Date.now())));

  const {
    data: formData,
    isLoading,
    isError,
  } = useQuery<{
    form: FormExperienceForm;
    project: ProjectInfo | null;
    canHideBranding?: boolean;
    compiledCss?: string | null;
    analyticsIntegrations?: AnalyticsIntegrationConfig[];
  }>({
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
  const compiledCss = formData?.compiledCss;
  const analyticsIntegrations = formData?.analyticsIntegrations;
  const themeFromProject = project?.settings?.theme;
  const theme = useMemo<FormExperienceTheme | undefined>(() => {
    if (!themeOverride && !themeFromProject) return undefined;
    return { ...(themeFromProject ?? {}), ...(themeOverride ?? {}) };
  }, [themeFromProject, themeOverride]);

  const isFocusedExperience = form?.type === "multi_step";
  const analytics = useMemo<FunnelAnalyticsDispatcher | null>(() => {
    if (!formSlug || !project) return null;
    return createFunnelAnalyticsDispatcher({
      projectSlug: project.slug,
      resourceSlug: formSlug,
      funnelType: "form",
      integrations: analyticsIntegrations,
      search: `?${analyticsSearch}`,
    });
  }, [analyticsIntegrations, analyticsSearch, formSlug, project]);

  // ─── Analytics ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!analytics || !form) return;
    analytics.emit({
      event: "form_view",
      stageKey: "form-view",
      stageLabel: form.name.slice(0, 160),
      stageKind: "page",
      stageOrder: 1,
      context: { stageOutcome: "viewed" },
    });
  }, [analytics, form]);

  function handleFormAnalyticsEvent(
    event: FormExperienceAnalyticsEvent,
  ): void {
    if (event.type === "viewed") {
      currentAnalyticsStageRef.current = event.screen;
    }
    if (!analytics) return;
    const eventName = event.type === "viewed"
      ? "form_stage_viewed"
      : event.type === "completed"
        ? "form_stage_completed"
        : event.type === "skipped"
          ? "form_stage_skipped"
          : "form_stage_validation_failed";
    analytics.emit({
      event: eventName,
      stageKey: event.screen.key,
      stageLabel: event.screen.label,
      stageKind: event.screen.kind,
      stageOrder: event.screen.order + 1,
      context: {
        ...(event.screen.fieldType
          ? { fieldType: event.screen.fieldType }
          : {}),
        ...(event.screen.required !== undefined
          ? { required: event.screen.required }
          : {}),
        stageOutcome: event.type,
      },
    });
  }

  function analyticsCorrelation(
    stage: FormExperienceAnalyticsStage | null = null,
  ) {
    if (!analytics) return undefined;
    return {
      journeyId: analytics.journeyId,
      funnelType: "form" as const,
      source: analytics.source,
      deviceType: analytics.deviceType,
      ...(stage
        ? {
            stageKey: stage.key,
            stageLabel: stage.label,
            stageKind: stage.kind,
            stageOrder: stage.order + 1,
          }
        : {}),
    };
  }

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
    () => (form ? getSortedFormSteps(form) : []),
    [form],
  );
  const allFields = useMemo(
    () => (form ? getAllFormFields(form) : []),
    [form],
  );
  const completionField = useMemo(
    () => (form ? getCompletionField(form) : null),
    [form],
  );

  // ─── URL prefill (once per form load) ──────────────────────────────────

  const didPrefill = useRef(false);
  useEffect(() => {
    if (!form) return;
    if (didPrefill.current) return;
    didPrefill.current = true;

    const query = parseQueryString(window.location.search);
    const prefillFields = allFields.map((field) => ({
      id: field.id,
      type: field.type,
      options: field.options,
      hidden: field.hidden,
      validation: field.validation,
    }));
    const prefilled = {
      ...hiddenFieldDefaults(prefillFields),
      ...prefillFromQuery(prefillFields, query),
    };
    if (Object.keys(prefilled).length > 0) {
      setValues((previous) => ({ ...prefilled, ...previous }));
    }
  }, [form, allFields]);

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
    setValues((previous) => ({ ...previous, [fieldId]: value }));
    setClearedFieldIds((previous) =>
      previous.filter((id) => id !== fieldId),
    );
  }

  function setFileValue(fieldId: string, file: File | null) {
    setFiles((previous) => ({ ...previous, [fieldId]: file }));
  }

  function clearFields(fieldIds: string[]) {
    setValues((previous) => {
      const next = { ...previous };
      for (const id of fieldIds) delete next[id];
      return next;
    });
    setFiles((previous) => {
      const next = { ...previous };
      for (const id of fieldIds) delete next[id];
      return next;
    });
    setClearedFieldIds((previous) =>
      Array.from(new Set([...previous, ...fieldIds])),
    );
  }

  async function ensureResponseId(): Promise<string> {
    if (responseId) return responseId;
    const res = await fetch(`/api/public/forms/${projectSlug}/${formSlug}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        website: spamField,
        _token: formToken,
        ...(analytics ? { analytics: analyticsCorrelation() } : {}),
      }),
    });
    if (!res.ok) throw new Error("Failed to start form response");
    const data = await res.json();
    const id = data.response?.id;
    if (!id) throw new Error("No response ID returned");
    setResponseId(id);
    analytics?.emitProviderOnly({
      event: "form_started",
      stageKey: "form-started",
      stageLabel: "Form started",
      stageKind: "page",
      stageOrder: 1,
    });
    return id;
  }

  async function uploadFieldFile(
    responseId: string,
    field: FormExperienceCheckpoint["fields"][number],
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

  async function submitStepValues(
    checkpoint: FormExperienceCheckpoint,
  ): Promise<boolean> {
    const analyticsStage = currentAnalyticsStageRef.current;
    const submitStageOrder = (analyticsStage?.order ?? 0) + 2;
    if (checkpoint.isFinal) {
      analytics?.emit({
        event: "form_submit_attempted",
        stageKey: "form-submit",
        stageLabel: "Submit form",
        stageKind: "submit",
        stageOrder: submitStageOrder,
      });
    }
    setSubmitting(true);
    setError(null);
    try {
      const resId = await ensureResponseId();
      const fields: Array<{
        fieldId: string;
        value: string;
        fileUrl?: string;
      }> = [];

      for (const currentField of checkpoint.fields) {
        if (currentField.type === "file") {
          const file = files[currentField.id];
          if (file) {
            const upload = await uploadFieldFile(resId, currentField, file);
            fields.push({
              fieldId: currentField.id,
              value: upload.filename,
              fileUrl: upload.fileUrl,
            });
            continue;
          }
        }
        fields.push({
          fieldId: currentField.id,
          value: values[currentField.id] ?? "",
        });
      }

      const res = await fetch(
        `/api/public/forms/${projectSlug}/${formSlug}/responses/${resId}/steps/${checkpoint.stepIndex}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fields,
            ...(clearedFieldIds.length > 0 ? { clearedFieldIds } : {}),
            complete: checkpoint.isFinal,
            ...(analytics
              ? { analytics: analyticsCorrelation(analyticsStage) }
              : {}),
          }),
        },
      );
      if (!res.ok) throw new Error("Failed to submit");
      if (clearedFieldIds.length > 0) {
        setClearedFieldIds([]);
      }
      if (checkpoint.isFinal) {
        analytics?.emitProviderOnly({
          event: "form_completed",
          stageKey: "form-complete",
          stageLabel: "Form completed",
          stageKind: "completion",
          stageOrder: submitStageOrder + 1,
        });
        posthog?.capture("form_submitted", {
          form_slug: formSlug,
          form_name: form?.name,
          total_steps: checkpoint.totalSteps,
        });
        setSubmitted(true);
      }
      return true;
    } catch (caught) {
      if (checkpoint.isFinal) {
        analytics?.emit({
          event: "form_submit_failed",
          stageKey: "form-submit",
          stageLabel: "Submit form",
          stageKind: "submit",
          stageOrder: submitStageOrder,
        });
      }
      setError(
        caught instanceof Error
          ? caught.message
          : "Something went wrong. Please try again.",
      );
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Loading / Error States ────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !form) {
    return (
      <FormExperiencePageShell
        theme={theme}
        canHideBranding={canHideBranding}
      >
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertCircle className="h-10 w-10 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-1">Form not found</h2>
          <p className="text-sm text-muted-foreground">
            This form may have been removed or is not yet published.
          </p>
        </div>
      </FormExperiencePageShell>
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
            isFocusedExperience ? "text-2xl sm:text-3xl" : "text-xl",
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
      const completionScreens = buildFormExperienceModel({
        form,
        values: {},
        surface: "standalone",
      }).screens;
      const completionProgress = getFocusedQuestionProgress(
        completionScreens,
        completionScreens.length - 1,
      );
      return (
        <div data-linkycal-public>
          {compiledCss ? <style>{compiledCss}</style> : null}
          <FocusedFormExperienceShell
            theme={theme}
            canHideBranding={canHideBranding}
            progressCurrent={completionProgress.current}
            progressTotal={completionProgress.total}
            showNav={false}
          >
            {seoHead}
            {completionContent}
          </FocusedFormExperienceShell>
        </div>
      );
    }

    return (
      <div data-linkycal-public>
        {compiledCss ? <style>{compiledCss}</style> : null}
        <FormExperiencePageShell
          theme={theme}
          canHideBranding={canHideBranding}
        >
          {seoHead}
          <div className="py-16">{completionContent}</div>
        </FormExperiencePageShell>
      </div>
    );
  }

  return (
    <div data-linkycal-public>
      {compiledCss ? <style>{compiledCss}</style> : null}
      <FormExperience
        form={form}
        surface="standalone"
        values={values}
        files={files}
        submitting={submitting}
        error={error}
        theme={theme}
        canHideBranding={canHideBranding}
        head={seoHead}
        honeypot={
          <div className="sr-only" aria-hidden="true">
            <label htmlFor="website">Website</label>
            <input
              id="website"
              type="text"
              name="website"
              autoComplete="url"
              tabIndex={-1}
              value={spamField}
              onChange={(event) => setSpamField(event.target.value)}
            />
          </div>
        }
        onValueChange={setValue}
        onFileChange={setFileValue}
        onClearFields={clearFields}
        onCheckpoint={submitStepValues}
        onAnalyticsEvent={handleFormAnalyticsEvent}
      />
    </div>
  );
}

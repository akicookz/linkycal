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
} from "lucide-react";
import { RichTextContent } from "@/components/RichTextContent";
import { Button } from "@/components/ui/button";
import { FormFieldRenderer } from "@/components/FormFieldRenderer";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import { track } from "@/lib/track";
import {
  isFieldVisible,
  isStepVisible,
  type FormCondition,
  type FormConditionField,
} from "@/lib/form-conditions";
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

// ─── Component ───────────────────────────────────────────────────────────────

export default function PublicForm() {
  const { projectSlug, formSlug } = useParams<{ projectSlug: string; formSlug: string }>();
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
  const [values, setValues] = useState<Record<string, string>>({});
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
  const currentStep = steps[currentStepIndex];
  const currentFields = currentStep
    ? [...currentStep.fields]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .filter((f) => isFieldVisible(
          {
            id: f.id,
            type: f.type,
            options: f.options,
            visibility: f.visibility ?? null,
          },
          conditionInputs,
        ))
    : [];
  const isLastStep = currentStepIndex === steps.length - 1;
  const isFirstStep = currentStepIndex === 0;

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

  // ─── Clamp currentStepIndex if visibility shrinks the step list ────────
  useEffect(() => {
    if (steps.length === 0) return;
    if (currentStepIndex >= steps.length) {
      setCurrentStepIndex(steps.length - 1);
    }
  }, [steps.length, currentStepIndex]);

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
  }, [allFields, conditionInputs, values]);

  function setValue(fieldId: string, value: string) {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  }

  function validateCurrentStep(): boolean {
    const errors: Record<string, string> = {};
    for (const field of currentFields) {
      if (field.required && !values[field.id]?.trim()) {
        errors[field.id] = "This field is required";
      }
      if (
        field.type === "email" &&
        values[field.id]?.trim() &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values[field.id])
      ) {
        errors[field.id] = "Please enter a valid email";
      }
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

  async function submitCurrentStep() {
    if (!validateCurrentStep()) return;

    setSubmitting(true);
    setError(null);

    try {
      const resId = await ensureResponseId();
      const fields = currentFields.map((f) => ({
        fieldId: f.id,
        value: values[f.id] ?? "",
      }));

      const res = await fetch(
        `/api/public/forms/${projectSlug}/${formSlug}/responses/${resId}/steps/${currentStepIndex}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fields, complete: isLastStep }),
        }
      );

      if (!res.ok) throw new Error("Failed to submit");

      if (isLastStep) {
        posthog?.capture("form_submitted", {
          form_slug: formSlug,
          form_name: form?.name,
          total_steps: steps.length,
        });
        setSubmitted(true);
      } else {
        setCurrentStepIndex((prev) => prev + 1);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

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

  // ─── Success State ─────────────────────────────────────────────────────

  const completionTitle = completionField?.label || "Thank you!";
  const completionDescription = completionField?.description || null;
  const completionFallbackText = completionField
    ? null
    : "Your response has been submitted successfully.";
  const completionRedirectUrl =
    completionField?.validation &&
    typeof completionField.validation.redirectUrl === "string" &&
    completionField.validation.redirectUrl.trim()
      ? completionField.validation.redirectUrl.trim()
      : null;

  // Redirect after 5 seconds if configured
  useEffect(() => {
    if (!submitted || !completionRedirectUrl) return;
    const timer = setTimeout(() => {
      window.location.href = completionRedirectUrl;
    }, 5000);
    return () => clearTimeout(timer);
  }, [submitted, completionRedirectUrl]);

  if (submitted) {
    return (
      <PageShell theme={theme} canHideBranding={canHideBranding}>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-5">
            <CheckCircle2 className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-xl font-semibold mb-2">{completionTitle}</h2>
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
      </PageShell>
    );
  }

  // ─── Form Rendering ────────────────────────────────────────────────────

  return (
    <PageShell theme={theme} canHideBranding={canHideBranding}>
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
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
          )}
          <Button
            type="submit"
            disabled={submitting}
            className="min-w-[100px]"
            style={theme?.primaryBg ? { backgroundColor: theme.primaryBg, color: theme.primaryText || "#fff", borderColor: theme.primaryBg } : undefined}
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

// ─── Page Shell ──────────────────────────────────────────────────────────────

function PageShell({
  children,
  theme,
  canHideBranding,
}: {
  children: React.ReactNode;
  theme?: BookingTheme;
  canHideBranding?: boolean;
}) {
  const [searchParams] = useSearchParams();
  const isEmbedded = searchParams.get("embed") === "1";
  const hideBanner = searchParams.get("hide_banner") === "1";
  const showBanner = !!theme?.bannerImage && !hideBanner;
  const hideBrandingRequested = searchParams.get("hide_branding") === "1";
  const showBranding = !(hideBrandingRequested && canHideBranding);

  const themeVars = theme?.primaryBg
    ? ({
        ["--primary" as string]: theme.primaryBg,
        ["--primary-foreground" as string]: theme.primaryText || "#ffffff",
        ["--ring" as string]: theme.primaryBg,
      } as React.CSSProperties)
    : undefined;

  const card = (
    <div className="w-full max-w-[52rem] mx-auto" style={themeVars}>
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

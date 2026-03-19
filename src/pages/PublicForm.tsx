import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
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
  options: Array<{ label: string; value: string }> | null;
}

interface FormStep {
  id: string;
  sortOrder: number;
  title: string | null;
  description: string | null;
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
  const { formSlug } = useParams<{ formSlug: string }>();

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
  } = useQuery<{ form: PublicFormData; project: ProjectInfo | null }>({
    queryKey: ["public-form", formSlug],
    queryFn: async () => {
      const res = await fetch(`/api/public/forms/${formSlug}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("not_found");
        throw new Error("Failed to load form");
      }
      return res.json();
    },
    enabled: !!formSlug,
  });

  const form = formData?.form;
  const project = formData?.project;
  const theme = project?.settings?.theme;

  // ─── Apply theme ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!theme) return;
    if (theme.backgroundColor) document.body.style.backgroundColor = theme.backgroundColor;

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
  }, [theme]);

  const steps = form?.steps
    ? [...form.steps].sort((a, b) => a.sortOrder - b.sortOrder)
    : [];
  const currentStep = steps[currentStepIndex];
  const currentFields = currentStep
    ? [...currentStep.fields].sort((a, b) => a.sortOrder - b.sortOrder)
    : [];
  const isLastStep = currentStepIndex === steps.length - 1;
  const isFirstStep = currentStepIndex === 0;

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
    const res = await fetch(`/api/public/forms/${formSlug}/responses`, {
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
        `/api/public/forms/${formSlug}/responses/${resId}/steps/${currentStepIndex}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fields }),
        }
      );

      if (!res.ok) throw new Error("Failed to submit");

      if (isLastStep) {
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
      <PageShell theme={theme}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </PageShell>
    );
  }

  if (isError || !form) {
    return (
      <PageShell theme={theme}>
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

  if (submitted) {
    return (
      <PageShell theme={theme}>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-5">
            <CheckCircle2 className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Thank you!</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            Your response has been submitted successfully.
          </p>
        </div>
      </PageShell>
    );
  }

  // ─── Form Rendering ────────────────────────────────────────────────────

  return (
    <PageShell theme={theme}>
      <div className="space-y-1 mb-5">
        <h1 className="text-lg font-semibold">{form.name}</h1>
        {steps.length > 1 && currentStep?.title && (
          <p className="text-sm text-muted-foreground">{currentStep.title}</p>
        )}
        {currentStep?.description && (
          <p className="text-sm text-muted-foreground">
            {currentStep.description}
          </p>
        )}
      </div>

      {/* Step progress indicator */}
      {steps.length > 1 && (
        <div className="flex gap-1.5 mb-5">
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
        className="space-y-4"
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
          <FieldRenderer
            key={field.id}
            field={field}
            value={values[field.id] ?? ""}
            onChange={(val) => setValue(field.id, val)}
            error={fieldErrors[field.id]}
          />
        ))}

        {error && (
          <p className="text-sm text-destructive flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" />
            {error}
          </p>
        )}

        <div className="flex items-center gap-3 pt-4">
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
              <><Loader2 className="h-4 w-4 animate-spin" /> {isLastStep ? "Submitting..." : "Next"}</>
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

function PageShell({ children, theme }: { children: React.ReactNode; theme?: BookingTheme }) {
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
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          {theme?.bannerImage && (
            <div
              className="w-full h-36 sm:h-44 rounded-t-[20px] bg-cover bg-center"
              style={{ backgroundImage: `url(${theme.bannerImage})` }}
            />
          )}
          <div
            className={cn(
              "bg-card p-6 sm:p-8",
              theme?.bannerImage
                ? "rounded-b-[20px]"
                : "rounded-[20px]"
            )}
            style={{
              borderRadius: theme?.borderRadius != null
                ? theme.bannerImage
                  ? `0 0 ${theme.borderRadius}px ${theme.borderRadius}px`
                  : `${theme.borderRadius}px`
                : undefined,
            }}
          >
            {children}
          </div>
        </div>
      </div>
      <footer className="py-4 text-center">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Powered by <Logo size="sm" />
        </Link>
      </footer>
    </div>
  );
}

// ─── Field Renderer ──────────────────────────────────────────────────────────

function FieldRenderer({
  field,
  value,
  onChange,
  error,
}: {
  field: FormField;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const id = `field-${field.id}`;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {field.label}
        {field.required && <span className="text-destructive ml-0.5">*</span>}
      </Label>

      {field.type === "textarea" ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? undefined}
          required={field.required}
          rows={3}
          className={cn(
            "flex w-full rounded-[12px] border border-input bg-muted/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 resize-y",
            error && "border-destructive"
          )}
        />
      ) : field.type === "select" ? (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          className={cn(
            "flex h-10 w-full rounded-[12px] border border-input bg-muted/50 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50",
            !value && "text-muted-foreground",
            error && "border-destructive"
          )}
        >
          <option value="">{field.placeholder || "Select an option"}</option>
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : field.type === "multi_select" ? (
        <div className="space-y-1.5">
          {field.options?.map((opt) => {
            const selected = value
              .split(",")
              .filter(Boolean)
              .includes(opt.value);
            return (
              <label
                key={opt.value}
                className={cn(
                  "flex items-center gap-2.5 rounded-[12px] border px-3 py-2.5 text-sm cursor-pointer transition-colors",
                  selected
                    ? "border-primary bg-primary/5"
                    : "border-input hover:border-primary/30"
                )}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => {
                    const current = value.split(",").filter(Boolean);
                    const next = selected
                      ? current.filter((v) => v !== opt.value)
                      : [...current, opt.value];
                    onChange(next.join(","));
                  }}
                  className="rounded"
                />
                {opt.label}
              </label>
            );
          })}
        </div>
      ) : field.type === "radio" ? (
        <div className="space-y-1.5">
          {field.options?.map((opt) => (
            <label
              key={opt.value}
              className={cn(
                "flex items-center gap-2.5 rounded-[12px] border px-3 py-2.5 text-sm cursor-pointer transition-colors",
                value === opt.value
                  ? "border-primary bg-primary/5"
                  : "border-input hover:border-primary/30"
              )}
            >
              <input
                type="radio"
                name={id}
                value={opt.value}
                checked={value === opt.value}
                onChange={() => onChange(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      ) : field.type === "checkbox" ? (
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={value === "true"}
            onChange={(e) => onChange(e.target.checked ? "true" : "")}
            className="rounded"
          />
          <span className="text-sm">{field.placeholder || field.label}</span>
        </label>
      ) : field.type === "rating" ? (
        <RatingInput value={value} onChange={onChange} />
      ) : (
        <Input
          id={id}
          type={
            field.type === "email"
              ? "email"
              : field.type === "phone"
                ? "tel"
                : field.type === "number"
                  ? "number"
                  : field.type === "date"
                    ? "date"
                    : field.type === "time"
                      ? "time"
                      : "text"
          }
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? undefined}
          required={field.required}
          className={cn(error && "border-destructive")}
        />
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ─── Rating Input ────────────────────────────────────────────────────────────

function RatingInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const rating = parseInt(value) || 0;
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star.toString())}
          className="p-0.5 transition-colors"
        >
          <Star
            className={cn(
              "h-6 w-6",
              star <= rating
                ? "fill-yellow-400 text-yellow-400"
                : "text-muted-foreground"
            )}
          />
        </button>
      ))}
    </div>
  );
}

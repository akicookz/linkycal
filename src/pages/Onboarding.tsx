import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePostHog } from "@posthog/react";
import {
  Loader,
  Check,
  ArrowRight,
  ArrowLeft,
  FileText,
  CalendarDays,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WeeklyAvailabilityEditor } from "@/components/WeeklyAvailabilityEditor";
import { Logo } from "@/components/Logo";
import FormBuilder from "@/pages/FormBuilder";
import CopyPromptButton from "@/components/CopyPromptButton";
import { cn, copyToClipboard } from "@/lib/utils";
import { getTimezones, getDetectedTimezone, FONT_OPTIONS, plans } from "@/lib/constants";
import {
  generateFormApiPrompt,
  generateFormEmbedPrompt,
} from "@/lib/prompts";
import {
  dayConfigsToRules,
  defaultDayConfigs,
  rulesToDayConfigs,
  type DayAvailabilityConfig,
} from "@/lib/availability";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OnboardingProps {
  mode?: "onboarding" | "new-project";
}

// ─── Constants ────────────────────────────────────────────────────────────────

type StepId =
  | "project"
  | "intent"
  | "form-template"
  | "event-type"
  | "availability"
  | "branding"
  | "plan";

interface Intent {
  forms: boolean;
  scheduling: boolean;
}

const STEP_LABELS: Record<StepId, string> = {
  project: "Project",
  intent: "Setup",
  "form-template": "Form",
  "event-type": "Event Type",
  availability: "Availability",
  branding: "Branding",
  plan: "Plan",
};

function buildFlow(intent: Intent): StepId[] {
  const flow: StepId[] = ["project", "intent"];
  if (intent.forms) flow.push("form-template");
  if (intent.scheduling) flow.push("event-type", "availability", "branding");
  flow.push("plan");
  return flow;
}

const durations = [
  { value: "15", label: "15 minutes" },
  { value: "30", label: "30 minutes" },
  { value: "45", label: "45 minutes" },
  { value: "60", label: "60 minutes" },
];

const timezones = getTimezones();

// ─── Component ────────────────────────────────────────────────────────────────

export default function Onboarding({ mode = "onboarding" }: OnboardingProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const posthog = usePostHog();

  // ─── Step state ───────────────────────────────────────────────────────────
  const [step, setStep] = useState<StepId>("project");
  const [intent, setIntent] = useState<Intent>({ forms: false, scheduling: false });
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectSlug, setProjectSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resumeChecked, setResumeChecked] = useState(mode === "new-project");
  const [promptCopiedId, setPromptCopiedId] = useState<string | null>(null);
  const [templateFormId, setTemplateFormId] = useState<string | null>(null);

  const flow = useMemo(() => buildFlow(intent), [intent]);

  function goNext(currentIntent?: Intent) {
    const activeFlow = currentIntent ? buildFlow(currentIntent) : flow;
    const idx = activeFlow.indexOf(step);
    if (idx === -1 || idx === activeFlow.length - 1) return;
    setStep(activeFlow[idx + 1]);
  }

  function goBack() {
    const idx = flow.indexOf(step);
    if (idx <= 0) return;
    setStep(flow[idx - 1]);
  }

  // ─── Handle Stripe return ─────────────────────────────────────────────────
  const completing = searchParams.get("completing") === "true";
  const returnProjectId = searchParams.get("projectId");

  // ─── Resume: detect incomplete project ────────────────────────────────────
  useEffect(() => {
    if (mode !== "onboarding" || completing) {
      setResumeChecked(true);
      return;
    }

    async function detectResume() {
      try {
        // 1. Find incomplete project
        const projRes = await fetch("/api/projects");
        if (!projRes.ok) { setResumeChecked(true); return; }
        const { projects } = await projRes.json() as { projects: { id: string; slug: string; name: string; onboarded: boolean; settings: string | null }[] };
        const incomplete = projects.find((p) => !p.onboarded);
        if (!incomplete) {
          // If at least one project exists and they're all onboarded, this user
          // is done — don't sit on this page. If there are no projects at all
          // (fresh signup), stay on the project step.
          if (projects.length > 0) {
            navigate("/app", { replace: true });
            return;
          }
          setResumeChecked(true);
          return;
        }

        setProjectId(incomplete.id);
        setProjectSlug(incomplete.slug);

        // 2. Check event types — if any exist, the user is on the scheduling path.
        const etRes = await fetch(`/api/projects/${incomplete.id}/event-types`);
        const etData = etRes.ok ? await etRes.json() as { eventTypes: unknown[] } : { eventTypes: [] };

        const parsedSettings = incomplete.settings ? JSON.parse(incomplete.settings) : null;
        const hasTheme = parsedSettings?.theme?.primaryBg;

        if (etData.eventTypes?.length || hasTheme) {
          // Scheduling flow was started. Pin scheduling intent and resume.
          setIntent({ forms: false, scheduling: true });
          setStep(hasTheme ? "plan" : "availability");
        } else {
          // Project exists but no event-types/theme — let the user pick intent.
          setStep("intent");
        }
      } catch {
        // If anything fails, start fresh on intent step (project already exists)
      } finally {
        setResumeChecked(true);
      }
    }

    detectResume();
  }, [mode, completing]);

  // ─── Step 0: Project ──────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState(getDetectedTimezone());

  const slug = useMemo(() => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 50);
  }, [name]);

  // ─── Step 1: Event Type ───────────────────────────────────────────────────
  const [eventName, setEventName] = useState("");
  const [eventDuration, setEventDuration] = useState("30");

  const eventSlug = useMemo(() => {
    return eventName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 50);
  }, [eventName]);

  // ─── Step 2: Availability ──────────────────────────────────────────────────
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [dayConfigs, setDayConfigs] = useState<DayAvailabilityConfig[]>(
    defaultDayConfigs(),
  );

  // ─── Step 3: Branding ────────────────────────────────────────────────────
  const [primaryBg, setPrimaryBg] = useState("#1B4332");
  const [primaryText, setPrimaryText] = useState("#ffffff");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [textColor, setTextColor] = useState("#0f1a14");
  const [borderRadius, setBorderRadius] = useState(16);
  const [fontFamily, setFontFamily] = useState("Satoshi");

  useEffect(() => {
    if (completing && returnProjectId) {
      setProjectId(returnProjectId);
      completeOnboarding(returnProjectId);
    }
  }, [completing, returnProjectId]);

  // ─── Mutations ────────────────────────────────────────────────────────────

  const createProjectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug, timezone }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create project");
      }
      return res.json() as Promise<{ project: { id: string; slug: string } }>;
    },
    onSuccess: (data) => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      const id = data.project.id;
      setProjectId(id);
      setProjectSlug(data.project.slug);
      posthog?.capture("onboarding_project_created", { mode });

      if (mode === "new-project") {
        // For new-project mode, mark as onboarded immediately and go to dashboard
        fetch("/api/onboarding/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: id }),
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: ["projects"] });
          navigate(`/app/projects/${id}`);
        });
      } else {
        setStep("intent");
      }
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const createEventTypeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/event-types`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: eventName,
          slug: eventSlug,
          duration: Number(eventDuration),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create event type");
      }
      return res.json();
    },
    onSuccess: () => {
      setError(null);
      setStep("availability");
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  // Fetch default schedule when entering availability step
  const { data: schedulesData } = useQuery({
    queryKey: ["onboarding-schedules", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/schedules`);
      if (!res.ok) throw new Error("Failed to fetch schedules");
      return res.json() as Promise<{ schedules: { id: string; name: string; timezone: string }[] }>;
    },
    enabled: step === "availability" && !!projectId,
  });

  useEffect(() => {
    if (schedulesData?.schedules?.length && !scheduleId) {
      setScheduleId(schedulesData.schedules[0].id);
    }
  }, [schedulesData, scheduleId]);

  const { data: onboardingRules } = useQuery<
    Array<{
      dayOfWeek: number;
      startTime: string;
      endTime: string;
    }>
  >({
    queryKey: ["onboarding-schedule-rules", scheduleId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/schedules/${scheduleId}/rules`);
      if (!res.ok) throw new Error("Failed to fetch schedule rules");
      const data = await res.json();
      return data.rules ?? [];
    },
    enabled: step === "availability" && !!projectId && !!scheduleId,
  });

  useEffect(() => {
    if (!onboardingRules) return;
    setDayConfigs(
      onboardingRules.length > 0 ? rulesToDayConfigs(onboardingRules) : defaultDayConfigs(),
    );
  }, [onboardingRules]);

  const saveAvailabilityMutation = useMutation({
    mutationFn: async () => {
      const rules = dayConfigsToRules(dayConfigs);
      const res = await fetch(`/api/projects/${projectId}/schedules/${scheduleId}/rules`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save availability");
      }
      return res.json();
    },
    onSuccess: () => {
      setError(null);
      setStep("branding");
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const saveBrandingMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            theme: {
              primaryBg,
              primaryText,
              backgroundColor: bgColor,
              textColor,
              borderRadius,
              fontFamily,
            },
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save branding");
      }
      return res.json();
    },
    onSuccess: () => {
      setError(null);
      setStep("plan");
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const createDefaultFormMutation = useMutation({
    mutationFn: async (pid: string) => {
      const res = await fetch("/api/onboarding/default-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: pid }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create default form");
      }
      return res.json() as Promise<{ form: { id: string } }>;
    },
    onSuccess: (data) => {
      setTemplateFormId(data.form.id);
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "forms"],
      });
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  // Lazy-create the default contact form the first time the user lands on the form-template step.
  useEffect(() => {
    if (
      step === "form-template" &&
      projectId &&
      !templateFormId &&
      !createDefaultFormMutation.isPending
    ) {
      createDefaultFormMutation.mutate(projectId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, projectId, templateFormId]);

  // Read the live form from React Query cache for prompt copying.
  const { data: templateForm } = useQuery<{
    id: string;
    name: string;
    slug: string;
    type: "single" | "multi_step";
    steps?: Array<{
      title: string | null;
      description: string | null;
      richDescription?: string | null;
      fields: Array<{
        id: string;
        label: string;
        type: string;
        required: boolean;
        placeholder: string | null;
        options: Array<{ label: string; value: string }> | null;
      }>;
    }>;
  }>({
    queryKey: ["projects", projectId, "forms", templateFormId],
    queryFn: async () => {
      const res = await fetch(
        `/api/projects/${projectId}/forms/${templateFormId}`,
      );
      if (!res.ok) throw new Error("Failed to fetch form");
      const data = await res.json();
      return data.form ?? data;
    },
    enabled: !!projectId && !!templateFormId,
  });

  const checkoutMutation = useMutation({
    mutationFn: async ({ plan, interval }: { plan: string; interval: string }) => {
      const origin = window.location.origin;
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          interval,
          successUrl: `${origin}/app/onboarding?completing=true&projectId=${projectId}`,
          cancelUrl: `${origin}/app/onboarding?completing=true&projectId=${projectId}`,
        }),
      });
      if (!res.ok) throw new Error("Failed to create checkout session");
      return res.json() as Promise<{ url: string }>;
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (pid: string) => {
      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: pid }),
      });
      if (!res.ok) throw new Error("Failed to complete onboarding");
      return res.json();
    },
    onSuccess: (_data, pid) => {
      posthog?.capture("onboarding_completed");
      // Optimistically mark this project onboarded so guards/redirects
      // don't bounce us back to /app/onboarding before the refetch lands.
      queryClient.setQueryData<Array<{ id: string; onboarded: boolean }>>(
        ["projects"],
        (old) =>
          old?.map((p) => (p.id === pid ? { ...p, onboarded: true } : p)),
      );
      navigate("/app");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function completeOnboarding(pid: string) {
    completeMutation.mutate(pid);
  }

  function handleSelectPlan(planId: string) {
    if (planId === "free") {
      if (projectId) completeOnboarding(projectId);
    } else {
      checkoutMutation.mutate({ plan: planId, interval: "month" });
    }
  }

  // ─── Loading states ────────────────────────────────────────────────────────
  if (completing || !resumeChecked) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
        <Logo size="lg" />
        <div className="mt-8 flex items-center gap-3 text-muted-foreground">
          <Loader className="h-5 w-5 animate-spin" />
          <span className="text-sm">{completing ? "Finishing setup..." : "Loading..."}</span>
        </div>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const visibleFlow: StepId[] = mode === "new-project" ? ["project"] : flow;
  const stepIndex = visibleFlow.indexOf(step);
  const isLoading =
    createProjectMutation.isPending ||
    createEventTypeMutation.isPending ||
    saveAvailabilityMutation.isPending ||
    saveBrandingMutation.isPending ||
    checkoutMutation.isPending ||
    completeMutation.isPending;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-12">
      {(() => {
        const widthClass =
          step === "plan" || step === "form-template"
            ? "max-w-4xl"
            : step === "intent"
              ? "max-w-2xl"
              : "max-w-lg";
        return (
          <>
            <div className={cn("w-full mb-10", widthClass)}>
              <Logo size="lg" />
            </div>
            <Card className={cn("w-full", widthClass)}>
        {/* ── Step: Project ────────────────────────────────────────────── */}
        {step === "project" && (
          <>
            <CardHeader>
              <CardTitle className="text-xl">Create your project</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                A project is your workspace for forms, bookings, and contacts.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="project-name">Project Name</Label>
                <Input
                  id="project-name"
                  placeholder="e.g. My Business"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError(null);
                  }}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="project-slug">URL Slug</Label>
                <div className="flex items-center rounded-[12px] border bg-muted/50 px-3 h-10">
                  <span className="text-sm text-muted-foreground mr-1">linkycal.com/</span>
                  <span className="text-sm font-medium text-foreground">
                    {slug || "your-project"}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timezones.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex justify-end pt-2">
                <Button
                  onClick={() => {
                    if (!name.trim()) {
                      setError("Project name is required");
                      return;
                    }
                    if (!slug) {
                      setError("Please enter a valid project name");
                      return;
                    }
                    setError(null);
                    createProjectMutation.mutate();
                  }}
                  disabled={isLoading || !name.trim()}
                >
                  {createProjectMutation.isPending ? (
                    <>
                      <Loader className="h-4 w-4 animate-spin mr-1.5" />
                      Creating...
                    </>
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="h-4 w-4 ml-1.5" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </>
        )}

        {/* ── Step: Intent ─────────────────────────────────────────────── */}
        {step === "intent" && (
          <>
            <CardHeader>
              <CardTitle className="text-xl">What are you here for?</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Pick one or both. We'll tailor the rest of the setup.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {([
                  {
                    key: "forms" as const,
                    icon: FileText,
                    title: "Add contact forms to my website",
                    description: "Embed forms that collect name, email, phone, and a message.",
                  },
                  {
                    key: "scheduling" as const,
                    icon: CalendarDays,
                    title: "Scheduling and form links",
                    description: "Bookable event types, availability, and shareable booking pages.",
                  },
                ]).map((card) => {
                  const Icon = card.icon;
                  const selected = intent[card.key];
                  return (
                    <button
                      key={card.key}
                      type="button"
                      onClick={() =>
                        setIntent((prev) => ({ ...prev, [card.key]: !prev[card.key] }))
                      }
                      className={cn(
                        "text-left rounded-[16px] border p-4 transition-all flex flex-col gap-3 hover:border-primary/40",
                        selected && "border-primary",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="h-9 w-9 rounded-[12px] bg-primary/10 flex items-center justify-center">
                          <Icon className="h-4 w-4 text-primary" />
                        </div>
                        <div
                          className={cn(
                            "h-5 w-5 rounded-full border flex items-center justify-center transition-colors",
                            selected
                              ? "bg-primary border-primary text-primary-foreground"
                              : "border-border",
                          )}
                        >
                          {selected && <Check className="h-3 w-3" />}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{card.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {card.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => { goBack(); setError(null); }}>
                  <ArrowLeft className="h-4 w-4 mr-1.5" />
                  Back
                </Button>
                <Button
                  disabled={!intent.forms && !intent.scheduling}
                  onClick={() => {
                    setError(null);
                    goNext(intent);
                  }}
                >
                  Continue
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </div>
            </CardContent>
          </>
        )}

        {/* ── Step: Form template (live FormBuilder) ───────────────────── */}
        {step === "form-template" && (
          <>
            <CardHeader className="px-4 sm:px-6">
              <CardTitle className="text-xl">Your contact form</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                A starter form is ready. Edit it now or continue and refine later.
              </p>
            </CardHeader>
            <CardContent className="space-y-5 px-3 sm:px-6">
              {error && <p className="text-sm text-destructive">{error}</p>}

              {!templateFormId || !projectId ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                  <Loader className="h-5 w-5 animate-spin mr-2" />
                  <span className="text-sm">Setting up your form...</span>
                </div>
              ) : (
                <FormBuilder
                  projectId={projectId}
                  formId={templateFormId}
                  mode="template"
                  onboardingFooter={
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-4 border-t mt-2">
                      <Button
                        variant="ghost"
                        className="w-full sm:w-auto order-2 sm:order-1 text-muted-foreground"
                        onClick={() => {
                          goBack();
                          setError(null);
                        }}
                      >
                        <ArrowLeft className="h-4 w-4 mr-1.5" />
                        Back
                      </Button>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 order-1 sm:order-2">
                        <CopyPromptButton
                          align="end"
                          buttonVariant="outline"
                          buttonSize="default"
                          buttonClassName="h-10 px-4 text-sm w-full sm:w-auto justify-center"
                          items={[
                            {
                              id: "embed",
                              label:
                                promptCopiedId === "embed"
                                  ? "Copied!"
                                  : "Embed prompt",
                              description:
                                "Instructions for AI builders (Lovable, Cursor) to install the form.",
                              copied: promptCopiedId === "embed",
                              onClick: () => {
                                if (!templateForm) return;
                                const slug = projectSlug ?? "your-project";
                                copyToClipboard(
                                  generateFormEmbedPrompt(
                                    templateForm,
                                    slug,
                                    window.location.origin,
                                  ),
                                );
                                setPromptCopiedId("embed");
                                setTimeout(
                                  () => setPromptCopiedId(null),
                                  2000,
                                );
                              },
                            },
                            {
                              id: "api",
                              label:
                                promptCopiedId === "api"
                                  ? "Copied!"
                                  : "API prompt",
                              description:
                                "Wire the form up via API or native HTML action.",
                              copied: promptCopiedId === "api",
                              onClick: () => {
                                if (!templateForm) return;
                                const slug = projectSlug ?? "your-project";
                                copyToClipboard(
                                  generateFormApiPrompt(
                                    templateForm,
                                    slug,
                                    window.location.origin,
                                  ),
                                );
                                setPromptCopiedId("api");
                                setTimeout(
                                  () => setPromptCopiedId(null),
                                  2000,
                                );
                              },
                            },
                          ]}
                        />
                        <Button
                          className="w-full sm:w-auto"
                          onClick={() => {
                            setError(null);
                            goNext();
                          }}
                        >
                          Continue
                          <ArrowRight className="h-4 w-4 ml-1.5" />
                        </Button>
                      </div>
                    </div>
                  }
                />
              )}
            </CardContent>
          </>
        )}

        {/* ── Step: Event Type ─────────────────────────────────────────── */}
        {step === "event-type" && (
          <>
            <CardHeader>
              <CardTitle className="text-xl">Create your first event type</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                An event type is a bookable meeting. You can customize availability later.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="event-name">Event Name</Label>
                <Input
                  id="event-name"
                  placeholder="e.g. 30 Min Meeting"
                  value={eventName}
                  onChange={(e) => {
                    setEventName(e.target.value);
                    setError(null);
                  }}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="event-slug">URL Slug</Label>
                <div className="flex items-center rounded-[12px] border bg-muted/50 px-3 h-10">
                  <span className="text-sm text-muted-foreground mr-1">linkycal.com/{slug}/</span>
                  <span className="text-sm font-medium text-foreground">
                    {eventSlug || "your-event"}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="event-duration">Duration</Label>
                <Select value={eventDuration} onValueChange={setEventDuration}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {durations.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => { goBack(); setError(null); }}>
                  <ArrowLeft className="h-4 w-4 mr-1.5" />
                  Back
                </Button>
                <Button
                  onClick={() => {
                    if (!eventName.trim()) {
                      setError("Event name is required");
                      return;
                    }
                    if (!eventSlug) {
                      setError("Please enter a valid event name");
                      return;
                    }
                    setError(null);
                    createEventTypeMutation.mutate();
                  }}
                  disabled={isLoading || !eventName.trim()}
                >
                  {createEventTypeMutation.isPending ? (
                    <>
                      <Loader className="h-4 w-4 animate-spin mr-1.5" />
                      Creating...
                    </>
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="h-4 w-4 ml-1.5" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </>
        )}

        {/* ── Step: Availability ───────────────────────────────────────── */}
        {step === "availability" && (
          <>
            <CardHeader>
              <CardTitle className="text-xl">Set your availability</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Choose which days and hours you're available for bookings.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <WeeklyAvailabilityEditor
                dayConfigs={dayConfigs}
                onChange={setDayConfigs}
                disabled={saveAvailabilityMutation.isPending}
              />

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => { goBack(); setError(null); }}>
                  <ArrowLeft className="h-4 w-4 mr-1.5" />
                  Back
                </Button>
                <Button
                  onClick={() => {
                    const hasAtLeastOneDay = dayConfigs.some((day) => day.enabled && day.blocks.length > 0);
                    if (!hasAtLeastOneDay) {
                      setError("Please enable at least one day");
                      return;
                    }
                    setError(null);
                    saveAvailabilityMutation.mutate();
                  }}
                  disabled={isLoading || !scheduleId}
                >
                  {saveAvailabilityMutation.isPending ? (
                    <>
                      <Loader className="h-4 w-4 animate-spin mr-1.5" />
                      Saving...
                    </>
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="h-4 w-4 ml-1.5" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </>
        )}

        {/* ── Step: Branding ───────────────────────────────────────────── */}
        {step === "branding" && (
          <>
            <CardHeader>
              <CardTitle className="text-xl">Customize your pages</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Style your public booking and form pages. You can refine these in settings later.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                {([
                  { label: "Primary BG", value: primaryBg, onChange: setPrimaryBg },
                  { label: "Primary Text", value: primaryText, onChange: setPrimaryText },
                  { label: "Background", value: bgColor, onChange: setBgColor },
                  { label: "Text", value: textColor, onChange: setTextColor },
                ] as const).map((field) => (
                  <div key={field.label}>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      {field.label}
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer rounded-[12px] border border-border px-2.5 py-1.5 hover:bg-accent/50 transition-colors">
                      <input
                        type="color"
                        value={field.value}
                        onChange={(e) => field.onChange(e.target.value)}
                        className="sr-only"
                      />
                      <span
                        className="h-5 w-5 rounded-full border border-border shrink-0"
                        style={{ backgroundColor: field.value }}
                      />
                      <span className="font-mono text-xs">{field.value}</span>
                    </label>
                  </div>
                ))}
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Border Radius ({borderRadius}px)
                </label>
                <input
                  type="range"
                  min={0}
                  max={32}
                  value={borderRadius}
                  onChange={(e) => setBorderRadius(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-[11px] text-muted-foreground mt-0.5">
                  <span>Sharp</span>
                  <span>Round</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Font</label>
                <Select value={fontFamily} onValueChange={setFontFamily}>
                  <SelectTrigger className="w-full" style={{ fontFamily }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FONT_OPTIONS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => { goBack(); setError(null); }}>
                  <ArrowLeft className="h-4 w-4 mr-1.5" />
                  Back
                </Button>
                <Button
                  onClick={() => saveBrandingMutation.mutate()}
                  disabled={isLoading}
                >
                  {saveBrandingMutation.isPending ? (
                    <>
                      <Loader className="h-4 w-4 animate-spin mr-1.5" />
                      Saving...
                    </>
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="h-4 w-4 ml-1.5" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </>
        )}

        {/* ── Step: Plan ───────────────────────────────────────────────── */}
        {step === "plan" && (
          <>
            <CardHeader>
              <CardTitle className="text-xl">Choose your plan</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Start free and upgrade anytime as you grow.
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {plans.map((plan) => (
                  <div
                    key={plan.id}
                    className={cn(
                      "relative rounded-[16px] border p-5 flex flex-col transition-shadow",
                      plan.popular && "ring-2 ring-primary",
                    )}
                  >
                    {plan.popular && (
                      <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-bl-[12px] rounded-tr-[15px]">
                        Popular
                      </div>
                    )}

                    <div className="mb-4">
                      <h3 className="text-base font-semibold">{plan.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{plan.description}</p>
                    </div>

                    <div className="mb-4">
                      {plan.price === 0 ? (
                        <div className="text-2xl font-bold">Free</div>
                      ) : (
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-bold">${plan.price}</span>
                          <span className="text-sm text-muted-foreground">/{plan.interval}</span>
                        </div>
                      )}
                    </div>

                    <ul className="space-y-2 mb-5 flex-1">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2 text-sm">
                          <Check className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                      {plan.limits.map((limit) => (
                        <li key={limit} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <span className="h-4 w-4 flex items-center justify-center mt-0.5 shrink-0">&mdash;</span>
                          <span>{limit}</span>
                        </li>
                      ))}
                    </ul>

                    <Button
                      variant={plan.id === "free" ? "outline" : "default"}
                      className="w-full"
                      disabled={isLoading}
                      onClick={() => handleSelectPlan(plan.id)}
                    >
                      {checkoutMutation.isPending && checkoutMutation.variables?.plan === plan.id ? (
                        <Loader className="h-4 w-4 animate-spin mr-1.5" />
                      ) : null}
                      {completeMutation.isPending && plan.id === "free" ? (
                        <Loader className="h-4 w-4 animate-spin mr-1.5" />
                      ) : null}
                      {plan.id === "free"
                        ? "Continue for free"
                        : `Get ${plan.name}`}
                    </Button>
                  </div>
                ))}
              </div>

              {flow.indexOf("plan") > 1 && (
                <div className="flex justify-start pt-5">
                  <Button variant="outline" onClick={() => { goBack(); setError(null); }}>
                    <ArrowLeft className="h-4 w-4 mr-1.5" />
                    Back
                  </Button>
                </div>
              )}
            </CardContent>
          </>
        )}
            </Card>
          </>
        );
      })()}

      {/* Step indicator dots */}
      {mode === "onboarding" && (
        <>
          <div className="flex items-center gap-2 mt-8">
            {visibleFlow.map((stepId, i) => (
              <div
                key={stepId}
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  i === stepIndex
                    ? "w-6 bg-primary"
                    : i < stepIndex
                      ? "w-2 bg-primary/50"
                      : "w-2 bg-border",
                )}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Step {stepIndex + 1} of {visibleFlow.length}: {STEP_LABELS[step]}
          </p>
        </>
      )}
    </div>
  );
}

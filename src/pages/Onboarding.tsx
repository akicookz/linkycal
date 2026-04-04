import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePostHog } from "@posthog/react";
import { Loader, Check, ArrowRight, ArrowLeft } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { getTimezones, getDetectedTimezone, FONT_OPTIONS, plans } from "@/lib/constants";
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

const onboardingSteps = [
  { label: "Project" },
  { label: "Event Type" },
  { label: "Availability" },
  { label: "Branding" },
  { label: "Plan" },
];

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
  const [currentStep, setCurrentStep] = useState(0);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resumeChecked, setResumeChecked] = useState(mode === "new-project");

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
        if (!incomplete) { setResumeChecked(true); return; }

        setProjectId(incomplete.id);

        // 2. Check event types
        const etRes = await fetch(`/api/projects/${incomplete.id}/event-types`);
        const etData = etRes.ok ? await etRes.json() as { eventTypes: unknown[] } : { eventTypes: [] };
        if (!etData.eventTypes?.length) {
          setCurrentStep(1);
          setResumeChecked(true);
          return;
        }

        // 3. Check schedules (availability was customized if rules exist)
        // 3. Check branding (we can't easily distinguish customized availability
        // from the default schedule, so we resume at step 2 unless branding is set)
        const parsedSettings = incomplete.settings ? JSON.parse(incomplete.settings) : null;
        const hasTheme = parsedSettings?.theme?.primaryBg;

        if (hasTheme) {
          // Steps 0-3 done, resume at plan selection
          setCurrentStep(4);
        } else {
          // Event types exist but no branding — resume at availability (step 2)
          // We skip to step 3 if schedule was already saved, but we can't easily detect that,
          // so we conservatively start at step 2.
          setCurrentStep(2);
        }
      } catch {
        // If anything fails, start fresh
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
      return res.json() as Promise<{ project: { id: string } }>;
    },
    onSuccess: (data) => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      const id = data.project.id;
      setProjectId(id);
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
        setCurrentStep(1);
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
      setCurrentStep(2);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  // Fetch default schedule when entering step 2
  const { data: schedulesData } = useQuery({
    queryKey: ["onboarding-schedules", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/schedules`);
      if (!res.ok) throw new Error("Failed to fetch schedules");
      return res.json() as Promise<{ schedules: { id: string; name: string; timezone: string }[] }>;
    },
    enabled: currentStep === 2 && !!projectId,
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
    enabled: currentStep === 2 && !!projectId && !!scheduleId,
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
      setCurrentStep(3);
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
      setCurrentStep(4);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
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
    onSuccess: () => {
      posthog?.capture("onboarding_completed");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      navigate("/app");
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

  const steps = mode === "new-project" ? [{ label: "Project" }] : onboardingSteps;
  const isLoading =
    createProjectMutation.isPending ||
    createEventTypeMutation.isPending ||
    saveAvailabilityMutation.isPending ||
    saveBrandingMutation.isPending ||
    checkoutMutation.isPending ||
    completeMutation.isPending;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-lg mb-10">
        <Logo size="lg" />
      </div>

      <Card className={cn("w-full", currentStep === 4 ? "max-w-4xl" : "max-w-lg")}>
        {/* ── Step 0: Project ──────────────────────────────────────────── */}
        {currentStep === 0 && (
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

        {/* ── Step 1: Event Type ───────────────────────────────────────── */}
        {currentStep === 1 && (
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
                <Button variant="outline" onClick={() => { setCurrentStep(0); setError(null); }}>
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

        {/* ── Step 2: Availability ──────────────────────────────────────── */}
        {currentStep === 2 && (
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
                <Button variant="outline" onClick={() => { setCurrentStep(1); setError(null); }}>
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

        {/* ── Step 3: Branding ─────────────────────────────────────────── */}
        {currentStep === 3 && (
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
                <Button variant="outline" onClick={() => { setCurrentStep(2); setError(null); }}>
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

        {/* ── Step 4: Plan ─────────────────────────────────────────────── */}
        {currentStep === 4 && (
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

              <div className="flex justify-start pt-5">
                <Button variant="outline" onClick={() => { setCurrentStep(3); setError(null); }}>
                  <ArrowLeft className="h-4 w-4 mr-1.5" />
                  Back
                </Button>
              </div>
            </CardContent>
          </>
        )}
      </Card>

      {/* Step indicator dots */}
      {mode === "onboarding" && (
        <>
          <div className="flex items-center gap-2 mt-8">
            {steps.map((step, i) => (
              <div
                key={step.label}
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  i === currentStep
                    ? "w-6 bg-primary"
                    : i < currentStep
                      ? "w-2 bg-primary/50"
                      : "w-2 bg-border",
                )}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Step {currentStep + 1} of {steps.length}: {steps[currentStep].label}
          </p>
        </>
      )}
    </div>
  );
}

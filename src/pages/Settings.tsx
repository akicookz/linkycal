import { useState } from "react";
import { useParams } from "react-router-dom";
import { UpgradeDialog } from "@/components/UpgradeDialog";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  BarChart3,
  Loader,
  CalendarDays,
  LockKeyhole,
  Sparkles,
  Unplug,
  ExternalLink,
  Trash2,
  Save,
} from "lucide-react";
import { AnalyticsIntegrationCard } from "@/components/analytics/AnalyticsIntegrationCard";
import { GoogleAnalyticsIcon } from "@/components/icons/GoogleAnalyticsIcon";
import { MetaPixelIcon } from "@/components/icons/MetaPixelIcon";
import { PostHogIcon } from "@/components/icons/PostHogIcon";
import PageHeader from "@/components/PageHeader";
import { Card, CardAction, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  AnalyticsIntegrationConfig,
  AnalyticsProvider,
  ConfigureAnalyticsIntegrationInput,
} from "../../shared/funnel-analytics";
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
import { ImageUpload } from "@/components/ImageUpload";
import { useEntitlements } from "@/hooks/use-entitlements";
import { queryClient } from "@/lib/query-client";
import {
  isEntitlementRequestError,
  readEntitlementError,
} from "@/lib/entitlement-errors";
import type {
  EntitlementDecision,
  EntitlementKey,
} from "../../shared/plan-catalog";

// ─── Types ───────────────────────────────────────────────────────────────────

interface BookingTheme {
  primaryBg: string;
  primaryText: string;
  backgroundColor: string;
  textColor: string;
  borderRadius: number;
  fontFamily: string;
  backgroundImage: string;
  bannerImage: string;
}

interface Project {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  settings?: { theme?: Partial<BookingTheme> };
  createdAt: string;
}

interface CalendarConnection {
  id: string;
  provider: "google";
  email: string;
  createdAt: string;
}

interface AnalyticsIntegrationsResponse {
  integrations: AnalyticsIntegrationConfig[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Vancouver",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];

const ANALYTICS_PROVIDER_DETAILS = [
  {
    provider: "ga4",
    name: "Google Analytics",
    description:
      "Send namespaced funnel events to your GA4 web data stream.",
  },
  {
    provider: "meta_pixel",
    name: "Meta Pixel",
    description:
      "Send safe custom events, booking schedules, and form leads to Meta.",
  },
  {
    provider: "posthog",
    name: "PostHog",
    description:
      "Capture canonical booking and form events in your PostHog project.",
  },
] as const;

import { FONT_OPTIONS } from "@/lib/constants";

function slugifyProjectName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);
}

function providerIcon(provider: AnalyticsProvider) {
  if (provider === "ga4") {
    return <GoogleAnalyticsIcon className="size-6" />;
  }
  if (provider === "meta_pixel") {
    return <MetaPixelIcon className="size-6" />;
  }
  return <PostHogIcon className="size-6" />;
}

function defaultIntegration(
  provider: AnalyticsProvider,
): AnalyticsIntegrationConfig {
  if (provider === "ga4") return { provider, enabled: false };
  if (provider === "meta_pixel") return { provider, enabled: false };
  return { provider, enabled: false, host: "us" };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Settings() {
  const { projectId } = useParams<{ projectId: string }>();

  const [projectName, setProjectName] = useState("");
  const [projectSlug, setProjectSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [projectTimezone, setProjectTimezone] = useState("America/New_York");
  const [nameInitialized, setNameInitialized] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [upgradeEntitlement, setUpgradeEntitlement] =
    useState<EntitlementKey>("customCss");
  const [upgradeActionLabel, setUpgradeActionLabel] = useState(
    "use this feature",
  );
  const [upgradeDecision, setUpgradeDecision] =
    useState<EntitlementDecision | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  function handleUploadError(error: unknown): void {
    if (!isEntitlementRequestError(error)) return;
    setUpgradeEntitlement(error.decision.key);
    setUpgradeActionLabel("upload this image");
    setUpgradeDecision(error.decision);
    setShowUpgradeDialog(true);
  }

  // Theme state
  const [themePrimaryBg, setThemePrimaryBg] = useState("#1B4332");
  const [themePrimaryText, setThemePrimaryText] = useState("#ffffff");
  const [themeBg, setThemeBg] = useState("#ffffff");
  const [themeText, setThemeText] = useState("#0f1a14");
  const [themeRadius, setThemeRadius] = useState(16);
  const [themeFont, setThemeFont] = useState("Satoshi");
  const [themeBackgroundImage, setThemeBackgroundImage] = useState("");
  const [themeBannerImage, setThemeBannerImage] = useState("");
  const [themeInitialized, setThemeInitialized] = useState(false);
  const [customCss, setCustomCss] = useState("");
  const [customCssInitialized, setCustomCssInitialized] = useState(false);

  // Fetch project
  const {
    data: project,
    isLoading: loadingProject,
  } = useQuery<Project>({
    queryKey: ["projects", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) throw new Error("Failed to fetch project");
      const data = await res.json();
      const project = data.project ?? data;
      // Initialize form state on first load
      if (!nameInitialized) {
        setProjectName(project.name);
        setProjectSlug(project.slug);
        setProjectTimezone(project.timezone);
        setNameInitialized(true);
      }
      if (!themeInitialized && project.settings?.theme) {
        const t = project.settings.theme;
        if (t.primaryBg) setThemePrimaryBg(t.primaryBg);
        if (t.primaryText) setThemePrimaryText(t.primaryText);
        if (t.backgroundColor) setThemeBg(t.backgroundColor);
        if (t.textColor) setThemeText(t.textColor);
        if (t.borderRadius != null) setThemeRadius(t.borderRadius);
        if (t.fontFamily) setThemeFont(t.fontFamily);
        if (t.backgroundImage) setThemeBackgroundImage(t.backgroundImage);
        if (t.bannerImage) setThemeBannerImage(t.bannerImage);
        setThemeInitialized(true);
      }
      return project;
    },
    enabled: !!projectId,
  });

  // Fetch calendar connections
  const {
    data: calendarConnections,
    isLoading: loadingCalendars,
  } = useQuery<CalendarConnection[]>({
    queryKey: ["projects", projectId, "calendar-connections"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/calendar/connections`);
      if (!res.ok) throw new Error("Failed to fetch calendar connections");
      const data = await res.json();
      return data.connections ?? [];
    },
    enabled: !!projectId,
  });

  const {
    data: entitlements,
    isLoading: loadingEntitlements,
  } = useEntitlements(projectId ?? "");
  const hasAnalyticsAccess =
    entitlements?.planLimits.analytics === true;
  const hasCustomCssAccess = entitlements?.planLimits.customCss === true;

  const { isLoading: loadingCustomCss } = useQuery<{
    customCss: { sourceCss: string; sourceBytes: number } | null;
  }>({
    queryKey: ["projects", projectId, "custom-css"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/custom-css`);
      if (!res.ok) throw new Error("Failed to fetch Custom CSS");
      const data = await res.json() as {
        customCss: { sourceCss: string; sourceBytes: number } | null;
      };
      if (!customCssInitialized) {
        setCustomCss(data.customCss?.sourceCss ?? "");
        setCustomCssInitialized(true);
      }
      return data;
    },
    enabled: !!projectId,
  });

  const {
    data: analyticsIntegrations,
    isLoading: loadingAnalyticsIntegrations,
    error: analyticsIntegrationsError,
  } = useQuery<AnalyticsIntegrationsResponse>({
    queryKey: ["projects", projectId, "analytics-integrations"],
    queryFn: async () => {
      const res = await fetch(
        `/api/projects/${projectId}/analytics/integrations`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(
          body.error || "Failed to fetch analytics integrations",
        );
      }
      return res.json();
    },
    enabled: !!projectId && hasAnalyticsAccess,
  });

  // Update project mutation
  const updateProjectMutation = useMutation({
    mutationFn: async (data: { name?: string; slug?: string; timezone?: string }) => {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || "Failed to update project");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const saveThemeMutation = useMutation({
    mutationFn: async () => {
      const currentSettings = project?.settings ?? {};
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            ...currentSettings,
            theme: {
              primaryBg: themePrimaryBg,
              primaryText: themePrimaryText,
              backgroundColor: themeBg,
              textColor: themeText,
              borderRadius: themeRadius,
              fontFamily: themeFont,
              backgroundImage: themeBackgroundImage,
              bannerImage: themeBannerImage,
            },
          },
        }),
      });
      if (!res.ok) throw new Error("Failed to save theme");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
    },
  });

  const saveCustomCssMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/custom-css`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ css: customCss }),
      });
      if (!res.ok) {
        const planLimitError = await readEntitlementError(res.clone());
        if (planLimitError) throw planLimitError;
      }
      const body = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(body.error || "Failed to save Custom CSS");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "custom-css"],
      });
    },
    onError: (error) => {
      if (!isEntitlementRequestError(error)) return;
      setUpgradeEntitlement(error.decision.key);
      setUpgradeActionLabel("publish Custom CSS");
      setUpgradeDecision(error.decision);
      setShowUpgradeDialog(true);
    },
  });

  const resetCustomCssMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/custom-css`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to reset Custom CSS");
    },
    onSuccess: () => {
      setCustomCss("");
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "custom-css"],
      });
    },
  });

  const saveAnalyticsIntegrationMutation = useMutation({
    mutationFn: async (input: ConfigureAnalyticsIntegrationInput) => {
      const { provider, ...config } = input;
      const res = await fetch(
        `/api/projects/${projectId}/analytics/integrations/${provider}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(
          body.error || "Failed to save analytics integration",
        );
      }
      return res.json() as Promise<{
        integration: AnalyticsIntegrationConfig;
      }>;
    },
    onSuccess: (data) => {
      queryClient.setQueryData<AnalyticsIntegrationsResponse>(
        ["projects", projectId, "analytics-integrations"],
        function updateSavedIntegration(current) {
          if (!current) return { integrations: [data.integration] };
          return {
            integrations: current.integrations.map(function replace(config) {
              return config.provider === data.integration.provider
                ? data.integration
                : config;
            }),
          };
        },
      );
    },
  });

  // Connect Google Calendar mutation
  const connectCalendarMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/calendar/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const planLimitError = await readEntitlementError(res.clone());
        if (planLimitError) throw planLimitError;
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to initiate calendar connection");
      }
      return res.json() as Promise<{ url: string }>;
    },
    onSuccess: (data) => {
      // Redirect to OAuth URL
      window.location.href = data.url;
    },
    onError: (err: Error) => {
      if (isEntitlementRequestError(err)) {
        const { decision } = err;
        setUpgradeEntitlement(decision.key);
        setUpgradeActionLabel("connect another calendar");
        setUpgradeDecision(decision);
        setShowUpgradeDialog(true);
      }
    },
  });

  // Disconnect calendar mutation
  const disconnectCalendarMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const res = await fetch(
        `/api/projects/${projectId}/calendar/connections/${connectionId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Failed to disconnect calendar");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "calendar-connections"],
      });
      setDisconnectDialogOpen(false);
      setDisconnectingId(null);
    },
  });

  // Delete project mutation
  const deleteProjectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete project");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      window.location.href = "/app";
    },
  });

  function handleUpdateGeneral() {
    const name = projectName.trim();
    const slug = projectSlug.trim();
    if (!name || !slug) return;
    if (name === project?.name && slug === project?.slug) return;
    updateProjectMutation.mutate({ name, slug });
  }

  function handleUpdateTimezone(tz: string) {
    setProjectTimezone(tz);
    updateProjectMutation.mutate({ timezone: tz });
  }

  function openDisconnectDialog(connectionId: string) {
    setDisconnectingId(connectionId);
    setDisconnectDialogOpen(true);
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Configure your project settings"
      />

      <div className="space-y-4">
        {/* General */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">General</CardTitle>
            <CardDescription>
              Basic project configuration.
            </CardDescription>
            <CardAction>
              <Button
                variant="outline"
                size="sm"
                onClick={handleUpdateGeneral}
                disabled={
                  loadingProject ||
                  updateProjectMutation.isPending ||
                  !projectName.trim() ||
                  !projectSlug.trim() ||
                  (projectName === project?.name && projectSlug === project?.slug)
                }
              >
                {updateProjectMutation.isPending ? <Loader className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Update
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-6 flex-wrap">
                <div className="shrink-0">
                  <p className="text-sm font-medium">Project Name</p>
                  <p className="text-xs text-muted-foreground">Display name for this project.</p>
                </div>
                {loadingProject ? (
                  <Skeleton className="h-9 w-64" />
                ) : (
                  <Input
                    value={projectName}
                    onChange={(e) => {
                      const value = e.target.value;
                      setProjectName(value);
                      if (!slugEdited) setProjectSlug(slugifyProjectName(value));
                    }}
                    placeholder="Project name"
                    className="w-64"
                  />
                )}
              </div>
              <div className="flex items-center justify-between gap-6 flex-wrap">
                <div className="shrink-0">
                  <p className="text-sm font-medium">URL Slug</p>
                  <p className="text-xs text-muted-foreground">Used in your public booking & form links. Old links redirect to the new slug.</p>
                </div>
                {loadingProject ? (
                  <Skeleton className="h-9 w-64" />
                ) : (
                  <div className="flex items-center rounded-[12px] border bg-muted/50 px-3 h-9 w-64">
                    <span className="text-sm text-muted-foreground shrink-0">linkycal.com/</span>
                    <input
                      value={projectSlug}
                      onChange={(e) => {
                        setProjectSlug(slugifyProjectName(e.target.value));
                        setSlugEdited(true);
                      }}
                      placeholder="your-project"
                      className="flex-1 min-w-0 bg-transparent text-sm font-medium text-foreground outline-none"
                    />
                  </div>
                )}
              </div>
              {updateProjectMutation.isError && (
                <p className="text-sm text-destructive">{(updateProjectMutation.error as Error).message}</p>
              )}
              <div className="flex items-center justify-between gap-6 flex-wrap">
                <div className="shrink-0">
                  <p className="text-sm font-medium">Timezone</p>
                  <p className="text-xs text-muted-foreground">Default for bookings and availability.</p>
                </div>
                {loadingProject ? (
                  <Skeleton className="h-9 w-64" />
                ) : (
                  <Select
                    value={projectTimezone}
                    onValueChange={handleUpdateTimezone}
                  >
                    <SelectTrigger className="w-64">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMON_TIMEZONES.map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Booking Appearance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Booking Page Appearance</CardTitle>
            <CardDescription>
              Customize the look of your public booking page and embeddable widgets.
            </CardDescription>
            <CardAction>
              <Button
                size="sm"
                onClick={() => saveThemeMutation.mutate()}
                disabled={saveThemeMutation.isPending}
              >
                {saveThemeMutation.isPending ? <Loader className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {([
                {
                  key: "brand",
                  title: "Brand colors",
                  desc: "Used for buttons and accents.",
                  fields: [
                    { label: "Button color", value: themePrimaryBg, onChange: setThemePrimaryBg },
                    { label: "Button text", value: themePrimaryText, onChange: setThemePrimaryText },
                  ],
                },
                {
                  key: "page",
                  title: "Page colors",
                  desc: "Used for the page background and text.",
                  fields: [
                    { label: "Page background", value: themeBg, onChange: setThemeBg },
                    { label: "Body text", value: themeText, onChange: setThemeText },
                  ],
                },
              ] as const).map((group) => (
                <div key={group.key} className="flex items-center justify-between gap-6 flex-wrap">
                  <div className="shrink-0">
                    <p className="text-sm font-medium">{group.title}</p>
                    <p className="text-xs text-muted-foreground">{group.desc}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 w-64">
                    {group.fields.map((field) => (
                      <label
                        key={field.label}
                        className="flex items-center gap-2 cursor-pointer rounded-[12px] border border-border px-2.5 py-1.5 hover:bg-accent/50 transition-colors"
                        title={field.label}
                      >
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
                        <span className="font-mono text-xs truncate">{field.value}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-between gap-6 flex-wrap">
                <div className="shrink-0">
                  <p className="text-sm font-medium">Border Radius · {themeRadius}px</p>
                  <p className="text-xs text-muted-foreground">Controls roundness of cards and buttons.</p>
                </div>
                <div className="w-64">
                  <input
                    type="range"
                    min={0}
                    max={32}
                    value={themeRadius}
                    onChange={(e) => setThemeRadius(Number(e.target.value))}
                    className="w-full accent-primary"
                  />
                  <div className="flex justify-between text-[11px] text-muted-foreground mt-0.5">
                    <span>Sharp</span>
                    <span>Round</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-6 flex-wrap">
                <div className="shrink-0">
                  <p className="text-sm font-medium">Font</p>
                  <p className="text-xs text-muted-foreground">Typography used on the public page.</p>
                </div>
                <Select value={themeFont} onValueChange={setThemeFont}>
                  <SelectTrigger className="w-64" style={{ fontFamily: themeFont }}>
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ImageUpload
                  label="Background Image"
                  value={themeBackgroundImage}
                  onChange={setThemeBackgroundImage}
                  uploadUrl={`/api/projects/${projectId}/uploads`}
                  onUploadError={handleUploadError}
                />
                <ImageUpload
                  label="Banner Image"
                  value={themeBannerImage}
                  onChange={setThemeBannerImage}
                  uploadUrl={`/api/projects/${projectId}/uploads`}
                  onUploadError={handleUploadError}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Custom CSS */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {hasCustomCssAccess ? (
                <Sparkles className="size-4 text-muted-foreground" />
              ) : (
                <LockKeyhole className="size-4 text-muted-foreground" />
              )}
              Custom CSS
            </CardTitle>
            <CardDescription>
              Add scoped styles to public forms and booking pages. Available on
              Pro and Business.
            </CardDescription>
            {hasCustomCssAccess ? (
              <CardAction>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => resetCustomCssMutation.mutate()}
                    disabled={resetCustomCssMutation.isPending || !customCss}
                  >
                    {resetCustomCssMutation.isPending ? (
                      <Loader className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                    Reset
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => saveCustomCssMutation.mutate()}
                    disabled={saveCustomCssMutation.isPending}
                  >
                    {saveCustomCssMutation.isPending ? (
                      <Loader className="size-4 animate-spin" />
                    ) : (
                      <Save className="size-4" />
                    )}
                    Save CSS
                  </Button>
                </div>
              </CardAction>
            ) : null}
          </CardHeader>
          <CardContent>
            {loadingCustomCss || loadingEntitlements ? (
              <Skeleton className="h-48 w-full rounded-[16px]" />
            ) : hasCustomCssAccess ? (
              <div className="space-y-3">
                <textarea
                  aria-label="Custom CSS"
                  value={customCss}
                  onChange={(event) => setCustomCss(event.target.value)}
                  placeholder=".booking-card { box-shadow: none; }"
                  spellCheck={false}
                  className="min-h-48 w-full resize-y rounded-[12px] bg-muted/45 px-4 py-3 font-mono text-sm outline-none transition-[box-shadow,background-color] focus:bg-background focus:ring-2 focus:ring-ring"
                />
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>Selectors are scoped to LinkyCal public pages.</span>
                  <span className="tabular-nums">
                    {new TextEncoder().encode(customCss).byteLength.toLocaleString()} / 20,480 bytes
                  </span>
                </div>
                {saveCustomCssMutation.isError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {saveCustomCssMutation.error.message}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-col items-start justify-between gap-4 rounded-[16px] bg-muted/50 px-4 py-4 sm:flex-row sm:items-center">
                <div>
                  <p className="text-sm font-medium">Unlock project Custom CSS</p>
                  <p className="text-xs text-muted-foreground">
                    Upgrade to Pro to publish safely scoped CSS and remove
                    LinkyCal branding.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    setUpgradeEntitlement("customCss");
                    setUpgradeActionLabel("publish Custom CSS");
                    setUpgradeDecision(null);
                    setShowUpgradeDialog(true);
                  }}
                >
                  <Sparkles className="size-4" />
                  Upgrade to Pro
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Analytics Integrations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="size-4 text-muted-foreground" />
              Analytics integrations
            </CardTitle>
            <CardDescription>
              Send safe funnel events to your own analytics account using
              structured public identifiers. Raw scripts and arbitrary hosts
              are not accepted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingEntitlements ||
            (hasAnalyticsAccess && loadingAnalyticsIntegrations) ? (
              <div className="grid gap-4 lg:grid-cols-3">
                {[1, 2, 3].map(function integrationSkeleton(index) {
                  return (
                    <Skeleton
                      key={index}
                      className="h-72 rounded-[20px]"
                    />
                  );
                })}
              </div>
            ) : !hasAnalyticsAccess ? (
              <div className="space-y-5">
                <div className="grid gap-4 lg:grid-cols-3">
                  {ANALYTICS_PROVIDER_DETAILS.map(function lockedProvider(
                    provider,
                  ) {
                    return (
                      <div
                        key={provider.provider}
                        className="rounded-[20px] bg-muted/45 p-5 shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)]"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-background">
                            {providerIcon(provider.provider)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold">
                                {provider.name}
                              </p>
                              <LockKeyhole className="size-3.5 text-muted-foreground" />
                            </div>
                            <p className="mt-1 text-pretty text-xs text-muted-foreground">
                              {provider.description}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-col items-start justify-between gap-4 rounded-[16px] bg-primary/10 px-4 py-3 sm:flex-row sm:items-center">
                  <div>
                    <p className="text-sm font-medium">
                      Configure providers with Pro
                    </p>
                    <p className="text-pretty text-xs text-muted-foreground">
                      Pro and Business projects can publish enabled provider
                      identifiers on booking pages, forms, and widgets.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    aria-label="Upgrade to configure analytics"
                    onClick={() => {
                      setUpgradeEntitlement("analytics");
                      setUpgradeActionLabel("configure analytics integrations");
                      setUpgradeDecision(null);
                      setShowUpgradeDialog(true);
                    }}
                  >
                    <Sparkles className="size-4" />
                    Upgrade to Pro
                  </Button>
                </div>
              </div>
            ) : analyticsIntegrationsError ? (
              <p role="alert" className="text-sm text-destructive">
                {(analyticsIntegrationsError as Error).message}
              </p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-3">
                {ANALYTICS_PROVIDER_DETAILS.map(function providerCard(
                  provider,
                ) {
                  const config =
                    analyticsIntegrations?.integrations.find(
                      function matchingIntegration(integration) {
                        return integration.provider === provider.provider;
                      },
                    ) ?? defaultIntegration(provider.provider);
                  const currentProvider =
                    saveAnalyticsIntegrationMutation.variables?.provider;
                  return (
                    <AnalyticsIntegrationCard
                      key={provider.provider}
                      config={config}
                      name={provider.name}
                      description={provider.description}
                      icon={providerIcon(provider.provider)}
                      isSaving={
                        saveAnalyticsIntegrationMutation.isPending &&
                        currentProvider === provider.provider
                      }
                      error={
                        saveAnalyticsIntegrationMutation.isError &&
                        currentProvider === provider.provider
                          ? saveAnalyticsIntegrationMutation.error.message
                          : undefined
                      }
                      onSave={(input) =>
                        saveAnalyticsIntegrationMutation.mutate(input)
                      }
                    />
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Calendar Integration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              Calendar Integration
            </CardTitle>
            <CardDescription>
              Connect your Google Calendar to sync bookings and check availability.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingCalendars ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <div className="space-y-3">
                {calendarConnections && calendarConnections.length > 0 ? (
                  <div className="space-y-2">
                    {calendarConnections.map((conn) => (
                      <div
                        key={conn.id}
                        className="flex items-center gap-3 py-2.5"
                      >
                        <div className="h-7 w-7 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                          <CalendarDays className="h-3.5 w-3.5 text-red-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground leading-none mb-0.5">
                            Google Calendar
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {conn.email}
                          </p>
                        </div>
                        <Badge variant="success">Connected</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive shrink-0"
                          onClick={() => openDisconnectDialog(conn.id)}
                        >
                          <Unplug className="h-3 w-3" />
                          Disconnect
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm text-muted-foreground">
                      No calendars connected.
                    </p>
                  </div>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => connectCalendarMutation.mutate()}
                  disabled={connectCalendarMutation.isPending}
                >
                  {connectCalendarMutation.isPending ? (
                    <Loader className="h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4" />
                  )}
                  Connect Google Calendar
                </Button>

                {connectCalendarMutation.isError && (
                  <p className="text-sm text-destructive">
                    {connectCalendarMutation.error?.message ??
                      "Failed to initiate connection."}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-destructive/20">
          <CardHeader>
            <CardTitle className="text-destructive text-base">Danger Zone</CardTitle>
            <CardDescription>
              Permanently delete this project and all associated data. This action cannot be undone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
              Delete Project
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Delete Project Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete{" "}
              <span className="font-semibold text-foreground">
                {project?.name ?? "this project"}
              </span>
              ? All event types, bookings, forms, contacts, and workflows will be
              permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleteProjectMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteProjectMutation.mutate()}
              disabled={deleteProjectMutation.isPending}
            >
              {deleteProjectMutation.isPending && (
                <Loader className="h-4 w-4 animate-spin" />
              )}
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disconnect Calendar Dialog */}
      <Dialog open={disconnectDialogOpen} onOpenChange={setDisconnectDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Disconnect Calendar</DialogTitle>
            <DialogDescription>
              Are you sure you want to disconnect this Google Calendar? Future
              bookings will no longer sync automatically.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDisconnectDialogOpen(false);
                setDisconnectingId(null);
              }}
              disabled={disconnectCalendarMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                disconnectingId &&
                disconnectCalendarMutation.mutate(disconnectingId)
              }
              disabled={disconnectCalendarMutation.isPending}
            >
              {disconnectCalendarMutation.isPending && (
                <Loader className="h-4 w-4 animate-spin" />
              )}
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upgrade Dialog */}
      <UpgradeDialog
        open={showUpgradeDialog}
        onClose={() => setShowUpgradeDialog(false)}
        projectId={projectId!}
        entitlement={upgradeEntitlement}
        actionLabel={upgradeActionLabel}
        decision={upgradeDecision ?? undefined}
      />
    </div>
  );
}

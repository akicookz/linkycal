import { useState } from "react";
import { useParams } from "react-router-dom";
import { UpgradeDialog } from "@/components/UpgradeDialog";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Loader,
  CalendarDays,
  Unplug,
  ExternalLink,
  Trash2,
  Save,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Card, CardAction, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { ImageUpload } from "@/components/ImageUpload";
import { queryClient } from "@/lib/query-client";

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

import { FONT_OPTIONS } from "@/lib/constants";

// ─── Component ───────────────────────────────────────────────────────────────

export default function Settings() {
  const { projectId } = useParams<{ projectId: string }>();

  const [projectName, setProjectName] = useState("");
  const [projectTimezone, setProjectTimezone] = useState("America/New_York");
  const [nameInitialized, setNameInitialized] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

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

  // Update project mutation
  const updateProjectMutation = useMutation({
    mutationFn: async (data: { name?: string; timezone?: string }) => {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update project");
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

  // Connect Google Calendar mutation
  const connectCalendarMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/calendar/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
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
      if (err.message.includes("Plan limit")) {
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

  function handleUpdateName() {
    if (projectName.trim() && projectName !== project?.name) {
      updateProjectMutation.mutate({ name: projectName.trim() });
    }
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
                onClick={handleUpdateName}
                disabled={
                  loadingProject ||
                  updateProjectMutation.isPending ||
                  !projectName.trim() ||
                  projectName === project?.name
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
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="Project name"
                    className="w-64"
                  />
                )}
              </div>
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
                />
                <ImageUpload
                  label="Banner Image"
                  value={themeBannerImage}
                  onChange={setThemeBannerImage}
                  uploadUrl={`/api/projects/${projectId}/uploads`}
                />
              </div>
            </div>
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
        feature="calendar connections"
        description="Your current plan allows 1 calendar connection. Upgrade to Pro to connect unlimited Google Calendar accounts."
      />
    </div>
  );
}

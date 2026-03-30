import { useState, useEffect, useLayoutEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  Save,
  Loader,
  AlertCircle,
  Plus,
  Trash2,
  Clock,
  CalendarOff,
  Copy,
  Check,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
import { WeeklyAvailabilityEditor } from "@/components/WeeklyAvailabilityEditor";
import {
  dayConfigsToRules,
  defaultDayConfigs,
  getTimeOptions,
  parseTimeToMinutes,
  rulesToDayConfigs,
  type DayAvailabilityConfig,
} from "@/lib/availability";
import { queryClient } from "@/lib/query-client";
import { cn } from "@/lib/utils";
import { UpgradeDialog } from "@/components/UpgradeDialog";

// ─── Types ───────────────────────────────────────────────────────────────────

interface EventType {
  id: string;
  name: string;
  slug: string;
  duration: number;
  description: string | null;
  location: string | null;
  color: string;
  bufferBefore: number;
  bufferAfter: number;
  maxPerDay: number | null;
  enabled: boolean;
  requiresConfirmation: boolean;
  bookingFormId: string | null;
  scheduleId: string | null;
}

interface Schedule {
  id: string;
  timezone: string;
}

interface AvailabilityRule {
  id: string;
  scheduleId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

interface ScheduleOverride {
  id: string;
  scheduleId: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  isBlocked: boolean;
}

interface EventTypeFormData {
  name: string;
  slug: string;
  duration: number;
  description: string;
  location: string;
  color: string;
  bufferBefore: number;
  bufferAfter: number;
  requiresConfirmation: boolean;
  bookingFormId: string | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

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

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeDurationValue(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) {
    return defaultFormData.duration;
  }

  return Math.round(duration);
}

const defaultFormData: EventTypeFormData = {
  name: "",
  slug: "",
  duration: 30,
  description: "",
  location: "",
  color: "#3b82f6",
  bufferBefore: 0,
  bufferAfter: 0,
  requiresConfirmation: false,
  bookingFormId: null as string | null,
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function EventTypeForm() {
  const { projectId, eventTypeId } = useParams<{
    projectId: string;
    eventTypeId: string;
  }>();
  const navigate = useNavigate();
  const isEditing = !!eventTypeId;

  // Form state
  const [formData, setFormData] = useState<EventTypeFormData>(defaultFormData);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [selectRenderVersion, setSelectRenderVersion] = useState(0);

  // Availability state
  const [dayConfigs, setDayConfigs] = useState<DayAvailabilityConfig[]>(
    defaultDayConfigs(),
  );
  const [timezone, setTimezone] = useState("America/New_York");

  // Copy from state (for new event types)
  const [copyFromId, setCopyFromId] = useState<string>("");

  // Copy availability state (for editing)
  const [copyAvailabilityOpen, setCopyAvailabilityOpen] = useState(false);
  const [copyAvailabilitySourceId, setCopyAvailabilitySourceId] = useState("");

  // Override dialog state
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [overrideDate, setOverrideDate] = useState("");
  const [overrideBlocked, setOverrideBlocked] = useState(true);
  const [overrideStartTime, setOverrideStartTime] = useState("09:00");
  const [overrideEndTime, setOverrideEndTime] = useState("17:00");

  // Calendar state
  const [destinationCalendar, setDestinationCalendar] = useState<{ connectionId: string; calendarId: string } | null>(null);
  const [busyCalendars, setBusyCalendars] = useState<Array<{ connectionId: string; calendarId: string }>>([]);
  const [calendarConnectError, setCalendarConnectError] = useState<string | null>(null);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);

  // Fetch existing event types (for copy-from selector)
  const { data: existingEventTypes } = useQuery<EventType[]>({
    queryKey: ["projects", projectId, "event-types"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/event-types`);
      if (!res.ok) throw new Error("Failed to fetch event types");
      const data = await res.json();
      return data.eventTypes ?? [];
    },
    enabled: !!projectId,
  });

  // Fetch event type with schedule data (when editing)
  const {
    data: eventTypeData,
    isLoading,
    isError,
  } = useQuery<{
    eventType: EventType;
    schedule: Schedule | null;
    rules: AvailabilityRule[];
    overrides: ScheduleOverride[];
  }>({
    queryKey: ["projects", projectId, "event-types", eventTypeId, "full"],
    queryFn: async () => {
      const res = await fetch(
        `/api/projects/${projectId}/event-types/${eventTypeId}`,
      );
      if (!res.ok) throw new Error("Failed to fetch event type");
      return res.json();
    },
    enabled: !!eventTypeId,
  });

  // Fetch project forms for booking form picker
  const { data: projectForms } = useQuery<Array<{ id: string; name: string; type: string; status: string }>>({
    queryKey: ["projects", projectId, "forms"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/forms`);
      if (!res.ok) throw new Error("Failed to fetch forms");
      const data = await res.json();
      return (data.forms ?? []).filter((f: { status: string }) => f.status === "active");
    },
    enabled: !!projectId,
  });

  // Fetch connected calendar accounts
  const { data: calendarAccounts } = useQuery<{
    accounts: Array<{
      connectionId: string;
      email: string;
      calendars: Array<{ id: string; summary: string; primary: boolean; accessRole: string }>;
    }>;
  }>({
    queryKey: ["calendar-accounts"],
    queryFn: async () => {
      const res = await fetch("/api/calendar/calendars");
      if (!res.ok) throw new Error("Failed to fetch calendars");
      return res.json();
    },
  });

  // Fetch event type calendar config (when editing)
  const { data: calendarConfig } = useQuery<{
    destination: { connectionId: string; calendarId: string } | null;
    busyCalendars: Array<{ connectionId: string; calendarId: string }>;
  }>({
    queryKey: ["projects", projectId, "event-types", eventTypeId, "calendars"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/event-types/${eventTypeId}/calendars`);
      if (!res.ok) throw new Error("Failed to fetch calendar config");
      return res.json();
    },
    enabled: !!eventTypeId,
  });

  // Populate calendar config from fetched data
  useEffect(() => {
    if (!calendarConfig) return;
    setDestinationCalendar(calendarConfig.destination);
    setBusyCalendars(calendarConfig.busyCalendars);
  }, [calendarConfig]);

  const durationOptions = useMemo(() => {
    const nextOptions = new Set(DURATION_OPTIONS);
    nextOptions.add(normalizeDurationValue(formData.duration));

    return Array.from(nextOptions).sort((left, right) => left - right);
  }, [formData.duration]);

  // Populate form from fetched data (useLayoutEffect to set state before paint,
  // preventing Radix Select from briefly rendering with stale default values)
  useLayoutEffect(() => {
    if (!eventTypeData) return;
    const et = eventTypeData.eventType;
    setFormData({
      name: et.name,
      slug: et.slug,
      duration: normalizeDurationValue(et.duration),
      description: et.description ?? "",
      location: et.location ?? "",
      color: et.color,
      bufferBefore: et.bufferBefore,
      bufferAfter: et.bufferAfter,
      requiresConfirmation: et.requiresConfirmation ?? false,
      bookingFormId: et.bookingFormId ?? null,
    });
    setSlugManuallyEdited(true);

    // Populate availability
    if (eventTypeData.schedule) {
      setTimezone(eventTypeData.schedule.timezone);
    }
    if (eventTypeData.rules) {
      setDayConfigs(rulesToDayConfigs(eventTypeData.rules));
    }
    setSelectRenderVersion((current) => current + 1);
  }, [eventTypeData]);

  // Auto-generate slug from name (only for new event types)
  useEffect(() => {
    if (!slugManuallyEdited && !isEditing) {
      setFormData((prev) => ({ ...prev, slug: generateSlug(prev.name) }));
    }
  }, [formData.name, slugManuallyEdited, isEditing]);

  // When "copy from" changes for a new event type, load that event type's availability
  const { data: copySourceData } = useQuery<{
    eventType: EventType;
    schedule: Schedule | null;
    rules: AvailabilityRule[];
    overrides: ScheduleOverride[];
  }>({
    queryKey: ["projects", projectId, "event-types", copyFromId, "full"],
    queryFn: async () => {
      const res = await fetch(
        `/api/projects/${projectId}/event-types/${copyFromId}`,
      );
      if (!res.ok) throw new Error("Failed to fetch source event type");
      return res.json();
    },
    enabled: !!copyFromId && !isEditing,
  });

  useEffect(() => {
    if (!copySourceData) return;
    if (copySourceData.schedule) {
      setTimezone(copySourceData.schedule.timezone);
    }
    if (copySourceData.rules) {
      setDayConfigs(rulesToDayConfigs(copySourceData.rules));
    }
    setSelectRenderVersion((current) => current + 1);
  }, [copySourceData]);

  // Fetch source event type for copy-availability dialog (edit mode)
  const { data: copyAvailabilityData, isFetching: isFetchingCopyAvailability } = useQuery<{
    eventType: EventType;
    schedule: Schedule | null;
    rules: AvailabilityRule[];
    overrides: ScheduleOverride[];
  }>({
    queryKey: ["projects", projectId, "event-types", copyAvailabilitySourceId, "full"],
    queryFn: async () => {
      const res = await fetch(
        `/api/projects/${projectId}/event-types/${copyAvailabilitySourceId}`,
      );
      if (!res.ok) throw new Error("Failed to fetch source event type");
      return res.json();
    },
    enabled: !!copyAvailabilitySourceId && isEditing,
  });

  function applyCopiedAvailability() {
    if (!copyAvailabilityData) return;
    if (copyAvailabilityData.schedule) {
      setTimezone(copyAvailabilityData.schedule.timezone);
    }
    if (copyAvailabilityData.rules) {
      setDayConfigs(rulesToDayConfigs(copyAvailabilityData.rules));
    }
    setSelectRenderVersion((current) => current + 1);
    setCopyAvailabilityOpen(false);
    setCopyAvailabilitySourceId("");
  }

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: EventTypeFormData & { copyFromEventTypeId?: string }) => {
      const res = await fetch(`/api/projects/${projectId}/event-types`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || "Failed to create event type");
      }
      const result = await res.json();

      // Save availability rules to the new event type's schedule
      const eventType = result.eventType;
      if (eventType?.scheduleId) {
        await saveAvailability(eventType.scheduleId);
      }

      // Save calendar config
      if (eventType?.id) {
        await saveCalendarConfig(eventType.id);
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "event-types"],
      });
      navigate(`/app/projects/${projectId}/event-types`);
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: EventTypeFormData) => {
      const res = await fetch(
        `/api/projects/${projectId}/event-types/${eventTypeId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || "Failed to update event type");
      }
      const result = await res.json();

      // Save availability rules as part of the same mutation
      if (eventTypeData?.eventType?.scheduleId) {
        await saveAvailability(eventTypeData.eventType.scheduleId);
      }

      // Save calendar config
      if (eventTypeId) {
        await saveCalendarConfig(eventTypeId);
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "event-types"],
      });
      navigate(`/app/projects/${projectId}/event-types`);
    },
  });

  const connectCalendarMutation = useMutation({
    mutationFn: async () => {
      setCalendarConnectError(null);
      const returnUrl = window.location.pathname;
      const res = await fetch(`/api/projects/${projectId}/calendar/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnUrl }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to connect calendar");
      }
      return res.json() as Promise<{ url: string }>;
    },
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
    onError: (err: Error) => {
      if (err.message.includes("Plan limit")) {
        setShowUpgradeDialog(true);
      } else {
        setCalendarConnectError(err.message);
      }
    },
  });

  async function saveCalendarConfig(etId: string) {
    await fetch(`/api/projects/${projectId}/event-types/${etId}/calendars`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        destination: destinationCalendar,
        busyCalendars,
      }),
    });
  }

  async function saveAvailability(scheduleId: string) {
    const newRules = dayConfigsToRules(dayConfigs);

    const res = await fetch(
      `/api/projects/${projectId}/schedules/${scheduleId}/rules`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: newRules, timezone }),
      },
    );
    if (!res.ok) throw new Error("Failed to save availability");
  }

  // Add override mutation
  const addOverrideMutation = useMutation({
    mutationFn: async (data: {
      date: string;
      isBlocked: boolean;
      startTime: string | null;
      endTime: string | null;
    }) => {
      const scheduleId = eventTypeData?.eventType?.scheduleId;
      if (!scheduleId) throw new Error("No schedule found");
      const res = await fetch(
        `/api/projects/${projectId}/schedules/${scheduleId}/overrides`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
      );
      if (!res.ok) throw new Error("Failed to add override");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "event-types", eventTypeId, "full"],
      });
      setOverrideDialogOpen(false);
      resetOverrideForm();
    },
  });

  // Delete override mutation
  const deleteOverrideMutation = useMutation({
    mutationFn: async (overrideId: string) => {
      const scheduleId = eventTypeData?.eventType?.scheduleId;
      if (!scheduleId) throw new Error("No schedule found");
      const res = await fetch(
        `/api/projects/${projectId}/schedules/${scheduleId}/overrides/${overrideId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Failed to delete override");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "event-types", eventTypeId, "full"],
      });
    },
  });

  function resetOverrideForm() {
    setOverrideDate("");
    setOverrideBlocked(true);
    setOverrideStartTime("09:00");
    setOverrideEndTime("17:00");
  }

  function handleAddOverride(e: React.FormEvent) {
    e.preventDefault();
    addOverrideMutation.mutate({
      date: overrideDate,
      isBlocked: overrideBlocked,
      startTime: overrideBlocked ? null : overrideStartTime,
      endTime: overrideBlocked ? null : overrideEndTime,
    });
  }

  function formatOverrideDate(dateStr: string): string {
    const date = new Date(dateStr + "T12:00:00");
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isEditing) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate({
        ...formData,
        copyFromEventTypeId: copyFromId || undefined,
      });
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const overrides = eventTypeData?.overrides ?? [];
  const overrideStartOptions = getTimeOptions({
    minMinutes: 0,
    maxMinutes: parseTimeToMinutes(overrideEndTime) - 15,
    includeMidnight: false,
  });
  const overrideEndOptions = getTimeOptions({
    minMinutes: parseTimeToMinutes(overrideStartTime) + 15,
    maxMinutes: 24 * 60,
    includeMidnight: true,
  });

  // Other event types for copy-from (exclude current)
  const copyableEventTypes = useMemo(
    () =>
      (existingEventTypes ?? []).filter((et) => et.id !== eventTypeId),
    [existingEventTypes, eventTypeId],
  );

  if (isEditing && isLoading) {
    return (
      <div>
        <PageHeader title="Edit Event Type" description="Loading...">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              navigate(`/app/projects/${projectId}/event-types`)
            }
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </PageHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-28" />
              </CardHeader>
              <CardContent className="space-y-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
          {/* Right Column */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-10 w-full" />
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-5 w-5 rounded" />
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-8 w-20 ml-auto" />
                    <Skeleton className="h-4 w-4" />
                    <Skeleton className="h-8 w-20" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (isEditing && isError) {
    return (
      <div>
        <PageHeader title="Edit Event Type" description="">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              navigate(`/app/projects/${projectId}/event-types`)
            }
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </PageHeader>
        <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed py-16">
          <AlertCircle className="h-10 w-10 text-destructive mb-4" />
          <p className="text-sm font-medium text-foreground mb-1">
            Failed to load event type
          </p>
          <p className="text-sm text-muted-foreground">
            Please try refreshing the page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={isEditing ? "Edit Event Type" : "New Event Type"}
        description={
          isEditing
            ? "Update your event type details and availability"
            : "Create a new event type for people to book with you"
        }
      >
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              navigate(`/app/projects/${projectId}/event-types`)
            }
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isSaving || !formData.name || !formData.slug}
          >
            {isSaving ? <Loader className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isEditing ? "Save Changes" : "Create Event Type"}
          </Button>
        </div>
      </PageHeader>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Event Details */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Event Details</CardTitle>
              <label className="cursor-pointer">
                <input
                  type="color"
                  value={formData.color}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, color: e.target.value }))
                  }
                  className="sr-only"
                />
                <span
                  className="block h-7 w-7 rounded-full border border-border shrink-0 transition-shadow hover:ring-2 hover:ring-ring hover:ring-offset-2"
                  style={{ backgroundColor: formData.color }}
                />
              </label>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="e.g. 30 Minute Meeting"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="slug">Slug</Label>
                  <Input
                    id="slug"
                    placeholder="30-minute-meeting"
                    value={formData.slug}
                    onChange={(e) => {
                      setSlugManuallyEdited(true);
                      setFormData((prev) => ({ ...prev, slug: e.target.value }));
                    }}
                    required
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Auto-generated from name.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="duration">Duration</Label>
                  <Select
                    key={`duration-${selectRenderVersion}`}
                    value={String(formData.duration)}
                    onValueChange={(val) =>
                      setFormData((prev) => ({
                        ...prev,
                        duration: Number(val),
                      }))
                    }
                  >
                    <SelectTrigger id="duration">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {durationOptions.map((d) => (
                        <SelectItem key={d} value={String(d)}>
                          {d} minutes
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  placeholder="Optional description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  placeholder="e.g. Google Meet, Zoom, Office"
                  value={formData.location}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      location: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bufferBefore">Buffer before (min)</Label>
                  <Input
                    id="bufferBefore"
                    type="number"
                    min={0}
                    value={formData.bufferBefore}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        bufferBefore: Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bufferAfter">Buffer after (min)</Label>
                  <Input
                    id="bufferAfter"
                    type="number"
                    min={0}
                    value={formData.bufferAfter}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        bufferAfter: Number(e.target.value),
                      }))
                    }
                  />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-[12px] border px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Require confirmation</p>
                  <p className="text-xs text-muted-foreground">
                    New bookings will need your approval before they're confirmed
                  </p>
                </div>
                <Switch
                  checked={formData.requiresConfirmation}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, requiresConfirmation: checked }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Booking Form</Label>
                <Select
                  value={formData.bookingFormId ?? "none"}
                  onValueChange={(val) =>
                    setFormData((prev) => ({
                      ...prev,
                      bookingFormId: val === "none" ? null : val,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No custom form" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No custom form</SelectItem>
                    {projectForms?.map((form) => (
                      <SelectItem key={form.id} value={form.id}>
                        {form.name}
                        <span className="text-muted-foreground ml-1">
                          ({form.type === "multi_step" ? "Multi-step" : "Single"})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Attach a form to collect additional information during booking.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Calendar */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Calendar</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => connectCalendarMutation.mutate()}
                disabled={connectCalendarMutation.isPending}
              >
                {connectCalendarMutation.isPending ? (
                  <Loader className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <svg className="h-3.5 w-3.5 mr-1" viewBox="0 0 24 24" fill="none">
                    <path d="M21.35 11.1h-9.18v2.73h5.51c-.24 1.28-.97 2.36-2.06 3.08v2.56h3.33c1.95-1.79 3.07-4.43 3.07-7.55 0-.52-.05-1.02-.14-1.5l-.53.68z" fill="#4285F4" />
                    <path d="M12.17 22c2.78 0 5.11-.92 6.82-2.49l-3.33-2.56c-.92.62-2.1.99-3.49.99-2.68 0-4.95-1.81-5.76-4.24H3.01v2.64C4.72 19.78 8.17 22 12.17 22z" fill="#34A853" />
                    <path d="M6.41 14.09c-.21-.62-.33-1.28-.33-1.97s.12-1.35.33-1.97V7.51H3.01A9.996 9.996 0 0 0 2 12.12c0 1.61.39 3.14 1.01 4.49l3.4-2.52z" fill="#FBBC05" />
                    <path d="M12.17 5.91c1.51 0 2.87.52 3.94 1.54l2.95-2.95C17.27 2.86 14.94 2 12.17 2 8.17 2 4.72 4.22 3.01 7.51l3.4 2.61c.81-2.43 3.08-4.21 5.76-4.21z" fill="#EA4335" />
                  </svg>
                )}
                Connect
              </Button>
            </CardHeader>
            {calendarConnectError && (
              <p className="px-6 -mt-2 mb-2 text-xs text-destructive">{calendarConnectError}</p>
            )}
            <CardContent className="space-y-5">
              {calendarAccounts?.accounts && calendarAccounts.accounts.length > 0 ? (
                <>
                  <div className="space-y-2">
                    <Label>Write new events to</Label>
                    <Select
                      value={destinationCalendar ? `${destinationCalendar.connectionId}::${destinationCalendar.calendarId}` : ""}
                      onValueChange={(val) => {
                        if (!val) {
                          setDestinationCalendar(null);
                          return;
                        }
                        const [connectionId, calendarId] = val.split("::");
                        setDestinationCalendar({ connectionId, calendarId });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a calendar" />
                      </SelectTrigger>
                      <SelectContent>
                        {calendarAccounts.accounts.flatMap((account) =>
                          account.calendars
                            .filter((cal) => cal.accessRole === "writer" || cal.accessRole === "owner")
                            .map((cal) => (
                              <SelectItem
                                key={`${account.connectionId}::${cal.id}`}
                                value={`${account.connectionId}::${cal.id}`}
                              >
                                {cal.summary}{calendarAccounts.accounts.length > 1 ? ` (${account.email})` : ""}
                              </SelectItem>
                            )),
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Check for busy times</Label>
                    <div className="space-y-2">
                      {calendarAccounts.accounts.flatMap((account) =>
                        account.calendars.map((cal) => {
                          const key = `${account.connectionId}::${cal.id}`;
                          const isChecked = busyCalendars.some(
                            (bc) => bc.connectionId === account.connectionId && bc.calendarId === cal.id,
                          );
                          return (
                            <div
                              key={key}
                              className={cn(
                                "flex items-center justify-between rounded-[12px] border px-4 py-2.5 transition-colors",
                                isChecked ? "bg-white border-border" : "bg-muted/30 border-transparent",
                              )}
                            >
                              <div className="flex items-center gap-3">
                                <Switch
                                  checked={isChecked}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setBusyCalendars((prev) => [
                                        ...prev,
                                        { connectionId: account.connectionId, calendarId: cal.id },
                                      ]);
                                    } else {
                                      setBusyCalendars((prev) =>
                                        prev.filter(
                                          (bc) =>
                                            !(bc.connectionId === account.connectionId && bc.calendarId === cal.id),
                                        ),
                                      );
                                    }
                                  }}
                                />
                                <span className={cn("text-sm", isChecked ? "text-foreground" : "text-muted-foreground")}>
                                  {cal.summary}
                                  {calendarAccounts.accounts.length > 1 && (
                                    <span className="text-muted-foreground ml-1">({account.email})</span>
                                  )}
                                </span>
                              </div>
                            </div>
                          );
                        }),
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground py-2 text-center">
                  No calendar connected yet. Use the Connect button above to get started.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Availability Source (only for new event types) */}
          {!isEditing && copyableEventTypes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Availability Source
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label>Start with availability from</Label>
                  <Select
                    value={copyFromId || "__default__"}
                    onValueChange={(val) =>
                      setCopyFromId(val === "__default__" ? "" : val)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Default (Mon-Fri, 9am-5pm)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__default__">
                        Default (Mon-Fri, 9am-5pm)
                      </SelectItem>
                      {copyableEventTypes.map((et) => (
                        <SelectItem key={et.id} value={et.id}>
                          Copy from: {et.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    This creates an independent copy. Changes won't affect the
                    source.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Error messages */}
          {(createMutation.isError || updateMutation.isError) && (
            <p className="text-sm text-destructive">
              {(createMutation.error ?? updateMutation.error)?.message ??
                "Something went wrong."}
            </p>
          )}
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Available Times */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Available Times
              </CardTitle>
              {isEditing && copyableEventTypes.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCopyAvailabilityOpen(true)}
                >
                  <Copy className="h-4 w-4" />
                  Copy from
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <WeeklyAvailabilityEditor
                  key={`availability-${selectRenderVersion}`}
                  dayConfigs={dayConfigs}
                  onChange={setDayConfigs}
                  disabled={isSaving}
                />
              </div>
            </CardContent>
          </Card>

          {/* Date Overrides (only when editing — schedule must exist) */}
          {isEditing && eventTypeData?.eventType?.scheduleId && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarOff className="h-4 w-4 text-muted-foreground" />
                  Date Overrides
                </CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setOverrideDialogOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  Add Override
                </Button>
              </CardHeader>
              <CardContent>
                {overrides.length > 0 ? (
                  <div className="space-y-2">
                    {overrides.map((override) => (
                      <div
                        key={override.id}
                        className="flex items-center gap-4 py-2"
                      >
                        <span className="text-sm font-medium text-foreground min-w-[160px]">
                          {formatOverrideDate(override.date)}
                        </span>
                        {override.isBlocked ? (
                          <Badge variant="destructive">Blocked</Badge>
                        ) : (
                          <Badge variant="secondary">
                            {override.startTime} – {override.endTime}
                          </Badge>
                        )}
                        <div className="flex-1" />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                          onClick={() =>
                            deleteOverrideMutation.mutate(override.id)
                          }
                          disabled={deleteOverrideMutation.isPending}
                        >
                          {deleteOverrideMutation.isPending ? <Loader className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No date overrides. Add one to block a specific day or set
                    custom hours.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

        </div>
      </form>

      {/* Upgrade Dialog */}
      <UpgradeDialog
        open={showUpgradeDialog}
        onClose={() => setShowUpgradeDialog(false)}
        projectId={projectId!}
        feature="calendar connections"
        description="Your current plan allows 1 calendar connection. Upgrade to Pro to connect unlimited Google Calendar accounts."
      />

      {/* Add Override Dialog */}
      <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Date Override</DialogTitle>
            <DialogDescription>
              Block a specific date or set custom hours for that day.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddOverride} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="overrideDate">Date</Label>
              <Input
                id="overrideDate"
                type="date"
                value={overrideDate}
                onChange={(e) => setOverrideDate(e.target.value)}
                required
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="overrideBlocked"
                checked={overrideBlocked}
                onCheckedChange={setOverrideBlocked}
              />
              <Label htmlFor="overrideBlocked">Block entire day</Label>
            </div>

            {!overrideBlocked && (
              <div className="space-y-2">
                <Label>Custom Hours</Label>
                <div className="flex items-center gap-2">
                  <Select
                    value={overrideStartTime}
                    onValueChange={setOverrideStartTime}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-80">
                      {overrideStartOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-muted-foreground">to</span>
                  <Select
                    value={overrideEndTime}
                    onValueChange={setOverrideEndTime}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-80">
                      {overrideEndOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {addOverrideMutation.isError && (
              <p className="text-sm text-destructive">
                {addOverrideMutation.error?.message ??
                  "Failed to add override."}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setOverrideDialogOpen(false);
                  resetOverrideForm();
                }}
                disabled={addOverrideMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={addOverrideMutation.isPending}>
                {addOverrideMutation.isPending ? (
                  <Loader className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Add Override
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Copy Availability Dialog */}
      <Dialog
        open={copyAvailabilityOpen}
        onOpenChange={(open) => {
          setCopyAvailabilityOpen(open);
          if (!open) setCopyAvailabilitySourceId("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy Availability</DialogTitle>
            <DialogDescription>
              Replace current availability rules with rules from another event
              type. This creates an independent copy.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Copy from</Label>
              <Select
                value={copyAvailabilitySourceId || "__none__"}
                onValueChange={(val) =>
                  setCopyAvailabilitySourceId(val === "__none__" ? "" : val)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an event type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" disabled>
                    Select an event type
                  </SelectItem>
                  {copyableEventTypes.map((et) => (
                    <SelectItem key={et.id} value={et.id}>
                      {et.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCopyAvailabilityOpen(false);
                setCopyAvailabilitySourceId("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!copyAvailabilitySourceId || !copyAvailabilityData || isFetchingCopyAvailability}
              onClick={applyCopiedAvailability}
            >
              {isFetchingCopyAvailability ? (
                <Loader className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

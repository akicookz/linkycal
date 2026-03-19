import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Clock,
  Save,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  Globe,
  CalendarOff,
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
import { queryClient } from "@/lib/query-client";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Schedule {
  id: string;
  projectId: string;
  name: string;
  timezone: string;
  isDefault: boolean;
  createdAt: string;
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

interface DayConfig {
  enabled: boolean;
  startTime: string;
  endTime: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

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

function defaultDayConfigs(): DayConfig[] {
  return DAYS.map((_, i) => ({
    enabled: i < 5, // Mon-Fri enabled by default
    startTime: "09:00",
    endTime: "17:00",
  }));
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Availability() {
  const { projectId } = useParams<{ projectId: string }>();

  const [dayConfigs, setDayConfigs] = useState<DayConfig[]>(defaultDayConfigs());
  const [timezone, setTimezone] = useState("America/New_York");
  const [hasChanges, setHasChanges] = useState(false);

  // Override dialog state
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [overrideDate, setOverrideDate] = useState("");
  const [overrideBlocked, setOverrideBlocked] = useState(true);
  const [overrideStartTime, setOverrideStartTime] = useState("09:00");
  const [overrideEndTime, setOverrideEndTime] = useState("17:00");

  // Fetch schedules
  const {
    data: schedules,
    isLoading: loadingSchedules,
    isError: errorSchedules,
  } = useQuery<Schedule[]>({
    queryKey: ["projects", projectId, "schedules"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/schedules`);
      if (!res.ok) throw new Error("Failed to fetch schedules");
      const data = await res.json();
      return data.schedules ?? [];
    },
    enabled: !!projectId,
  });

  const defaultSchedule = useMemo(
    () => schedules?.find((s) => s.isDefault) ?? schedules?.[0],
    [schedules],
  );

  // Fetch availability rules for the default schedule
  const {
    data: rules,
    isLoading: loadingRules,
  } = useQuery<AvailabilityRule[]>({
    queryKey: ["schedules", defaultSchedule?.id, "rules"],
    queryFn: async () => {
      const res = await fetch(
        `/api/projects/${projectId}/schedules/${defaultSchedule!.id}/rules`,
      );
      if (!res.ok) throw new Error("Failed to fetch rules");
      const data = await res.json();
      return data.rules ?? [];
    },
    enabled: !!defaultSchedule?.id,
  });

  // Fetch overrides
  const {
    data: overrides,
    isLoading: loadingOverrides,
  } = useQuery<ScheduleOverride[]>({
    queryKey: ["schedules", defaultSchedule?.id, "overrides"],
    queryFn: async () => {
      const res = await fetch(
        `/api/projects/${projectId}/schedules/${defaultSchedule!.id}/overrides`,
      );
      if (!res.ok) throw new Error("Failed to fetch overrides");
      const data = await res.json();
      return data.overrides ?? [];
    },
    enabled: !!defaultSchedule?.id,
  });

  // Populate day configs from fetched rules
  useEffect(() => {
    if (!rules) return;
    const configs = defaultDayConfigs().map((c) => ({ ...c, enabled: false }));
    for (const rule of rules) {
      const idx = rule.dayOfWeek;
      if (idx >= 0 && idx < 7) {
        configs[idx] = {
          enabled: true,
          startTime: rule.startTime,
          endTime: rule.endTime,
        };
      }
    }
    setDayConfigs(configs);
    setHasChanges(false);
  }, [rules]);

  // Populate timezone
  useEffect(() => {
    if (defaultSchedule) {
      setTimezone(defaultSchedule.timezone);
    }
  }, [defaultSchedule]);

  // Save rules mutation
  const saveRulesMutation = useMutation({
    mutationFn: async () => {
      const newRules = dayConfigs
        .map((config, idx) => ({
          dayOfWeek: idx,
          startTime: config.startTime,
          endTime: config.endTime,
          enabled: config.enabled,
        }))
        .filter((r) => r.enabled);

      const res = await fetch(
        `/api/projects/${projectId}/schedules/${defaultSchedule!.id}/rules`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rules: newRules, timezone }),
        },
      );
      if (!res.ok) throw new Error("Failed to save availability");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["schedules", defaultSchedule?.id, "rules"],
      });
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "schedules"],
      });
      setHasChanges(false);
    },
  });

  // Add override mutation
  const addOverrideMutation = useMutation({
    mutationFn: async (data: {
      date: string;
      isBlocked: boolean;
      startTime: string | null;
      endTime: string | null;
    }) => {
      const res = await fetch(
        `/api/projects/${projectId}/schedules/${defaultSchedule!.id}/overrides`,
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
        queryKey: ["schedules", defaultSchedule?.id, "overrides"],
      });
      setOverrideDialogOpen(false);
      resetOverrideForm();
    },
  });

  // Delete override mutation
  const deleteOverrideMutation = useMutation({
    mutationFn: async (overrideId: string) => {
      const res = await fetch(
        `/api/projects/${projectId}/schedules/${defaultSchedule!.id}/overrides/${overrideId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Failed to delete override");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["schedules", defaultSchedule?.id, "overrides"],
      });
    },
  });

  function updateDay(index: number, changes: Partial<DayConfig>) {
    setDayConfigs((prev) =>
      prev.map((config, i) => (i === index ? { ...config, ...changes } : config)),
    );
    setHasChanges(true);
  }

  function handleTimezoneChange(tz: string) {
    setTimezone(tz);
    setHasChanges(true);
  }

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

  const isLoading = loadingSchedules || loadingRules;

  return (
    <div>
      <PageHeader
        title="Availability"
        description="Set your available hours for bookings"
      >
        {hasChanges && (
          <Button
            size="sm"
            onClick={() => saveRulesMutation.mutate()}
            disabled={saveRulesMutation.isPending}
          >
            {saveRulesMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Changes
          </Button>
        )}
      </PageHeader>

      {/* Error state */}
      {errorSchedules && (
        <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed py-16">
          <AlertCircle className="h-10 w-10 text-destructive mb-4" />
          <p className="text-sm font-medium text-foreground mb-1">
            Failed to load availability
          </p>
          <p className="text-sm text-muted-foreground">
            Please try refreshing the page.
          </p>
        </div>
      )}

      {!errorSchedules && (
        <div className="space-y-6">
          {/* Timezone Selector */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                Timezone
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-10 w-64" />
              ) : (
                <Select value={timezone} onValueChange={handleTimezoneChange}>
                  <SelectTrigger className="w-full max-w-xs">
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
              )}
            </CardContent>
          </Card>

          {/* Weekly Hours */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Weekly Hours
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-5 w-9" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-10 w-28" />
                      <Skeleton className="h-10 w-28" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {DAYS.map((day, idx) => (
                    <div
                      key={day}
                      className="flex items-center gap-4 py-2"
                    >
                      <Switch
                        checked={dayConfigs[idx].enabled}
                        onCheckedChange={(checked) =>
                          updateDay(idx, { enabled: checked })
                        }
                      />
                      <span
                        className={`text-sm font-medium w-28 ${
                          !dayConfigs[idx].enabled
                            ? "text-muted-foreground"
                            : "text-foreground"
                        }`}
                      >
                        {day}
                      </span>

                      {dayConfigs[idx].enabled ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type="time"
                            value={dayConfigs[idx].startTime}
                            onChange={(e) =>
                              updateDay(idx, { startTime: e.target.value })
                            }
                            className="w-[120px]"
                          />
                          <span className="text-sm text-muted-foreground">to</span>
                          <Input
                            type="time"
                            value={dayConfigs[idx].endTime}
                            onChange={(e) =>
                              updateDay(idx, { endTime: e.target.value })
                            }
                            className="w-[120px]"
                          />
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          Unavailable
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {saveRulesMutation.isError && (
                <p className="text-sm text-destructive mt-4">
                  {saveRulesMutation.error?.message ?? "Failed to save changes."}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Schedule Overrides */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <CalendarOff className="h-4 w-4 text-muted-foreground" />
                Date Overrides
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOverrideDialogOpen(true)}
                disabled={!defaultSchedule}
              >
                <Plus className="h-4 w-4" />
                Add Override
              </Button>
            </CardHeader>
            <CardContent>
              {loadingOverrides ? (
                <div className="space-y-3">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-6 w-20" />
                      <Skeleton className="h-8 w-8" />
                    </div>
                  ))}
                </div>
              ) : overrides && overrides.length > 0 ? (
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
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2.5 text-xs text-destructive hover:text-destructive"
                        onClick={() => deleteOverrideMutation.mutate(override.id)}
                        disabled={deleteOverrideMutation.isPending}
                      >
                        {deleteOverrideMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No date overrides. Add one to block a specific day or set custom
                  hours.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

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
                  <Input
                    type="time"
                    value={overrideStartTime}
                    onChange={(e) => setOverrideStartTime(e.target.value)}
                    className="w-[120px]"
                  />
                  <span className="text-sm text-muted-foreground">to</span>
                  <Input
                    type="time"
                    value={overrideEndTime}
                    onChange={(e) => setOverrideEndTime(e.target.value)}
                    className="w-[120px]"
                  />
                </div>
              </div>
            )}

            {addOverrideMutation.isError && (
              <p className="text-sm text-destructive">
                {addOverrideMutation.error?.message ?? "Failed to add override."}
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
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Add Override
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

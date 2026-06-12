import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WorkflowScheduleConfig {
  frequency: "hourly" | "daily" | "weekly" | "monthly";
  time?: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  timezone?: string;
}

export interface WorkflowContactFilter {
  tagIds: string[];
  matchAllTags?: boolean;
}

export interface WorkflowTriggerConfig {
  schedule?: WorkflowScheduleConfig | null;
  contactFilter?: WorkflowContactFilter | null;
}

interface TagItem {
  id: string;
  name: string;
  color: string;
}

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

function timezoneOptions(): string[] {
  // Intl.supportedValuesOf is missing from the current TS lib target
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: "timeZone") => string[];
  };
  try {
    if (intl.supportedValuesOf) return intl.supportedValuesOf("timeZone");
  } catch {
    // fall through
  }
  return Array.from(new Set(["UTC", browserTimezone()]));
}

export function defaultSchedule(): WorkflowScheduleConfig {
  return {
    frequency: "daily",
    time: "09:00",
    timezone: browserTimezone(),
  };
}

export function describeSchedule(
  schedule: WorkflowScheduleConfig | null | undefined,
): string {
  if (!schedule) return "Schedule not set";
  const time = schedule.time ?? "09:00";
  switch (schedule.frequency) {
    case "hourly":
      return "Every hour";
    case "daily":
      return `Daily at ${time}`;
    case "weekly":
      return `Weekly on ${DAYS[schedule.dayOfWeek ?? 1]} at ${time}`;
    case "monthly":
      return `Monthly on day ${schedule.dayOfMonth ?? 1} at ${time}`;
    default:
      return "Schedule not set";
  }
}

export function describeContactFilter(
  filter: WorkflowContactFilter | null | undefined,
  tags: TagItem[],
): string {
  if (!filter) return "No contacts (single run)";
  if (filter.tagIds.length === 0) return "All contacts";
  const names = filter.tagIds
    .map((id) => tags.find((t) => t.id === id)?.name)
    .filter(Boolean);
  const joiner = filter.matchAllTags ? " and " : " or ";
  return `Contacts tagged ${names.join(joiner) || `${filter.tagIds.length} tag(s)`}`;
}

// ─── Editor ──────────────────────────────────────────────────────────────────

export function WorkflowTriggerConfigEditor({
  trigger,
  config,
  onChange,
  tags,
}: {
  trigger: string;
  config: WorkflowTriggerConfig;
  onChange: (config: WorkflowTriggerConfig) => void;
  tags: TagItem[];
}) {
  const schedule = config.schedule ?? defaultSchedule();
  const filter = config.contactFilter ?? null;
  const audienceMode = !filter ? "none" : filter.tagIds.length === 0 ? "all" : "tags";

  function setSchedule(patch: Partial<WorkflowScheduleConfig>) {
    onChange({ ...config, schedule: { ...schedule, ...patch } });
  }

  function setAudienceMode(mode: string) {
    if (mode === "none") {
      onChange({ ...config, contactFilter: null });
    } else if (mode === "all") {
      onChange({ ...config, contactFilter: { tagIds: [] } });
    } else {
      onChange({
        ...config,
        contactFilter: { tagIds: filter?.tagIds ?? [], matchAllTags: filter?.matchAllTags },
      });
    }
  }

  function toggleTag(tagId: string) {
    const current = filter?.tagIds ?? [];
    const next = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];
    onChange({
      ...config,
      contactFilter: { tagIds: next, matchAllTags: filter?.matchAllTags },
    });
  }

  return (
    <div className="space-y-5">
      {trigger === "scheduled" && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">Schedule</p>

          <div className="space-y-2">
            <Label htmlFor="schedule-frequency">Frequency</Label>
            <Select
              value={schedule.frequency}
              onValueChange={(val) =>
                setSchedule({ frequency: val as WorkflowScheduleConfig["frequency"] })
              }
            >
              <SelectTrigger id="schedule-frequency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hourly">Hourly</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {schedule.frequency === "weekly" && (
            <div className="space-y-2">
              <Label htmlFor="schedule-day-of-week">Day of Week</Label>
              <Select
                value={String(schedule.dayOfWeek ?? 1)}
                onValueChange={(val) => setSchedule({ dayOfWeek: Number(val) })}
              >
                <SelectTrigger id="schedule-day-of-week">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS.map((day, i) => (
                    <SelectItem key={day} value={String(i)}>
                      {day}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {schedule.frequency === "monthly" && (
            <div className="space-y-2">
              <Label htmlFor="schedule-day-of-month">Day of Month</Label>
              <Input
                id="schedule-day-of-month"
                type="number"
                min={1}
                max={28}
                value={schedule.dayOfMonth ?? 1}
                onChange={(e) => {
                  const day = parseInt(e.target.value, 10);
                  if (!Number.isNaN(day)) {
                    setSchedule({ dayOfMonth: Math.min(28, Math.max(1, day)) });
                  }
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                1–28 so the run never skips shorter months.
              </p>
            </div>
          )}

          {schedule.frequency !== "hourly" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="schedule-time">Time</Label>
                <Input
                  id="schedule-time"
                  type="time"
                  value={schedule.time ?? "09:00"}
                  onChange={(e) => setSchedule({ time: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="schedule-timezone">Timezone</Label>
                <Select
                  value={schedule.timezone ?? browserTimezone()}
                  onValueChange={(val) => setSchedule({ timezone: val })}
                >
                  <SelectTrigger id="schedule-timezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {timezoneOptions().map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz.split("_").join(" ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
      )}

      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium text-foreground">Contacts</p>
          <p className="text-[11px] text-muted-foreground">
            Who this workflow runs for each time it fires. One run is started per contact.
          </p>
        </div>

        <Select value={audienceMode} onValueChange={setAudienceMode}>
          <SelectTrigger id="audience-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No contacts (single run)</SelectItem>
            <SelectItem value="all">All contacts</SelectItem>
            <SelectItem value="tags">Contacts with tags</SelectItem>
          </SelectContent>
        </Select>

        {audienceMode === "tags" && (
          <div className="space-y-2">
            {tags.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                Create tags in the Contacts section first.
              </p>
            ) : (
              <div className="space-y-2">
                {tags.map((tag) => {
                  const selected = filter?.tagIds.includes(tag.id) ?? false;
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      className={`w-full flex items-center gap-3 rounded-[16px] border px-3 py-2.5 text-sm text-left transition-colors ${
                        selected ? "border-primary/40 bg-primary/5" : "hover:bg-accent"
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="flex-1 truncate">{tag.name}</span>
                      {selected && <Check className="h-4 w-4 text-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}

            {(filter?.tagIds.length ?? 0) > 1 && (
              <div className="flex items-center justify-between rounded-[16px] border px-3 py-2.5">
                <div>
                  <p className="text-sm text-foreground">Match all tags</p>
                  <p className="text-[11px] text-muted-foreground">
                    Contacts must have every selected tag, not just one.
                  </p>
                </div>
                <Switch
                  checked={filter?.matchAllTags ?? false}
                  onCheckedChange={(checked) =>
                    onChange({
                      ...config,
                      contactFilter: { tagIds: filter?.tagIds ?? [], matchAllTags: checked },
                    })
                  }
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

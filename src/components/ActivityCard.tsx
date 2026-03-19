import { CalendarCheck, FileText, CheckCircle2, XCircle, Loader2, Video, Calendar, Info, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface ActivityCardProps {
  type: "booking" | "form_response";
  name: string;
  email: string;
  title: string;
  status: string;
  date: string;
  startTime?: string;
  endTime?: string;
  timezone?: string;
  meetingUrl?: string | null;
  onClick: () => void;
  // Booking pending actions
  isPending?: boolean;
  onConfirm?: () => void;
  onDecline?: () => void;
  confirmLoading?: boolean;
  declineLoading?: boolean;
  // Form response actions
  onDelete?: () => void;
  deleteLoading?: boolean;
}

function statusVariant(status: string) {
  switch (status) {
    case "confirmed":
    case "completed":
      return "success" as const;
    case "cancelled":
    case "declined":
      return "destructive" as const;
    case "pending":
    case "in_progress":
      return "warning" as const;
    default:
      return "secondary" as const;
  }
}

export function getRelativeTime(startTime: string, endTime: string): { label: string; isHappening: boolean; isUpcoming: boolean; isPast: boolean } {
  const now = Date.now();
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();

  if (now >= start && now <= end) {
    return { label: "happening now", isHappening: true, isUpcoming: false, isPast: false };
  }

  if (now < start) {
    const diffMs = start - now;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    let label: string;
    if (diffMin < 1) label = "in less than a minute";
    else if (diffMin < 60) label = `in ${diffMin} min`;
    else if (diffHours < 24) label = `in ${diffHours}h`;
    else if (diffDays === 1) label = "tomorrow";
    else label = `in ${diffDays} days`;

    return { label, isHappening: false, isUpcoming: true, isPast: false };
  }

  const diffMs = now - end;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  let label: string;
  if (diffMin < 60) label = `${diffMin}m ago`;
  else if (diffHours < 24) label = `${diffHours}h ago`;
  else if (diffDays === 1) label = "yesterday";
  else label = `${diffDays}d ago`;

  return { label, isHappening: false, isUpcoming: false, isPast: true };
}

export function formatVerboseDate(dateStr: string, tz?: string): string {
  const date = new Date(dateStr);
  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: tz || undefined,
  });
  const dayStr = date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: tz || undefined,
  });

  let tzLabel = "";
  if (tz) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(date);
      const tzPart = parts.find((p) => p.type === "timeZoneName");
      if (tzPart) tzLabel = tzPart.value;
    } catch {
      tzLabel = tz;
    }
  }

  return tzLabel ? `${timeStr} · ${dayStr} · ${tzLabel}` : `${timeStr} · ${dayStr}`;
}

export function getGoogleCalendarDayUrl(dateStr: string): string {
  const date = new Date(dateStr);
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `https://calendar.google.com/calendar/r/day/${y}/${m}/${d}`;
}

export function isWithinOneHour(startTime: string): boolean {
  const diffMs = new Date(startTime).getTime() - Date.now();
  return diffMs <= 3600000;
}

export function ActivityCard({
  type,
  name,
  email,
  title,
  status,
  date,
  startTime,
  endTime,
  timezone,
  meetingUrl,
  onClick,
  isPending,
  onConfirm,
  onDecline,
  confirmLoading,
  declineLoading,
  onDelete,
  deleteLoading,
}: ActivityCardProps) {
  const Icon = type === "booking" ? CalendarCheck : FileText;
  const isBooking = type === "booking";
  const isConfirmed = status === "confirmed";
  const hasTimeInfo = !!(startTime && endTime);
  const relTime = hasTimeInfo ? getRelativeTime(startTime!, endTime!) : null;
  const showJoinCall = isConfirmed && hasTimeInfo && (relTime?.isHappening || (relTime?.isUpcoming && isWithinOneHour(startTime!)));
  const showSeeOnCalendar = isConfirmed && hasTimeInfo && !showJoinCall;

  return (
    <Card
      className="flex flex-col p-4 cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <div className="flex items-start gap-3 flex-1 min-h-0">
        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{name}</p>
          <p className="text-sm text-foreground truncate mt-0.5">{title}</p>
          {email && email !== name && <p className="text-xs text-muted-foreground truncate mt-0.5">{email}</p>}
          <p className="text-[11px] text-muted-foreground mt-1">
            {hasTimeInfo ? formatVerboseDate(startTime!, timezone) : formatVerboseDate(date, timezone)}
          </p>
        </div>

        {/* Status indicator */}
        {isConfirmed && relTime ? (
          <span
            className={`shrink-0 text-[11px] font-medium ${
              relTime.isHappening
                ? "text-amber-600 animate-pulse"
                : relTime.isUpcoming
                  ? "text-emerald-600"
                  : "text-muted-foreground"
            }`}
          >
            {relTime.label}
          </span>
        ) : (
          <Badge variant={statusVariant(status)} className="shrink-0 text-[10px]">
            {status}
          </Badge>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1.5 pt-3 mt-auto ml-12" onClick={(e) => e.stopPropagation()}>
        {/* Pending booking: Confirm + Decline */}
        {isBooking && isPending && onConfirm && onDecline ? (
          <>
            <Button
              variant="default"
              size="sm"
              className="h-7 px-2.5 text-xs flex-1"
              onClick={onConfirm}
              disabled={confirmLoading || declineLoading}
            >
              {confirmLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Confirm
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2.5 text-xs text-destructive hover:text-destructive"
              onClick={onDecline}
              disabled={confirmLoading || declineLoading}
            >
              {declineLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
              Decline
            </Button>
          </>
        ) : isBooking && showJoinCall ? (
          <>
            <Button
              variant="default"
              size="sm"
              className="h-7 px-2.5 text-xs flex-1"
              onClick={() => {
                if (meetingUrl) window.open(meetingUrl, "_blank");
              }}
              disabled={!meetingUrl}
            >
              <Video className="h-3.5 w-3.5" />
              Join meeting
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={onClick}
            >
              <Info className="h-3.5 w-3.5" />
              Details
            </Button>
          </>
        ) : isBooking && showSeeOnCalendar ? (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-xs flex-1"
              onClick={() => window.open(getGoogleCalendarDayUrl(startTime!), "_blank")}
            >
              <Calendar className="h-3.5 w-3.5" />
              See on calendar
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-xs flex-1"
              onClick={onClick}
            >
              <Info className="h-3.5 w-3.5" />
              Details
            </Button>
          </>
        ) : isBooking ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-xs w-full"
            onClick={onClick}
          >
            <Info className="h-3.5 w-3.5" />
            Details
          </Button>
        ) : (
          /* Form response: Details + Delete */
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-xs flex-1"
              onClick={onClick}
            >
              <Info className="h-3.5 w-3.5" />
              Details
            </Button>
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2.5 text-xs text-destructive hover:text-destructive"
                onClick={onDelete}
                disabled={deleteLoading}
              >
                {deleteLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Delete
              </Button>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

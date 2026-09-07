import { CalendarCheck, CalendarClock, FileText, CheckCircle2, XCircle, Video, Calendar, Info, Trash2 } from "lucide-react";
import { ActionsSheet } from "@/components/ActionsSheet";
import { Badge } from "@/components/ui/badge";
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
  const startDate = new Date(startTime);
  const start = startDate.getTime();
  const end = new Date(endTime).getTime();

  const timeStr = new Date(startTime).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const dateStr = startDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(startDate.getFullYear() !== new Date(now).getFullYear()
      ? { year: "numeric" as const }
      : {}),
  });

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
    else if (diffMin < 60) label = `${timeStr} (in ${diffMin} min)`;
    else if (diffHours < 24) {
      const remMin = diffMin % 60;
      label = remMin > 0
        ? `${timeStr} (in ${diffHours}h ${remMin}m)`
        : `${timeStr} (in ${diffHours}h)`;
    }
    else if (diffDays === 1) label = `tomorrow, ${timeStr}`;
    else label = `${dateStr}, ${timeStr}`;

    return { label, isHappening: false, isUpcoming: true, isPast: false };
  }

  const diffMs = now - end;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMs >= 86400000) {
    return {
      label: `${dateStr}, ${timeStr}`,
      isHappening: false,
      isUpcoming: false,
      isPast: true,
    };
  }

  let label: string;
  if (diffMin < 60) label = `${timeStr} (${diffMin}m ago)`;
  else {
    const remMin = diffMin % 60;
    label = remMin > 0
      ? `${timeStr} (${diffHours}h ${remMin}m ago)`
      : `${timeStr} (${diffHours}h ago)`;
  }

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
  const isBooking = type === "booking";
  const isPendingBooking = isBooking && (isPending ?? status === "pending");
  const isConfirmed = status === "confirmed";
  const hasTimeInfo = !!(startTime && endTime);
  const relTime = hasTimeInfo ? getRelativeTime(startTime!, endTime!) : null;
  const showJoinCall = isConfirmed && hasTimeInfo && (relTime?.isHappening || (relTime?.isUpcoming && isWithinOneHour(startTime!)));
  const showSeeOnCalendar = isConfirmed && hasTimeInfo && !showJoinCall;
  const Icon =
    type === "booking"
      ? isPendingBooking
        ? CalendarClock
        : CalendarCheck
      : FileText;
  const iconWrapperClass =
    type === "booking" && isPendingBooking
      ? "bg-amber-100"
      : "bg-primary/10";
  const iconClass =
    type === "booking" && isPendingBooking
      ? "text-amber-600"
      : "text-primary";

  const actionItems = [
    {
      id: "details",
      label: "Details",
      icon: Info,
      onClick,
    },
    ...(isBooking && isPendingBooking && onConfirm
      ? [{
          id: "confirm",
          label: confirmLoading ? "Confirming..." : "Confirm",
          icon: CheckCircle2,
          onClick: onConfirm,
          disabled: confirmLoading || declineLoading,
        }]
      : []),
    ...(isBooking && isPendingBooking && onDecline
      ? [{
          id: "decline",
          label: declineLoading ? "Declining..." : "Decline",
          icon: XCircle,
          onClick: onDecline,
          variant: "destructive" as const,
          disabled: confirmLoading || declineLoading,
        }]
      : []),
    ...(isBooking && showJoinCall
      ? [{
          id: "join",
          label: "Join meeting",
          icon: Video,
          onClick: () => {
            if (meetingUrl) window.open(meetingUrl, "_blank");
          },
          disabled: !meetingUrl,
        }]
      : []),
    ...(isBooking && showSeeOnCalendar
      ? [{
          id: "calendar",
          label: "See on calendar",
          icon: Calendar,
          onClick: () => window.open(getGoogleCalendarDayUrl(startTime!), "_blank"),
        }]
      : []),
    ...(!isBooking && onDelete
      ? [{
          id: "delete",
          label: deleteLoading ? "Deleting..." : "Delete",
          icon: Trash2,
          onClick: onDelete,
          variant: "destructive" as const,
          disabled: deleteLoading,
        }]
      : []),
  ];

  return (
    <Card
      className="flex cursor-pointer flex-col p-4 transition-shadow hover:border-primary/25"
      onClick={onClick}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${iconWrapperClass}`}>
          <Icon className={`h-4 w-4 ${iconClass}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold break-words text-foreground">{name}</p>
            <div className="-mr-1.5 -mt-1 shrink-0">
              <ActionsSheet items={actionItems} title="Activity" />
            </div>
          </div>
          {(isConfirmed || isPendingBooking) && relTime ? (
            <p
              className={`mt-0.5 text-xs font-medium ${relTime.isHappening
                ? "text-amber-600 animate-pulse"
                : relTime.isUpcoming
                  ? "text-emerald-600"
                  : "text-muted-foreground"
                }`}
            >
              {relTime.label}
            </p>
          ) : !isPendingBooking ? (
            <Badge variant={statusVariant(status)} className="mt-1 text-[10px]">
              {status}
            </Badge>
          ) : null}
          <p className="mt-1 text-sm break-words text-foreground">{title}</p>
          {email && email !== name && (
            <p className="mt-0.5 text-xs break-all text-muted-foreground">{email}</p>
          )}
          <p className="mt-1 text-[11px] text-pretty text-muted-foreground">
            {hasTimeInfo ? formatVerboseDate(startTime!, timezone) : formatVerboseDate(date, timezone)}
          </p>
        </div>
      </div>
    </Card>
  );
}

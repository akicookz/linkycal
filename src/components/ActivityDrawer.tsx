import { useState, useEffect } from "react";
import { CalendarCheck, CalendarClock, FileText, Loader, XCircle, CheckCircle2, Video, Calendar, ClipboardCopy, Trash2, Check } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyableField } from "@/components/CopyableField";
import { getRelativeTime, formatVerboseDate, getGoogleCalendarDayUrl, isWithinOneHour } from "@/components/ActivityCard";
import { copyToClipboard } from "@/lib/utils";

function countryFlag(code: string): string {
  try {
    return String.fromCodePoint(
      ...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
    );
  } catch {
    return "";
  }
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

function formResponseStatusLabel(status: FormResponseDetail["status"]): string {
  switch (status) {
    case "completed":
      return "Completed";
    case "in_progress":
      return "In Progress";
    case "abandoned":
      return "Abandoned";
    default:
      return status;
  }
}

function formatDrawerDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDrawerTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDrawerDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Types for the drawer data
interface BookingDetail {
  booking: {
    id: string;
    name: string;
    email: string;
    notes: string | null;
    startTime: string;
    endTime: string;
    timezone: string;
    status: string;
    country: string | null;
    city: string | null;
    expiresAt: string | null;
    formResponseId: string | null;
    meetingUrl?: string | null;
    createdAt: string;
  };
  eventTypeName: string;
  formFields: Array<{ label: string; type: string; value: string }>;
}

interface FormResponseValueDetail {
  id: string;
  responseId: string;
  fieldId: string;
  value: string | null;
  fileUrl: string | null;
  fieldLabel: string;
  fieldType: string;
  displayValue: string;
}

interface FormResponseDetail {
  id: string;
  formId: string;
  currentStepIndex: number;
  status: "in_progress" | "completed" | "abandoned";
  respondentEmail: string | null;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
  values: FormResponseValueDetail[];
}

interface ActivityDrawerProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  item: {
    id: string;
    type: "booking" | "form_response";
    name: string;
    email: string;
    title: string;
    status: string;
    date: string;
    country?: string | null;
    city?: string | null;
    // Booking fields
    startTime?: string;
    endTime?: string;
    timezone?: string;
    meetingUrl?: string | null;
    formResponseId?: string | null;
    eventTypeId?: string;
    // Form response fields
    formId?: string | null;
  } | null;
  onConfirm?: (id: string) => void;
  onDecline?: (id: string) => void;
  onCancel?: (id: string) => void;
  onDeleteFormResponse?: (id: string) => void;
  confirmLoading?: boolean;
  declineLoading?: boolean;
  cancelLoading?: boolean;
  deleteLoading?: boolean;
}

export function ActivityDrawer({
  open,
  onClose,
  projectId,
  item,
  onConfirm,
  onDecline,
  onCancel,
  onDeleteFormResponse,
  confirmLoading,
  declineLoading,
  cancelLoading,
  deleteLoading,
}: ActivityDrawerProps) {
  const [detail, setDetail] = useState<BookingDetail | null>(null);
  const [formDetail, setFormDetail] = useState<FormResponseDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  useEffect(() => {
    if (!open || !item) {
      setDetail(null);
      setFormDetail(null);
      return;
    }

    setLoading(true);

    if (item.type === "booking") {
      fetch(`/api/projects/${projectId}/bookings/${item.id}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setDetail(data as BookingDetail);
        })
        .finally(() => setLoading(false));
    } else {
      if (!item.formId) {
        setLoading(false);
        return;
      }

      fetch(`/api/projects/${projectId}/forms/${item.formId}/responses/${item.id}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.response) setFormDetail(data.response as FormResponseDetail);
        })
        .catch(() => { })
        .finally(() => setLoading(false));
    }
  }, [open, item, projectId]);

  if (!item) return null;

  const isBooking = item.type === "booking";
  const country = detail?.booking?.country ?? item.country;
  const city = detail?.booking?.city ?? item.city;

  // Booking time logic
  const bookingStartTime = detail?.booking?.startTime ?? item.startTime;
  const bookingEndTime = detail?.booking?.endTime ?? item.endTime;
  const bookingMeetingUrl = detail?.booking?.meetingUrl ?? item.meetingUrl;
  const bookingStatus = detail?.booking?.status ?? item.status;
  const isPendingBooking = isBooking && bookingStatus === "pending";
  const Icon =
    isBooking
      ? isPendingBooking
        ? CalendarClock
        : CalendarCheck
      : FileText;
  const iconWrapperClass =
    isBooking && isPendingBooking ? "bg-amber-100" : "bg-primary/10";
  const iconClass =
    isBooking && isPendingBooking ? "text-amber-600" : "text-primary";
  const hasTimeInfo = !!(bookingStartTime && bookingEndTime);
  const relTime = hasTimeInfo ? getRelativeTime(bookingStartTime!, bookingEndTime!) : null;
  const isConfirmed = bookingStatus === "confirmed";
  const showJoinCall = isConfirmed && hasTimeInfo && (relTime?.isHappening || (relTime?.isUpcoming && isWithinOneHour(bookingStartTime!)));
  const showSeeOnCalendar = isConfirmed && hasTimeInfo && !showJoinCall;

  // Copy all form fields
  function handleCopyAllFields() {
    const fields = formDetail?.values ?? [];
    if (fields.length === 0) return;
    const text = fields.map((field) => `${field.fieldLabel}: ${field.displayValue}`).join("\n");
    copyToClipboard(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${iconWrapperClass}`}>
              <Icon className={`h-5 w-5 ${iconClass}`} />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="truncate">{item.name}</SheetTitle>
              <SheetDescription className="truncate">
                {isBooking ? item.email : `Submitted ${formatDrawerDateTime(formDetail?.createdAt ?? item.date)}`}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 flex-1">
            <Loader className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4">
            {/* Location */}
            {(country || city) && (
              <p className="text-sm text-muted-foreground">
                {country ? countryFlag(country) + " " : ""}
                {[city, country].filter(Boolean).join(", ")}
              </p>
            )}

            {/* Relative time badge for active bookings */}
            {isBooking && (isConfirmed || isPendingBooking) && relTime && (
              <div
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${relTime.isHappening
                    ? "bg-amber-50 text-amber-700"
                    : relTime.isUpcoming
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-muted text-muted-foreground"
                  }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${relTime.isHappening ? "bg-amber-500 animate-pulse" : relTime.isUpcoming ? "bg-emerald-500" : "bg-muted-foreground"
                  }`} />
                {relTime.label}
              </div>
            )}

            {/* Details section */}
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Details</p>
              {isBooking && detail ? (
                <>
                  <CopyableField label="Event" value={detail.eventTypeName} />
                  <CopyableField label="Date" value={formatDrawerDate(detail.booking.startTime)} />
                  <CopyableField label="Time" value={`${formatDrawerTime(detail.booking.startTime)} – ${formatDrawerTime(detail.booking.endTime)}`} />
                  <CopyableField label="Timezone" value={detail.booking.timezone} />
                  <div className="py-1.5">
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Status</p>
                    <Badge variant={statusVariant(bookingStatus)}>{bookingStatus}</Badge>
                  </div>
                  {detail.booking.notes && <CopyableField label="Notes" value={detail.booking.notes} />}
                </>
              ) : isBooking ? (
                <>
                  <CopyableField label="Event" value={item.title} />
                  {item.startTime && <CopyableField label="Date" value={formatVerboseDate(item.startTime, item.timezone)} />}
                  <div className="py-1.5">
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Status</p>
                    <Badge variant={statusVariant(bookingStatus)}>{bookingStatus}</Badge>
                  </div>
                </>
              ) : (
                <>
                  <CopyableField label="Form" value={item.title} />
                  <CopyableField
                    label="Submitted"
                    value={formatDrawerDateTime(formDetail?.createdAt ?? item.date)}
                  />
                  <div className="py-1.5">
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Status</p>
                    <Badge variant={statusVariant(formDetail?.status ?? item.status)}>
                      {formDetail ? formResponseStatusLabel(formDetail.status) : item.status}
                    </Badge>
                  </div>
                </>
              )}
            </div>

            {/* Form Responses section (booking with form) */}
            {isBooking && detail?.formFields && detail.formFields.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Form Responses</p>
                {detail.formFields.map((field, i) => (
                  <CopyableField key={i} label={field.label} value={field.value} />
                ))}
              </div>
            )}

            {/* Form response fields */}
            {!isBooking && formDetail?.values && formDetail.values.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Responses</p>
                {formDetail.values.map((value) => (
                  <CopyableField
                    key={value.id}
                    label={value.fieldLabel}
                    value={value.displayValue}
                  />
                ))}
              </div>
            )}

            {!isBooking && formDetail && formDetail.values.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No submitted field values for this response.
              </p>
            )}

            {!isBooking &&
              formDetail?.metadata != null &&
              typeof formDetail.metadata === "object" &&
              Object.keys(formDetail.metadata as Record<string, unknown>).length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Metadata</p>
                  <pre className="text-xs text-muted-foreground bg-muted rounded-[12px] p-3 overflow-x-auto">
                    {JSON.stringify(formDetail.metadata, null, 2)}
                  </pre>
                </div>
              )}
          </div>
        )}

        {/* Sticky action bar at bottom */}
        {!loading && (
          <div className="pt-4 mt-auto space-y-2">
            {isBooking && isPendingBooking && onConfirm && onDecline && (
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => onConfirm(item.id)}
                  disabled={confirmLoading || declineLoading}
                  className="flex-1"
                >
                  {confirmLoading ? <Loader className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Confirm Booking
                </Button>
                <Button
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => onDecline(item.id)}
                  disabled={confirmLoading || declineLoading}
                >
                  {declineLoading ? <Loader className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                  Decline
                </Button>
              </div>
            )}

            {isBooking && showJoinCall && (
              <div className="flex items-center gap-2">
                <Button
                  className="flex-1"
                  onClick={() => {
                    if (bookingMeetingUrl) window.open(bookingMeetingUrl, "_blank");
                  }}
                  disabled={!bookingMeetingUrl}
                >
                  <Video className="h-4 w-4" />
                  Join meeting
                </Button>
                {onCancel && (
                  <Button
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onCancel(item.id)}
                    disabled={cancelLoading}
                  >
                    {cancelLoading ? <Loader className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                    Cancel
                  </Button>
                )}
              </div>
            )}

            {isBooking && showSeeOnCalendar && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => window.open(getGoogleCalendarDayUrl(bookingStartTime!), "_blank")}
                >
                  <Calendar className="h-4 w-4" />
                  See on calendar
                </Button>
                {onCancel && (
                  <Button
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onCancel(item.id)}
                    disabled={cancelLoading}
                  >
                    {cancelLoading ? <Loader className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                    Cancel
                  </Button>
                )}
              </div>
            )}

            {/* Form response actions: Copy all + Delete */}
            {!isBooking && (
              <div className="flex items-center gap-2">
                {formDetail?.values && formDetail.values.length > 0 && (
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleCopyAllFields}
                  >
                    {copiedAll ? <Check className="h-4 w-4 text-emerald-600" /> : <ClipboardCopy className="h-4 w-4" />}
                    {copiedAll ? "Copied" : "Copy all fields"}
                  </Button>
                )}
                {onDeleteFormResponse && (
                  <Button
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onDeleteFormResponse(item.id)}
                    disabled={deleteLoading}
                  >
                    {deleteLoading ? <Loader className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Delete
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

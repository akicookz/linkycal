import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Check,
  Loader2,
  AlertCircle,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface BookingTheme {
  primaryBg?: string;
  primaryText?: string;
  backgroundColor?: string;
  textColor?: string;
  borderRadius?: number;
  fontFamily?: string;
  backgroundImage?: string;
  bannerImage?: string;
}

interface EventType {
  id: string;
  name: string;
  slug: string;
  duration: number;
  description: string | null;
  location: string | null;
  color: string;
}

interface ProjectInfo {
  id: string;
  name: string;
  slug: string;
  settings?: { theme?: BookingTheme };
}

interface TimeSlot {
  start: string;
  end: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatTime(iso: string, tz: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  });
}

function formatDateFull(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateShort(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayMondayBased(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Monday = 0, Sunday = 6
}

function getGmtOffset(tz: string): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    });
    const parts = formatter.formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value || "";
  } catch {
    return "";
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PublicBooking() {
  const { projectSlug, eventSlug } = useParams<{
    projectSlug: string;
    eventSlug: string;
  }>();
  const [searchParams] = useSearchParams();

  // Preselect date from ?date= query param or default to today
  const initialDate = useMemo(() => {
    const paramDate = searchParams.get("date");
    if (paramDate && /^\d{4}-\d{2}-\d{2}$/.test(paramDate)) {
      const parsed = new Date(paramDate + "T00:00:00");
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (parsed >= today) return paramDate;
    }
    return toDateString(new Date());
  }, [searchParams]);

  // step: 1 = date+time, 2 = details, 3 = confirmed
  const [step, setStep] = useState(1);
  const [selectedDate, setSelectedDate] = useState<string | null>(initialDate);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date(initialDate + "T00:00:00");
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [descExpanded, setDescExpanded] = useState(false);

  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestNotes, setGuestNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingStatus, setBookingStatus] = useState<"confirmed" | "pending">("confirmed");

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const gmtOffset = useMemo(() => getGmtOffset(timezone), [timezone]);
  const containerRef = useRef<HTMLDivElement>(null);

  // ─── Fetch event type ──────────────────────────────────────────────────

  const { data, isLoading, isError } = useQuery<{
    project: ProjectInfo;
    eventType: EventType;
  }>({
    queryKey: ["public-event-type", projectSlug, eventSlug],
    queryFn: async () => {
      const res = await fetch(`/api/v1/event-types/${projectSlug}/${eventSlug}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!projectSlug && !!eventSlug,
  });

  const eventType = data?.eventType;
  const project = data?.project;
  const theme = project?.settings?.theme;

  // ─── Apply theme ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!theme) return;
    if (theme.backgroundColor) document.body.style.backgroundColor = theme.backgroundColor;

    // Load custom font
    if (theme.fontFamily && theme.fontFamily !== "Satoshi") {
      const fontUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(theme.fontFamily)}:wght@400;500;600;700&display=swap`;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = fontUrl;
      document.head.appendChild(link);
      return () => {
        document.body.style.backgroundColor = "";
        link.remove();
      };
    }

    return () => { document.body.style.backgroundColor = ""; };
  }, [theme]);

  // ─── Fetch slots ───────────────────────────────────────────────────────

  const { data: slotsData, isLoading: loadingSlots } = useQuery<{ slots: TimeSlot[] }>({
    queryKey: ["public-slots", projectSlug, eventSlug, selectedDate, timezone],
    queryFn: async () => {
      const params = new URLSearchParams({
        date: selectedDate!,
        timezone,
        eventTypeSlug: eventSlug!,
      });
      const res = await fetch(`/api/v1/availability/${projectSlug}?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch slots");
      return res.json();
    },
    enabled: !!selectedDate && !!projectSlug && !!eventSlug,
  });

  const slots = slotsData?.slots ?? [];

  // Reset slot when date changes
  useEffect(() => { setSelectedSlot(null); }, [selectedDate]);

  // ─── Calendar ──────────────────────────────────────────────────────────

  const calendarDays = useMemo(() => {
    const { year, month } = currentMonth;
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayMondayBased(year, month);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days: Array<{ day: number; dateStr: string; disabled: boolean; isToday: boolean }> = [];

    for (let i = 0; i < firstDay; i++) {
      days.push({ day: 0, dateStr: "", disabled: true, isToday: false });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const dateStr = toDateString(date);
      days.push({
        day: d,
        dateStr,
        disabled: date < today,
        isToday: date.getTime() === today.getTime(),
      });
    }

    return days;
  }, [currentMonth]);

  const canGoPrev = (() => {
    const now = new Date();
    return currentMonth.year > now.getFullYear() ||
      (currentMonth.year === now.getFullYear() && currentMonth.month > now.getMonth());
  })();

  // ─── Actions ───────────────────────────────────────────────────────────

  function handleDateSelect(dateStr: string) {
    setSelectedDate(dateStr);
    setSelectedSlot(null);
  }

  async function handleBook() {
    if (!selectedSlot || !guestName || !guestEmail || !eventSlug || !projectSlug) return;
    setSubmitting(true);
    setBookingError(null);

    try {
      const res = await fetch("/api/v1/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectSlug, eventTypeSlug: eventSlug,
          startTime: selectedSlot.start,
          name: guestName, email: guestEmail,
          phone: guestPhone || undefined,
          notes: guestNotes || undefined,
          timezone,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || "Failed to book");
      }
      const result = await res.json().catch(() => ({})) as { booking?: { status?: string } };
      setBookingStatus(result.booking?.status === "pending" ? "pending" : "confirmed");
      setStep(3);
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  function handleBookAnother() {
    setStep(1);
    setSelectedDate(null);
    setSelectedSlot(null);
    setGuestName(""); setGuestEmail(""); setGuestPhone(""); setGuestNotes("");
    setBookingError(null);
  }

  const primaryStyle = theme?.primaryBg
    ? { backgroundColor: theme.primaryBg, color: theme.primaryText || "#fff", borderColor: theme.primaryBg }
    : undefined;

  // ─── Loading / Error ───────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !eventType || !project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-sm">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto" />
          <h1 className="text-xl font-semibold">Booking page not found</h1>
          <p className="text-sm text-muted-foreground">
            This booking link may be invalid or the event type has been disabled.
          </p>
          <Button variant="outline" asChild><Link to="/">Go to LinkyCal</Link></Button>
        </div>
      </div>
    );
  }

  // ─── Description truncation ────────────────────────────────────────────

  const desc = eventType.description || "";
  const descIsLong = desc.length > 120;
  const descDisplay = descIsLong && !descExpanded ? desc.slice(0, 120) + "..." : desc;

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className="min-h-screen flex flex-col items-center justify-center px-4 py-8 sm:py-12"
      style={{
        backgroundColor: theme?.backgroundColor || "var(--background)",
        color: theme?.textColor || "var(--foreground)",
        fontFamily: theme?.fontFamily ? `"${theme.fontFamily}", sans-serif` : undefined,
        ...(theme?.backgroundImage ? {
          backgroundImage: `url(${theme.backgroundImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        } : {}),
      }}
    >
      <div
        className="w-full transition-[max-width] duration-500 ease-in-out"
        style={{ maxWidth: step === 1 ? "880px" : "560px" }}
      >
        {/* ─── Banner ─── */}
        {theme?.bannerImage && (
          <div
            className="w-full h-36 sm:h-44 rounded-t-[16px] bg-cover bg-center mb-0"
            style={{ backgroundImage: `url(${theme.bannerImage})` }}
          />
        )}

        {/* ─── Card ─── */}
        <div
           className={cn(
            "bg-card p-6 sm:p-8 transition-all duration-500",
            theme?.bannerImage ? "rounded-b-[16px] border-x border-b border-border" : "rounded-[16px] border border-border",
          )}
          style={{ borderRadius: theme?.bannerImage ? undefined : theme?.borderRadius ? `${theme.borderRadius}px` : undefined }}
        >

          {/* ─── Event Header (step 1 only) ─── */}
          {step === 1 && (
            <div className="mb-6">
              <h1 className="text-xl font-semibold tracking-tight">{eventType.name}</h1>

              {desc && (
                <div className="mt-1.5">
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                    {descDisplay}
                  </p>
                  {descIsLong && (
                    <button
                      onClick={() => setDescExpanded(!descExpanded)}
                      className="text-sm text-muted-foreground underline decoration-dotted underline-offset-2 mt-0.5 hover:text-foreground transition-colors"
                    >
                      {descExpanded ? "Show less" : "Show more"}
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center gap-4 mt-3 text-[13px] text-muted-foreground">
                {eventType.location && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                    {eventType.location}
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {eventType.duration} mins
                </span>
              </div>
            </div>
          )}

          {/* ─── Step 1: Date + Time ─── */}
          {step === 1 && (
            <div>
              <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
                {/* Calendar */}
                <div>
                  <h2 className="text-base font-semibold">Select Date and Time</h2>
                  <p className="text-[13px] text-muted-foreground flex items-center gap-1.5 mt-1 mb-4">
                    <Globe className="w-3.5 h-3.5" />
                    {timezone} ({gmtOffset})
                  </p>
                  {/* Month nav */}
                  <div className="flex items-center justify-between mb-2">
                    <button
                      onClick={() =>
                        setCurrentMonth((prev) => ({
                          year: prev.month === 0 ? prev.year - 1 : prev.year,
                          month: prev.month === 0 ? 11 : prev.month - 1,
                        }))
                      }
                      disabled={!canGoPrev}
                      className="p-1 rounded-md hover:bg-accent transition-colors disabled:opacity-30 text-muted-foreground"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-sm font-medium">
                      {MONTHS[currentMonth.month]} {currentMonth.year}
                    </span>
                    <button
                      onClick={() =>
                        setCurrentMonth((prev) => ({
                          year: prev.month === 11 ? prev.year + 1 : prev.year,
                          month: prev.month === 11 ? 0 : prev.month + 1,
                        }))
                      }
                      className="p-1 rounded-md hover:bg-accent transition-colors text-muted-foreground"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Day headers */}
                  <div className="grid grid-cols-7">
                    {DAYS.map((d) => (
                      <div key={d} className="text-center text-[12px] font-medium text-muted-foreground py-1.5">
                        {d}
                      </div>
                    ))}
                  </div>

                  {/* Day grid */}
                  <div className="grid grid-cols-7">
                    {calendarDays.map((day, i) =>
                      day.day === 0 ? (
                        <div key={`e-${i}`} />
                      ) : (
                        <button
                          key={day.dateStr}
                          disabled={day.disabled}
                          onClick={() => handleDateSelect(day.dateStr)}
                          className={cn(
                            "aspect-square flex items-center justify-center text-sm transition-all rounded-full",
                            day.disabled && "text-muted-foreground/30 cursor-not-allowed",
                            !day.disabled && "hover:bg-accent cursor-pointer",
                            day.isToday && !day.disabled && "font-bold",
                            selectedDate === day.dateStr && !primaryStyle &&
                              "bg-primary text-primary-foreground",
                          )}
                          style={selectedDate === day.dateStr && primaryStyle ? primaryStyle : undefined}
                        >
                          {day.day}
                        </button>
                      ),
                    )}
                  </div>
                </div>

                {/* Time Slots */}
                <div className="min-h-[280px]">
                  {!selectedDate ? (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                      Select a date to see available times
                    </div>
                  ) : loadingSlots ? (
                    <div>
                      <div className="h-4 w-28 bg-muted rounded mb-3 animate-pulse" />
                      <div className="grid grid-cols-2 gap-1.5">
                        {Array.from({ length: 8 }).map((_, i) => (
                          <div
                            key={i}
                            className="h-10 rounded-lg border border-border bg-muted/50 animate-pulse"
                          />
                        ))}
                      </div>
                    </div>
                  ) : slots.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                      No available times on this date
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-medium mb-3">
                        {formatDateShort(new Date(selectedDate + "T00:00:00"))}
                      </p>
                      <div className="grid grid-cols-2 gap-1.5 max-h-[340px] overflow-y-auto pr-1">
                        {slots.map((slot) => {
                          const isSelected = selectedSlot?.start === slot.start;
                          return (
                            <button
                              key={slot.start}
                              onClick={() => setSelectedSlot(slot)}
                              className={cn(
                                "py-2.5 px-3 rounded-lg border text-[13px] font-medium text-center transition-all",
                                isSelected && !primaryStyle && "bg-primary text-primary-foreground border-primary",
                                !isSelected && "border-border hover:border-foreground/20 hover:bg-accent",
                              )}
                              style={isSelected && primaryStyle ? primaryStyle : undefined}
                            >
                              {formatTime(slot.start, timezone)} - {formatTime(slot.end, timezone)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom nav */}
              <div className="flex items-center justify-end mt-6">
                <Button
                  disabled={!selectedSlot}
                  onClick={() => setStep(2)}
                  className="px-10"
                  style={primaryStyle}
                >
                  Next
                </Button>
              </div>
            </div>
          )}

          {/* ─── Step 2: Details ─── */}
          {step === 2 && (
            <div>
              <h2 className="text-base font-semibold mb-1">Your Information</h2>

              {/* Summary */}
              {selectedSlot && selectedDate && (
                <p className="text-[13px] text-muted-foreground mb-5">
                  {formatDateShort(new Date(selectedDate + "T00:00:00"))} &middot;{" "}
                  {formatTime(selectedSlot.start, timezone)} - {formatTime(selectedSlot.end, timezone)} &middot;{" "}
                  {eventType.duration} mins
                </p>
              )}

              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Name *</Label>
                  <Input id="name" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Your full name" />
                </div>
                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input id="email" type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="you@example.com" />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" type="tel" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} placeholder="+1 (555) 000-0000" />
                </div>
                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <textarea
                    id="notes"
                    value={guestNotes}
                    onChange={(e) => setGuestNotes(e.target.value)}
                    placeholder="Anything you'd like us to know"
                    className="w-full min-h-[80px] rounded-[12px] border border-input bg-white px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none resize-vertical"
                  />
                </div>

                {bookingError && (
                  <p className="text-sm text-destructive">{bookingError}</p>
                )}
              </div>

              {/* Bottom nav */}
              <div className="flex items-center justify-between mt-6">
                <button
                  onClick={() => setStep(1)}
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Back
                </button>
                <Button
                  disabled={!guestName || !guestEmail || submitting}
                  onClick={handleBook}
                  className="px-10"
                  style={primaryStyle}
                >
                  {submitting ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Booking...</>
                  ) : (
                    "Confirm Booking"
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* ─── Step 3: Success ─── */}
          {step === 3 && (
            <div className="text-center py-8">
              {bookingStatus === "pending" ? (
                <>
                  <div className="mx-auto w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mb-4">
                    <Clock className="h-7 w-7 text-amber-600" />
                  </div>
                  <h2 className="text-xl font-semibold mb-1">Request submitted</h2>
                  <p className="text-sm text-muted-foreground mb-5">
                    Your booking request has been submitted. You&apos;ll receive an email once the host confirms.
                  </p>
                </>
              ) : (
                <>
                  <div className="mx-auto w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
                    <Check className="h-7 w-7 text-emerald-600" />
                  </div>
                  <h2 className="text-xl font-semibold mb-1">Booking confirmed!</h2>
                  <p className="text-sm text-muted-foreground mb-5">
                    You&apos;re booked with {project.name}.
                  </p>
                </>
              )}

              {selectedSlot && selectedDate && (
                <div className="rounded-lg border border-border p-4 text-left mb-5 mx-auto max-w-sm">
                  <p className="text-sm font-semibold">{eventType.name}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatDateFull(new Date(selectedDate + "T00:00:00"))}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatTime(selectedSlot.start, timezone)} - {formatTime(selectedSlot.end, timezone)}
                  </p>
                  {eventType.location && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                      <MapPin className="h-3.5 w-3.5" /> {eventType.location}
                    </p>
                  )}
                </div>
              )}

              <p className="text-xs text-muted-foreground mb-5">
                {bookingStatus === "pending"
                  ? `A confirmation will be sent to ${guestEmail} once approved.`
                  : `A confirmation email has been sent to ${guestEmail}.`}
              </p>

              <Button variant="outline" size="sm" onClick={handleBookAnother}>
                Book another time
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Footer — bottom right */}
      <div className="fixed bottom-4 right-4">
        <a
          href="https://linkycal.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors bg-background/80 backdrop-blur-sm border border-border rounded-full px-3 py-1.5"
        >
          <Logo size="sm" iconOnly />
          Made with LinkyCal
        </a>
      </div>
    </div>
  );
}

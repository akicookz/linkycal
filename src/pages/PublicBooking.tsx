import {
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { usePostHog } from "@posthog/react";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Check,
  Loader,
  AlertCircle,
  Globe,
  ArrowLeft,
  ArrowRight,
  CalendarCheck as CalendarCheckIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  FocusedFieldInput,
  type FocusedFieldData,
} from "@/components/FocusedFieldInput";
import {
  FormExperience,
  type FormExperienceCheckpoint,
} from "@/components/FormExperience";
import { Logo } from "@/components/Logo";
import { SEOHead } from "@/components/SEOHead";
import {
  buildFormExperienceModel,
  getAllFormFields,
  getContactMappedFieldIds,
  shouldCollectDetailsWithForm,
  type ContactMappedFieldIds,
  type FormExperienceForm,
} from "@/lib/form-experience";
import { buildBookingPrefill, parseQueryString } from "@/lib/form-prefill";
import { track } from "@/lib/track";
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
  settings?: { collectDetailsWithForm?: boolean } | null;
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

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

const EMPTY_FIELD_ID_SET: ReadonlySet<string> = new Set();

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const BOOKING_NAME_FIELD: FocusedFieldData = {
  id: "name",
  type: "text",
  label: "Name",
  description: null,
  placeholder: "Your full name",
  required: true,
  options: null,
};

const BOOKING_EMAIL_FIELD: FocusedFieldData = {
  id: "email",
  type: "email",
  label: "Email",
  description: null,
  placeholder: "you@example.com",
  required: true,
  options: null,
};

const BOOKING_NOTES_FIELD: FocusedFieldData = {
  id: "notes",
  type: "textarea",
  label: "Notes",
  description: null,
  placeholder: "Anything you'd like us to know",
  required: false,
  options: null,
};

function truncateMetaDescription(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 180) return normalized;
  return `${normalized.slice(0, 177).trimEnd()}...`;
}

function formatTime(iso: string, tz: string, format: "12h" | "24h" = "12h"): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: format === "24h" ? "2-digit" : "numeric",
    minute: "2-digit",
    hour12: format === "12h",
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
    weekday: "long",
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
  const { projectSlug, slug: eventSlug } = useParams<{
    projectSlug: string;
    slug: string;
  }>();
  const [searchParams] = useSearchParams();
  const posthog = usePostHog();

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

  // step: 1 = date+time, 2 = details, 3 = attached form, 4 = confirmed
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
  const [guestNotes, setGuestNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingStatus, setBookingStatus] = useState<"confirmed" | "pending">("confirmed");
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  // Spam prevention
  const [spamField, setSpamField] = useState("");
  const [formToken] = useState(() => btoa(String(Date.now())));

  const [timeFormat, setTimeFormat] = useState<"12h" | "24h">("12h");

  // Mobile step splitting: date → time as separate views
  const [mobileSubStep, setMobileSubStep] = useState<"date" | "time">("date");
  const [mobileSlideDir, setMobileSlideDir] = useState<"left" | "right">("left");
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 767px)").matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const goMobileSubStep = useCallback((target: "date" | "time") => {
    setMobileSlideDir(target === "time" ? "left" : "right");
    setMobileSubStep(target);
  }, []);

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const gmtOffset = useMemo(() => getGmtOffset(timezone), [timezone]);
  const containerRef = useRef<HTMLDivElement>(null);

  // ─── Fetch event type ──────────────────────────────────────────────────

  const { data, isLoading, isError } = useQuery<{
    project: ProjectInfo;
    owner: { name: string; image: string | null } | null;
    eventType: EventType;
    bookingForm: FormExperienceForm | null;
    availableDays: number[];
    canHideBranding?: boolean;
  }>({
    queryKey: ["public-event-type", projectSlug, eventSlug, timezone],
    queryFn: async () => {
      const params = new URLSearchParams({ timezone });
      const res = await fetch(
        `/api/v1/event-types/${projectSlug}/${eventSlug}?${params.toString()}`,
      );
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!projectSlug && !!eventSlug,
  });

  const eventType = data?.eventType;
  const descRef = useRef<HTMLParagraphElement>(null);
  const [descIsLong, setDescIsLong] = useState(false);
  useLayoutEffect(() => {
    const el = descRef.current;
    if (el && !descExpanded) {
      setDescIsLong(el.scrollHeight > el.clientHeight + 1);
    }
  }, [eventType?.description, descExpanded]);
  const project = data?.project;
  const owner = data?.owner;
  const themeFromProject = project?.settings?.theme;
  const themeOverride = useMemo<BookingTheme | undefined>(() => {
    const raw = searchParams.get("theme");
    if (!raw) return undefined;
    try {
      return JSON.parse(atob(raw)) as BookingTheme;
    } catch {
      return undefined;
    }
  }, [searchParams]);
  const theme = useMemo<BookingTheme | undefined>(() => {
    if (!themeOverride && !themeFromProject) return undefined;
    return { ...(themeFromProject ?? {}), ...(themeOverride ?? {}) };
  }, [themeFromProject, themeOverride]);
  const isEmbedded = searchParams.get("embed") === "1";
  const hideBanner = searchParams.get("hide_banner") === "1";
  const showBanner = !!theme?.bannerImage && !hideBanner;
  const hideBrandingRequested = searchParams.get("hide_branding") === "1";
  const showBranding = !(hideBrandingRequested && data?.canHideBranding);
  const bookingForm = data?.bookingForm;
  const availableDays = data?.availableDays ?? [];

  const mappedFields = useMemo<ContactMappedFieldIds>(
    () => (bookingForm ? getContactMappedFieldIds(bookingForm) : {}),
    [bookingForm],
  );

  const mergeDetails = useMemo(
    () => shouldCollectDetailsWithForm(eventType?.settings, bookingForm),
    [eventType?.settings, bookingForm],
  );

  const didPrefill = useRef(false);
  useEffect(() => {
    if (!data) return;
    if (didPrefill.current) return;
    didPrefill.current = true;

    const fields = bookingForm ? getAllFormFields(bookingForm) : [];
    const prefill = buildBookingPrefill({
      fields: fields.map((field) => ({
        id: field.id,
        type: field.type,
        options: field.options,
      })),
      query: parseQueryString(window.location.search),
      nameFieldId: mappedFields.nameFieldId,
      emailFieldId: mappedFields.emailFieldId,
    });

    if (Object.keys(prefill.formValues).length > 0) {
      setFormValues((previous) => ({ ...prefill.formValues, ...previous }));
    }
    const { guestName: seededName, guestEmail: seededEmail, guestNotes: seededNotes } = prefill;
    if (seededName) setGuestName((previous) => previous || seededName);
    if (seededEmail) setGuestEmail((previous) => previous || seededEmail);
    if (seededNotes && !mergeDetails) setGuestNotes((previous) => previous || seededNotes);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const mappedFieldIds = useMemo(() => {
    const ids = new Set<string>();
    if (mappedFields.nameFieldId) ids.add(mappedFields.nameFieldId);
    if (mappedFields.emailFieldId) ids.add(mappedFields.emailFieldId);
    return ids;
  }, [mappedFields]);

  const excludedFieldIds = mergeDetails ? EMPTY_FIELD_ID_SET : mappedFieldIds;
  const requiredFieldIds = mergeDetails ? mappedFieldIds : undefined;

  const bookingFormModel = useMemo(
    () =>
      bookingForm
        ? buildFormExperienceModel({
            form: bookingForm,
            values: formValues,
            surface: "booking",
            excludedFieldIds,
            requiredFieldIds,
          })
        : null,
    [bookingForm, formValues, excludedFieldIds, requiredFieldIds],
  );
  const hasBookingFormContent = bookingFormModel?.hasDisplayContent ?? false;
  const confirmationStep = 4;

  useEffect(() => {
    const hiddenFieldIds = bookingFormModel?.hiddenValueFieldIds;
    if (!hiddenFieldIds?.length) return;

    setFormValues((previous) => {
      let next = previous;
      for (const id of hiddenFieldIds) {
        if (!Object.prototype.hasOwnProperty.call(previous, id)) continue;
        if (next === previous) next = { ...previous };
        delete next[id];
      }
      return next;
    });
  }, [bookingFormModel]);

  useEffect(() => {
    if (mappedFields.nameFieldId && formValues[mappedFields.nameFieldId] && !guestName) {
      setGuestName(formValues[mappedFields.nameFieldId]);
    }
    if (mappedFields.emailFieldId && formValues[mappedFields.emailFieldId] && !guestEmail) {
      setGuestEmail(formValues[mappedFields.emailFieldId]);
    }
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mappedFields.nameFieldId && guestName) {
      setFormValues((prev) => {
        if (prev[mappedFields.nameFieldId!] === guestName) return prev;
        return { ...prev, [mappedFields.nameFieldId!]: guestName };
      });
    }
    if (mappedFields.emailFieldId && guestEmail) {
      setFormValues((prev) => {
        if (prev[mappedFields.emailFieldId!] === guestEmail) return prev;
        return { ...prev, [mappedFields.emailFieldId!]: guestEmail };
      });
    }
  }, [guestName, guestEmail, mappedFields]);

  // ─── Track page view ────────────────────────────────────────────────────

  useEffect(() => {
    if (projectSlug && eventSlug && eventType) {
      track("page_view", { projectSlug, resourceSlug: eventSlug });
    }
  }, [projectSlug, eventSlug, eventType]);

  // ─── Apply theme ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!theme) return;
    if (!isEmbedded && theme.backgroundColor) {
      document.body.style.backgroundColor = theme.backgroundColor;
    }

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
  }, [theme, isEmbedded]);

  // ─── Embed: post height to parent + transparent background ─────────────
  useEffect(() => {
    if (!isEmbedded) return;
    const prevBodyBg = document.body.style.backgroundColor;
    const prevHtmlBg = document.documentElement.style.backgroundColor;
    document.body.style.backgroundColor = "transparent";
    document.documentElement.style.backgroundColor = "transparent";

    let last = 0;
    const sendHeight = () => {
      const h = document.documentElement.scrollHeight;
      if (h !== last) {
        last = h;
        window.parent.postMessage({ type: "lc-height", height: h }, "*");
      }
    };
    sendHeight();
    const ro = new ResizeObserver(sendHeight);
    ro.observe(document.documentElement);
    window.addEventListener("resize", sendHeight);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sendHeight);
      document.body.style.backgroundColor = prevBodyBg;
      document.documentElement.style.backgroundColor = prevHtmlBg;
    };
  }, [isEmbedded]);

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
        disabled: date < today || (availableDays.length > 0 && !availableDays.includes(date.getDay())),
        isToday: date.getTime() === today.getTime(),
      });
    }

    return days;
  }, [currentMonth, availableDays]);

  const canGoPrev = (() => {
    const now = new Date();
    return currentMonth.year > now.getFullYear() ||
      (currentMonth.year === now.getFullYear() && currentMonth.month > now.getMonth());
  })();

  // ─── Actions ───────────────────────────────────────────────────────────

  function handleDateSelect(dateStr: string) {
    setSelectedDate(dateStr);
    setSelectedSlot(null);
    if (isMobile) goMobileSubStep("time");
  }

  function setBookingFormValue(fieldId: string, value: string) {
    setFormValues((previous) => ({ ...previous, [fieldId]: value }));
    const currentField = bookingFormModel?.allFields.find(
      (field) => field.id === fieldId,
    );
    if (currentField?.contactMapping === "name") setGuestName(value);
    if (currentField?.contactMapping === "email") setGuestEmail(value);
  }

  function clearBookingFormFields(fieldIds: string[]) {
    setFormValues((previous) => {
      const next = { ...previous };
      for (const id of fieldIds) delete next[id];
      return next;
    });
  }

  async function handleBook(): Promise<boolean> {
    if (!selectedSlot || !eventSlug || !projectSlug) {
      return false;
    }
    if (!guestName || !guestEmail) {
      setBookingError("Please provide your name and email");
      return false;
    }
    setSubmitting(true);
    setBookingError(null);

    try {
      const payload: Record<string, unknown> = {
        projectSlug, eventTypeSlug: eventSlug,
        startTime: selectedSlot.start,
        name: guestName, email: guestEmail,
        // Merged mode has no Notes input, so never attach notes the booker
        // couldn't see (e.g. seeded from a crafted ?notes= link).
        notes: mergeDetails ? undefined : guestNotes || undefined,
        timezone,
        website: spamField,
        _token: formToken,
      };

      if (bookingForm) {
        const merged = { ...formValues };
        if (mappedFields.nameFieldId) merged[mappedFields.nameFieldId] = guestName;
        if (mappedFields.emailFieldId) merged[mappedFields.emailFieldId] = guestEmail;
        if (Object.keys(merged).length > 0) {
          payload.formFields = merged;
        }
      }

      const res = await fetch("/api/v1/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || "Failed to book");
      }
      const result = await res.json().catch(() => ({})) as { booking?: { status?: string } };
      const status = result.booking?.status === "pending" ? "pending" : "confirmed";
      setBookingStatus(status);
      posthog?.capture(status === "pending" ? "booking_requested" : "booking_confirmed", {
        project_slug: projectSlug,
        event_slug: eventSlug,
        event_name: eventType?.name,
        duration: eventType?.duration,
        start_time: selectedSlot.start,
      });
      setStep(confirmationStep);
      return true;
    } catch (caught) {
      setBookingError(caught instanceof Error ? caught.message : "Something went wrong");
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function checkpointBookingForm(
    checkpoint: FormExperienceCheckpoint,
  ): Promise<boolean> {
    if (!checkpoint.isFinal) return true;
    return handleBook();
  }

  const honeypotInput = (
    <div className="sr-only" aria-hidden="true">
      <label htmlFor="website">Website</label>
      <input
        id="website"
        type="text"
        name="website"
        autoComplete="url"
        tabIndex={-1}
        value={spamField}
        onChange={(e) => setSpamField(e.target.value)}
      />
    </div>
  );

  const primaryColorStyle: React.CSSProperties | undefined = theme?.primaryBg
    ? { backgroundColor: theme.primaryBg, color: theme.primaryText || "#fff", borderColor: theme.primaryBg }
    : undefined;
  const primaryStyle: React.CSSProperties | undefined = (primaryColorStyle || theme?.borderRadius != null)
    ? {
        ...(primaryColorStyle ?? {}),
        ...(theme?.borderRadius != null ? { borderRadius: `${theme.borderRadius}px` } : {}),
      }
    : undefined;
  const switcherContainerRadius = theme?.borderRadius != null
    ? `${Math.max(6, Math.round(theme.borderRadius * 0.625))}px`
    : undefined;
  const switcherButtonRadius = theme?.borderRadius != null
    ? `${Math.max(4, Math.round(theme.borderRadius * 0.5))}px`
    : undefined;

  // ─── Loading / Error ───────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader className="h-8 w-8 animate-spin text-muted-foreground" />
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
          <Button variant="outline" asChild><Link to="/"><ArrowRight className="h-4 w-4" />Go to LinkyCal</Link></Button>
        </div>
      </div>
    );
  }

  // ─── Description truncation ────────────────────────────────────────────

  const desc = eventType.description || "";
  const seoDescription = truncateMetaDescription(
    desc ||
      `Book a ${eventType.duration}-minute ${eventType.name} with ${project.name}.`,
  );
  const seoImage = theme?.bannerImage || theme?.backgroundImage || "/og-image.png";
  const seoCanonical =
    projectSlug && eventSlug ? `/${projectSlug}/${eventSlug}` : undefined;

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className={isEmbedded
        ? "w-full flex justify-center"
        : "min-h-screen flex flex-col items-center justify-center px-4 py-8 sm:py-12"}
      style={isEmbedded ? {
        color: theme?.textColor || undefined,
        fontFamily: theme?.fontFamily ? `"${theme.fontFamily}", sans-serif` : undefined,
        ...(theme?.primaryBg ? {
          ["--theme-primary" as string]: theme.primaryBg,
          ["--primary" as string]: theme.primaryBg,
          ["--primary-foreground" as string]: theme.primaryText || "#ffffff",
          ["--ring" as string]: theme.primaryBg,
        } : {}),
        ...(theme?.borderRadius != null ? { ["--theme-radius" as string]: `${theme.borderRadius}px` } : {}),
      } : {
        backgroundColor: theme?.backgroundColor || "var(--background)",
        color: theme?.textColor || "var(--foreground)",
        fontFamily: theme?.fontFamily ? `"${theme.fontFamily}", sans-serif` : undefined,
        ...(theme?.primaryBg ? {
          ["--theme-primary" as string]: theme.primaryBg,
          ["--primary" as string]: theme.primaryBg,
          ["--primary-foreground" as string]: theme.primaryText || "#ffffff",
          ["--ring" as string]: theme.primaryBg,
        } : {}),
        ...(theme?.borderRadius != null ? { ["--theme-radius" as string]: `${theme.borderRadius}px` } : {}),
        ...(theme?.backgroundImage ? {
          backgroundImage: `url(${theme.backgroundImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        } : {}),
      }}
    >
      <SEOHead
        title={`Book ${eventType.name}`}
        description={seoDescription}
        image={seoImage}
        imageAlt={`${eventType.name} booking page preview`}
        canonical={seoCanonical}
        noIndex={isEmbedded}
      />

      <div
        className="w-full transition-[max-width] duration-500 ease-in-out"
        style={{ maxWidth: step === 1 ? "880px" : "680px" }}
      >
        {/* ─── Banner ─── */}
        {showBanner && (
          <div
            className="w-full h-36 sm:h-44 rounded-t-[16px] bg-cover bg-center mb-0"
            style={{ backgroundImage: `url(${theme!.bannerImage})` }}
          />
        )}

        {/* ─── Card ─── */}
        <div
          className={cn(
            "relative bg-card p-6 sm:p-8 transition-all duration-500",
            showBanner ? "rounded-b-[16px]" : "rounded-[16px]",
          )}
          style={{ borderRadius: showBanner ? undefined : theme?.borderRadius ? `${theme.borderRadius}px` : undefined }}
        >

          {/* ─── Owner Avatar (always visible) ─── */}
          {owner && (
            <div
              className={cn(
                "relative z-10",
                showBanner ? "-mt-14 mb-4" : "mb-4",
              )}
            >
              {owner.image ? (
                <img
                  src={owner.image}
                  alt={owner.name}
                  className={cn(
                    "h-16 w-16 rounded-full object-cover",
                    showBanner && "ring-4 ring-white",
                  )}
                />
              ) : (
                <div
                  className={cn(
                    "h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-lg font-semibold text-primary",
                    showBanner && "ring-4 ring-white",
                  )}
                >
                  {owner.name?.charAt(0)?.toUpperCase() ?? "?"}
                </div>
              )}
            </div>
          )}

          {/* ─── Event Header (step 1 only) ─── */}
          {step === 1 && (
            <div className="mb-6">
              <h1 className="text-xl font-semibold tracking-tight">{eventType.name}</h1>

              {desc && (
                <div className="mt-1.5">
                  <p
                    ref={descRef}
                    className={cn(
                      "text-sm text-muted-foreground leading-relaxed whitespace-pre-line",
                      !descExpanded && "line-clamp-3",
                    )}
                  >
                    {desc}
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
              {/* Desktop: side-by-side layout (unchanged) */}
              <div className={cn("grid gap-6", isMobile ? "" : "grid-cols-[280px_1fr]")}>
                {/* Calendar — hidden on mobile when viewing time slots */}
                {(!isMobile || mobileSubStep === "date") && (
                  <div
                    className={cn(isMobile && "animate-mobile-slide-in")}
                    style={isMobile ? { "--slide-from": mobileSlideDir === "right" ? "-100%" : "100%" } as React.CSSProperties : undefined}
                  >
                    <h2 className="text-base font-semibold">Select Date and Time</h2>
                    <p className="text-[13px] text-muted-foreground flex items-center gap-1.5 mt-1 mb-4">
                      <Globe className="w-3.5 h-3.5" />
                      {timezone} ({gmtOffset})
                    </p>
                    {/* Month nav */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm">
                        <span className="font-semibold">{MONTHS[currentMonth.month]}</span>{" "}
                        <span className="text-muted-foreground">{currentMonth.year}</span>
                      </span>
                      <div className="flex items-center gap-1">
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
                    </div>

                    {/* Day headers */}
                    <div className="grid grid-cols-7 gap-1.5 mb-1.5">
                      {DAYS.map((d) => (
                        <div key={d} className="text-center text-[11px] font-semibold tracking-wide text-muted-foreground py-1">
                          {d}
                        </div>
                      ))}
                    </div>

                    {/* Day grid */}
                    <div className="grid grid-cols-7 gap-1.5">
                      {calendarDays.map((day, i) => {
                        if (day.day === 0) return <div key={`e-${i}`} />;

                        const isSelected = selectedDate === day.dateStr;
                        const cellRadius = theme?.borderRadius
                          ? `${Math.round(theme.borderRadius * 0.6)}px`
                          : "12px";

                        return (
                          <button
                            key={day.dateStr}
                            disabled={day.disabled}
                            onClick={() => handleDateSelect(day.dateStr)}
                            className={cn(
                              "lc-themed-hover aspect-square flex flex-col items-center justify-center text-[14px] font-medium transition-all relative border border-transparent",
                              day.disabled && "text-muted-foreground/30 cursor-not-allowed",
                              !day.disabled && !isSelected && "bg-muted/50 cursor-pointer",
                              isSelected && !primaryColorStyle && "bg-primary text-primary-foreground shadow-sm",
                              isSelected && primaryColorStyle && "shadow-sm",
                            )}
                            data-selected={isSelected || undefined}
                            style={{
                              borderRadius: !day.disabled || isSelected ? cellRadius : undefined,
                              ...(isSelected && primaryColorStyle ? primaryColorStyle : {}),
                            }}
                          >
                            {day.day}
                            {day.isToday && !isSelected && !day.disabled && (
                              <span className="absolute bottom-1.5 h-1 w-1 rounded-full bg-current opacity-60" />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Mobile: "Select Time" button below calendar when a date is already selected */}
                    {isMobile && selectedDate && (
                      <Button
                        className="w-full mt-6 h-12 text-[15px]"
                        style={primaryStyle}
                        onClick={() => goMobileSubStep("time")}
                      >
                        <Clock className="h-4 w-4" />
                        Select Time
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )}

                {/* Time Slots — on mobile, shown as its own view */}
                {(!isMobile || mobileSubStep === "time") && (
                  <div
                    className={cn("min-h-[280px]", isMobile && "animate-mobile-slide-in")}
                    style={isMobile ? { "--slide-from": mobileSlideDir === "left" ? "100%" : "-100%" } as React.CSSProperties : undefined}
                  >

                    {!selectedDate ? (
                      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                        Select a date to see available times
                      </div>
                    ) : loadingSlots ? (
                      <div>
                        <div className="h-4 w-28 bg-muted rounded mb-3 animate-pulse" />
                        <div className={cn("grid gap-1.5", isMobile ? "grid-cols-1" : "grid-cols-2")}>
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
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm font-medium">
                            {formatDateShort(new Date(selectedDate + "T00:00:00"))}
                          </p>
                          <div
                            className="flex items-center bg-muted rounded-[10px] p-1 text-xs font-medium"
                            style={switcherContainerRadius ? { borderRadius: switcherContainerRadius } : undefined}
                          >
                            {(["12h", "24h"] as const).map((fmt) => (
                              <button
                                key={fmt}
                                onClick={() => setTimeFormat(fmt)}
                                className={cn(
                                  "px-3 py-1 rounded-[8px] transition-all",
                                  timeFormat === fmt
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground",
                                )}
                                style={switcherButtonRadius ? { borderRadius: switcherButtonRadius } : undefined}
                              >
                                {fmt}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className={cn("grid gap-1.5 max-h-[340px] overflow-y-auto pr-1", isMobile ? "grid-cols-1" : "grid-cols-2")}>
                          {slots.map((slot) => {
                            const isSelected = selectedSlot?.start === slot.start;
                            return (
                              <button
                                key={slot.start}
                                onClick={() => setSelectedSlot(slot)}
                                className={cn(
                                  "lc-themed-button lc-themed-hover py-2.5 px-3 border border-transparent text-[13px] font-medium text-center transition-all",
                                  isSelected && !primaryColorStyle && "bg-primary text-primary-foreground shadow-sm border-primary",
                                  !isSelected && "bg-muted/50",
                                )}
                                data-selected={isSelected || undefined}
                                style={isSelected && primaryColorStyle ? primaryColorStyle : undefined}
                              >
                                {formatTime(slot.start, timezone, timeFormat)} - {formatTime(slot.end, timezone, timeFormat)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Bottom nav — hide on mobile date step, show on time step & desktop */}
              {(!isMobile || mobileSubStep === "time") && (
                <div className="flex items-center justify-between mt-6">
                  {isMobile ? (
                    <button
                      onClick={() => goMobileSubStep("date")}
                      className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back
                    </button>
                  ) : (
                    <div />
                  )}
                  <Button
                    disabled={!selectedSlot}
                    onClick={() => setStep(mergeDetails ? 3 : 2)}
                    className="px-10"
                    style={primaryStyle}
                  >
                    Your details
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
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
                  {formatTime(selectedSlot.start, timezone, timeFormat)} - {formatTime(selectedSlot.end, timezone, timeFormat)} &middot;{" "}
                  {eventType.duration} mins
                </p>
              )}

              <div className="space-y-4">
                {honeypotInput}

                <div>
                  <Label htmlFor="name">Name *</Label>
                  <FocusedFieldInput
                    field={BOOKING_NAME_FIELD}
                    value={guestName}
                    onChange={setGuestName}
                    density="compact"
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email *</Label>
                  <FocusedFieldInput
                    field={BOOKING_EMAIL_FIELD}
                    value={guestEmail}
                    onChange={setGuestEmail}
                    density="compact"
                  />
                </div>
                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <FocusedFieldInput
                    field={BOOKING_NOTES_FIELD}
                    value={guestNotes}
                    onChange={setGuestNotes}
                    density="compact"
                  />
                </div>

                {bookingError && !hasBookingFormContent && (
                  <p className="text-sm text-destructive">{bookingError}</p>
                )}
              </div>

              {/* Bottom nav */}
              <div className="flex items-center justify-between mt-6">
                <button
                  onClick={() => {
                    setStep(1);
                    if (isMobile) goMobileSubStep("time");
                  }}
                  className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
                {hasBookingFormContent ? (
                  <Button
                    disabled={!guestName || !guestEmail}
                    onClick={() => setStep(3)}
                    className="px-10"
                    style={primaryStyle}
                  >
                    Next
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    disabled={!guestName || !guestEmail || submitting}
                    onClick={handleBook}
                    className="px-10"
                    style={primaryStyle}
                  >
                    {submitting ? (
                      <><Loader className="h-4 w-4 animate-spin" /> Booking...</>
                    ) : (
                      <><CalendarCheckIcon className="h-4 w-4" /> Confirm Booking</>
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* ─── Step 3: Attached Form ─── */}
          {step === 3 && bookingForm && (
            <FormExperience
              form={bookingForm}
              surface="booking"
              values={formValues}
              excludedFieldIds={excludedFieldIds}
              requiredFieldIds={requiredFieldIds}
              submitting={submitting}
              error={bookingError}
              theme={theme}
              honeypot={honeypotInput}
              onValueChange={setBookingFormValue}
              onClearFields={clearBookingFormFields}
              onCheckpoint={checkpointBookingForm}
              onExitBack={() => {
                if (mergeDetails) {
                  setStep(1);
                  if (isMobile) goMobileSubStep("time");
                } else {
                  setStep(2);
                }
              }}
            />
          )}

          {/* ─── Confirmation Step ─── */}
          {step === confirmationStep && (
            <div className="text-center py-8">
              {bookingStatus === "pending" ? (
                <>
                  <div className="mx-auto w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mb-4">
                    <Clock className="h-7 w-7 text-amber-600" />
                  </div>
                  <h2 className="text-xl font-semibold mb-1">Request submitted</h2>
                  <p className="text-sm text-muted-foreground mb-5">
                    You&apos;ll receive an email once the host confirms.
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
                    {formatTime(selectedSlot.start, timezone, timeFormat)} - {formatTime(selectedSlot.end, timezone, timeFormat)}
                  </p>
                  {eventType.location && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                      <MapPin className="h-3.5 w-3.5" /> {eventType.location}
                    </p>
                  )}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                {bookingStatus === "pending"
                  ? `A confirmation will be sent to ${guestEmail} once approved.`
                  : `A confirmation email has been sent to ${guestEmail}.`}
              </p>
            </div>
          )}
        </div>

        {/* ─── Footer: Powered by LinkyCal ─── */}
        {showBranding && (
          <div className="flex justify-center px-6 py-4 sm:px-8">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Powered by <Logo size="xs" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  CalendarCheck,
  XCircle,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

interface Booking {
  id: string;
  eventTypeId: string;
  contactId: string | null;
  name: string;
  email: string;
  notes: string | null;
  startTime: string;
  endTime: string;
  timezone: string;
  status: "confirmed" | "cancelled" | "rescheduled" | "pending" | "declined";
  expiresAt: string | null;
  formResponseId: string | null;
  createdAt: string;
}

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
  createdAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusVariant(status: Booking["status"]) {
  switch (status) {
    case "confirmed":
      return "success" as const;
    case "cancelled":
      return "destructive" as const;
    case "rescheduled":
      return "warning" as const;
    case "pending":
      return "warning" as const;
    case "declined":
      return "secondary" as const;
    default:
      return "secondary" as const;
  }
}

function formatRelativeTime(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return "expired";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Bookings() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") ?? "all";
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [declineDialogOpen, setDeclineDialogOpen] = useState(false);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);
  const [formResponseCache, setFormResponseCache] = useState<Record<string, Array<{ label: string; type: string; value: string }>>>({});
  const [loadingFormResponse, setLoadingFormResponse] = useState<string | null>(null);

  // Fetch bookings
  const {
    data: bookings,
    isLoading: loadingBookings,
    isError: errorBookings,
  } = useQuery<Booking[]>({
    queryKey: ["projects", projectId, "bookings"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/bookings`);
      if (!res.ok) throw new Error("Failed to fetch bookings");
      const data = await res.json();
      return data.bookings ?? [];
    },
    enabled: !!projectId,
  });

  // Fetch event types for names
  const { data: eventTypes } = useQuery<EventType[]>({
    queryKey: ["projects", projectId, "event-types"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/event-types`);
      if (!res.ok) throw new Error("Failed to fetch event types");
      const data = await res.json();
      return data.eventTypes ?? [];
    },
    enabled: !!projectId,
  });

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/projects/${projectId}/bookings/${id}/cancel`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to cancel booking");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "bookings"] });
      setCancelDialogOpen(false);
      setCancellingId(null);
    },
  });

  // Confirm mutation
  const confirmMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/projects/${projectId}/bookings/${id}/confirm`, {
        method: "PATCH",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to confirm booking");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "bookings"] });
    },
  });

  // Decline mutation
  const declineMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/projects/${projectId}/bookings/${id}/decline`, {
        method: "PATCH",
      });
      if (!res.ok) throw new Error("Failed to decline booking");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "bookings"] });
      setDeclineDialogOpen(false);
      setDecliningId(null);
    },
  });

  // Event type lookup
  const eventTypeMap = useMemo(() => {
    const map = new Map<string, string>();
    eventTypes?.forEach((et) => map.set(et.id, et.name));
    return map;
  }, [eventTypes]);

  // Sort bookings by start time descending
  const sortedBookings = useMemo(() => {
    if (!bookings) return [];
    return [...bookings].sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
    );
  }, [bookings]);

  // Pending count
  const pendingCount = useMemo(
    () => sortedBookings.filter((b) => b.status === "pending").length,
    [sortedBookings],
  );

  // Filter by tab
  const now = new Date();
  const filteredBookings = useMemo(() => {
    switch (activeTab) {
      case "pending":
        return sortedBookings.filter((b) => b.status === "pending");
      case "upcoming":
        return sortedBookings.filter(
          (b) => new Date(b.startTime) >= now && b.status === "confirmed",
        );
      case "past":
        return sortedBookings.filter(
          (b) => new Date(b.startTime) < now && b.status !== "cancelled" && b.status !== "declined",
        );
      case "cancelled":
        return sortedBookings.filter((b) => b.status === "cancelled" || b.status === "declined");
      default:
        return sortedBookings;
    }
  }, [sortedBookings, activeTab]);

  function openCancelDialog(id: string) {
    setCancellingId(id);
    setCancelDialogOpen(true);
  }

  async function toggleExpand(bookingId: string) {
    if (expandedBookingId === bookingId) {
      setExpandedBookingId(null);
      return;
    }
    setExpandedBookingId(bookingId);

    // Fetch form response if not cached
    if (!formResponseCache[bookingId]) {
      setLoadingFormResponse(bookingId);
      try {
        const res = await fetch(`/api/projects/${projectId}/bookings/${bookingId}/form-response`);
        if (res.ok) {
          const data = await res.json();
          setFormResponseCache((prev) => ({ ...prev, [bookingId]: data.fields ?? [] }));
        }
      } catch {
        // silently fail
      } finally {
        setLoadingFormResponse(null);
      }
    }
  }

  function openDeclineDialog(id: string) {
    setDecliningId(id);
    setDeclineDialogOpen(true);
  }

  function renderEmptyState() {
    const messages: Record<string, string> = {
      all: "Bookings will appear here once someone schedules with you.",
      pending: "No pending booking requests.",
      upcoming: "No upcoming bookings found.",
      past: "No past bookings found.",
      cancelled: "No cancelled or declined bookings.",
    };

    return (
      <div className="flex flex-col items-center justify-center py-16">
        <CalendarCheck className="h-10 w-10 text-muted-foreground mb-4" />
        <p className="text-sm font-medium text-foreground mb-1">No bookings</p>
        <p className="text-sm text-muted-foreground">
          {messages[activeTab] ?? messages.all}
        </p>
      </div>
    );
  }

  function renderTable() {
    if (filteredBookings.length === 0) return renderEmptyState();

    return (
      <div className="space-y-1 px-6">
          {filteredBookings.map((booking) => (
          <div key={booking.id}>
            <div className="flex items-center gap-4 py-3">
              {/* Avatar */}
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary shrink-0">
                {booking.name.charAt(0).toUpperCase()}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {booking.name}
                  <span className="font-normal text-muted-foreground ml-1.5 text-xs">{booking.email}</span>
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {eventTypeMap.get(booking.eventTypeId) ?? "Event"} &middot;{" "}
                  {formatDate(booking.startTime)}, {formatTime(booking.startTime)} – {formatTime(booking.endTime)}
                </p>
                {booking.status === "pending" && booking.expiresAt && (
                  <p className="text-[11px] text-amber-600 flex items-center gap-1 mt-0.5">
                    <Clock className="h-3 w-3" />
                    Expires in {formatRelativeTime(booking.expiresAt)}
                  </p>
                )}
              </div>

              {/* Status + Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={statusVariant(booking.status)}>
                  {booking.status}
                </Badge>

                {booking.formResponseId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => toggleExpand(booking.id)}
                  >
                    {expandedBookingId === booking.id ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                    Details
                  </Button>
                )}

                {booking.status === "pending" && (
                  <>
                    <Button
                      variant="default"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => confirmMutation.mutate(booking.id)}
                      disabled={confirmMutation.isPending}
                    >
                      {confirmMutation.isPending && confirmMutation.variables === booking.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      Confirm
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                      onClick={() => openDeclineDialog(booking.id)}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Decline
                    </Button>
                  </>
                )}

                {booking.status === "confirmed" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    onClick={() => openCancelDialog(booking.id)}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Cancel
                  </Button>
                )}
              </div>
            </div>

            {/* Expanded form response */}
            {expandedBookingId === booking.id && (
              <div className="pl-14 pb-3">
                {loadingFormResponse === booking.id ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading form data...
                  </div>
                ) : formResponseCache[booking.id]?.length ? (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 bg-muted/30 rounded-[12px] px-4 py-3">
                    {formResponseCache[booking.id].map((field, i) => (
                      <div key={i} className="min-w-0">
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{field.label}</p>
                        <p className="text-sm text-foreground truncate">{field.value || "—"}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-2">No form data available.</p>
                )}
              </div>
            )}

          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Bookings" description="View and manage your bookings" />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending" className="relative">
            Pending
            {pendingCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-semibold">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="past">Past</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        {/* Loading */}
        {loadingBookings && (
          <div className="space-y-1 px-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="py-3 flex items-center gap-4">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-6 w-20" />
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {errorBookings && (
          <div className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="h-10 w-10 text-destructive mb-4" />
            <p className="text-sm font-medium text-foreground mb-1">
              Failed to load bookings
            </p>
            <p className="text-sm text-muted-foreground">
              Please try refreshing the page.
            </p>
          </div>
        )}

        {/* Content */}
        {!loadingBookings && !errorBookings && renderTable()}
      </Card>

      {/* Cancel Confirmation Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel Booking</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this booking? The guest will be
              notified of the cancellation.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCancelDialogOpen(false);
                setCancellingId(null);
              }}
              disabled={cancelMutation.isPending}
            >
              Keep Booking
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancellingId && cancelMutation.mutate(cancellingId)}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Cancel Booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decline Confirmation Dialog */}
      <Dialog open={declineDialogOpen} onOpenChange={setDeclineDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Decline Booking Request</DialogTitle>
            <DialogDescription>
              Are you sure you want to decline this booking request? The guest
              will be notified.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeclineDialogOpen(false);
                setDecliningId(null);
              }}
              disabled={declineMutation.isPending}
            >
              Keep Request
            </Button>
            <Button
              variant="destructive"
              onClick={() => decliningId && declineMutation.mutate(decliningId)}
              disabled={declineMutation.isPending}
            >
              {declineMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

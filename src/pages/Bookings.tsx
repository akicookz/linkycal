import { useState, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  CalendarCheck,
  Loader,
  AlertCircle,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
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
import { ActivityCard } from "@/components/ActivityCard";
import { ActivityDrawer } from "@/components/ActivityDrawer";
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
  meetingUrl: string | null;
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

// ─── Component ───────────────────────────────────────────────────────────────

export default function Bookings() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") ?? "all";
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [declineDialogOpen, setDeclineDialogOpen] = useState(false);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [declineMessage, setDeclineMessage] = useState("");
  const [activeTab, setActiveTab] = useState(initialTab);
  const [drawerItem, setDrawerItem] = useState<Booking | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

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
        method: "PATCH",
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
    mutationFn: async ({ id, notify, reason }: { id: string; notify: boolean; reason?: string }) => {
      const res = await fetch(`/api/projects/${projectId}/bookings/${id}/decline`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notify, reason: reason || undefined }),
      });
      if (!res.ok) throw new Error("Failed to decline booking");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "bookings"] });
      setDeclineDialogOpen(false);
      setDecliningId(null);
      setDeclineMessage("");
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

      {/* Loading */}
      {loadingBookings && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[160px] rounded-[20px]" />
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
      {!loadingBookings && !errorBookings && (
        <>
          {filteredBookings.length === 0 ? (
            renderEmptyState()
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredBookings.map((booking) => (
                <ActivityCard
                  key={booking.id}
                  type="booking"
                  name={booking.name}
                  email={booking.email}
                  title={eventTypeMap.get(booking.eventTypeId) ?? "Event"}
                  status={booking.status}
                  date={booking.createdAt}
                  startTime={booking.startTime}
                  endTime={booking.endTime}
                  timezone={booking.timezone}
                  meetingUrl={booking.meetingUrl}
                  onClick={() => { setDrawerItem(booking); setDrawerOpen(true); }}
                  isPending={booking.status === "pending"}
                  onConfirm={() => confirmMutation.mutate(booking.id)}
                  onDecline={() => openDeclineDialog(booking.id)}
                  confirmLoading={confirmMutation.isPending && confirmMutation.variables === booking.id}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Drawer */}
      <ActivityDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setDrawerItem(null); }}
        projectId={projectId!}
        item={drawerItem ? {
          id: drawerItem.id,
          type: "booking",
          name: drawerItem.name,
          email: drawerItem.email,
          title: eventTypeMap.get(drawerItem.eventTypeId) ?? "Event",
          status: drawerItem.status,
          date: drawerItem.createdAt,
          country: null,
          city: null,
          startTime: drawerItem.startTime,
          endTime: drawerItem.endTime,
          timezone: drawerItem.timezone,
          meetingUrl: drawerItem.meetingUrl,
          formResponseId: drawerItem.formResponseId,
          eventTypeId: drawerItem.eventTypeId,
        } : null}
        onConfirm={(id) => confirmMutation.mutate(id)}
        onDecline={(id) => { setDrawerOpen(false); openDeclineDialog(id); }}
        onCancel={(id) => { setDrawerOpen(false); openCancelDialog(id); }}
        confirmLoading={confirmMutation.isPending}
      />

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
                <Loader className="h-4 w-4 animate-spin" />
              )}
              Cancel Booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decline Booking Dialog */}
      <Dialog open={declineDialogOpen} onOpenChange={(open) => {
        setDeclineDialogOpen(open);
        if (!open) { setDecliningId(null); setDeclineMessage(""); }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Decline Booking Request</DialogTitle>
            <DialogDescription>
              Optionally include a message to the guest explaining why.
            </DialogDescription>
          </DialogHeader>
          <textarea
            className="w-full rounded-[12px] bg-muted/50 px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            rows={3}
            placeholder="Optional message to the guest..."
            value={declineMessage}
            onChange={(e) => setDeclineMessage(e.target.value)}
            disabled={declineMutation.isPending}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => decliningId && declineMutation.mutate({ id: decliningId, notify: false })}
              disabled={declineMutation.isPending}
            >
              {declineMutation.isPending && !declineMutation.variables?.notify && (
                <Loader className="h-4 w-4 animate-spin" />
              )}
              Decline Silently
            </Button>
            <Button
              variant="destructive"
              onClick={() => decliningId && declineMutation.mutate({ id: decliningId, notify: true, reason: declineMessage || undefined })}
              disabled={declineMutation.isPending}
            >
              {declineMutation.isPending && declineMutation.variables?.notify && (
                <Loader className="h-4 w-4 animate-spin" />
              )}
              Decline & Notify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

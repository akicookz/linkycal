import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  CalendarCheck,
  CalendarRange,
  ClipboardList,
  Users,
  Plus,
  ArrowRight,
  AlertCircle,
  Loader,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

interface Booking {
  id: string;
  eventTypeId: string;
  contactId: string | null;
  name: string;
  email: string;
  phone: string | null;
  notes: string | null;
  startTime: string;
  endTime: string;
  timezone: string;
  status: "confirmed" | "cancelled" | "rescheduled";
  createdAt: string;
}

interface Form {
  id: string;
  name: string;
  slug: string;
  status: "draft" | "active" | "archived";
}

interface Contact {
  id: string;
  name: string;
  email: string | null;
}

interface ActivityItem {
  id: string;
  type: "booking" | "form_response";
  name: string;
  email: string;
  title: string;
  status: string;
  createdAt: string;
  country?: string | null;
  city?: string | null;
  startTime?: string;
  endTime?: string;
  timezone?: string;
  eventTypeId?: string;
  formResponseId?: string | null;
  expiresAt?: string | null;
  formId?: string | null;
  meetingUrl?: string | null;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { projectId } = useParams<{ projectId: string }>();

  // Drawer state
  const [drawerItem, setDrawerItem] = useState<ActivityItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const {
    data: eventTypes,
    isLoading: loadingEventTypes,
    isError: errorEventTypes,
  } = useQuery<EventType[]>({
    queryKey: ["projects", projectId, "event-types"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/event-types`);
      if (!res.ok) throw new Error("Failed to fetch event types");
      const data = await res.json();
      return data.eventTypes ?? [];
    },
    enabled: !!projectId,
  });

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

  const {
    data: activityItems,
    isLoading: loadingActivity,
    isError: errorActivity,
  } = useQuery<ActivityItem[]>({
    queryKey: ["projects", projectId, "activity"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/activity/recent`);
      if (!res.ok) throw new Error("Failed to fetch activity");
      const data = await res.json();
      return data.items ?? [];
    },
    enabled: !!projectId,
  });

  const {
    data: forms,
    isLoading: loadingForms,
  } = useQuery<Form[]>({
    queryKey: ["projects", projectId, "forms"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/forms`);
      if (!res.ok) throw new Error("Failed to fetch forms");
      const data = await res.json();
      return data.forms ?? [];
    },
    enabled: !!projectId,
  });

  const {
    data: contacts,
    isLoading: loadingContacts,
  } = useQuery<Contact[]>({
    queryKey: ["projects", projectId, "contacts"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/contacts`);
      if (!res.ok) throw new Error("Failed to fetch contacts");
      const data = await res.json();
      return data.contacts ?? [];
    },
    enabled: !!projectId,
  });

  // ─── Mutations ───────────────────────────────────────────────────────────

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
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "activity"] });
    },
  });

  const [declineDialogOpen, setDeclineDialogOpen] = useState(false);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [declineMessage, setDeclineMessage] = useState("");

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
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "activity"] });
      setDeclineDialogOpen(false);
      setDecliningId(null);
      setDeclineMessage("");
    },
  });

  const deleteFormResponseMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/projects/${projectId}/form-responses/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete form response");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "activity"] });
      setDrawerOpen(false);
      setDrawerItem(null);
    },
  });

  // ─── Derived State ──────────────────────────────────────────────────────

  const isLoading = loadingEventTypes || loadingBookings || loadingForms || loadingContacts;
  const hasError = errorEventTypes || errorBookings;

  const activeEventTypes = eventTypes?.filter((e) => e.enabled) ?? [];
  const activeForms = forms?.filter((f) => f.status === "active") ?? [];
  const totalBookings = bookings?.length ?? 0;
  const totalContacts = contacts?.length ?? 0;

  const stats = [
    {
      label: "Total Bookings",
      value: totalBookings,
      icon: CalendarCheck,
      loading: loadingBookings,
    },
    {
      label: "Active Event Types",
      value: activeEventTypes.length,
      icon: CalendarRange,
      loading: loadingEventTypes,
    },
    {
      label: "Active Forms",
      value: activeForms.length,
      icon: ClipboardList,
      loading: loadingForms,
    },
    {
      label: "Contacts",
      value: totalContacts,
      icon: Users,
      loading: loadingContacts,
    },
  ];

  // Map activity item to the shape expected by ActivityDrawer
  function toDrawerItem(item: ActivityItem) {
    return {
      id: item.id,
      type: item.type,
      name: item.name,
      email: item.email,
      title: item.title,
      status: item.status,
      date: item.createdAt,
      country: item.country,
      city: item.city,
      startTime: item.startTime,
      endTime: item.endTime,
      timezone: item.timezone,
      meetingUrl: item.meetingUrl,
      formResponseId: item.formResponseId,
      eventTypeId: item.eventTypeId,
      formId: item.formId,
    };
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Welcome back! Here's an overview of your project."
      >
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button asChild variant="outline" size="sm" className="flex-1 sm:flex-none">
            <Link to={`/app/projects/${projectId}/forms/new`}>
              <Plus className="h-4 w-4" />
              Create Form
            </Link>
          </Button>
          <Button asChild size="sm" className="flex-1 sm:flex-none">
            <Link to={`/app/projects/${projectId}/event-types`}>
              <Plus className="h-4 w-4" />
              Create Event Type
            </Link>
          </Button>
        </div>
      </PageHeader>

      {/* Stat Cards */}
      <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {stat.loading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-semibold">{stat.value}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CalendarCheck className="h-4 w-4 text-muted-foreground" />
            Recent Activity
          </CardTitle>
          {activityItems && activityItems.length > 0 && (
            <Link
              to={`/app/projects/${projectId}/bookings`}
              className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              View all
              <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </CardHeader>
        <CardContent>
          {loadingActivity || isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-[160px] rounded-[20px]" />
              ))}
            </div>
          ) : errorActivity || hasError ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <AlertCircle className="h-8 w-8 mb-2" />
              <p className="text-sm">Failed to load recent activity.</p>
            </div>
          ) : !activityItems || activityItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <CalendarCheck className="h-10 w-10 text-muted-foreground mb-4" />
              <p className="text-sm font-medium text-foreground mb-1">
                No activity yet
              </p>
              <p className="text-sm text-muted-foreground">
                Bookings and form responses will appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {activityItems.map((item) => (
                <ActivityCard
                  key={`${item.type}-${item.id}`}
                  type={item.type}
                  name={item.name}
                  email={item.email}
                  title={item.title}
                  status={item.status}
                  date={item.createdAt}
                  startTime={item.startTime}
                  endTime={item.endTime}
                  timezone={item.timezone}
                  meetingUrl={item.meetingUrl}
                  onClick={() => {
                    setDrawerItem(item);
                    setDrawerOpen(true);
                  }}
                  isPending={item.type === "booking" && item.status === "pending"}
                  onConfirm={
                    item.type === "booking" && item.status === "pending"
                      ? () => confirmMutation.mutate(item.id)
                      : undefined
                  }
                  onDecline={
                    item.type === "booking" && item.status === "pending"
                      ? () => { setDecliningId(item.id); setDeclineDialogOpen(true); }
                      : undefined
                  }
                  confirmLoading={confirmMutation.isPending && confirmMutation.variables === item.id}
                  declineLoading={declineMutation.isPending && declineMutation.variables?.id === item.id}
                  onDelete={
                    item.type === "form_response"
                      ? () => deleteFormResponseMutation.mutate(item.id)
                      : undefined
                  }
                  deleteLoading={deleteFormResponseMutation.isPending && deleteFormResponseMutation.variables === item.id}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity Drawer */}
      <ActivityDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setDrawerItem(null);
        }}
        projectId={projectId ?? ""}
        item={drawerItem ? toDrawerItem(drawerItem) : null}
        onConfirm={(id) => confirmMutation.mutate(id)}
        onDecline={(id) => { setDrawerOpen(false); setDecliningId(id); setDeclineDialogOpen(true); }}
        onDeleteFormResponse={(id) => deleteFormResponseMutation.mutate(id)}
        confirmLoading={confirmMutation.isPending}
        declineLoading={declineMutation.isPending}
        deleteLoading={deleteFormResponseMutation.isPending}
      />

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

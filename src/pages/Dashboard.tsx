import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarCheck,
  CalendarRange,
  ClipboardList,
  Users,
  Plus,
  ArrowRight,
  AlertCircle,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";


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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
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
    default:
      return "secondary" as const;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { projectId } = useParams<{ projectId: string }>();

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

  const isLoading = loadingEventTypes || loadingBookings || loadingForms || loadingContacts;
  const hasError = errorEventTypes || errorBookings;

  const activeEventTypes = eventTypes?.filter((e) => e.enabled) ?? [];
  const activeForms = forms?.filter((f) => f.status === "active") ?? [];
  const totalBookings = bookings?.length ?? 0;
  const totalContacts = contacts?.length ?? 0;

  const recentBookings = [...(bookings ?? [])]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  // Build a lookup map for event type names
  const eventTypeMap = new Map<string, string>();
  eventTypes?.forEach((et) => eventTypeMap.set(et.id, et.name));

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

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Welcome back! Here's an overview of your project."
      >
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to={`/app/projects/${projectId}/forms/new`}>
              <Plus className="h-4 w-4" />
              Create Form
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to={`/app/projects/${projectId}/event-types`}>
              <Plus className="h-4 w-4" />
              Create Event Type
            </Link>
          </Button>
        </div>
      </PageHeader>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
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

      {/* Recent Bookings */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CalendarCheck className="h-4 w-4 text-muted-foreground" />
            Recent Bookings
          </CardTitle>
          {bookings && bookings.length > 0 && (
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
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
            </div>
          ) : hasError ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <AlertCircle className="h-8 w-8 mb-2" />
              <p className="text-sm">Failed to load recent bookings.</p>
            </div>
          ) : recentBookings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <CalendarCheck className="h-10 w-10 text-muted-foreground mb-4" />
              <p className="text-sm font-medium text-foreground mb-1">
                No bookings yet
              </p>
              <p className="text-sm text-muted-foreground">
                Bookings will appear here once someone schedules with you.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {recentBookings.map((booking) => (
                <div key={booking.id}>
                  <div className="flex items-center gap-4 py-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary shrink-0">
                      {booking.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {booking.name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {eventTypeMap.get(booking.eventTypeId) ?? "Event"} &middot;{" "}
                        {formatDateTime(booking.startTime)}
                      </p>
                    </div>
                    <Badge variant={statusVariant(booking.status)}>
                      {booking.status}
                    </Badge>
                  </div>

                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

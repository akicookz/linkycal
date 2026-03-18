import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Plus,
  CalendarRange,
  Copy,
  Pencil,
  Trash2,
  Loader2,
  AlertCircle,
  Check,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
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

interface Project {
  id: string;
  name: string;
  slug: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function EventTypes() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Fetch project for slug
  const { data: projects } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to fetch projects");
      const data = await res.json();
      return data.projects ?? [];
    },
  });

  const currentProject = projects?.find((p) => p.id === projectId);

  // Fetch event types
  const {
    data: eventTypes,
    isLoading,
    isError,
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

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/projects/${projectId}/event-types/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete event type");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "event-types"] });
      setDeleteDialogOpen(false);
      setDeletingId(null);
    },
  });

  // Toggle enabled mutation
  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const res = await fetch(`/api/projects/${projectId}/event-types/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error("Failed to toggle event type");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "event-types"] });
    },
  });

  function handleCopyLink(et: EventType) {
    const projectSlug = currentProject?.slug ?? projectId;
    const url = `${window.location.origin}/${projectSlug}/${et.slug}`;
    navigator.clipboard.writeText(url);
    setCopiedId(et.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div>
      <PageHeader
        title="Event Types"
        description="Create and manage your booking event types"
      >
        <Button
          onClick={() =>
            navigate(`/app/projects/${projectId}/event-types/new`)
          }
          size="sm"
        >
          <Plus className="h-4 w-4" />
          New Event Type
        </Button>
      </PageHeader>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-40" />
                  <div className="flex justify-between pt-2">
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="h-8 w-8" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed py-16">
          <AlertCircle className="h-10 w-10 text-destructive mb-4" />
          <p className="text-sm font-medium text-foreground mb-1">
            Failed to load event types
          </p>
          <p className="text-sm text-muted-foreground">
            Please try refreshing the page.
          </p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !isError && eventTypes && eventTypes.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed py-16">
          <CalendarRange className="h-10 w-10 text-muted-foreground mb-4" />
          <p className="text-sm font-medium text-foreground mb-1">
            No event types yet
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            Create your first event type to start accepting bookings.
          </p>
          <Button
            onClick={() =>
              navigate(`/app/projects/${projectId}/event-types/new`)
            }
            size="sm"
          >
            <Plus className="h-4 w-4" />
            New Event Type
          </Button>
        </div>
      )}

      {/* Event Type Grid */}
      {!isLoading && !isError && eventTypes && eventTypes.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {eventTypes.map((et) => (
            <Card
              key={et.id}
              className={`relative transition-opacity ${!et.enabled ? "opacity-60" : ""}`}
            >
              <CardContent>
                {/* Color dot + name */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: et.color }}
                    />
                    <h3 className="text-sm font-semibold text-foreground truncate">
                      {et.name}
                    </h3>
                  </div>
                  <Switch
                    checked={et.enabled}
                    onCheckedChange={(checked) =>
                      toggleMutation.mutate({ id: et.id, enabled: checked })
                    }
                  />
                </div>

                {/* Duration + Location */}
                <div className="flex items-center gap-1.5 flex-wrap mb-3">
                  <Badge variant="secondary" className="text-[11px] px-2 py-0.5">
                    {et.duration} min
                  </Badge>
                  {et.location && (
                    <Badge variant="secondary" className="text-[11px] px-2 py-0.5">
                      {et.location}
                    </Badge>
                  )}
                </div>

                {et.description && (
                  <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                    {et.description}
                  </p>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2.5 text-xs"
                    onClick={() => handleCopyLink(et)}
                  >
                    {copiedId === et.id ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copiedId === et.id ? "Copied" : "Copy link"}
                  </Button>
                  <div className="flex-1" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2.5 text-xs"
                    onClick={() =>
                      navigate(
                        `/app/projects/${projectId}/event-types/${et.id}`,
                      )
                    }
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2.5 text-xs text-destructive hover:text-destructive"
                    onClick={() => {
                      setDeletingId(et.id);
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Event Type</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this event type? This action cannot
              be undone and will remove all associated bookings.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setDeletingId(null);
              }}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deletingId && deleteMutation.mutate(deletingId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

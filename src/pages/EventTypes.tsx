import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePostHog } from "@posthog/react";
import {
  Plus,
  CalendarRange,
  Copy,
  Trash2,
  Loader,
  AlertCircle,
  Check,
  Code,
  FileText,
  Pencil,
} from "lucide-react";
import { ActionsSheet } from "@/components/ActionsSheet";
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
import { copyToClipboard, copyToClipboardLazy } from "@/lib/utils";
import {
  generateEventTypeApiPrompt,
  generateEventTypeEmbedPrompt,
} from "@/lib/prompts";

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
  const posthog = usePostHog();

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
      posthog?.capture("event_type_deleted", { project_id: projectId });
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
    const projectSlug = currentProject?.slug ?? projectId ?? "";
    const url = `${window.location.origin}/${projectSlug}/${et.slug}`;
    copyToClipboard(url);
    setCopiedId(`link-${et.id}`);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function handleCopyEmbed(et: EventType) {
    const projectSlug = currentProject?.slug ?? projectId ?? "";
    const snippet = `<div id="linkycal-booking"></div>\n<script src="https://cdn.linkycal.com/widgets/booking.js"></script>\n<script>LinkyCal.booking({ projectSlug: "${projectSlug}", eventTypeSlug: "${et.slug}", container: "#linkycal-booking" })</script>`;
    copyToClipboard(snippet);
    setCopiedId(`embed-${et.id}`);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function handleCopyApiPrompt(et: EventType) {
    const projectSlug = currentProject?.slug ?? projectId ?? "";

    const textPromise = (async () => {
      let fullEt = et as EventType & {
        requiresConfirmation?: boolean;
        bookingFormId?: string | null;
      };
      let bookingFormFields:
        | Array<{
          id: string;
          label: string;
          type: string;
          required: boolean;
          placeholder: string | null;
          options: Array<{ label: string; value: string }> | null;
        }>
        | undefined;

      try {
        const res = await fetch(`/api/projects/${projectId}/event-types/${et.id}`);
        if (res.ok) {
          const data = await res.json();
          fullEt = data.eventType ?? et;
          bookingFormFields = data.bookingForm?.steps?.flatMap(
            (
              step: {
                fields?: Array<{
                  id: string;
                  label: string;
                  type: string;
                  required: boolean;
                  placeholder: string | null;
                  options: Array<{ label: string; value: string }> | null;
                }>;
              },
            ) => step.fields ?? [],
          );
        }
      } catch { /* use basic data */ }
      return generateEventTypeApiPrompt(
        fullEt,
        projectSlug,
        window.location.origin,
        bookingFormFields,
      );
    })();

    copyToClipboardLazy(textPromise);
    setCopiedId(`api-${et.id}`);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function handleCopyEmbedPrompt(et: EventType) {
    const projectSlug = currentProject?.slug ?? projectId ?? "";
    const prompt = generateEventTypeEmbedPrompt(et, projectSlug);
    copyToClipboard(prompt);
    setCopiedId(`embedprompt-${et.id}`);
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
          New
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
            New
          </Button>
        </div>
      )}

      {/* Event Type Grid */}
      {!isLoading && !isError && eventTypes && eventTypes.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {eventTypes.map((et) => (
            <Card
              key={et.id}
              className={`relative transition-all cursor-pointer hover:border-primary/25 ${!et.enabled ? "opacity-60" : ""}`}
              onClick={() => navigate(`/app/projects/${projectId}/event-types/${et.id}`)}
            >
              <CardContent>
                {/* Color dot + name */}
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: et.color }}
                    />
                    <h3 className="text-sm font-semibold break-words text-foreground">
                      {et.name}
                    </h3>
                  </div>
                  <div className="-mr-1.5 flex shrink-0 items-center gap-1">
                    <Switch
                      checked={et.enabled}
                      onCheckedChange={(checked) =>
                        toggleMutation.mutate({ id: et.id, enabled: checked })
                      }
                      onClick={(e) => e.stopPropagation()}
                    />
                    <ActionsSheet
                      title="Event type"
                      items={[
                        {
                          id: "copy-link",
                          label: copiedId === `link-${et.id}` ? "Copied" : "Copy link",
                          icon: copiedId === `link-${et.id}` ? Check : Copy,
                          onClick: () => handleCopyLink(et),
                        },
                        {
                          id: "copy-api",
                          label: copiedId === `api-${et.id}` ? "Copied" : "Copy API prompt",
                          icon: FileText,
                          onClick: () => handleCopyApiPrompt(et),
                        },
                        {
                          id: "copy-embed-prompt",
                          label: copiedId === `embedprompt-${et.id}` ? "Copied" : "Copy embed prompt",
                          icon: FileText,
                          onClick: () => handleCopyEmbedPrompt(et),
                        },
                        {
                          id: "embed",
                          label: copiedId === `embed-${et.id}` ? "Copied" : "Copy embed script",
                          icon: Code,
                          onClick: () => handleCopyEmbed(et),
                        },
                        {
                          id: "edit",
                          label: "Edit",
                          icon: Pencil,
                          onClick: () => navigate(`/app/projects/${projectId}/event-types/${et.id}`),
                        },
                        {
                          id: "delete",
                          label: "Delete",
                          icon: Trash2,
                          variant: "destructive",
                          onClick: () => {
                            setDeletingId(et.id);
                            setDeleteDialogOpen(true);
                          },
                        },
                      ]}
                    />
                  </div>
                </div>

                <div className="mb-3 flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="px-2 py-0.5 text-[11px]">
                    {et.duration} min
                  </Badge>
                  {et.location && (
                    <Badge variant="secondary" className="px-2 py-0.5 text-[11px]">
                      {et.location}
                    </Badge>
                  )}
                </div>

                {et.description && (
                  <p className="text-xs text-pretty text-muted-foreground line-clamp-2">
                    {et.description}
                  </p>
                )}
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
              {deleteMutation.isPending ? (
                <Loader className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

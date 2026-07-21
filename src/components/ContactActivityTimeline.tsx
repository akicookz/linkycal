import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Brain,
  CalendarCheck,
  CalendarClock,
  ChevronDown,
  Clock,
  FileText,
  Loader,
  RefreshCw,
  Tag,
  Workflow,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActivityDrawer } from "@/components/ActivityDrawer";
import { ContactActivityDetailsDrawer } from "@/components/ContactActivityDetailsDrawer";
import {
  hasContactActivityDetails,
  type ContactActivityCategory,
  type ContactActivityContact,
  type ContactActivityPage,
  type ContactActivitySummary,
  type ContactTimelineItem,
} from "@/lib/contact-activity";
import { cn } from "@/lib/utils";

interface ContactActivityTimelineProps {
  projectId: string;
  contactId: string;
  contact: ContactActivityContact;
  onSummaryChange?: (summary: ContactActivitySummary) => void;
}

const categories: Array<{ value: ContactActivityCategory; label: string }> = [
  { value: "all", label: "All" },
  { value: "bookings", label: "Bookings" },
  { value: "form_responses", label: "Form responses" },
  { value: "workflows", label: "Workflows" },
];

function relativeTime(value: string): string {
  const elapsed = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(elapsed / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusVariant(status: string) {
  if (status === "confirmed" || status === "completed") return "success" as const;
  if (status === "cancelled" || status === "declined" || status === "failed") {
    return "destructive" as const;
  }
  if (status === "pending" || status === "running" || status === "in_progress") {
    return "warning" as const;
  }
  return "secondary" as const;
}

function ActivityIcon({ item }: { item: ContactTimelineItem }) {
  switch (item.kind) {
    case "booking":
      return item.status === "pending" ? (
        <CalendarClock className="h-4 w-4 text-amber-600" />
      ) : (
        <CalendarCheck className="h-4 w-4 text-emerald-600" />
      );
    case "form_response":
      return <FileText className="h-4 w-4 text-blue-600" />;
    case "workflow_run":
      return <Workflow className="h-4 w-4 text-violet-600" />;
    case "research":
      return <Brain className="h-4 w-4 text-primary" />;
    default:
      return item.activityType === "tag_added" || item.activityType === "tag_removed" ? (
        <Tag className="h-4 w-4 text-muted-foreground" />
      ) : (
        <Clock className="h-4 w-4 text-muted-foreground" />
      );
  }
}

function TimelineRow({
  item,
  onSelect,
}: {
  item: ContactTimelineItem;
  onSelect: (item: ContactTimelineItem) => void;
}) {
  const content = (
    <>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/60">
        <ActivityIcon item={item} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{item.title}</span>
          {item.status && (
            <Badge variant={statusVariant(item.status)} className="px-2 py-0 text-[10px] capitalize">
              {item.status.replace(/_/g, " ")}
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground text-pretty">{item.description}</p>
      </div>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {relativeTime(item.occurredAt)}
      </span>
    </>
  );

  if (!hasContactActivityDetails(item)) {
    return <div className="flex min-h-12 items-start gap-3 rounded-[16px] px-3 py-2.5">{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="flex min-h-12 w-full items-start gap-3 rounded-[16px] px-3 py-2.5 text-left transition-[background-color,scale] hover:bg-muted/60 active:scale-[0.96]"
    >
      {content}
    </button>
  );
}

export function ContactActivityTimeline({
  projectId,
  contactId,
  contact,
  onSummaryChange,
}: ContactActivityTimelineProps) {
  const [category, setCategory] = useState<ContactActivityCategory>("all");
  const [selectedItem, setSelectedItem] = useState<ContactTimelineItem | null>(null);
  const activityQuery = useInfiniteQuery<ContactActivityPage>({
    queryKey: ["projects", projectId, "contacts", contactId, "activities", category],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ category, limit: "20" });
      if (pageParam) params.set("cursor", String(pageParam));
      const response = await fetch(
        `/api/projects/${projectId}/contacts/${contactId}/activities?${params.toString()}`,
      );
      if (!response.ok) throw new Error("Failed to load activity");
      return (await response.json()) as ContactActivityPage;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    retry: false,
  });

  const firstPage = activityQuery.data?.pages[0];
  const activities = useMemo(() => {
    const byId = new Map<string, ContactTimelineItem>();
    for (const currentPage of activityQuery.data?.pages ?? []) {
      for (const item of currentPage.activities) byId.set(item.id, item);
    }
    return [...byId.values()];
  }, [activityQuery.data?.pages]);

  useEffect(() => {
    if (!onSummaryChange) return;
    if (firstPage) {
      onSummaryChange({ status: "ready", counts: firstPage.counts });
    } else if (activityQuery.isError) {
      onSummaryChange({ status: "error", counts: null });
    } else {
      onSummaryChange({ status: "loading", counts: null });
    }
  }, [activityQuery.isError, firstPage, onSummaryChange]);

  const drawerItem =
    selectedItem?.kind === "booking"
      ? {
          id: selectedItem.bookingId,
          type: "booking" as const,
          name: contact.name,
          email: contact.email ?? "",
          title: selectedItem.title,
          status: selectedItem.status ?? "confirmed",
          date: selectedItem.occurredAt,
          startTime: selectedItem.startTime,
          endTime: selectedItem.endTime,
          timezone: selectedItem.timezone,
          meetingUrl: selectedItem.meetingUrl,
          formResponseId: selectedItem.formResponseId,
          eventTypeId: selectedItem.eventTypeId,
        }
      : selectedItem?.kind === "form_response"
        ? {
            id: selectedItem.responseId,
            type: "form_response" as const,
            name: contact.name,
            email: contact.email ?? "",
            title: selectedItem.title,
            status: selectedItem.status ?? "completed",
            date: selectedItem.occurredAt,
            formId: selectedItem.formId,
          }
        : null;
  const extendedDrawerItem =
    selectedItem?.kind === "workflow_run" || selectedItem?.kind === "research"
      ? selectedItem
      : null;

  return (
    <>
      <Card>
        <Tabs value={category} onValueChange={(value) => setCategory(value as ContactActivityCategory)}>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Activity Timeline
            </CardTitle>
            <TabsList className="ml-auto h-auto max-w-full flex-wrap justify-end gap-1">
              {categories.map((entry) => (
                <TabsTrigger
                  key={entry.value}
                  value={entry.value}
                  className="min-h-10 px-2.5 text-xs transition-[background-color,color,box-shadow]"
                >
                  {entry.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </CardHeader>
        </Tabs>

        <CardContent>
          {activityQuery.isPending ? (
            <div role="status" aria-label="Loading activity" className="space-y-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="flex items-start gap-3 px-3 py-2.5">
                  <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-2 pt-1">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : activityQuery.isError && !firstPage ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <div>
                <p className="text-sm font-medium">Could not load activity</p>
                <p className="mt-1 text-xs text-muted-foreground">Please try again.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="transition-[background-color,color,scale] active:scale-[0.96]"
                onClick={() => activityQuery.refetch()}
              >
                <RefreshCw className="h-4 w-4" />
                Try again
              </Button>
            </div>
          ) : activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Clock className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">No {category === "all" ? "activity" : categories.find((entry) => entry.value === category)?.label.toLowerCase()} yet</p>
            </div>
          ) : (
            <div className="space-y-1">
              {activities.map((item) => (
                <TimelineRow key={item.id} item={item} onSelect={setSelectedItem} />
              ))}
              {activityQuery.hasNextPage && (
                <div className="flex justify-center pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(
                      "transition-[background-color,color,scale] active:scale-[0.96]",
                      activityQuery.isFetchingNextPage && "cursor-wait",
                    )}
                    disabled={activityQuery.isFetchingNextPage}
                    onClick={() => activityQuery.fetchNextPage()}
                  >
                    {activityQuery.isFetchingNextPage ? (
                      <Loader className="h-4 w-4 animate-spin" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                    Load more
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <ActivityDrawer
        open={!!drawerItem}
        onClose={() => setSelectedItem(null)}
        projectId={projectId}
        item={drawerItem}
      />
      <ContactActivityDetailsDrawer
        open={!!extendedDrawerItem}
        onClose={() => setSelectedItem(null)}
        projectId={projectId}
        item={extendedDrawerItem}
      />
    </>
  );
}

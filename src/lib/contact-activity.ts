export type ContactActivityCategory =
  | "all"
  | "bookings"
  | "form_responses"
  | "workflows";

export interface ContactActivityCounts {
  all: number;
  bookings: number;
  formResponses: number;
  workflows: number;
}

export interface ContactActivitySummary {
  status: "loading" | "ready" | "error";
  counts: ContactActivityCounts | null;
}

interface ContactTimelineItemBase {
  id: string;
  occurredAt: string;
  title: string;
  description: string;
  status: string | null;
}

export type ContactTimelineItem =
  | (ContactTimelineItemBase & {
      kind: "booking";
      category: "bookings";
      bookingId: string;
      eventTypeId: string;
      startTime: string;
      endTime: string;
      timezone: string;
      meetingUrl: string | null;
      formResponseId: string | null;
    })
  | (ContactTimelineItemBase & {
      kind: "form_response";
      category: "form_responses";
      responseId: string;
      formId: string;
    })
  | (ContactTimelineItemBase & {
      kind: "workflow_run";
      category: "workflows";
      runId: string;
      workflowId: string;
    })
  | (ContactTimelineItemBase & {
      kind: "research";
      category: "workflows";
      research: Record<string, unknown>;
    })
  | (ContactTimelineItemBase & {
      kind: "generic";
      category: "all";
      activityType: string;
    });

export interface ContactActivityPage {
  activities: ContactTimelineItem[];
  counts: ContactActivityCounts;
  nextCursor: string | null;
}

export interface ContactActivityContact {
  name: string;
  email: string | null;
}

export function hasContactActivityDetails(item: ContactTimelineItem): boolean {
  return item.kind !== "generic";
}

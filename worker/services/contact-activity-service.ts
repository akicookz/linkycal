import { and, eq, inArray, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import * as dbSchema from "../db/schema";

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
      activityType: dbSchema.ContactActivityRow["type"];
    });

export interface ContactActivityPage {
  activities: ContactTimelineItem[];
  counts: ContactActivityCounts;
  nextCursor: string | null;
}

export interface ContactActivityListOptions {
  category: ContactActivityCategory;
  limit: number;
  cursor: string | null;
}

export interface ContactActivityCursor {
  occurredAt: string;
  id: string;
}

export interface ContactActivityQueryInput {
  category?: string;
  limit?: string;
  cursor?: string;
}

const RESPONSE_ID_CHUNK = 90;

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return normalizeRecord(parsed);
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function compareTimelineItems(
  left: ContactTimelineItem,
  right: ContactTimelineItem,
): number {
  const timeDifference =
    new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime();
  return timeDifference || right.id.localeCompare(left.id);
}

function isBeforeCursor(
  item: ContactTimelineItem,
  cursor: ContactActivityCursor,
): boolean {
  const itemTime = new Date(item.occurredAt).getTime();
  const cursorTime = new Date(cursor.occurredAt).getTime();
  return itemTime < cursorTime || (itemTime === cursorTime && item.id < cursor.id);
}

function genericActivityCopy(activity: dbSchema.ContactActivityRow): {
  title: string;
  description: string;
} {
  const metadata = normalizeRecord(activity.metadata);
  switch (activity.type) {
    case "contact_created":
      return { title: "Contact created", description: "Added to contacts" };
    case "tag_added":
      return {
        title: "Tag added",
        description: String(metadata.tagName ?? "A tag was added"),
      };
    case "tag_removed":
      return {
        title: "Tag removed",
        description: String(metadata.tagName ?? "A tag was removed"),
      };
    case "next_action_set":
      return {
        title: "Next action set",
        description: String(metadata.text ?? "A next action was scheduled"),
      };
    case "next_action_completed":
      return {
        title: "Next action completed",
        description: String(metadata.text ?? "A next action was completed"),
      };
    case "booked":
      return { title: "Booking created", description: "Booking details unavailable" };
    case "cancelled":
      return { title: "Booking cancelled", description: "Booking details unavailable" };
    default:
      return { title: "Activity recorded", description: "Contact activity" };
  }
}

export function encodeContactActivityCursor(
  item: Pick<ContactTimelineItem, "occurredAt" | "id">,
): string {
  return btoa(JSON.stringify({ occurredAt: item.occurredAt, id: item.id }))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

export function parseContactActivityCursor(
  value: string | null | undefined,
): ContactActivityCursor | null {
  if (!value) return null;
  try {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
    const parsed = JSON.parse(atob(normalized + padding)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Invalid cursor");
    }
    const record = parsed as Record<string, unknown>;
    if (
      typeof record.occurredAt !== "string" ||
      !Number.isFinite(new Date(record.occurredAt).getTime()) ||
      typeof record.id !== "string" ||
      record.id.length === 0
    ) {
      throw new Error("Invalid cursor");
    }
    return { occurredAt: record.occurredAt, id: record.id };
  } catch {
    throw new Error("Invalid cursor");
  }
}

export function parseContactActivityListOptions(
  input: ContactActivityQueryInput,
): ContactActivityListOptions {
  const category = input.category ?? "all";
  if (
    category !== "all" &&
    category !== "bookings" &&
    category !== "form_responses" &&
    category !== "workflows"
  ) {
    throw new Error("Invalid activity category");
  }

  const limit = input.limit === undefined ? 20 : Number(input.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Activity limit must be an integer from 1 to 100");
  }

  const cursor = input.cursor ?? null;
  parseContactActivityCursor(cursor);
  return { category, limit, cursor };
}

export class ContactActivityService {
  constructor(private db: DrizzleD1Database<Record<string, unknown>>) {}

  async list(
    projectId: string,
    contactId: string,
    options: ContactActivityListOptions,
  ): Promise<ContactActivityPage | null> {
    const [contact] = await this.db
      .select({ id: dbSchema.contacts.id })
      .from(dbSchema.contacts)
      .where(
        and(
          eq(dbSchema.contacts.id, contactId),
          eq(dbSchema.contacts.projectId, projectId),
        ),
      )
      .limit(1);
    if (!contact) return null;

    const [bookingRows, activityRows, workflowRows] = await Promise.all([
      this.db
        .select({
          id: dbSchema.bookings.id,
          eventTypeId: dbSchema.bookings.eventTypeId,
          eventTypeName: dbSchema.eventTypes.name,
          formResponseId: dbSchema.bookings.formResponseId,
          startTime: dbSchema.bookings.startTime,
          endTime: dbSchema.bookings.endTime,
          timezone: dbSchema.bookings.timezone,
          status: dbSchema.bookings.status,
          meetingUrl: dbSchema.bookings.meetingUrl,
          createdAt: dbSchema.bookings.createdAt,
        })
        .from(dbSchema.bookings)
        .innerJoin(
          dbSchema.eventTypes,
          eq(dbSchema.bookings.eventTypeId, dbSchema.eventTypes.id),
        )
        .where(
          and(
            eq(dbSchema.bookings.contactId, contactId),
            eq(dbSchema.eventTypes.projectId, projectId),
          ),
        ),
      this.db
        .select()
        .from(dbSchema.contactActivity)
        .where(eq(dbSchema.contactActivity.contactId, contactId)),
      this.db
        .select({
          id: dbSchema.workflowRuns.id,
          workflowId: dbSchema.workflowRuns.workflowId,
          workflowName: dbSchema.workflows.name,
          status: dbSchema.workflowRuns.status,
          startedAt: dbSchema.workflowRuns.startedAt,
        })
        .from(dbSchema.workflowRuns)
        .innerJoin(
          dbSchema.workflows,
          eq(dbSchema.workflowRuns.workflowId, dbSchema.workflows.id),
        )
        .where(
          and(
            eq(dbSchema.workflows.projectId, projectId),
            sql`json_extract(${dbSchema.workflowRuns.context}, '$.contactId') = ${contactId}`,
          ),
        ),
    ]);

    const items: ContactTimelineItem[] = [];
    const bookingIds = new Set(bookingRows.map((booking) => booking.id));
    const responseIds = new Set<string>();

    for (const booking of bookingRows) {
      if (booking.formResponseId) responseIds.add(booking.formResponseId);
      items.push({
        id: `booking:${booking.id}`,
        kind: "booking",
        category: "bookings",
        occurredAt: toIso(booking.createdAt),
        title: booking.eventTypeName,
        description: "Booking created",
        status: booking.status,
        bookingId: booking.id,
        eventTypeId: booking.eventTypeId,
        startTime: toIso(booking.startTime),
        endTime: toIso(booking.endTime),
        timezone: booking.timezone,
        meetingUrl: booking.meetingUrl,
        formResponseId: booking.formResponseId,
      });
    }

    for (const activity of activityRows) {
      if (activity.type === "form_submitted" && activity.referenceId) {
        responseIds.add(activity.referenceId);
      }
    }

    for (const ids of chunk([...responseIds], RESPONSE_ID_CHUNK)) {
      const responseRows = await this.db
        .select({
          id: dbSchema.formResponses.id,
          formId: dbSchema.formResponses.formId,
          formName: dbSchema.forms.name,
          status: dbSchema.formResponses.status,
          respondentEmail: dbSchema.formResponses.respondentEmail,
          createdAt: dbSchema.formResponses.createdAt,
        })
        .from(dbSchema.formResponses)
        .innerJoin(dbSchema.forms, eq(dbSchema.formResponses.formId, dbSchema.forms.id))
        .where(
          and(
            inArray(dbSchema.formResponses.id, ids),
            eq(dbSchema.forms.projectId, projectId),
          ),
        );
      for (const response of responseRows) {
        if (!response.formId) continue;
        items.push({
          id: `form_response:${response.id}`,
          kind: "form_response",
          category: "form_responses",
          occurredAt: toIso(response.createdAt),
          title: response.formName,
          description: response.respondentEmail
            ? `Submitted by ${response.respondentEmail}`
            : "Form response submitted",
          status: response.status,
          responseId: response.id,
          formId: response.formId,
        });
      }
    }

    for (const run of workflowRows) {
      items.push({
        id: `workflow_run:${run.id}`,
        kind: "workflow_run",
        category: "workflows",
        occurredAt: toIso(run.startedAt),
        title: run.workflowName,
        description: "Workflow run",
        status: run.status,
        runId: run.id,
        workflowId: run.workflowId,
      });
    }

    for (const activity of activityRows) {
      if (activity.type === "form_submitted") continue;
      if (
        (activity.type === "booked" || activity.type === "cancelled") &&
        activity.referenceId &&
        bookingIds.has(activity.referenceId)
      ) {
        continue;
      }
      if (activity.type === "workflow_researched") {
        const metadata = normalizeRecord(activity.metadata);
        items.push({
          id: `research:${activity.id}`,
          kind: "research",
          category: "workflows",
          occurredAt: toIso(activity.createdAt),
          title: "Lead research completed",
          description: String(metadata.summary ?? "Research saved to this contact"),
          status: "completed",
          research: normalizeRecord(metadata.research ?? metadata),
        });
        continue;
      }
      const copy = genericActivityCopy(activity);
      items.push({
        id: `activity:${activity.id}`,
        kind: "generic",
        category: "all",
        occurredAt: toIso(activity.createdAt),
        title: copy.title,
        description: copy.description,
        status: null,
        activityType: activity.type,
      });
    }

    items.sort(compareTimelineItems);
    const counts: ContactActivityCounts = {
      all: items.length,
      bookings: items.filter((item) => item.category === "bookings").length,
      formResponses: items.filter((item) => item.category === "form_responses").length,
      workflows: items.filter((item) => item.category === "workflows").length,
    };
    const cursor = parseContactActivityCursor(options.cursor);
    const categoryItems = items.filter(
      (item) => options.category === "all" || item.category === options.category,
    );
    const afterCursor = cursor
      ? categoryItems.filter((item) => isBeforeCursor(item, cursor))
      : categoryItems;
    const pageItems = afterCursor.slice(0, options.limit);
    const hasMore = afterCursor.length > options.limit;

    return {
      activities: pageItems,
      counts,
      nextCursor:
        hasMore && pageItems.length > 0
          ? encodeContactActivityCursor(pageItems[pageItems.length - 1])
          : null,
    };
  }
}

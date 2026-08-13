import { and, desc, eq, gte, inArray, like, or, sql } from "drizzle-orm";

import * as dbSchema from "../db/schema";
import { normalizePendingBookingForRead } from "../services/booking-service";
import type { ActionResult, ProjectActionDeps } from "./action-result";
import { actionOk } from "./action-result";

function parseTimestamp(value: Date | string | number): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    return new Date(value.replace(" ", "T") + (value.includes("T") ? "" : "Z")).getTime();
  }
  return new Date(value).getTime();
}

export async function listRecentActivityAction(
  deps: ProjectActionDeps,
  limit = 10,
): Promise<ActionResult<{ items: unknown[] }>> {
  const boundedLimit = Math.max(1, Math.min(50, limit));
  const [bookings, responses] = await Promise.all([
    deps.db
      .select({
        id: dbSchema.bookings.id,
        name: dbSchema.bookings.name,
        email: dbSchema.bookings.email,
        status: dbSchema.bookings.status,
        startTime: dbSchema.bookings.startTime,
        endTime: dbSchema.bookings.endTime,
        timezone: dbSchema.bookings.timezone,
        country: dbSchema.bookings.country,
        city: dbSchema.bookings.city,
        expiresAt: dbSchema.bookings.expiresAt,
        formResponseId: dbSchema.bookings.formResponseId,
        eventTypeId: dbSchema.bookings.eventTypeId,
        meetingUrl: dbSchema.bookings.meetingUrl,
        createdAt: dbSchema.bookings.createdAt,
        eventTypeName: dbSchema.eventTypes.name,
      })
      .from(dbSchema.bookings)
      .innerJoin(dbSchema.eventTypes, eq(dbSchema.bookings.eventTypeId, dbSchema.eventTypes.id))
      .where(and(
        eq(dbSchema.eventTypes.projectId, deps.projectId),
        gte(dbSchema.bookings.endTime, sql`(unixepoch() - 86400)`),
      ))
      .orderBy(desc(dbSchema.bookings.createdAt))
      .limit(boundedLimit),
    deps.db
      .select({
        id: dbSchema.formResponses.id,
        respondentEmail: dbSchema.formResponses.respondentEmail,
        status: dbSchema.formResponses.status,
        country: dbSchema.formResponses.country,
        city: dbSchema.formResponses.city,
        formId: dbSchema.formResponses.formId,
        createdAt: dbSchema.formResponses.createdAt,
        formName: dbSchema.forms.name,
      })
      .from(dbSchema.formResponses)
      .innerJoin(dbSchema.forms, eq(dbSchema.formResponses.formId, dbSchema.forms.id))
      .where(and(
        eq(dbSchema.forms.projectId, deps.projectId),
        gte(dbSchema.formResponses.createdAt, sql`(unixepoch() - 86400)`),
      ))
      .orderBy(desc(dbSchema.formResponses.createdAt))
      .limit(boundedLimit),
  ]);
  const responseIds = responses.map((response) => response.id);
  const nameValues = responseIds.length === 0 ? [] : await deps.db
    .select({
      responseId: dbSchema.formFieldValues.responseId,
      value: dbSchema.formFieldValues.value,
      sortOrder: dbSchema.formFields.sortOrder,
      contactMapping: dbSchema.formFields.contactMapping,
    })
    .from(dbSchema.formFieldValues)
    .innerJoin(dbSchema.formFields, and(
      eq(dbSchema.formFieldValues.formId, dbSchema.formFields.formId),
      eq(dbSchema.formFieldValues.fieldId, dbSchema.formFields.id),
    ))
    .where(and(
      inArray(dbSchema.formFieldValues.responseId, responseIds),
      or(
        eq(dbSchema.formFields.contactMapping, "name"),
        and(like(dbSchema.formFields.label, "%name%"), eq(dbSchema.formFields.type, "text")),
      ),
    ));
  const mappedIds = new Set(nameValues.filter((value) => value.contactMapping === "name").map((value) => value.responseId));
  const nameByResponseId = new Map<string, string>();
  for (const value of nameValues.sort((left, right) => left.sortOrder - right.sortOrder)) {
    if (!value.value || (mappedIds.has(value.responseId) && value.contactMapping !== "name")) continue;
    nameByResponseId.set(value.responseId, `${nameByResponseId.get(value.responseId) ?? ""}${nameByResponseId.has(value.responseId) ? " " : ""}${value.value}`);
  }
  const now = new Date();
  const items = [
    ...bookings.map(function bookingItem(booking) {
      return {
        type: "booking" as const,
        ...normalizePendingBookingForRead(booking, now),
        title: booking.eventTypeName,
      };
    }),
    ...responses.map((response) => ({
      type: "form_response" as const,
      ...response,
      name: nameByResponseId.get(response.id) ?? response.respondentEmail ?? "Anonymous",
      email: response.respondentEmail ?? "",
      title: response.formName,
    })),
  ].sort((left, right) => {
    function priority(item: typeof left): number {
      if (item.type !== "booking") return 3;
      const start = parseTimestamp(item.startTime);
      if (item.status === "pending" && start >= Date.now()) return 0;
      return start >= Date.now() ? 1 : 2;
    }
    const priorities = priority(left) - priority(right);
    if (priorities) return priorities;
    if (left.type === "booking" && right.type === "booking") return parseTimestamp(left.startTime) - parseTimestamp(right.startTime);
    if (left.type === "form_response" && right.type === "form_response") return parseTimestamp(right.createdAt) - parseTimestamp(left.createdAt);
    return 0;
  }).slice(0, boundedLimit);
  return actionOk({ items });
}

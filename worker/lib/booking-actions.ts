import type { DrizzleD1Database } from "drizzle-orm/d1";
import { eq, and, inArray } from "drizzle-orm";

import * as dbSchema from "../db/schema";
import type { AppEnv } from "../types";
import { AvailabilityService } from "../services/availability-service";
import { BookingService } from "../services/booking-service";
import { CalendarService } from "../services/calendar-service";
import { ContactService } from "../services/contact-service";
import { EmailService } from "../services/email-service";
import type { EmailTheme } from "../services/email-service";
import { FormService } from "../services/form-service";
import type { TriggerContext } from "../services/workflow-execution-service";
import {
  formatDateInTimezone,
  getUtcRangeForLocalDate,
  getWeekRangeForLocalDate,
} from "./timezone";
import { parseInviteConnectionIds } from "./calendar-refs";
import { dispatchWorkflowTrigger } from "./workflow-dispatch";

type AppDatabase = DrizzleD1Database<Record<string, unknown>>;

// ─── Shared Deps ─────────────────────────────────────────────────────────────
// Booking lifecycle flows (create/cancel/confirm/decline) are shared between
// the HTTP routes in worker/index.ts and the MCP tools in worker/mcp/. Routes
// keep route-only concerns (rate limiting, spam checks, request validation,
// analytics); everything below runs identically for both callers.

export interface BookingActionDeps {
  db: AppDatabase;
  env: AppEnv;
  waitUntil: (p: Promise<unknown>) => void;
}

export type BookingActionResult =
  | { ok: true; booking: dbSchema.BookingRow }
  | { ok: false; status: 400 | 404 | 409; error: string };

export type CreateBookingActionResult =
  | { ok: true; booking: dbSchema.BookingRow; projectId: string }
  | { ok: false; status: 400 | 404 | 409; error: string };

// ─── Theme Helper ────────────────────────────────────────────────────────────

export function parseProjectTheme(
  settings: string | null | undefined,
): EmailTheme | undefined {
  if (!settings) return undefined;
  try {
    const parsed = JSON.parse(settings) as { theme?: EmailTheme };
    return parsed.theme;
  } catch {
    return undefined;
  }
}

// ─── Booking Email Helpers ───────────────────────────────────────────────────

export async function getBookingSubmittedFields(
  db: AppDatabase,
  formResponseId: string | null | undefined,
): Promise<Array<{ label: string; value: string }>> {
  if (!formResponseId) return [];

  const fieldValues = await db
    .select({
      label: dbSchema.formFields.label,
      type: dbSchema.formFields.type,
      value: dbSchema.formFieldValues.value,
      fileUrl: dbSchema.formFieldValues.fileUrl,
    })
    .from(dbSchema.formFieldValues)
    .innerJoin(
      dbSchema.formFields,
      and(
        eq(dbSchema.formFieldValues.formId, dbSchema.formFields.formId),
        eq(dbSchema.formFieldValues.fieldId, dbSchema.formFields.id),
      ),
    )
    .where(eq(dbSchema.formFieldValues.responseId, formResponseId));

  return fieldValues.map((fieldValue) => ({
    label: fieldValue.label,
    value:
      fieldValue.type === "file"
        ? (fieldValue.value ?? (fieldValue.fileUrl ? "Uploaded file" : ""))
        : (fieldValue.value ?? fieldValue.fileUrl ?? ""),
  }));
}

export async function resolveOrganizerEmail(
  db: AppDatabase,
  eventType: { destinationConnectionId: string | null },
  ownerUserId: string,
): Promise<string | null> {
  if (eventType.destinationConnectionId) {
    const [conn] = await db
      .select({ email: dbSchema.calendarConnections.email })
      .from(dbSchema.calendarConnections)
      .where(eq(dbSchema.calendarConnections.id, eventType.destinationConnectionId))
      .limit(1);
    if (conn?.email) return conn.email;
  }
  const [conn] = await db
    .select({ email: dbSchema.calendarConnections.email })
    .from(dbSchema.calendarConnections)
    .where(eq(dbSchema.calendarConnections.userId, ownerUserId))
    .limit(1);
  return conn?.email ?? null;
}

export async function resolveInviteAttendees(
  db: AppDatabase,
  eventType: { inviteConnectionIds: string | null },
  destinationConnectionId: string,
  guestEmail: string,
): Promise<string[]> {
  const inviteIds = parseInviteConnectionIds(eventType.inviteConnectionIds).filter(
    (id) => id !== destinationConnectionId,
  );

  const emails = new Set<string>();
  if (guestEmail) emails.add(guestEmail.toLowerCase());

  if (inviteIds.length > 0) {
    const rows = await db
      .select({ id: dbSchema.calendarConnections.id, email: dbSchema.calendarConnections.email })
      .from(dbSchema.calendarConnections)
      .where(inArray(dbSchema.calendarConnections.id, inviteIds));
    for (const row of rows) {
      if (row.email) emails.add(row.email.toLowerCase());
    }
  }

  return Array.from(emails);
}

// ─── Create Booking ──────────────────────────────────────────────────────────

export interface CreateBookingActionInput {
  projectSlug: string;
  eventTypeSlug: string;
  name: string;
  email: string;
  notes?: string;
  startTime: string; // ISO 8601 instant
  timezone: string;
  metadata?: Record<string, unknown>;
  formFields?: Record<string, string>;
  geo?: { ip?: string | null; country?: string | null; city?: string | null };
}

export async function createBookingAction(
  deps: BookingActionDeps,
  input: CreateBookingActionInput,
): Promise<CreateBookingActionResult> {
  const { db, env, waitUntil } = deps;

  // 1. Look up project by slug
  const [project] = await db
    .select()
    .from(dbSchema.projects)
    .where(eq(dbSchema.projects.slug, input.projectSlug))
    .limit(1);

  if (!project) {
    return { ok: false, status: 404, error: "Project not found" };
  }

  // 2. Look up event type by slug within the project
  const [eventType] = await db
    .select()
    .from(dbSchema.eventTypes)
    .where(
      and(
        eq(dbSchema.eventTypes.projectId, project.id),
        eq(dbSchema.eventTypes.slug, input.eventTypeSlug),
      ),
    )
    .limit(1);

  if (!eventType) {
    return { ok: false, status: 404, error: "Event type not found" };
  }

  if (!eventType.enabled) {
    return { ok: false, status: 400, error: "Event type is not available" };
  }

  // 3. Parse startTime, calculate endTime from duration
  const startTime = new Date(input.startTime);
  const endTime = new Date(
    startTime.getTime() + eventType.duration * 60 * 1000,
  );

  const availabilityService = new AvailabilityService(db);

  // 3b. Enforce per-day / per-week booking caps (count pending + confirmed).
  // Boundaries are measured in the host's schedule timezone.
  if (eventType.maxPerDay !== null || eventType.maxPerWeek !== null) {
    const schedule = await availabilityService.resolveSchedule(
      project.id,
      eventType,
    );
    if (schedule) {
      const scheduleDate = formatDateInTimezone(startTime, schedule.timezone);
      if (eventType.maxPerDay !== null) {
        const dayRange = getUtcRangeForLocalDate(scheduleDate, schedule.timezone);
        const dayCount = await availabilityService.countBookingsInRange(
          eventType.id,
          dayRange.start,
          dayRange.end,
        );
        if (dayCount >= eventType.maxPerDay) {
          return { ok: false, status: 409, error: "This day is fully booked" };
        }
      }
      if (eventType.maxPerWeek !== null) {
        const weekStart = eventType.weekStart === "sunday" ? "sunday" : "monday";
        const weekRange = getWeekRangeForLocalDate(
          scheduleDate,
          schedule.timezone,
          weekStart,
        );
        const weekCount = await availabilityService.countBookingsInRange(
          eventType.id,
          weekRange.start,
          weekRange.end,
        );
        if (weekCount >= eventType.maxPerWeek) {
          return { ok: false, status: 409, error: "This week is fully booked" };
        }
      }
    }
  }

  // 4. Check availability — verify the slot is still open
  const dateStr = formatDateInTimezone(startTime, input.timezone);
  const slots = await availabilityService.getAvailableSlots({
    projectSlug: input.projectSlug,
    eventTypeSlug: input.eventTypeSlug,
    date: dateStr,
    timezone: input.timezone,
  });

  const slotAvailable = slots.some(
    (slot) => slot.start === startTime.toISOString(),
  );

  if (!slotAvailable) {
    return { ok: false, status: 409, error: "Selected time slot is no longer available" };
  }

  // 5. Determine if booking requires confirmation
  const isPending = eventType.requiresConfirmation;

  // For pending bookings, calculate expiry: min(now + 24h, startTime - 1h)
  let expiresAt: Date | undefined;
  if (isPending) {
    const twentyFourHoursLater = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const oneHourBefore = new Date(startTime.getTime() - 60 * 60 * 1000);

    if (oneHourBefore <= new Date()) {
      return {
        ok: false,
        status: 400,
        error: "This event type requires confirmation. Bookings must be made at least 1 hour in advance.",
      };
    }

    expiresAt = twentyFourHoursLater < oneHourBefore ? twentyFourHoursLater : oneHourBefore;
  }

  // 6. Create form response if event type has a booking form
  let formResponseId: string | undefined;
  if (eventType.bookingFormId && input.formFields && Object.keys(input.formFields).length > 0) {
    const formService = new FormService(db);
    const formResponse = await formService.createResponse(eventType.bookingFormId);
    if (formResponse) {
      formResponseId = formResponse.id;
      // Insert all field values
      const fields = Object.entries(input.formFields).map(([fieldId, value]) => ({
        fieldId,
        value,
      }));
      // Submit as a single step (all fields at once)
      await formService.submitStep(formResponse.id, 0, fields);
      // Mark as completed
      await db
        .update(dbSchema.formResponses)
        .set({ status: "completed", respondentEmail: input.email })
        .where(eq(dbSchema.formResponses.id, formResponse.id));
    }
  }

  // 7. Create the booking
  const bookingService = new BookingService(db);
  const booking = await bookingService.create({
    eventTypeId: eventType.id,
    name: input.name,
    email: input.email,
    notes: input.notes,
    startTime,
    endTime,
    timezone: input.timezone,
    metadata: input.metadata,
    status: isPending ? "pending" : "confirmed",
    expiresAt,
    formResponseId,
    ipAddress: input.geo?.ip ?? null,
    country: input.geo?.country ?? null,
    city: input.geo?.city ?? null,
  });

  // 7. Look up project owner for calendar invite + email notification
  const ownerRows = await db
    .select()
    .from(dbSchema.schema.users)
    .where(eq(dbSchema.schema.users.id, project.userId))
    .limit(1);
  const owner = ownerRows[0];
  const submittedFields = await getBookingSubmittedFields(db, formResponseId);
  const projectTheme = parseProjectTheme(project.settings);

  if (isPending) {
    // 8. Pending booking: send request emails, skip calendar event
    waitUntil(
      (async () => {
        try {
          const emailService = new EmailService(env.RESEND_API_KEY);

          // Send "request received" email to guest
          await emailService.sendBookingRequestReceived({
            to: input.email,
            guestName: input.name,
            eventTypeName: eventType.name,
            startTime,
            endTime,
            timezone: input.timezone,
            theme: projectTheme,
          });

          // Send "action needed" email to owner/organizer
          if (owner) {
            const dashboardUrl = `${env.BETTER_AUTH_URL}/app/projects/${project.id}/bookings?tab=pending`;
            const organizerEmail = await resolveOrganizerEmail(db, eventType, project.userId);
            const to = organizerEmail ?? owner.email;
            const cc = organizerEmail && organizerEmail.toLowerCase() !== owner.email.toLowerCase()
              ? [owner.email]
              : undefined;
            await emailService.sendBookingRequestNotification({
              to,
              cc,
              ownerName: owner.name,
              guestName: input.name,
              guestEmail: input.email,
              eventTypeName: eventType.name,
              startTime,
              endTime,
              dashboardUrl,
              submittedFields,
              theme: projectTheme,
            });
          }
        } catch (err) {
          console.error("Pending booking email failed:", err);
        }
      })(),
    );
  } else {
    // 8. Confirmed booking: create calendar event + send confirmation emails
    const calendarService = new CalendarService(db, {
      GOOGLE_CALENDAR_CLIENT_ID: env.GOOGLE_CALENDAR_CLIENT_ID,
      GOOGLE_CALENDAR_CLIENT_SECRET: env.GOOGLE_CALENDAR_CLIENT_SECRET,
    });

    waitUntil(
      (async () => {
        let meetingUrl: string | undefined;

        try {
          let calConnection;
          let destinationCalendarId = "primary";

          if (eventType.destinationConnectionId) {
            const [conn] = await db
              .select()
              .from(dbSchema.calendarConnections)
              .where(eq(dbSchema.calendarConnections.id, eventType.destinationConnectionId))
              .limit(1);
            calConnection = conn;
            if (eventType.destinationCalendarId) {
              destinationCalendarId = eventType.destinationCalendarId;
            }
          } else {
            const [conn] = await db
              .select()
              .from(dbSchema.calendarConnections)
              .where(eq(dbSchema.calendarConnections.userId, project.userId))
              .limit(1);
            calConnection = conn;
          }

          if (calConnection) {
            const accessToken = await calendarService.refreshAccessToken(
              calConnection.refreshToken,
            );

            const attendeeEmails = await resolveInviteAttendees(
              db,
              eventType,
              calConnection.id,
              input.email,
            );

            const gcalResult = await calendarService.createEvent(
              accessToken,
              destinationCalendarId,
              {
                summary: `${eventType.name} with ${input.name}`,
                start: startTime.toISOString(),
                end: endTime.toISOString(),
                description: input.notes,
                attendees: attendeeEmails,
                guestName: input.name,
              },
            );

            meetingUrl = gcalResult.meetingUrl ?? undefined;

            await db
              .update(dbSchema.bookings)
              .set({ gcalEventId: gcalResult.id, meetingUrl: gcalResult.meetingUrl })
              .where(eq(dbSchema.bookings.id, booking.id));
          }
        } catch (err) {
          console.error("Google Calendar event creation failed:", err);
        }

        try {
          const emailService = new EmailService(env.RESEND_API_KEY);

          await emailService.sendBookingConfirmation({
            to: input.email,
            guestName: input.name,
            eventTypeName: eventType.name,
            startTime,
            endTime,
            timezone: input.timezone,
            location: eventType.location ?? undefined,
            notes: input.notes,
            meetingUrl,
            theme: projectTheme,
          });

          if (owner) {
            const organizerEmail = await resolveOrganizerEmail(db, eventType, project.userId);
            const to = organizerEmail ?? owner.email;
            const cc = organizerEmail && organizerEmail.toLowerCase() !== owner.email.toLowerCase()
              ? [owner.email]
              : undefined;
            await emailService.sendBookingNotification({
              to,
              cc,
              ownerName: owner.name,
              guestName: input.name,
              guestEmail: input.email,
              eventTypeName: eventType.name,
              startTime,
              endTime,
              submittedFields,
              theme: projectTheme,
            });
          }
        } catch (err) {
          console.error("Email sending failed:", err);
        }
      })(),
    );
  }

  // Dispatch workflow triggers for booking creation
  waitUntil(
    (async () => {
      try {
        const contactService = new ContactService(db);
        const contact = await contactService.findOrCreate(project.id, {
          name: input.name,
          email: input.email,
        });

        // Link contact to the booking row
        await db
          .update(dbSchema.bookings)
          .set({ contactId: contact.id })
          .where(eq(dbSchema.bookings.id, booking.id));

        // Log booking activity for the contact
        await contactService.logActivity(contact.id, "booked", booking.id);

        const bookingContext: TriggerContext = {
          projectId: project.id,
          bookingId: booking.id,
          contactId: contact.id,
          contactEmail: input.email,
          contactName: input.name,
        };
        await dispatchWorkflowTrigger(db, env, project.id, "booking_created", bookingContext);
        if (isPending) {
          await dispatchWorkflowTrigger(db, env, project.id, "booking_pending", bookingContext);
        }
      } catch (err) {
        console.error("Booking workflow dispatch failed:", err);
      }
    })(),
  );

  return { ok: true, booking, projectId: project.id };
}

// ─── Cancel Booking ──────────────────────────────────────────────────────────

export async function cancelBookingAction(
  deps: BookingActionDeps,
  projectId: string,
  bookingId: string,
  reason?: string,
): Promise<BookingActionResult> {
  const { db, env, waitUntil } = deps;

  const bookingService = new BookingService(db);
  const booking = await bookingService.cancel(bookingId, reason);

  if (!booking) {
    return { ok: false, status: 404, error: "Booking not found" };
  }

  // If the booking had a Google Calendar event, try to delete it in the background
  if (booking.gcalEventId) {
    waitUntil(
      (async () => {
        try {
          // Look up the project owner via event type
          const [eventType] = await db
            .select()
            .from(dbSchema.eventTypes)
            .where(eq(dbSchema.eventTypes.id, booking.eventTypeId))
            .limit(1);

          if (!eventType) return;

          const [project] = await db
            .select()
            .from(dbSchema.projects)
            .where(eq(dbSchema.projects.id, eventType.projectId))
            .limit(1);

          if (!project) return;

          // Use per-event-type destination calendar if set, else fall back
          let calConnection;
          let destinationCalendarId = "primary";

          if (eventType.destinationConnectionId) {
            const [conn] = await db
              .select()
              .from(dbSchema.calendarConnections)
              .where(eq(dbSchema.calendarConnections.id, eventType.destinationConnectionId))
              .limit(1);
            calConnection = conn;
            if (eventType.destinationCalendarId) {
              destinationCalendarId = eventType.destinationCalendarId;
            }
          } else {
            const [conn] = await db
              .select()
              .from(dbSchema.calendarConnections)
              .where(eq(dbSchema.calendarConnections.userId, project.userId))
              .limit(1);
            calConnection = conn;
          }

          if (!calConnection) return;

          const calendarService = new CalendarService(db, {
            GOOGLE_CALENDAR_CLIENT_ID: env.GOOGLE_CALENDAR_CLIENT_ID,
            GOOGLE_CALENDAR_CLIENT_SECRET: env.GOOGLE_CALENDAR_CLIENT_SECRET,
          });

          const accessToken = await calendarService.refreshAccessToken(
            calConnection.refreshToken,
          );

          await calendarService.deleteEvent(
            accessToken,
            destinationCalendarId,
            booking.gcalEventId!,
          );
        } catch (err) {
          console.error("Google Calendar event deletion failed:", err);
        }
      })(),
    );
  }

  // Send cancellation email in background
  waitUntil(
    (async () => {
      try {
        const [eventType] = await db
          .select({ projectId: dbSchema.eventTypes.projectId })
          .from(dbSchema.eventTypes)
          .where(eq(dbSchema.eventTypes.id, booking.eventTypeId))
          .limit(1);
        let theme: EmailTheme | undefined;
        if (eventType) {
          const [project] = await db
            .select({ settings: dbSchema.projects.settings })
            .from(dbSchema.projects)
            .where(eq(dbSchema.projects.id, eventType.projectId))
            .limit(1);
          theme = parseProjectTheme(project?.settings);
        }

        const emailService = new EmailService(env.RESEND_API_KEY);
        await emailService.sendBookingCancellation({
          to: booking.email,
          guestName: booking.name,
          eventTypeName: booking.eventTypeId, // fallback
          startTime: new Date(booking.startTime),
          endTime: new Date(booking.endTime),
          reason,
          theme,
        });
      } catch (err) {
        console.error("Cancellation email failed:", err);
      }
    })(),
  );

  // Dispatch booking_cancelled workflow trigger
  waitUntil(
    (async () => {
      try {
        const contactService = new ContactService(db);
        const contact = await contactService.findOrCreate(projectId, {
          name: booking.name,
          email: booking.email,
        });

        // Log cancellation activity for the contact
        await contactService.logActivity(contact.id, "cancelled", bookingId);

        await dispatchWorkflowTrigger(db, env, projectId, "booking_cancelled", {
          projectId,
          bookingId,
          contactId: contact.id,
          contactEmail: booking.email,
          contactName: booking.name,
        });
      } catch (err) {
        console.error("Booking cancel workflow dispatch failed:", err);
      }
    })(),
  );

  return { ok: true, booking };
}

// ─── Confirm Booking ─────────────────────────────────────────────────────────

export async function confirmBookingAction(
  deps: BookingActionDeps,
  projectId: string,
  bookingId: string,
): Promise<BookingActionResult> {
  const { db, env, waitUntil } = deps;

  const bookingService = new BookingService(db);
  const booking = await bookingService.confirm(bookingId);

  if (!booking) {
    return { ok: false, status: 404, error: "Booking not found or not pending" };
  }

  // Check if the event time has already passed
  if (new Date(booking.startTime) <= new Date()) {
    return { ok: false, status: 400, error: "Cannot confirm a booking whose time has already passed" };
  }

  // Look up event type and project for calendar + email
  const [eventType] = await db
    .select()
    .from(dbSchema.eventTypes)
    .where(eq(dbSchema.eventTypes.id, booking.eventTypeId))
    .limit(1);

  if (!eventType) {
    return { ok: true, booking };
  }

  const [project] = await db
    .select()
    .from(dbSchema.projects)
    .where(eq(dbSchema.projects.id, eventType.projectId))
    .limit(1);

  // Create Google Calendar event now
  const calendarService = new CalendarService(db, {
    GOOGLE_CALENDAR_CLIENT_ID: env.GOOGLE_CALENDAR_CLIENT_ID,
    GOOGLE_CALENDAR_CLIENT_SECRET: env.GOOGLE_CALENDAR_CLIENT_SECRET,
  });

  const projectTheme = parseProjectTheme(project?.settings);

  waitUntil(
    (async () => {
      let meetingUrl: string | undefined;

      try {
        let calConnection;
        let destinationCalendarId = "primary";

        if (eventType.destinationConnectionId) {
          const [conn] = await db
            .select()
            .from(dbSchema.calendarConnections)
            .where(eq(dbSchema.calendarConnections.id, eventType.destinationConnectionId))
            .limit(1);
          calConnection = conn;
          if (eventType.destinationCalendarId) {
            destinationCalendarId = eventType.destinationCalendarId;
          }
        } else if (project) {
          const [conn] = await db
            .select()
            .from(dbSchema.calendarConnections)
            .where(eq(dbSchema.calendarConnections.userId, project.userId))
            .limit(1);
          calConnection = conn;
        }

        if (calConnection) {
          const accessToken = await calendarService.refreshAccessToken(
            calConnection.refreshToken,
          );

          const attendeeEmails = await resolveInviteAttendees(
            db,
            eventType,
            calConnection.id,
            booking.email,
          );

          const gcalResult = await calendarService.createEvent(
            accessToken,
            destinationCalendarId,
            {
              summary: `${eventType.name} with ${booking.name}`,
              start: new Date(booking.startTime).toISOString(),
              end: new Date(booking.endTime).toISOString(),
              description: booking.notes ?? undefined,
              attendees: attendeeEmails,
              guestName: booking.name,
            },
          );

          meetingUrl = gcalResult.meetingUrl ?? undefined;

          await db
            .update(dbSchema.bookings)
            .set({ gcalEventId: gcalResult.id, meetingUrl: gcalResult.meetingUrl })
            .where(eq(dbSchema.bookings.id, booking.id));
        }
      } catch (err) {
        console.error("Calendar event creation on confirm failed:", err);
      }

      try {
        const emailService = new EmailService(env.RESEND_API_KEY);

        await emailService.sendBookingConfirmation({
          to: booking.email,
          guestName: booking.name,
          eventTypeName: eventType.name,
          startTime: new Date(booking.startTime),
          endTime: new Date(booking.endTime),
          timezone: booking.timezone,
          location: eventType.location ?? undefined,
          notes: booking.notes ?? undefined,
          meetingUrl,
          theme: projectTheme,
        });
      } catch (err) {
        console.error("Confirmation email failed:", err);
      }
    })(),
  );

  // Dispatch booking_confirmed workflow trigger
  waitUntil(
    (async () => {
      try {
        const contactService = new ContactService(db);
        const contact = await contactService.findOrCreate(projectId, {
          name: booking.name,
          email: booking.email,
        });

        // No activity log here — "booked" was already recorded when the
        // booking was created; logging again on confirm duplicated the
        // timeline entry.

        await dispatchWorkflowTrigger(db, env, projectId, "booking_confirmed", {
          projectId,
          bookingId,
          contactId: contact.id,
          contactEmail: booking.email,
          contactName: booking.name,
        });
      } catch (err) {
        console.error("Booking confirm workflow dispatch failed:", err);
      }
    })(),
  );

  return { ok: true, booking };
}

// ─── Decline Booking ─────────────────────────────────────────────────────────

export async function declineBookingAction(
  deps: BookingActionDeps,
  bookingId: string,
  opts: { reason?: string; notify: boolean },
): Promise<BookingActionResult> {
  const { db, env, waitUntil } = deps;
  const { reason, notify } = opts;

  const bookingService = new BookingService(db);
  const booking = await bookingService.decline(bookingId);

  if (!booking) {
    return { ok: false, status: 404, error: "Booking not found or not pending" };
  }

  // Send decline email to guest (unless silent)
  if (notify) {
    // Look up event type and owner for email
    const [eventType] = await db
      .select()
      .from(dbSchema.eventTypes)
      .where(eq(dbSchema.eventTypes.id, booking.eventTypeId))
      .limit(1);

    let ownerName = "the host";
    let declineTheme: EmailTheme | undefined;
    if (eventType) {
      const [project] = await db
        .select()
        .from(dbSchema.projects)
        .where(eq(dbSchema.projects.id, eventType.projectId))
        .limit(1);
      if (project) {
        declineTheme = parseProjectTheme(project.settings);
        const [owner] = await db
          .select()
          .from(dbSchema.schema.users)
          .where(eq(dbSchema.schema.users.id, project.userId))
          .limit(1);
        if (owner?.name) ownerName = owner.name;
      }
    }

    waitUntil(
      (async () => {
        try {
          const emailService = new EmailService(env.RESEND_API_KEY);
          await emailService.sendBookingDeclined({
            to: booking.email,
            guestName: booking.name,
            hostName: ownerName,
            eventTypeName: eventType?.name ?? "Meeting",
            startTime: new Date(booking.startTime),
            endTime: new Date(booking.endTime),
            timezone: booking.timezone,
            reason,
            theme: declineTheme,
          });
        } catch (err) {
          console.error("Decline email failed:", err);
        }
      })(),
    );
  }

  return { ok: true, booking };
}

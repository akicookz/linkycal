import { z } from "zod";
import { eq } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import * as dbSchema from "../../db/schema";
import { BookingService } from "../../services/booking-service";
import { AvailabilityService } from "../../services/availability-service";
import {
  createBookingAction,
  cancelBookingAction,
  confirmBookingAction,
  declineBookingAction,
} from "../../lib/booking-actions";
import type { ToolContext } from "../agent";
import { ok, err, withToolErrors, bookingInProject, inProject } from "../helpers";
import type { ToolResult } from "../helpers";

// ─── Handlers (exported for unit tests) ──────────────────────────────────────

const BOOKING_STATUSES = ["pending", "confirmed", "cancelled", "declined", "rescheduled"] as const;

export async function listBookings(
  ctx: ToolContext,
  input: { status?: (typeof BOOKING_STATUSES)[number]; limit?: number },
): Promise<ToolResult> {
  const service = new BookingService(ctx.db());
  let bookings = await service.listByProject(ctx.projectId());
  if (input.status) {
    bookings = bookings.filter((b) => b.status === input.status);
  }
  return ok(bookings.slice(0, input.limit ?? 50));
}

export async function getBooking(
  ctx: ToolContext,
  input: { bookingId: string },
): Promise<ToolResult> {
  const booking = await bookingInProject(ctx.db(), input.bookingId, ctx.projectId());
  if (!booking) return err("Not found");
  return ok(booking);
}

export async function getAvailableSlots(
  ctx: ToolContext,
  input: { eventTypeId: string; date: string; timezone: string },
): Promise<ToolResult> {
  const db = ctx.db();
  const projectId = ctx.projectId();

  const [eventType] = await db
    .select()
    .from(dbSchema.eventTypes)
    .where(eq(dbSchema.eventTypes.id, input.eventTypeId))
    .limit(1);
  if (!inProject(eventType ?? null, projectId)) return err("Not found");

  const [project] = await db
    .select({ slug: dbSchema.projects.slug })
    .from(dbSchema.projects)
    .where(eq(dbSchema.projects.id, projectId))
    .limit(1);
  if (!project) return err("Not found");

  const service = new AvailabilityService(db);
  const slots = await service.getAvailableSlots({
    projectSlug: project.slug,
    eventTypeSlug: eventType.slug,
    date: input.date,
    timezone: input.timezone,
  });
  return ok(slots);
}

export async function createBooking(
  ctx: ToolContext,
  input: {
    eventTypeId: string;
    name: string;
    email: string;
    startTime: string;
    timezone: string;
    notes?: string;
  },
): Promise<ToolResult> {
  const db = ctx.db();
  const projectId = ctx.projectId();

  const [eventType] = await db
    .select()
    .from(dbSchema.eventTypes)
    .where(eq(dbSchema.eventTypes.id, input.eventTypeId))
    .limit(1);
  if (!inProject(eventType ?? null, projectId)) return err("Not found");

  const [project] = await db
    .select({ slug: dbSchema.projects.slug })
    .from(dbSchema.projects)
    .where(eq(dbSchema.projects.id, projectId))
    .limit(1);
  if (!project) return err("Not found");

  const result = await createBookingAction(
    { db, env: ctx.env(), waitUntil: ctx.waitUntil },
    {
      projectSlug: project.slug,
      eventTypeSlug: eventType.slug,
      name: input.name,
      email: input.email,
      notes: input.notes,
      startTime: input.startTime,
      timezone: input.timezone,
    },
  );

  if (!result.ok) return err(result.error);
  return ok(result.booking);
}

export async function cancelBooking(
  ctx: ToolContext,
  input: { bookingId: string; reason?: string },
): Promise<ToolResult> {
  const db = ctx.db();
  const projectId = ctx.projectId();

  const booking = await bookingInProject(db, input.bookingId, projectId);
  if (!booking) return err("Not found");

  const result = await cancelBookingAction(
    { db, env: ctx.env(), waitUntil: ctx.waitUntil },
    projectId,
    input.bookingId,
    input.reason,
  );

  if (!result.ok) return err(result.error);
  return ok(result.booking);
}

export async function confirmBooking(
  ctx: ToolContext,
  input: { bookingId: string },
): Promise<ToolResult> {
  const db = ctx.db();
  const projectId = ctx.projectId();

  const booking = await bookingInProject(db, input.bookingId, projectId);
  if (!booking) return err("Not found");

  const result = await confirmBookingAction(
    { db, env: ctx.env(), waitUntil: ctx.waitUntil },
    projectId,
    input.bookingId,
  );

  if (!result.ok) return err(result.error);
  return ok(result.booking);
}

export async function declineBooking(
  ctx: ToolContext,
  input: { bookingId: string; reason?: string; notify?: boolean },
): Promise<ToolResult> {
  const db = ctx.db();
  const projectId = ctx.projectId();

  const booking = await bookingInProject(db, input.bookingId, projectId);
  if (!booking) return err("Not found");

  const result = await declineBookingAction(
    { db, env: ctx.env(), waitUntil: ctx.waitUntil },
    input.bookingId,
    { reason: input.reason, notify: input.notify ?? true },
  );

  if (!result.ok) return err(result.error);
  return ok(result.booking);
}

// ─── Registration ────────────────────────────────────────────────────────────

export function registerBookingTools(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    "list_bookings",
    {
      description:
        "List bookings for this project, newest first. Optionally filter by status and cap the number returned (default 50).",
      inputSchema: {
        status: z.enum(BOOKING_STATUSES).optional().describe("Filter by booking status"),
        limit: z.number().int().min(1).max(200).optional().describe("Max bookings to return (default 50)"),
      },
    },
    withToolErrors("list_bookings", (input) => listBookings(ctx, input)),
  );

  server.registerTool(
    "get_booking",
    {
      description: "Get a single booking by id, including guest details, times, status, and meeting URL.",
      inputSchema: {
        bookingId: z.string().describe("Booking id"),
      },
    },
    withToolErrors("get_booking", (input) => getBooking(ctx, input)),
  );

  server.registerTool(
    "get_available_slots",
    {
      description:
        "Get open time slots for an event type on a given day. Returns slots as ISO 8601 UTC instants; pass one of them as startTime to create_booking.",
      inputSchema: {
        eventTypeId: z.string().describe("Event type id (from list_event_types)"),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Day to check, YYYY-MM-DD in the given timezone"),
        timezone: z.string().describe("IANA timezone, e.g. America/New_York"),
      },
    },
    withToolErrors("get_available_slots", (input) => getAvailableSlots(ctx, input)),
  );

  server.registerTool(
    "create_booking",
    {
      description:
        "Book a meeting slot. startTime must be an ISO 8601 UTC instant matching a slot from get_available_slots. Sends confirmation emails, creates the calendar event, and triggers workflows exactly like a booking made through the booking page.",
      inputSchema: {
        eventTypeId: z.string().describe("Event type id (from list_event_types)"),
        name: z.string().min(1).max(200).describe("Guest name"),
        email: z.string().email().describe("Guest email"),
        startTime: z.string().describe("ISO 8601 UTC instant matching a slot from get_available_slots"),
        timezone: z.string().describe("Guest's IANA timezone, e.g. Europe/Berlin"),
        notes: z.string().max(2000).optional().describe("Optional notes from the guest"),
      },
    },
    withToolErrors("create_booking", (input) => createBooking(ctx, input)),
  );

  server.registerTool(
    "cancel_booking",
    {
      description:
        "Cancel a booking. Deletes the calendar event, emails the guest, and triggers booking_cancelled workflows.",
      inputSchema: {
        bookingId: z.string().describe("Booking id"),
        reason: z.string().max(500).optional().describe("Optional cancellation reason shown to the guest"),
      },
    },
    withToolErrors("cancel_booking", (input) => cancelBooking(ctx, input)),
  );

  server.registerTool(
    "confirm_booking",
    {
      description:
        "Confirm a pending booking (event types that require confirmation). Creates the calendar event, emails the guest, and triggers booking_confirmed workflows.",
      inputSchema: {
        bookingId: z.string().describe("Booking id (must be pending)"),
      },
    },
    withToolErrors("confirm_booking", (input) => confirmBooking(ctx, input)),
  );

  server.registerTool(
    "decline_booking",
    {
      description: "Decline a pending booking. Optionally emails the guest with a reason (notify defaults to true).",
      inputSchema: {
        bookingId: z.string().describe("Booking id (must be pending)"),
        reason: z.string().max(500).optional().describe("Optional reason shown to the guest"),
        notify: z.boolean().optional().describe("Send a decline email to the guest (default true)"),
      },
    },
    withToolErrors("decline_booking", (input) => declineBooking(ctx, input)),
  );
}

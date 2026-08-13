import { z } from "zod";
import { eq } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import * as dbSchema from "../../db/schema";
import {
  createBookingAction,
  cancelBookingAction,
  confirmBookingAction,
  declineBookingAction,
  getAvailableSlotsAction,
  getBookingAction,
  getBookingFormResponseAction,
  listBookingsAction,
} from "../../lib/booking-actions";
import { actionToMcpResult } from "../action-result";
import type { ToolContext } from "../agent";
import { withMcpToolDiscovery } from "../tool-discovery";
import { ok, err, withToolErrors, inProject } from "../helpers";
import type { ToolResult } from "../helpers";

// ─── Handlers (exported for unit tests) ──────────────────────────────────────

const BOOKING_STATUSES = ["pending", "confirmed", "cancelled", "declined", "rescheduled"] as const;

export async function listBookings(
  ctx: ToolContext,
  input: {
    status?: (typeof BOOKING_STATUSES)[number];
    limit?: number;
    offset?: number;
  },
): Promise<ToolResult> {
  return actionToMcpResult(
    await listBookingsAction(mcpBookingDeps(ctx), input),
  );
}

export async function getBooking(
  ctx: ToolContext,
  input: { bookingId: string },
): Promise<ToolResult> {
  return actionToMcpResult(
    await getBookingAction(mcpBookingDeps(ctx), input.bookingId),
  );
}

export async function getAvailableSlots(
  ctx: ToolContext,
  input: { eventTypeId: string; date: string; timezone: string },
): Promise<ToolResult> {
  return actionToMcpResult(
    await getAvailableSlotsAction(mcpBookingDeps(ctx), input),
  );
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
    metadata?: Record<string, unknown>;
    formFields?: Record<string, string>;
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
      metadata: input.metadata,
      formFields: input.formFields,
    },
  );

  if (!result.ok) return err(result.error);
  return ok(result.booking);
}

export async function getBookingFormResponse(
  ctx: ToolContext,
  input: { bookingId: string },
): Promise<ToolResult> {
  return actionToMcpResult(
    await getBookingFormResponseAction(mcpBookingDeps(ctx), input.bookingId),
  );
}

function mcpBookingDeps(ctx: ToolContext) {
  return {
    db: ctx.db(),
    env: ctx.env(),
    projectId: ctx.projectId(),
    channel: "mcp" as const,
    waitUntil: ctx.waitUntil,
  };
}

export async function cancelBooking(
  ctx: ToolContext,
  input: { bookingId: string; reason?: string },
): Promise<ToolResult> {
  const db = ctx.db();
  const projectId = ctx.projectId();

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

  const result = await declineBookingAction(
    { db, env: ctx.env(), waitUntil: ctx.waitUntil },
    projectId,
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
    withMcpToolDiscovery("list_bookings", {
      description:
        "List bookings for this project, newest first. Optionally filter by status and cap the number returned (default 50).",
      inputSchema: {
        status: z.enum(BOOKING_STATUSES).optional().describe("Filter by booking status"),
        limit: z.number().int().min(1).max(200).optional().describe("Max bookings to return (default 50)"),
        offset: z.number().int().min(0).optional().describe("Number of bookings to skip (default 0)"),
      },
    }),
    withToolErrors("list_bookings", ctx, (input) => listBookings(ctx, input)),
  );

  server.registerTool(
    "get_booking",
    withMcpToolDiscovery("get_booking", {
      description: "Get a single booking by id, including guest details, times, status, and meeting URL.",
      inputSchema: {
        bookingId: z.string().describe("Booking id"),
      },
    }),
    withToolErrors("get_booking", ctx, (input) => getBooking(ctx, input)),
  );

  server.registerTool(
    "get_available_slots",
    withMcpToolDiscovery("get_available_slots", {
      description:
        "Get open time slots for an event type on a given day. Returns slots as ISO 8601 UTC instants; pass one of them as startTime to create_booking.",
      inputSchema: {
        eventTypeId: z.string().describe("Event type id (from list_event_types)"),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Day to check, YYYY-MM-DD in the given timezone"),
        timezone: z.string().describe("IANA timezone, e.g. America/New_York"),
      },
    }),
    withToolErrors("get_available_slots", ctx, (input) => getAvailableSlots(ctx, input)),
  );

  server.registerTool(
    "create_booking",
    withMcpToolDiscovery("create_booking", {
      description:
        "Book a meeting slot. startTime must be an ISO 8601 UTC instant matching a slot from get_available_slots. Sends confirmation emails, creates the calendar event, and triggers workflows exactly like a booking made through the booking page.",
      inputSchema: {
        eventTypeId: z.string().describe("Event type id (from list_event_types)"),
        name: z.string().min(1).max(200).describe("Guest name"),
        email: z.string().email().describe("Guest email"),
        startTime: z.string().describe("ISO 8601 UTC instant matching a slot from get_available_slots"),
        timezone: z.string().describe("Guest's IANA timezone, e.g. Europe/Berlin"),
        notes: z.string().max(2000).optional().describe("Optional notes from the guest"),
        metadata: z.record(z.string(), z.unknown()).optional().describe("Optional booking metadata"),
        formFields: z.record(z.string(), z.string()).optional().describe("Booking form field values keyed by field id"),
      },
    }),
    withToolErrors("create_booking", ctx, (input) => createBooking(ctx, input)),
  );

  server.registerTool(
    "cancel_booking",
    withMcpToolDiscovery("cancel_booking", {
      description:
        "Cancel a booking. Deletes the calendar event, emails the guest, and triggers booking_cancelled workflows.",
      inputSchema: {
        bookingId: z.string().describe("Booking id"),
        reason: z.string().max(500).optional().describe("Optional cancellation reason shown to the guest"),
      },
    }),
    withToolErrors("cancel_booking", ctx, (input) => cancelBooking(ctx, input)),
  );

  server.registerTool(
    "confirm_booking",
    withMcpToolDiscovery("confirm_booking", {
      description:
        "Confirm a pending booking (event types that require confirmation). Creates the calendar event, emails the guest, and triggers booking_confirmed workflows.",
      inputSchema: {
        bookingId: z.string().describe("Booking id (must be pending)"),
      },
    }),
    withToolErrors("confirm_booking", ctx, (input) => confirmBooking(ctx, input)),
  );

  server.registerTool(
    "decline_booking",
    withMcpToolDiscovery("decline_booking", {
      description: "Decline a pending booking. Optionally emails the guest with a reason (notify defaults to true).",
      inputSchema: {
        bookingId: z.string().describe("Booking id (must be pending)"),
        reason: z.string().max(500).optional().describe("Optional reason shown to the guest"),
        notify: z.boolean().optional().describe("Send a decline email to the guest (default true)"),
      },
    }),
    withToolErrors("decline_booking", ctx, (input) => declineBooking(ctx, input)),
  );

  server.registerTool(
    "get_booking_form_response",
    withMcpToolDiscovery("get_booking_form_response", {
      description: "Get the submitted custom booking form fields for a booking.",
      inputSchema: {
        bookingId: z.string().describe("Booking id"),
      },
    }),
    withToolErrors("get_booking_form_response", ctx, (input) =>
      getBookingFormResponse(ctx, input),
    ),
  );
}

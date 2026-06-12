import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { EventTypeService } from "../../services/event-type-service";
import { createEventTypeSchema, updateEventTypeSchema } from "../../validation";
import type { ToolContext } from "../agent";
import {
  ok,
  err,
  withToolErrors,
  inProject,
  getPlanLimitsForProject,
} from "../helpers";
import type { ToolResult } from "../helpers";

type CreateEventTypeInput = z.infer<typeof createEventTypeSchema>;
type UpdateEventTypeInput = z.infer<typeof updateEventTypeSchema>;

// ─── Handlers (exported for unit tests) ──────────────────────────────────────

export async function listEventTypes(ctx: ToolContext): Promise<ToolResult> {
  const service = new EventTypeService(ctx.db());
  return ok(await service.list(ctx.projectId()));
}

export async function getEventType(
  ctx: ToolContext,
  input: { eventTypeId: string },
): Promise<ToolResult> {
  const service = new EventTypeService(ctx.db());
  const existing = inProject(await service.getById(input.eventTypeId), ctx.projectId());
  if (!existing) return err("Not found");

  return ok(await service.getByIdWithSchedule(input.eventTypeId));
}

export async function createEventType(
  ctx: ToolContext,
  input: CreateEventTypeInput,
): Promise<ToolResult> {
  const db = ctx.db();
  const projectId = ctx.projectId();
  const service = new EventTypeService(db);

  const planLimits = await getPlanLimitsForProject(db, projectId);
  const existing = await service.list(projectId);
  if (
    planLimits.maxEventTypes !== -1 &&
    existing.length >= planLimits.maxEventTypes
  ) {
    return err(`Plan limit reached: maximum ${planLimits.maxEventTypes} event type(s)`);
  }

  const eventType = await service.create(projectId, {
    name: input.name,
    slug: input.slug,
    duration: input.duration,
    description: input.description ?? undefined,
    location: input.location ?? undefined,
    color: input.color ?? undefined,
    bufferBefore: input.bufferBefore,
    bufferAfter: input.bufferAfter,
    maxPerDay: input.maxPerDay ?? undefined,
    enabled: input.enabled,
    requiresConfirmation: input.requiresConfirmation,
    bookingFormId: input.bookingFormId ?? undefined,
    settings: input.settings ?? undefined,
  });
  return ok(eventType);
}

export async function updateEventType(
  ctx: ToolContext,
  input: { eventTypeId: string } & UpdateEventTypeInput,
): Promise<ToolResult> {
  const service = new EventTypeService(ctx.db());
  const existing = inProject(await service.getById(input.eventTypeId), ctx.projectId());
  if (!existing) return err("Not found");

  const updateData: Record<string, unknown> = {};
  if (input.name !== undefined) updateData.name = input.name;
  if (input.slug !== undefined) updateData.slug = input.slug;
  if (input.duration !== undefined) updateData.duration = input.duration;
  if (input.description !== undefined) updateData.description = input.description ?? undefined;
  if (input.location !== undefined) updateData.location = input.location ?? undefined;
  if (input.color !== undefined) updateData.color = input.color;
  if (input.bufferBefore !== undefined) updateData.bufferBefore = input.bufferBefore;
  if (input.bufferAfter !== undefined) updateData.bufferAfter = input.bufferAfter;
  if (input.maxPerDay !== undefined) updateData.maxPerDay = input.maxPerDay ?? undefined;
  if (input.enabled !== undefined) updateData.enabled = input.enabled;
  if (input.requiresConfirmation !== undefined) updateData.requiresConfirmation = input.requiresConfirmation;
  if (input.bookingFormId !== undefined) updateData.bookingFormId = input.bookingFormId;
  if (input.settings !== undefined) updateData.settings = input.settings ?? undefined;

  const eventType = await service.update(
    input.eventTypeId,
    updateData as Parameters<typeof service.update>[1],
  );
  if (!eventType) return err("Not found");
  return ok(eventType);
}

// ─── Registration ────────────────────────────────────────────────────────────

const createShape = createEventTypeSchema.shape;
const updateShape = updateEventTypeSchema.shape;

export function registerEventTypeTools(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    "list_event_types",
    {
      description: "List all event types (bookable meeting types) in this project.",
      inputSchema: {},
    },
    withToolErrors("list_event_types", () => listEventTypes(ctx)),
  );

  server.registerTool(
    "get_event_type",
    {
      description: "Get an event type by id, including its schedule, availability rules, and date overrides.",
      inputSchema: {
        eventTypeId: z.string().describe("Event type id"),
      },
    },
    withToolErrors("get_event_type", (input) => getEventType(ctx, input)),
  );

  server.registerTool(
    "create_event_type",
    {
      description:
        "Create an event type. duration/buffers are in minutes. A default weekday 9am-5pm schedule is created with it.",
      inputSchema: {
        name: createShape.name.describe("Display name, e.g. 'Intro Call'"),
        slug: createShape.slug.describe("URL slug, lowercase letters/numbers/hyphens"),
        duration: createShape.duration.describe("Meeting length in minutes (default 30)"),
        description: createShape.description.describe("Public description"),
        location: createShape.location.describe("Location text, e.g. 'Google Meet'"),
        color: createShape.color.describe("Hex color like #4f7e63"),
        bufferBefore: createShape.bufferBefore.describe("Buffer before, in minutes (default 0)"),
        bufferAfter: createShape.bufferAfter.describe("Buffer after, in minutes (default 0)"),
        maxPerDay: createShape.maxPerDay.describe("Max bookings per day (null = unlimited)"),
        enabled: createShape.enabled.describe("Whether the event type is bookable (default true)"),
        requiresConfirmation: createShape.requiresConfirmation.describe(
          "If true, new bookings are pending until confirmed (default false)",
        ),
      },
    },
    withToolErrors("create_event_type", (input) => createEventType(ctx, input)),
  );

  server.registerTool(
    "update_event_type",
    {
      description: "Update an event type. Only provided fields change.",
      inputSchema: {
        eventTypeId: z.string().describe("Event type id"),
        name: updateShape.name.describe("New name"),
        slug: updateShape.slug.describe("New slug"),
        duration: updateShape.duration.describe("New duration in minutes"),
        description: updateShape.description.describe("New description (null to clear)"),
        location: updateShape.location.describe("New location (null to clear)"),
        color: updateShape.color.describe("New hex color"),
        bufferBefore: updateShape.bufferBefore.describe("Buffer before, in minutes"),
        bufferAfter: updateShape.bufferAfter.describe("Buffer after, in minutes"),
        maxPerDay: updateShape.maxPerDay.describe("Max bookings per day (null = unlimited)"),
        enabled: updateShape.enabled.describe("Enable/disable booking"),
        requiresConfirmation: updateShape.requiresConfirmation.describe("Require manual confirmation"),
      },
    },
    withToolErrors("update_event_type", (input) => updateEventType(ctx, input)),
  );
}

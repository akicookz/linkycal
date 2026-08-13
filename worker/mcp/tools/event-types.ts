import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  createEventTypeAction,
  deleteEventTypeAction,
  getEventTypeAction,
  listEventTypesAction,
  updateEventTypeAction,
} from "../../lib/event-type-actions";
import { createEventTypeSchema, updateEventTypeSchema } from "../../validation";
import type { ProjectActionDeps } from "../../lib/action-result";
import type { ToolContext } from "../agent";
import { actionToMcpResult } from "../action-result";
import { withToolErrors } from "../helpers";
import { withMcpToolDiscovery } from "../tool-discovery";

function projectActionDeps(ctx: ToolContext): ProjectActionDeps {
  return {
    db: ctx.db(),
    env: ctx.env(),
    projectId: ctx.projectId(),
    channel: "mcp",
    waitUntil: ctx.waitUntil,
  };
}

// ─── Handlers (exported for unit tests) ──────────────────────────────────────

export async function listEventTypes(ctx: ToolContext) {
  return actionToMcpResult(await listEventTypesAction(projectActionDeps(ctx)));
}

export async function getEventType(
  ctx: ToolContext,
  input: { eventTypeId: string },
) {
  return actionToMcpResult(
    await getEventTypeAction(projectActionDeps(ctx), input.eventTypeId),
  );
}

export async function createEventType(
  ctx: ToolContext,
  input: z.infer<typeof createEventTypeSchema>,
) {
  return actionToMcpResult(await createEventTypeAction(projectActionDeps(ctx), input));
}

export async function updateEventType(
  ctx: ToolContext,
  input: { eventTypeId: string } & z.infer<typeof updateEventTypeSchema>,
) {
  const { eventTypeId, ...body } = input;
  return actionToMcpResult(
    await updateEventTypeAction(projectActionDeps(ctx), eventTypeId, body),
  );
}

export async function deleteEventType(
  ctx: ToolContext,
  input: { eventTypeId: string },
) {
  return actionToMcpResult(
    await deleteEventTypeAction(projectActionDeps(ctx), input.eventTypeId),
  );
}

// ─── Registration ────────────────────────────────────────────────────────────

const createShape = createEventTypeSchema.shape;
const updateShape = updateEventTypeSchema.shape;

export function registerEventTypeTools(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    "list_event_types",
    withMcpToolDiscovery("list_event_types", {
      description: "List all event types (bookable meeting types) in this project.",
      inputSchema: {},
    }),
    withToolErrors("list_event_types", ctx, () => listEventTypes(ctx)),
  );

  server.registerTool(
    "get_event_type",
    withMcpToolDiscovery("get_event_type", {
      description: "Get an event type by id, including its schedule, availability rules, and date overrides.",
      inputSchema: { eventTypeId: z.string().describe("Event type id") },
    }),
    withToolErrors("get_event_type", ctx, (input) => getEventType(ctx, input)),
  );

  server.registerTool(
    "create_event_type",
    withMcpToolDiscovery("create_event_type", {
      description: "Create an event type. duration and buffers are in minutes.",
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
        maxPerWeek: createShape.maxPerWeek.describe("Max bookings per week (null = unlimited)"),
        weekStart: createShape.weekStart.describe("Week boundary for the weekly cap"),
        enabled: createShape.enabled.describe("Whether the event type is bookable"),
        requiresConfirmation: createShape.requiresConfirmation.describe("Require manual confirmation"),
        bookingFormId: createShape.bookingFormId.describe("Project form to show during booking"),
        settings: createShape.settings.describe("Event type settings"),
        copyFromEventTypeId: createShape.copyFromEventTypeId.describe("Project event type whose schedule to copy"),
      },
    }),
    withToolErrors("create_event_type", ctx, (input) => createEventType(ctx, input)),
  );

  server.registerTool(
    "update_event_type",
    withMcpToolDiscovery("update_event_type", {
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
        maxPerWeek: updateShape.maxPerWeek.describe("Max bookings per week (null = unlimited)"),
        weekStart: updateShape.weekStart.describe("Week boundary for the weekly cap"),
        enabled: updateShape.enabled.describe("Enable or disable booking"),
        requiresConfirmation: updateShape.requiresConfirmation.describe("Require manual confirmation"),
        bookingFormId: updateShape.bookingFormId.describe("Project form to show during booking"),
        settings: updateShape.settings.describe("Event type settings, null to clear"),
      },
    }),
    withToolErrors("update_event_type", ctx, (input) => updateEventType(ctx, input)),
  );

  server.registerTool(
    "delete_event_type",
    withMcpToolDiscovery("delete_event_type", {
      description: "Delete an event type and its associated availability schedule.",
      inputSchema: { eventTypeId: z.string().describe("Event type id") },
    }),
    withToolErrors("delete_event_type", ctx, (input) => deleteEventType(ctx, input)),
  );
}

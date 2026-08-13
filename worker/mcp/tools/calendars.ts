import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  getEventTypeCalendarsAction,
  listProjectCalendarsAction,
  updateEventTypeCalendarsAction,
} from "../../lib/calendar-actions";
import { updateEventTypeCalendarsSchema } from "../../validation";
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

// ─── Handlers ───────────────────────────────────────────────────────────────

export async function listProjectCalendars(ctx: ToolContext) {
  return actionToMcpResult(await listProjectCalendarsAction(projectActionDeps(ctx)));
}

export async function getEventTypeCalendars(
  ctx: ToolContext,
  input: { eventTypeId: string },
) {
  return actionToMcpResult(
    await getEventTypeCalendarsAction(projectActionDeps(ctx), input.eventTypeId),
  );
}

export async function updateEventTypeCalendars(
  ctx: ToolContext,
  input: { eventTypeId: string } & z.infer<typeof updateEventTypeCalendarsSchema>,
) {
  const { eventTypeId, ...body } = input;
  return actionToMcpResult(
    await updateEventTypeCalendarsAction(projectActionDeps(ctx), eventTypeId, body),
  );
}

// ─── Registration ───────────────────────────────────────────────────────────

const calendarShape = updateEventTypeCalendarsSchema.shape;

export function registerCalendarTools(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    "list_project_calendars",
    withMcpToolDiscovery("list_project_calendars", {
      description: "List calendars available through this project's connected accounts.",
      inputSchema: {},
    }),
    withToolErrors("list_project_calendars", ctx, () => listProjectCalendars(ctx)),
  );

  server.registerTool(
    "get_event_type_calendars",
    withMcpToolDiscovery("get_event_type_calendars", {
      description: "Get calendar destination, free/busy, and invite routing for an event type.",
      inputSchema: { eventTypeId: z.string().min(1).describe("Event type id") },
    }),
    withToolErrors("get_event_type_calendars", ctx, (input) => getEventTypeCalendars(ctx, input)),
  );

  server.registerTool(
    "update_event_type_calendars",
    withMcpToolDiscovery("update_event_type_calendars", {
      description: "Configure calendar destination, free/busy sources, and invite accounts for an event type.",
      inputSchema: {
        eventTypeId: z.string().min(1).describe("Event type id"),
        destination: calendarShape.destination.describe("Destination calendar, or null to disable"),
        busyCalendars: calendarShape.busyCalendars.describe("Calendars used for free/busy checks"),
        inviteConnectionIds: calendarShape.inviteConnectionIds.describe("Connected accounts that receive invites"),
      },
    }),
    withToolErrors("update_event_type_calendars", ctx, (input) => updateEventTypeCalendars(ctx, input)),
  );
}

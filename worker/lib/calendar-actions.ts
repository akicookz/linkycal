import { and, eq } from "drizzle-orm";
import { z } from "zod";

import * as dbSchema from "../db/schema";
import { CalendarService } from "../services/calendar-service";
import { updateEventTypeCalendarsSchema, validate } from "../validation";
import {
  parseBusyCalendars,
  parseInviteConnectionIds,
  serializeBusyCalendars,
  serializeInviteConnectionIds,
} from "./calendar-refs";
import { projectCanUseCalendarConnections } from "./calendar-connection-scope";
import { resolveProjectWorkspace } from "./entitlements";
import {
  actionError,
  actionNotFound,
  actionOk,
} from "./action-result";
import type { ActionResult, ProjectActionDeps } from "./action-result";
import type { ProjectScope } from "../types";

type CalendarConfigInput = z.infer<typeof updateEventTypeCalendarsSchema>;

interface CalendarAccount {
  connectionId: string;
  email: string;
  calendars: Awaited<ReturnType<CalendarService["listCalendars"]>>;
}

async function calendarScope(
  deps: ProjectActionDeps,
): Promise<ProjectScope | null> {
  if (deps.projectScope) {
    return deps.projectScope.projectId === deps.projectId ? deps.projectScope : null;
  }
  const workspace = await resolveProjectWorkspace(deps.db, deps.projectId);
  if (!workspace) return null;
  return {
    projectId: deps.projectId,
    ownerUserId: workspace.ownerUserId,
    teamId: workspace.teamId,
  };
}

async function eventTypeInProject(
  deps: ProjectActionDeps,
  eventTypeId: string,
): Promise<dbSchema.EventTypeRow | null> {
  const [eventType] = await deps.db
    .select()
    .from(dbSchema.eventTypes)
    .where(
      and(
        eq(dbSchema.eventTypes.id, eventTypeId),
        eq(dbSchema.eventTypes.projectId, deps.projectId),
      ),
    )
    .limit(1);
  return eventType ?? null;
}

function validationFailure<T>(error: unknown): ActionResult<T> {
  if (error instanceof z.ZodError) return actionError(400, "Invalid request");
  return actionError(400, "Invalid request");
}

// ─── Project calendar discovery ─────────────────────────────────────────────

export async function listProjectCalendarsAction(
  deps: ProjectActionDeps,
): Promise<ActionResult<{ accounts: CalendarAccount[] }>> {
  const scope = await calendarScope(deps);
  if (!scope) return actionNotFound("Project");
  const connections = scope.teamId
    ? await deps.db
        .select({
          id: dbSchema.calendarConnections.id,
          email: dbSchema.calendarConnections.email,
          refreshToken: dbSchema.calendarConnections.refreshToken,
        })
        .from(dbSchema.teamCalendarConnections)
        .innerJoin(
          dbSchema.calendarConnections,
          eq(
            dbSchema.teamCalendarConnections.connectionId,
            dbSchema.calendarConnections.id,
          ),
        )
        .where(eq(dbSchema.teamCalendarConnections.teamId, scope.teamId))
    : await deps.db
        .select({
          id: dbSchema.calendarConnections.id,
          email: dbSchema.calendarConnections.email,
          refreshToken: dbSchema.calendarConnections.refreshToken,
        })
        .from(dbSchema.calendarConnections)
        .where(eq(dbSchema.calendarConnections.userId, scope.ownerUserId));
  if (connections.length === 0) return actionOk({ accounts: [] });

  const service = new CalendarService(deps.db, {
    GOOGLE_CALENDAR_CLIENT_ID: deps.env.GOOGLE_CALENDAR_CLIENT_ID,
    GOOGLE_CALENDAR_CLIENT_SECRET: deps.env.GOOGLE_CALENDAR_CLIENT_SECRET,
  });
  const accounts: CalendarAccount[] = [];
  for (const connection of connections) {
    try {
      const token = await service.refreshAccessToken(connection.refreshToken);
      const calendars = await service.listCalendars(token);
      accounts.push({
        connectionId: connection.id,
        email: connection.email,
        calendars,
      });
    } catch (error) {
      console.error(`Failed to list calendars for ${connection.email}:`, error);
      accounts.push({
        connectionId: connection.id,
        email: connection.email,
        calendars: [],
      });
    }
  }
  return actionOk({ accounts });
}

// ─── Event type calendar routing ────────────────────────────────────────────

export async function getEventTypeCalendarsAction(
  deps: ProjectActionDeps,
  eventTypeId: string,
): Promise<ActionResult<{
  destination: { connectionId: string; calendarId: string } | null;
  busyCalendars: ReturnType<typeof parseBusyCalendars>;
  inviteConnectionIds: string[];
}>> {
  const eventType = await eventTypeInProject(deps, eventTypeId);
  if (!eventType) return actionNotFound("Event type");
  return actionOk({
    destination:
      eventType.destinationConnectionId && eventType.destinationCalendarId
        ? {
            connectionId: eventType.destinationConnectionId,
            calendarId: eventType.destinationCalendarId,
          }
        : null,
    busyCalendars: parseBusyCalendars(eventType.busyCalendars),
    inviteConnectionIds: parseInviteConnectionIds(eventType.inviteConnectionIds),
  });
}

export async function updateEventTypeCalendarsAction(
  deps: ProjectActionDeps,
  eventTypeId: string,
  body: unknown,
): Promise<ActionResult<{ success: true }>> {
  let data: CalendarConfigInput;
  try {
    data = validate(updateEventTypeCalendarsSchema, body);
  } catch (error) {
    return validationFailure(error);
  }
  if (!(await eventTypeInProject(deps, eventTypeId))) {
    return actionNotFound("Event type");
  }
  const scope = await calendarScope(deps);
  if (!scope) return actionNotFound("Project");
  const connectionIds = [
    data.destination?.connectionId,
    ...data.busyCalendars.map(function connectionId(calendar) {
      return calendar.connectionId;
    }),
    ...data.inviteConnectionIds,
  ].filter(function defined(id): id is string {
    return Boolean(id);
  });
  if (!(await projectCanUseCalendarConnections(deps.db, scope, connectionIds))) {
    return actionError(400, "Calendar connection is not available to this project");
  }
  await deps.db
    .update(dbSchema.eventTypes)
    .set({
      destinationConnectionId: data.destination?.connectionId ?? null,
      destinationCalendarId: data.destination?.calendarId ?? null,
      busyCalendars: serializeBusyCalendars(data.busyCalendars),
      inviteConnectionIds: serializeInviteConnectionIds(data.inviteConnectionIds),
    })
    .where(
      and(
        eq(dbSchema.eventTypes.id, eventTypeId),
        eq(dbSchema.eventTypes.projectId, deps.projectId),
      ),
    );
  return actionOk({ success: true });
}

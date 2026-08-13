import { and, eq } from "drizzle-orm";
import { z } from "zod";

import * as dbSchema from "../db/schema";
import { EventTypeService } from "../services/event-type-service";
import { ScheduleService } from "../services/schedule-service";
import {
  createEventTypeSchema,
  updateEventTypeSchema,
  validate,
} from "../validation";
import {
  actionCreated,
  actionError,
  actionNotFound,
  actionOk,
} from "./action-result";
import { createWithResourceCapacity } from "./resource-creation";
import type { ActionErrorBody, ActionResult, ProjectActionDeps } from "./action-result";

type CreateEventTypeInput = z.infer<typeof createEventTypeSchema>;
type UpdateEventTypeInput = z.infer<typeof updateEventTypeSchema>;

function validationFailure<T>(error: unknown): ActionResult<T> {
  if (error instanceof z.ZodError) return actionError(400, "Invalid request");
  return actionError(400, "Invalid request");
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

async function formInProject(
  deps: ProjectActionDeps,
  formId: string,
): Promise<boolean> {
  const [form] = await deps.db
    .select({ id: dbSchema.forms.id })
    .from(dbSchema.forms)
    .where(
      and(
        eq(dbSchema.forms.id, formId),
        eq(dbSchema.forms.projectId, deps.projectId),
      ),
    )
    .limit(1);
  return !!form;
}

async function ensureEventTypeReferences(
  deps: ProjectActionDeps,
  data: Pick<CreateEventTypeInput, "bookingFormId" | "copyFromEventTypeId">,
): Promise<ActionResult<null> | null> {
  if (data.bookingFormId && !(await formInProject(deps, data.bookingFormId))) {
    return actionNotFound("Form");
  }
  if (
    data.copyFromEventTypeId &&
    !(await eventTypeInProject(deps, data.copyFromEventTypeId))
  ) {
    return actionNotFound("Event type");
  }
  return null;
}

function mapEventTypeUpdate(data: UpdateEventTypeInput): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.slug !== undefined) update.slug = data.slug;
  if (data.duration !== undefined) update.duration = data.duration;
  if (data.description !== undefined) update.description = data.description;
  if (data.location !== undefined) update.location = data.location;
  if (data.color !== undefined) update.color = data.color;
  if (data.bufferBefore !== undefined) update.bufferBefore = data.bufferBefore;
  if (data.bufferAfter !== undefined) update.bufferAfter = data.bufferAfter;
  if (data.maxPerDay !== undefined) update.maxPerDay = data.maxPerDay;
  if (data.maxPerWeek !== undefined) update.maxPerWeek = data.maxPerWeek;
  if (data.weekStart !== undefined) update.weekStart = data.weekStart;
  if (data.enabled !== undefined) update.enabled = data.enabled;
  if (data.requiresConfirmation !== undefined) {
    update.requiresConfirmation = data.requiresConfirmation;
  }
  if (data.bookingFormId !== undefined) update.bookingFormId = data.bookingFormId;
  if (data.settings !== undefined) update.settings = data.settings;
  return update;
}

// ─── Event types ────────────────────────────────────────────────────────────

export async function listEventTypesAction(
  deps: ProjectActionDeps,
): Promise<ActionResult<dbSchema.EventTypeRow[]>> {
  return actionOk(await new EventTypeService(deps.db).list(deps.projectId));
}

export async function getEventTypeAction(
  deps: ProjectActionDeps,
  eventTypeId: string,
): Promise<ActionResult<{
  eventType: dbSchema.EventTypeRow;
  schedule: dbSchema.ScheduleRow | null;
  rules: dbSchema.AvailabilityRuleRow[];
  overrides: dbSchema.ScheduleOverrideRow[];
}>> {
  const eventType = await eventTypeInProject(deps, eventTypeId);
  if (!eventType) return actionNotFound("Event type");
  if (!eventType.scheduleId) {
    return actionOk({ eventType, schedule: null, rules: [], overrides: [] });
  }

  const [schedule] = await deps.db
    .select()
    .from(dbSchema.schedules)
    .where(
      and(
        eq(dbSchema.schedules.id, eventType.scheduleId),
        eq(dbSchema.schedules.projectId, deps.projectId),
      ),
    )
    .limit(1);
  if (!schedule) {
    return actionOk({ eventType, schedule: null, rules: [], overrides: [] });
  }
  const schedules = new ScheduleService(deps.db);
  const [rules, overrides] = await Promise.all([
    schedules.getRules(schedule.id),
    schedules.getOverrides(schedule.id),
  ]);
  return actionOk({ eventType, schedule, rules, overrides });
}

export async function createEventTypeAction(
  deps: ProjectActionDeps,
  body: unknown,
): Promise<ActionResult<dbSchema.EventTypeRow>> {
  let data: CreateEventTypeInput;
  try {
    data = validate(createEventTypeSchema, body);
  } catch (error) {
    return validationFailure(error);
  }
  const references = await ensureEventTypeReferences(deps, data);
  if (references && !references.ok) return references;

  const creation = await createWithResourceCapacity({
    db: deps.db,
    projectId: deps.projectId,
    key: "eventTypes",
    env: deps.env,
    channel: deps.channel,
    create: async function createEventTypeWithCapacity(transaction) {
      return new EventTypeService(transaction).create(deps.projectId, data);
    },
  });
  if (!creation.ok) {
    return {
      ok: false,
      status: creation.status,
      body: creation.body as unknown as ActionErrorBody,
    };
  }
  return actionCreated(creation.value);
}

export async function updateEventTypeAction(
  deps: ProjectActionDeps,
  eventTypeId: string,
  body: unknown,
): Promise<ActionResult<dbSchema.EventTypeRow>> {
  let data: UpdateEventTypeInput;
  try {
    data = validate(updateEventTypeSchema, body);
  } catch (error) {
    return validationFailure(error);
  }
  if (!(await eventTypeInProject(deps, eventTypeId))) {
    return actionNotFound("Event type");
  }
  if (data.bookingFormId && !(await formInProject(deps, data.bookingFormId))) {
    return actionNotFound("Form");
  }
  const eventType = await new EventTypeService(deps.db).update(
    eventTypeId,
    mapEventTypeUpdate(data) as Parameters<EventTypeService["update"]>[1],
  );
  if (!eventType) return actionNotFound("Event type");
  return actionOk(eventType);
}

export async function deleteEventTypeAction(
  deps: ProjectActionDeps,
  eventTypeId: string,
): Promise<ActionResult<{ success: true }>> {
  if (!(await eventTypeInProject(deps, eventTypeId))) {
    return actionNotFound("Event type");
  }
  await new EventTypeService(deps.db).delete(eventTypeId);
  return actionOk({ success: true });
}

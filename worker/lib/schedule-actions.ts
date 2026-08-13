import { and, eq } from "drizzle-orm";
import { z } from "zod";

import * as dbSchema from "../db/schema";
import { ScheduleService } from "../services/schedule-service";
import {
  createScheduleOverrideSchema,
  createScheduleSchema,
  updateAvailabilityRulesSchema,
  validate,
} from "../validation";
import {
  actionCreated,
  actionError,
  actionNotFound,
  actionOk,
} from "./action-result";
import type { ActionResult, ProjectActionDeps } from "./action-result";

type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
type UpdateRulesInput = z.infer<typeof updateAvailabilityRulesSchema>;
type CreateOverrideInput = z.infer<typeof createScheduleOverrideSchema>;

function validationFailure<T>(error: unknown): ActionResult<T> {
  if (error instanceof z.ZodError) return actionError(400, "Invalid request");
  return actionError(400, "Invalid request");
}

async function scheduleInProject(
  deps: ProjectActionDeps,
  scheduleId: string,
): Promise<dbSchema.ScheduleRow | null> {
  const [schedule] = await deps.db
    .select()
    .from(dbSchema.schedules)
    .where(
      and(
        eq(dbSchema.schedules.id, scheduleId),
        eq(dbSchema.schedules.projectId, deps.projectId),
      ),
    )
    .limit(1);
  return schedule ?? null;
}

// ─── Schedules ──────────────────────────────────────────────────────────────

export async function listSchedulesAction(
  deps: ProjectActionDeps,
): Promise<ActionResult<dbSchema.ScheduleRow[]>> {
  return actionOk(await new ScheduleService(deps.db).list(deps.projectId));
}

export async function getScheduleAction(
  deps: ProjectActionDeps,
  scheduleId: string,
): Promise<ActionResult<{
  schedule: dbSchema.ScheduleRow;
  rules: dbSchema.AvailabilityRuleRow[];
  overrides: dbSchema.ScheduleOverrideRow[];
}>> {
  const schedule = await scheduleInProject(deps, scheduleId);
  if (!schedule) return actionNotFound("Schedule");
  const service = new ScheduleService(deps.db);
  const [rules, overrides] = await Promise.all([
    service.getRules(schedule.id),
    service.getOverrides(schedule.id),
  ]);
  return actionOk({ schedule, rules, overrides });
}

export async function createScheduleAction(
  deps: ProjectActionDeps,
  body: unknown,
): Promise<ActionResult<dbSchema.ScheduleRow>> {
  let data: CreateScheduleInput;
  try {
    data = validate(createScheduleSchema, body);
  } catch (error) {
    return validationFailure(error);
  }
  return actionCreated(await new ScheduleService(deps.db).create(deps.projectId, data));
}

export async function updateScheduleAction(
  deps: ProjectActionDeps,
  scheduleId: string,
  body: unknown,
): Promise<ActionResult<dbSchema.ScheduleRow>> {
  let data: CreateScheduleInput;
  try {
    data = validate(createScheduleSchema, body);
  } catch (error) {
    return validationFailure(error);
  }
  if (!(await scheduleInProject(deps, scheduleId))) {
    return actionNotFound("Schedule");
  }
  const schedule = await new ScheduleService(deps.db).update(scheduleId, data);
  if (!schedule) return actionNotFound("Schedule");
  return actionOk(schedule);
}

export async function deleteScheduleAction(
  deps: ProjectActionDeps,
  scheduleId: string,
): Promise<ActionResult<{ success: true }>> {
  if (!(await scheduleInProject(deps, scheduleId))) {
    return actionNotFound("Schedule");
  }
  await new ScheduleService(deps.db).delete(scheduleId);
  return actionOk({ success: true });
}

export async function setScheduleRulesAction(
  deps: ProjectActionDeps,
  scheduleId: string,
  body: unknown,
  timezone?: string,
): Promise<ActionResult<dbSchema.AvailabilityRuleRow[]>> {
  let data: UpdateRulesInput;
  try {
    data = validate(updateAvailabilityRulesSchema, body);
  } catch (error) {
    return validationFailure(error);
  }
  if (!(await scheduleInProject(deps, scheduleId))) {
    return actionNotFound("Schedule");
  }
  const service = new ScheduleService(deps.db);
  return actionOk(await service.setRules(scheduleId, data.rules, timezone));
}

export async function addScheduleOverrideAction(
  deps: ProjectActionDeps,
  scheduleId: string,
  body: unknown,
): Promise<ActionResult<dbSchema.ScheduleOverrideRow>> {
  let data: CreateOverrideInput;
  try {
    data = validate(createScheduleOverrideSchema, body);
  } catch (error) {
    return validationFailure(error);
  }
  if (!(await scheduleInProject(deps, scheduleId))) {
    return actionNotFound("Schedule");
  }
  return actionCreated(
    await new ScheduleService(deps.db).addOverride(scheduleId, {
      ...data,
      startTime: data.startTime ?? undefined,
      endTime: data.endTime ?? undefined,
    }),
  );
}

export async function deleteScheduleOverrideAction(
  deps: ProjectActionDeps,
  scheduleId: string,
  overrideId: string,
): Promise<ActionResult<{ success: true }>> {
  if (!(await scheduleInProject(deps, scheduleId))) {
    return actionNotFound("Schedule");
  }
  const [override] = await deps.db
    .select({ id: dbSchema.scheduleOverrides.id })
    .from(dbSchema.scheduleOverrides)
    .where(
      and(
        eq(dbSchema.scheduleOverrides.id, overrideId),
        eq(dbSchema.scheduleOverrides.scheduleId, scheduleId),
      ),
    )
    .limit(1);
  if (!override) return actionNotFound("Override");
  await new ScheduleService(deps.db).deleteOverride(overrideId);
  return actionOk({ success: true });
}

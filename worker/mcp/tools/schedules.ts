import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  addScheduleOverrideAction,
  createScheduleAction,
  deleteScheduleAction,
  deleteScheduleOverrideAction,
  getScheduleAction,
  listSchedulesAction,
  setScheduleRulesAction,
  updateScheduleAction,
} from "../../lib/schedule-actions";
import {
  createScheduleOverrideSchema,
  createScheduleSchema,
  updateAvailabilityRulesSchema,
} from "../../validation";
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

export async function listSchedules(ctx: ToolContext) {
  return actionToMcpResult(await listSchedulesAction(projectActionDeps(ctx)));
}

export async function getSchedule(
  ctx: ToolContext,
  input: { scheduleId: string },
) {
  return actionToMcpResult(
    await getScheduleAction(projectActionDeps(ctx), input.scheduleId),
  );
}

export async function createSchedule(
  ctx: ToolContext,
  input: z.infer<typeof createScheduleSchema>,
) {
  return actionToMcpResult(await createScheduleAction(projectActionDeps(ctx), input));
}

export async function updateSchedule(
  ctx: ToolContext,
  input: { scheduleId: string } & z.infer<typeof createScheduleSchema>,
) {
  const { scheduleId, ...body } = input;
  return actionToMcpResult(
    await updateScheduleAction(projectActionDeps(ctx), scheduleId, body),
  );
}

export async function deleteSchedule(
  ctx: ToolContext,
  input: { scheduleId: string },
) {
  return actionToMcpResult(
    await deleteScheduleAction(projectActionDeps(ctx), input.scheduleId),
  );
}

export async function setScheduleRules(
  ctx: ToolContext,
  input: { scheduleId: string; timezone?: string } & z.infer<typeof updateAvailabilityRulesSchema>,
) {
  const { scheduleId, timezone, ...body } = input;
  return actionToMcpResult(
    await setScheduleRulesAction(projectActionDeps(ctx), scheduleId, body, timezone),
  );
}

export async function addScheduleOverride(
  ctx: ToolContext,
  input: { scheduleId: string } & z.infer<typeof createScheduleOverrideSchema>,
) {
  const { scheduleId, ...body } = input;
  return actionToMcpResult(
    await addScheduleOverrideAction(projectActionDeps(ctx), scheduleId, body),
  );
}

export async function deleteScheduleOverride(
  ctx: ToolContext,
  input: { scheduleId: string; overrideId: string },
) {
  return actionToMcpResult(
    await deleteScheduleOverrideAction(
      projectActionDeps(ctx),
      input.scheduleId,
      input.overrideId,
    ),
  );
}

// ─── Registration ────────────────────────────────────────────────────────────

const scheduleShape = createScheduleSchema.shape;
const rulesShape = updateAvailabilityRulesSchema.shape;
const overrideShape = createScheduleOverrideSchema.shape;

export function registerScheduleTools(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    "list_schedules",
    withMcpToolDiscovery("list_schedules", {
      description: "List availability schedules in this project.",
      inputSchema: {},
    }),
    withToolErrors("list_schedules", ctx, () => listSchedules(ctx)),
  );

  server.registerTool(
    "get_schedule",
    withMcpToolDiscovery("get_schedule", {
      description: "Get a schedule with weekly availability rules and date overrides.",
      inputSchema: { scheduleId: z.string().describe("Schedule id") },
    }),
    withToolErrors("get_schedule", ctx, (input) => getSchedule(ctx, input)),
  );

  server.registerTool(
    "create_schedule",
    withMcpToolDiscovery("create_schedule", {
      description: "Create an availability schedule.",
      inputSchema: {
        name: scheduleShape.name.describe("Schedule name"),
        timezone: scheduleShape.timezone.describe("IANA timezone"),
        isDefault: scheduleShape.isDefault.describe("Make this the project default"),
      },
    }),
    withToolErrors("create_schedule", ctx, (input) => createSchedule(ctx, input)),
  );

  server.registerTool(
    "update_schedule",
    withMcpToolDiscovery("update_schedule", {
      description: "Replace a schedule's details.",
      inputSchema: {
        scheduleId: z.string().describe("Schedule id"),
        name: scheduleShape.name.describe("Schedule name"),
        timezone: scheduleShape.timezone.describe("IANA timezone"),
        isDefault: scheduleShape.isDefault.describe("Make this the project default"),
      },
    }),
    withToolErrors("update_schedule", ctx, (input) => updateSchedule(ctx, input)),
  );

  server.registerTool(
    "delete_schedule",
    withMcpToolDiscovery("delete_schedule", {
      description: "Delete an availability schedule and its rules and overrides.",
      inputSchema: { scheduleId: z.string().describe("Schedule id") },
    }),
    withToolErrors("delete_schedule", ctx, (input) => deleteSchedule(ctx, input)),
  );

  server.registerTool(
    "set_schedule_rules",
    withMcpToolDiscovery("set_schedule_rules", {
      description: "Replace all weekly availability rules for a schedule.",
      inputSchema: {
        scheduleId: z.string().describe("Schedule id"),
        rules: rulesShape.rules.describe("Non-overlapping weekly availability blocks"),
        timezone: z.string().optional().describe("Optional replacement IANA timezone"),
      },
    }),
    withToolErrors("set_schedule_rules", ctx, (input) => setScheduleRules(ctx, input)),
  );

  server.registerTool(
    "add_schedule_override",
    withMcpToolDiscovery("add_schedule_override", {
      description: "Add a blocked or available date override to a schedule.",
      inputSchema: {
        scheduleId: z.string().describe("Schedule id"),
        date: overrideShape.date.describe("Date in YYYY-MM-DD format"),
        startTime: overrideShape.startTime.describe("Start time for an available override"),
        endTime: overrideShape.endTime.describe("End time for an available override"),
        isBlocked: overrideShape.isBlocked.describe("Block the full date"),
      },
    }),
    withToolErrors("add_schedule_override", ctx, (input) => addScheduleOverride(ctx, input)),
  );

  server.registerTool(
    "delete_schedule_override",
    withMcpToolDiscovery("delete_schedule_override", {
      description: "Delete a date override from a schedule.",
      inputSchema: {
        scheduleId: z.string().describe("Schedule id"),
        overrideId: z.string().describe("Override id"),
      },
    }),
    withToolErrors("delete_schedule_override", ctx, (input) => deleteScheduleOverride(ctx, input)),
  );
}

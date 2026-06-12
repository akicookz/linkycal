import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { ScheduleService } from "../../services/schedule-service";
import type { ToolContext } from "../agent";
import { ok, err, withToolErrors } from "../helpers";
import type { ToolResult } from "../helpers";

// ─── Handlers (exported for unit tests) ──────────────────────────────────────

export async function listSchedules(ctx: ToolContext): Promise<ToolResult> {
  const service = new ScheduleService(ctx.db());
  return ok(await service.list(ctx.projectId()));
}

export async function getSchedule(
  ctx: ToolContext,
  input: { scheduleId: string },
): Promise<ToolResult> {
  const service = new ScheduleService(ctx.db());

  // ScheduleService has no project-scoped getById — resolve through the
  // project's own list so foreign ids read as "not found".
  const schedules = await service.list(ctx.projectId());
  const schedule = schedules.find((s) => s.id === input.scheduleId);
  if (!schedule) return err("Not found");

  const [rules, overrides] = await Promise.all([
    service.getRules(schedule.id),
    service.getOverrides(schedule.id),
  ]);

  return ok({ schedule, rules, overrides });
}

// ─── Registration ────────────────────────────────────────────────────────────

export function registerScheduleTools(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    "list_schedules",
    {
      description: "List availability schedules in this project.",
      inputSchema: {},
    },
    withToolErrors("list_schedules", () => listSchedules(ctx)),
  );

  server.registerTool(
    "get_schedule",
    {
      description:
        "Get a schedule by id with its weekly availability rules (dayOfWeek 0=Sunday, HH:MM times) and date overrides.",
      inputSchema: {
        scheduleId: z.string().describe("Schedule id (from list_schedules or get_event_type)"),
      },
    },
    withToolErrors("get_schedule", (input) => getSchedule(ctx, input)),
  );
}

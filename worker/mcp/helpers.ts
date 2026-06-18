import type { DrizzleD1Database } from "drizzle-orm/d1";
import { eq, and, desc } from "drizzle-orm";

import * as dbSchema from "../db/schema";
import type { Plan, PlanLimits } from "../types";
import { PLAN_LIMITS } from "../lib/plan-limits";

type AppDatabase = DrizzleD1Database<Record<string, unknown>>;

// ─── Tool Results ────────────────────────────────────────────────────────────

export interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function err(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/**
 * Wrap a tool handler so unexpected exceptions surface as MCP error results
 * instead of crashing the agent session.
 */
export function withToolErrors<Input>(
  name: string,
  fn: (input: Input) => Promise<ToolResult>,
): (input: Input) => Promise<ToolResult> {
  return async (input: Input) => {
    try {
      return await fn(input);
    } catch (e) {
      if (e instanceof Error && e.name === "ZodError") {
        return err(`Invalid input: ${e.message}`);
      }
      console.error(`MCP tool ${name} failed:`, e);
      return err("Internal error");
    }
  };
}

// ─── Plan Limits ─────────────────────────────────────────────────────────────

/**
 * Resolve the plan limits for the project an API key is scoped to. Read-only:
 * a missing subscription row simply means the free plan.
 */
export async function getPlanLimitsForProject(
  db: AppDatabase,
  projectId: string,
): Promise<PlanLimits> {
  const [project] = await db
    .select({
      userId: dbSchema.projects.userId,
      teamId: dbSchema.projects.teamId,
    })
    .from(dbSchema.projects)
    .where(eq(dbSchema.projects.id, projectId))
    .limit(1);

  if (!project) return PLAN_LIMITS.free;

  const [subscription] = await db
    .select({ plan: dbSchema.subscriptions.plan })
    .from(dbSchema.subscriptions)
    .where(
      project.teamId
        ? eq(dbSchema.subscriptions.teamId, project.teamId)
        : eq(dbSchema.subscriptions.userId, project.userId),
    )
    .orderBy(
      desc(dbSchema.subscriptions.updatedAt),
      desc(dbSchema.subscriptions.createdAt),
    )
    .limit(1);

  const plan = (subscription?.plan as Plan | undefined) ?? "free";
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
}

// ─── Project-Scoping Asserts ─────────────────────────────────────────────────
// The services' getById methods are not project-scoped, so every tool that
// takes a resource id must verify the resource belongs to the session's
// project. Failed checks read as "not found" — never leak existence.

export async function bookingInProject(
  db: AppDatabase,
  bookingId: string,
  projectId: string,
): Promise<dbSchema.BookingRow | null> {
  const [row] = await db
    .select({ booking: dbSchema.bookings })
    .from(dbSchema.bookings)
    .innerJoin(
      dbSchema.eventTypes,
      eq(dbSchema.bookings.eventTypeId, dbSchema.eventTypes.id),
    )
    .where(
      and(
        eq(dbSchema.bookings.id, bookingId),
        eq(dbSchema.eventTypes.projectId, projectId),
      ),
    )
    .limit(1);
  return row?.booking ?? null;
}

export function inProject<T extends { projectId: string }>(
  row: T | null | undefined,
  projectId: string,
): T | null {
  if (!row || row.projectId !== projectId) return null;
  return row;
}

export async function tagInProject(
  db: AppDatabase,
  tagId: string,
  projectId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: dbSchema.tags.id })
    .from(dbSchema.tags)
    .where(and(eq(dbSchema.tags.id, tagId), eq(dbSchema.tags.projectId, projectId)))
    .limit(1);
  return !!row;
}

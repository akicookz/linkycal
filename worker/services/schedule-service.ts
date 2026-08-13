import type { DrizzleD1Database } from "drizzle-orm/d1";
import { eq, and, asc } from "drizzle-orm";
import * as dbSchema from "../db/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreateScheduleInput {
  name: string;
  timezone: string;
  isDefault?: boolean;
}

type UpdateScheduleInput = Partial<CreateScheduleInput>;

interface AvailabilityRuleInput {
  dayOfWeek: number;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

interface CreateOverrideInput {
  date: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  isBlocked: boolean;
}

interface D1StatementLike {
  bind(...values: unknown[]): D1StatementLike;
}

interface D1BatchClient {
  prepare(query: string): D1StatementLike;
  batch(statements: D1StatementLike[]): Promise<unknown[]>;
}

interface SyncStatementLike {
  run(...values: unknown[]): unknown;
}

interface SyncSqliteClient {
  query(query: string): SyncStatementLike;
  transaction<T>(callback: () => T): () => T;
}

function hasFunctions(
  value: unknown,
  names: string[],
): value is Record<string, (...args: never[]) => unknown> {
  if (!value || typeof value !== "object") return false;
  return names.every(function hasFunction(name) {
    return typeof (value as Record<string, unknown>)[name] === "function";
  });
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ScheduleService {
  constructor(private db: DrizzleD1Database<Record<string, unknown>>) {}

  // ─── List ─────────────────────────────────────────────────────────────────

  async list(projectId: string): Promise<dbSchema.ScheduleRow[]> {
    return this.db
      .select()
      .from(dbSchema.schedules)
      .where(eq(dbSchema.schedules.projectId, projectId));
  }

  // ─── Get Default ──────────────────────────────────────────────────────────

  async getDefault(projectId: string): Promise<dbSchema.ScheduleRow | null> {
    // Try to find the default schedule
    const defaultRows = await this.db
      .select()
      .from(dbSchema.schedules)
      .where(
        and(
          eq(dbSchema.schedules.projectId, projectId),
          eq(dbSchema.schedules.isDefault, true),
        ),
      )
      .limit(1);

    if (defaultRows[0]) return defaultRows[0];

    // Fall back to the first schedule
    const firstRows = await this.db
      .select()
      .from(dbSchema.schedules)
      .where(eq(dbSchema.schedules.projectId, projectId))
      .limit(1);

    return firstRows[0] ?? null;
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(
    projectId: string,
    data: CreateScheduleInput,
  ): Promise<dbSchema.ScheduleRow> {
    const id = crypto.randomUUID();

    // If this schedule should be the default, unset other defaults first
    if (data.isDefault) {
      await this.db
        .update(dbSchema.schedules)
        .set({ isDefault: false })
        .where(eq(dbSchema.schedules.projectId, projectId));
    }

    await this.db.insert(dbSchema.schedules).values({
      id,
      projectId,
      name: data.name,
      timezone: data.timezone,
      isDefault: data.isDefault ?? false,
    });

    return (await this.getById(id))!;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(
    id: string,
    data: UpdateScheduleInput,
  ): Promise<dbSchema.ScheduleRow | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    // If setting as default, unset other defaults first
    if (data.isDefault) {
      await this.db
        .update(dbSchema.schedules)
        .set({ isDefault: false })
        .where(eq(dbSchema.schedules.projectId, existing.projectId));
    }

    await this.db
      .update(dbSchema.schedules)
      .set(data)
      .where(eq(dbSchema.schedules.id, id));

    return (await this.getById(id))!;
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async delete(id: string): Promise<void> {
    // Cascading deletes handle availability rules and overrides via FK constraints
    await this.db
      .delete(dbSchema.schedules)
      .where(eq(dbSchema.schedules.id, id));
  }

  // ─── Get Rules ────────────────────────────────────────────────────────────

  async getRules(
    scheduleId: string,
  ): Promise<dbSchema.AvailabilityRuleRow[]> {
    return this.db
      .select()
      .from(dbSchema.availabilityRules)
      .where(eq(dbSchema.availabilityRules.scheduleId, scheduleId))
      .orderBy(
        asc(dbSchema.availabilityRules.dayOfWeek),
        asc(dbSchema.availabilityRules.startTime),
      );
  }

  // ─── Set Rules ────────────────────────────────────────────────────────────

  async setRules(
    scheduleId: string,
    rules: AvailabilityRuleInput[],
    timezone?: string,
  ): Promise<dbSchema.AvailabilityRuleRow[]> {
    const client = (
      this.db as typeof this.db & { $client?: unknown }
    ).$client;
    const values = rules.map(function ruleValue(rule) {
      return {
        id: crypto.randomUUID(),
        scheduleId,
        dayOfWeek: rule.dayOfWeek,
        startTime: rule.startTime,
        endTime: rule.endTime,
      };
    });

    if (hasFunctions(client, ["prepare", "batch"])) {
      const d1 = client as unknown as D1BatchClient;
      const statements: D1StatementLike[] = [];
      if (timezone !== undefined) {
        statements.push(
          d1
            .prepare(
              "UPDATE schedules SET timezone = ?, updated_at = unixepoch() WHERE id = ?",
            )
            .bind(timezone, scheduleId),
        );
      }
      statements.push(
        d1
          .prepare("DELETE FROM availability_rules WHERE schedule_id = ?")
          .bind(scheduleId),
      );
      for (const value of values) {
        statements.push(
          d1
            .prepare(
              "INSERT INTO availability_rules (id, schedule_id, day_of_week, start_time, end_time, created_at) VALUES (?, ?, ?, ?, ?, unixepoch())",
            )
            .bind(
              value.id,
              value.scheduleId,
              value.dayOfWeek,
              value.startTime,
              value.endTime,
            ),
        );
      }
      await d1.batch(statements);
    } else if (hasFunctions(client, ["query", "transaction"])) {
      const sqlite = client as unknown as SyncSqliteClient;
      const transaction = sqlite.transaction(function replaceScheduleRules() {
        if (timezone !== undefined) {
          sqlite
            .query(
              "UPDATE schedules SET timezone = ?, updated_at = unixepoch() WHERE id = ?",
            )
            .run(timezone, scheduleId);
        }
        sqlite
          .query("DELETE FROM availability_rules WHERE schedule_id = ?")
          .run(scheduleId);
        const insert = sqlite.query(
          "INSERT INTO availability_rules (id, schedule_id, day_of_week, start_time, end_time, created_at) VALUES (?, ?, ?, ?, ?, unixepoch())",
        );
        for (const value of values) {
          insert.run(
            value.id,
            value.scheduleId,
            value.dayOfWeek,
            value.startTime,
            value.endTime,
          );
        }
      });
      transaction();
    } else {
      throw new Error("Database client does not support atomic schedule updates");
    }

    return this.getRules(scheduleId);
  }

  // ─── Get Overrides ────────────────────────────────────────────────────────

  async getOverrides(
    scheduleId: string,
  ): Promise<dbSchema.ScheduleOverrideRow[]> {
    return this.db
      .select()
      .from(dbSchema.scheduleOverrides)
      .where(eq(dbSchema.scheduleOverrides.scheduleId, scheduleId));
  }

  // ─── Add Override ─────────────────────────────────────────────────────────

  async addOverride(
    scheduleId: string,
    data: CreateOverrideInput,
  ): Promise<dbSchema.ScheduleOverrideRow> {
    const id = crypto.randomUUID();

    await this.db.insert(dbSchema.scheduleOverrides).values({
      id,
      scheduleId,
      date: data.date,
      startTime: data.startTime ?? null,
      endTime: data.endTime ?? null,
      isBlocked: data.isBlocked,
    });

    const rows = await this.db
      .select()
      .from(dbSchema.scheduleOverrides)
      .where(eq(dbSchema.scheduleOverrides.id, id))
      .limit(1);

    return rows[0]!;
  }

  // ─── Delete Override ──────────────────────────────────────────────────────

  async deleteOverride(id: string): Promise<void> {
    await this.db
      .delete(dbSchema.scheduleOverrides)
      .where(eq(dbSchema.scheduleOverrides.id, id));
  }

  // ─── Create Default Schedule ──────────────────────────────────────────────

  async createDefaultSchedule(
    projectId: string,
    timezone: string,
  ): Promise<dbSchema.ScheduleRow> {
    const schedule = await this.create(projectId, {
      name: "Working Hours",
      timezone,
      isDefault: true,
    });

    // Mon-Fri 9:00-17:00 (days 1-5)
    const defaultRules: AvailabilityRuleInput[] = [];
    for (let day = 1; day <= 5; day++) {
      defaultRules.push({
        dayOfWeek: day,
        startTime: "09:00",
        endTime: "17:00",
      });
    }

    await this.setRules(schedule.id, defaultRules);

    return schedule;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async getById(id: string): Promise<dbSchema.ScheduleRow | null> {
    const rows = await this.db
      .select()
      .from(dbSchema.schedules)
      .where(eq(dbSchema.schedules.id, id))
      .limit(1);
    return rows[0] ?? null;
  }
}

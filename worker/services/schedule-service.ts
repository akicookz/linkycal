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
  ): Promise<dbSchema.AvailabilityRuleRow[]> {
    // Delete all existing rules for this schedule
    await this.db
      .delete(dbSchema.availabilityRules)
      .where(eq(dbSchema.availabilityRules.scheduleId, scheduleId));

    // Batch insert new rules
    if (rules.length > 0) {
      const values = rules.map((rule) => ({
        id: crypto.randomUUID(),
        scheduleId,
        dayOfWeek: rule.dayOfWeek,
        startTime: rule.startTime,
        endTime: rule.endTime,
      }));
      await this.db.insert(dbSchema.availabilityRules).values(values);
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

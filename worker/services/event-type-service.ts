import type { DrizzleD1Database } from "drizzle-orm/d1";
import { eq, and, desc } from "drizzle-orm";
import * as dbSchema from "../db/schema";
import { ScheduleService } from "./schedule-service";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreateEventTypeInput {
  name: string;
  slug: string;
  duration: number;
  description?: string;
  location?: string;
  color?: string;
  bufferBefore?: number;
  bufferAfter?: number;
  maxPerDay?: number;
  enabled?: boolean;
  requiresConfirmation?: boolean;
  bookingFormId?: string | null;
  settings?: unknown;
  copyFromEventTypeId?: string;
}

type UpdateEventTypeInput = Partial<Omit<CreateEventTypeInput, "copyFromEventTypeId">>;

// ─── Service ──────────────────────────────────────────────────────────────────

export class EventTypeService {
  constructor(private db: DrizzleD1Database<Record<string, unknown>>) {}

  // ─── List ─────────────────────────────────────────────────────────────────

  async list(projectId: string): Promise<dbSchema.EventTypeRow[]> {
    return this.db
      .select()
      .from(dbSchema.eventTypes)
      .where(eq(dbSchema.eventTypes.projectId, projectId))
      .orderBy(desc(dbSchema.eventTypes.createdAt));
  }

  // ─── Get By ID ────────────────────────────────────────────────────────────

  async getById(id: string): Promise<dbSchema.EventTypeRow | null> {
    const rows = await this.db
      .select()
      .from(dbSchema.eventTypes)
      .where(eq(dbSchema.eventTypes.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  // ─── Get By ID With Schedule ──────────────────────────────────────────────

  async getByIdWithSchedule(id: string): Promise<{
    eventType: dbSchema.EventTypeRow;
    schedule: dbSchema.ScheduleRow | null;
    rules: dbSchema.AvailabilityRuleRow[];
    overrides: dbSchema.ScheduleOverrideRow[];
  } | null> {
    let eventType = await this.getById(id);
    if (!eventType) return null;

    const scheduleService = new ScheduleService(this.db);

    let schedule: dbSchema.ScheduleRow | null = null;
    let rules: dbSchema.AvailabilityRuleRow[] = [];
    let overrides: dbSchema.ScheduleOverrideRow[] = [];

    if (eventType.scheduleId) {
      const scheduleRows = await this.db
        .select()
        .from(dbSchema.schedules)
        .where(eq(dbSchema.schedules.id, eventType.scheduleId))
        .limit(1);
      schedule = scheduleRows[0] ?? null;
    }

    // Auto-create schedule if missing (backfill for older event types)
    if (!schedule) {
      schedule = await scheduleService.createDefaultSchedule(
        eventType.projectId,
        "America/New_York",
      );
      await scheduleService.update(schedule.id, { isDefault: false });
      // Re-fetch to get updated fields
      const rows = await this.db
        .select()
        .from(dbSchema.schedules)
        .where(eq(dbSchema.schedules.id, schedule.id))
        .limit(1);
      schedule = rows[0]!;

      // Attach schedule to the event type
      await this.db
        .update(dbSchema.eventTypes)
        .set({ scheduleId: schedule.id })
        .where(eq(dbSchema.eventTypes.id, eventType.id));
      eventType = (await this.getById(eventType.id))!;
    }

    rules = await scheduleService.getRules(schedule.id);
    overrides = await scheduleService.getOverrides(schedule.id);

    return { eventType, schedule, rules, overrides };
  }

  // ─── Get By Slug ──────────────────────────────────────────────────────────

  async getBySlug(
    projectId: string,
    slug: string,
  ): Promise<dbSchema.EventTypeRow | null> {
    const rows = await this.db
      .select()
      .from(dbSchema.eventTypes)
      .where(
        and(
          eq(dbSchema.eventTypes.projectId, projectId),
          eq(dbSchema.eventTypes.slug, slug),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(
    projectId: string,
    data: CreateEventTypeInput,
  ): Promise<dbSchema.EventTypeRow> {
    const id = crypto.randomUUID();
    const scheduleService = new ScheduleService(this.db);

    // Create a schedule for this event type
    let schedule: dbSchema.ScheduleRow;

    if (data.copyFromEventTypeId) {
      // Copy schedule from another event type
      const sourceEventType = await this.getById(data.copyFromEventTypeId);
      if (sourceEventType?.scheduleId) {
        schedule = await scheduleService.create(projectId, {
          name: `${data.name} Availability`,
          timezone: "America/New_York",
          isDefault: false,
        });

        // Copy rules from source schedule
        const sourceRules = await scheduleService.getRules(sourceEventType.scheduleId);
        if (sourceRules.length > 0) {
          await scheduleService.setRules(
            schedule.id,
            sourceRules.map((r) => ({
              dayOfWeek: r.dayOfWeek,
              startTime: r.startTime,
              endTime: r.endTime,
            })),
          );
        }

        // Copy overrides from source schedule
        const sourceOverrides = await scheduleService.getOverrides(sourceEventType.scheduleId);
        for (const override of sourceOverrides) {
          await scheduleService.addOverride(schedule.id, {
            date: override.date,
            startTime: override.startTime ?? undefined,
            endTime: override.endTime ?? undefined,
            isBlocked: override.isBlocked,
          });
        }

        // Use the source schedule's timezone
        const sourceScheduleRows = await this.db
          .select()
          .from(dbSchema.schedules)
          .where(eq(dbSchema.schedules.id, sourceEventType.scheduleId))
          .limit(1);
        if (sourceScheduleRows[0]) {
          await scheduleService.update(schedule.id, {
            timezone: sourceScheduleRows[0].timezone,
          });
          schedule = (await this.db
            .select()
            .from(dbSchema.schedules)
            .where(eq(dbSchema.schedules.id, schedule.id))
            .limit(1))[0]!;
        }
      } else {
        // Source has no schedule, create default
        schedule = await scheduleService.createDefaultSchedule(projectId, "America/New_York");
        await scheduleService.update(schedule.id, { isDefault: false });
        schedule = (await this.db
          .select()
          .from(dbSchema.schedules)
          .where(eq(dbSchema.schedules.id, schedule.id))
          .limit(1))[0]!;
      }
    } else {
      // Create default schedule (Mon-Fri 9-5)
      schedule = await scheduleService.createDefaultSchedule(projectId, "America/New_York");
      // Don't mark as project default — it's event-type-specific
      await scheduleService.update(schedule.id, { isDefault: false });
      schedule = (await this.db
        .select()
        .from(dbSchema.schedules)
        .where(eq(dbSchema.schedules.id, schedule.id))
        .limit(1))[0]!;
    }

    await this.db.insert(dbSchema.eventTypes).values({
      id,
      projectId,
      name: data.name,
      slug: data.slug,
      duration: data.duration,
      description: data.description ?? null,
      location: data.location ?? null,
      color: data.color ?? "#3b82f6",
      bufferBefore: data.bufferBefore ?? 0,
      bufferAfter: data.bufferAfter ?? 0,
      maxPerDay: data.maxPerDay ?? null,
      enabled: data.enabled ?? true,
      requiresConfirmation: data.requiresConfirmation ?? false,
      bookingFormId: data.bookingFormId ?? null,
      scheduleId: schedule.id,
      settings: data.settings ?? null,
    });

    return (await this.getById(id))!;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(
    id: string,
    data: UpdateEventTypeInput,
  ): Promise<dbSchema.EventTypeRow | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    await this.db
      .update(dbSchema.eventTypes)
      .set(data)
      .where(eq(dbSchema.eventTypes.id, id));

    return (await this.getById(id))!;
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async delete(id: string): Promise<void> {
    const eventType = await this.getById(id);

    // Delete the associated schedule first (cascade will handle rules/overrides)
    if (eventType?.scheduleId) {
      const scheduleService = new ScheduleService(this.db);
      await scheduleService.delete(eventType.scheduleId);
    }

    await this.db
      .delete(dbSchema.eventTypes)
      .where(eq(dbSchema.eventTypes.id, id));
  }
}

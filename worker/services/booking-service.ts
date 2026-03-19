import type { DrizzleD1Database } from "drizzle-orm/d1";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import * as dbSchema from "../db/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreateBookingInput {
  eventTypeId: string;
  name: string;
  email: string;
  notes?: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  contactId?: string;
  metadata?: unknown;
  gcalEventId?: string;
  status?: "confirmed" | "pending";
  expiresAt?: Date;
  formResponseId?: string;
  ipAddress?: string | null;
  country?: string | null;
  city?: string | null;
}

interface BookingWithEventType extends dbSchema.BookingRow {
  eventTypeName: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class BookingService {
  constructor(private db: DrizzleD1Database<Record<string, unknown>>) {}

  // ─── List By Project ──────────────────────────────────────────────────────

  async listByProject(projectId: string): Promise<BookingWithEventType[]> {
    const rows = await this.db
      .select({
        id: dbSchema.bookings.id,
        eventTypeId: dbSchema.bookings.eventTypeId,
        contactId: dbSchema.bookings.contactId,
        name: dbSchema.bookings.name,
        email: dbSchema.bookings.email,
        notes: dbSchema.bookings.notes,
        startTime: dbSchema.bookings.startTime,
        endTime: dbSchema.bookings.endTime,
        timezone: dbSchema.bookings.timezone,
        status: dbSchema.bookings.status,
        expiresAt: dbSchema.bookings.expiresAt,
        formResponseId: dbSchema.bookings.formResponseId,
        gcalEventId: dbSchema.bookings.gcalEventId,
        meetingUrl: dbSchema.bookings.meetingUrl,
        ipAddress: dbSchema.bookings.ipAddress,
        country: dbSchema.bookings.country,
        city: dbSchema.bookings.city,
        metadata: dbSchema.bookings.metadata,
        createdAt: dbSchema.bookings.createdAt,
        updatedAt: dbSchema.bookings.updatedAt,
        eventTypeName: dbSchema.eventTypes.name,
      })
      .from(dbSchema.bookings)
      .innerJoin(
        dbSchema.eventTypes,
        eq(dbSchema.bookings.eventTypeId, dbSchema.eventTypes.id),
      )
      .where(eq(dbSchema.eventTypes.projectId, projectId))
      .orderBy(desc(dbSchema.bookings.startTime));

    return rows;
  }

  // ─── Get By ID ────────────────────────────────────────────────────────────

  async getById(id: string): Promise<dbSchema.BookingRow | null> {
    const rows = await this.db
      .select()
      .from(dbSchema.bookings)
      .where(eq(dbSchema.bookings.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(data: CreateBookingInput): Promise<dbSchema.BookingRow> {
    const id = crypto.randomUUID();

    await this.db.insert(dbSchema.bookings).values({
      id,
      eventTypeId: data.eventTypeId,
      name: data.name,
      email: data.email,
      notes: data.notes ?? null,
      startTime: data.startTime,
      endTime: data.endTime,
      timezone: data.timezone,
      status: data.status ?? "confirmed",
      expiresAt: data.expiresAt ?? null,
      formResponseId: data.formResponseId ?? null,
      contactId: data.contactId ?? null,
      metadata: data.metadata ?? null,
      gcalEventId: data.gcalEventId ?? null,
      ipAddress: data.ipAddress ?? null,
      country: data.country ?? null,
      city: data.city ?? null,
    });

    return (await this.getById(id))!;
  }

  // ─── Cancel ───────────────────────────────────────────────────────────────

  async cancel(
    id: string,
    _reason?: string,
  ): Promise<dbSchema.BookingRow | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    await this.db
      .update(dbSchema.bookings)
      .set({ status: "cancelled" })
      .where(eq(dbSchema.bookings.id, id));

    return (await this.getById(id))!;
  }

  // ─── Confirm ──────────────────────────────────────────────────────────────

  async confirm(id: string): Promise<dbSchema.BookingRow | null> {
    const existing = await this.getById(id);
    if (!existing || existing.status !== "pending") return null;

    await this.db
      .update(dbSchema.bookings)
      .set({ status: "confirmed", expiresAt: null })
      .where(eq(dbSchema.bookings.id, id));

    return (await this.getById(id))!;
  }

  // ─── Decline ──────────────────────────────────────────────────────────────

  async decline(id: string): Promise<dbSchema.BookingRow | null> {
    const existing = await this.getById(id);
    if (!existing || existing.status !== "pending") return null;

    await this.db
      .update(dbSchema.bookings)
      .set({ status: "declined", expiresAt: null })
      .where(eq(dbSchema.bookings.id, id));

    return (await this.getById(id))!;
  }

  // ─── Expire Pending Bookings ──────────────────────────────────────────────

  async expirePendingBookings(): Promise<dbSchema.BookingRow[]> {
    const now = new Date();

    const pending = await this.db
      .select()
      .from(dbSchema.bookings)
      .where(
        and(
          eq(dbSchema.bookings.status, "pending"),
          lte(dbSchema.bookings.expiresAt, now),
        ),
      );

    for (const booking of pending) {
      await this.db
        .update(dbSchema.bookings)
        .set({ status: "declined", expiresAt: null })
        .where(eq(dbSchema.bookings.id, booking.id));
    }

    return pending;
  }

  // ─── Reschedule ───────────────────────────────────────────────────────────

  async reschedule(
    id: string,
    newStartTime: Date,
    newEndTime: Date,
  ): Promise<dbSchema.BookingRow | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    // Mark the original booking as rescheduled
    await this.db
      .update(dbSchema.bookings)
      .set({ status: "rescheduled" })
      .where(eq(dbSchema.bookings.id, id));

    // Create a new booking with the same details but new times
    const newBooking = await this.create({
      eventTypeId: existing.eventTypeId,
      name: existing.name,
      email: existing.email,
      notes: existing.notes ?? undefined,
      startTime: newStartTime,
      endTime: newEndTime,
      timezone: existing.timezone,
      contactId: existing.contactId ?? undefined,
      metadata: existing.metadata ?? undefined,
      gcalEventId: existing.gcalEventId ?? undefined,
    });

    return newBooking;
  }

  // ─── Get Bookings In Range ────────────────────────────────────────────────

  async getBookingsInRange(
    eventTypeId: string,
    start: Date,
    end: Date,
  ): Promise<dbSchema.BookingRow[]> {
    return this.db
      .select()
      .from(dbSchema.bookings)
      .where(
        and(
          eq(dbSchema.bookings.eventTypeId, eventTypeId),
          eq(dbSchema.bookings.status, "confirmed"),
          gte(dbSchema.bookings.startTime, start),
          lte(dbSchema.bookings.endTime, end),
        ),
      );
  }
}

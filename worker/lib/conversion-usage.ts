import { and, eq, isNull } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import * as dbSchema from "../db/schema";
import type { EntitlementModeEnv } from "./entitlement-mode";
import { reserveProjectUsage } from "./metered-entitlements";

type AppDatabase = DrizzleD1Database<Record<string, unknown>>;

export async function recordPersistedBookingUsage(
  db: AppDatabase,
  projectId: string,
  bookingId: string,
): Promise<void> {
  const reservation = await reserveProjectUsage({
    db,
    projectId,
    key: "bookings",
    operationId: bookingId,
    channel: "booking_created",
  });
  await reservation.consume();
  await db
    .update(dbSchema.bookings)
    .set({ usageRecordedAt: new Date() })
    .where(eq(dbSchema.bookings.id, bookingId));
}

export async function recordPersistedFormResponseUsage(
  db: AppDatabase,
  projectId: string,
  responseId: string,
  env?: EntitlementModeEnv,
): Promise<void> {
  const reservation = await reserveProjectUsage({
    db,
    projectId,
    key: "formResponses",
    operationId: responseId,
    allowExistingOverage: true,
    channel: "public_form_completion",
    env,
  });
  if (!reservation.decision.allowed) {
    throw new Error("Completed form response usage could not be recorded");
  }
  await reservation.consume();
  await db
    .update(dbSchema.formResponses)
    .set({ usageRecordedAt: new Date() })
    .where(eq(dbSchema.formResponses.id, responseId));
}

export async function reconcileConversionUsage(
  db: AppDatabase,
  env?: EntitlementModeEnv,
  limit = 100,
): Promise<{ bookings: number; formResponses: number }> {
  const pendingBookings = await db
    .select({
      id: dbSchema.bookings.id,
      projectId: dbSchema.eventTypes.projectId,
    })
    .from(dbSchema.bookings)
    .innerJoin(
      dbSchema.eventTypes,
      eq(dbSchema.bookings.eventTypeId, dbSchema.eventTypes.id),
    )
    .where(isNull(dbSchema.bookings.usageRecordedAt))
    .limit(limit);
  let bookings = 0;
  for (const booking of pendingBookings) {
    try {
      await recordPersistedBookingUsage(db, booking.projectId, booking.id);
      bookings += 1;
    } catch (error) {
      console.error("Booking usage reconciliation failed:", error);
    }
  }

  const pendingResponses = await db
    .select({
      id: dbSchema.formResponses.id,
      projectId: dbSchema.forms.projectId,
    })
    .from(dbSchema.formResponses)
    .innerJoin(
      dbSchema.forms,
      eq(dbSchema.formResponses.formId, dbSchema.forms.id),
    )
    .where(
      and(
        eq(dbSchema.formResponses.status, "completed"),
        isNull(dbSchema.formResponses.usageRecordedAt),
      ),
    )
    .limit(limit);
  let formResponses = 0;
  for (const response of pendingResponses) {
    try {
      await recordPersistedFormResponseUsage(
        db,
        response.projectId,
        response.id,
        env,
      );
      formResponses += 1;
    } catch (error) {
      console.error("Form response usage reconciliation failed:", error);
    }
  }

  return { bookings, formResponses };
}

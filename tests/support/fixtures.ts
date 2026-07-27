import type { DrizzleD1Database } from "drizzle-orm/d1";

import * as dbSchema from "../../worker/db/schema";

export const FIXTURE_IDS = {
  owner: "owner-aki",
  project: "project-acme",
  schedule: "schedule-new-york",
  eventType: "event-discovery",
  destinationConnection: "calendar-destination",
  inviteConnection: "calendar-invite",
  booking: "booking-existing",
} as const;

export const CROSS_TIMEZONE_SLOT_ISO = "2026-03-23T13:00:00.000Z";

export const CROSS_TIMEZONE_VIEWERS = [
  {
    timezone: "Europe/Berlin",
    date: "2026-03-23",
    localTime: "14:00",
    startLabel: "2:00 PM",
    endLabel: "2:30 PM",
  },
  {
    timezone: "Europe/Helsinki",
    date: "2026-03-23",
    localTime: "15:00",
    startLabel: "3:00 PM",
    endLabel: "3:30 PM",
  },
  {
    timezone: "Europe/Guernsey",
    date: "2026-03-23",
    localTime: "13:00",
    startLabel: "1:00 PM",
    endLabel: "1:30 PM",
  },
  {
    timezone: "Asia/Kathmandu",
    date: "2026-03-23",
    localTime: "18:45",
    startLabel: "6:45 PM",
    endLabel: "7:15 PM",
  },
  {
    timezone: "Asia/Seoul",
    date: "2026-03-23",
    localTime: "22:00",
    startLabel: "10:00 PM",
    endLabel: "10:30 PM",
  },
  {
    timezone: "Pacific/Kiritimati",
    date: "2026-03-24",
    localTime: "03:00",
    startLabel: "3:00 AM",
    endLabel: "3:30 AM",
  },
  {
    timezone: "Pacific/Pago_Pago",
    date: "2026-03-23",
    localTime: "02:00",
    startLabel: "2:00 AM",
    endLabel: "2:30 AM",
  },
] as const;

interface AvailabilityScenarioOverrides {
  schedule?: Partial<dbSchema.NewScheduleRow>;
  rule?: Partial<dbSchema.NewAvailabilityRuleRow>;
  eventType?: Partial<dbSchema.NewEventTypeRow>;
}

export async function seedAvailabilityScenario(
  db: DrizzleD1Database<Record<string, unknown>>,
  overrides: AvailabilityScenarioOverrides = {},
): Promise<void> {
  await db.insert(dbSchema.schema.users).values({
    id: FIXTURE_IDS.owner,
    name: "Aki Owner",
    email: "aki@encited.com",
  });
  await db.insert(dbSchema.projects).values({
    id: FIXTURE_IDS.project,
    userId: FIXTURE_IDS.owner,
    name: "Acme",
    slug: "acme",
    timezone: "America/New_York",
  });
  await db.insert(dbSchema.schedules).values({
    id: FIXTURE_IDS.schedule,
    projectId: FIXTURE_IDS.project,
    name: "New York office hours",
    timezone: "America/New_York",
    isDefault: true,
    ...overrides.schedule,
  });
  await db.insert(dbSchema.availabilityRules).values({
    id: "rule-monday",
    scheduleId: FIXTURE_IDS.schedule,
    dayOfWeek: 1,
    startTime: "09:00",
    endTime: "09:30",
    ...overrides.rule,
  });
  await db.insert(dbSchema.eventTypes).values({
    id: FIXTURE_IDS.eventType,
    projectId: FIXTURE_IDS.project,
    name: "Discovery call",
    slug: "discovery-call",
    duration: 30,
    scheduleId: FIXTURE_IDS.schedule,
    enabled: true,
    ...overrides.eventType,
  });
}

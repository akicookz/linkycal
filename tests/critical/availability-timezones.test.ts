import { describe, expect, test } from "bun:test";
import { formatInTimeZone } from "date-fns-tz";

import * as dbSchema from "../../worker/db/schema";
import {
  AvailabilityService,
  buildSlotsForWindow,
} from "../../worker/services/availability-service";
import {
  CROSS_TIMEZONE_SLOT_ISO,
  CROSS_TIMEZONE_VIEWERS,
  FIXTURE_IDS,
  seedAvailabilityScenario,
} from "../support/fixtures";
import { createTestDb } from "../support/test-db";

const BEFORE_BOOKING = new Date("2026-03-20T12:00:00.000Z");

describe("availability across organizer and viewer timezones", () => {
  for (const viewer of CROSS_TIMEZONE_VIEWERS) {
    test(`${viewer.timezone} sees the New York slot on ${viewer.date} at ${viewer.localTime}`, async () => {
      const testDatabase = createTestDb();
      try {
        await seedAvailabilityScenario(testDatabase.db);

        const slots = await new AvailabilityService(
          testDatabase.db,
        ).getAvailableSlots({
          projectSlug: "acme",
          eventTypeSlug: "discovery-call",
          date: viewer.date,
          timezone: viewer.timezone,
          now: BEFORE_BOOKING,
        });

        expect(slots).toEqual([
          {
            start: CROSS_TIMEZONE_SLOT_ISO,
            end: "2026-03-23T13:30:00.000Z",
          },
        ]);
        expect(
          formatInTimeZone(
            slots[0]!.start,
            viewer.timezone,
            "yyyy-MM-dd HH:mm",
          ),
        ).toBe(`${viewer.date} ${viewer.localTime}`);
      } finally {
        testDatabase.close();
      }
    });
  }

  test("spring-forward never invents a New York 02:00 slot", () => {
    const slots = buildSlotsForWindow({
      scheduleDate: "2026-03-08",
      window: { startTime: "01:00", endTime: "04:00" },
      scheduleTimezone: "America/New_York",
      duration: 30,
    });
    const localTimes = slots.map(function toLocalTime(slot) {
      return formatInTimeZone(slot.start, "America/New_York", "HH:mm");
    });

    expect(localTimes).toEqual(["01:00", "01:30", "03:00", "03:30"]);
    expect(localTimes.some(function isMissingHour(time) {
      return time.startsWith("02:");
    })).toBe(false);
  });

  test("fall-back preserves both real instants in New York's repeated 01:00 hour", () => {
    const slots = buildSlotsForWindow({
      scheduleDate: "2026-11-01",
      window: { startTime: "00:00", endTime: "03:00" },
      scheduleTimezone: "America/New_York",
      duration: 60,
    });
    const repeatedHourStarts = slots
      .filter(function isRepeatedHour(slot) {
        return formatInTimeZone(
          slot.start,
          "America/New_York",
          "HH:mm",
        ) === "01:00";
      })
      .map(function toIso(slot) {
        return slot.start.toISOString();
      });

    expect(repeatedHourStarts).toEqual([
      "2026-11-01T05:00:00.000Z",
      "2026-11-01T06:00:00.000Z",
    ]);
  });

  test("queries every organizer date overlapping an extreme viewer day", async () => {
    const testDatabase = createTestDb();
    try {
      await seedAvailabilityScenario(testDatabase.db);
      await testDatabase.db.insert(dbSchema.availabilityRules).values({
        id: "rule-tuesday-early",
        scheduleId: FIXTURE_IDS.schedule,
        dayOfWeek: 2,
        startTime: "05:00",
        endTime: "05:30",
      });
      const service = new AvailabilityService(testDatabase.db);

      const kiritimati = await service.getAvailableSlots({
        projectSlug: "acme",
        eventTypeSlug: "discovery-call",
        date: "2026-03-24",
        timezone: "Pacific/Kiritimati",
        now: BEFORE_BOOKING,
      });
      const pagoPago = await service.getAvailableSlots({
        projectSlug: "acme",
        eventTypeSlug: "discovery-call",
        date: "2026-03-23",
        timezone: "Pacific/Pago_Pago",
        now: BEFORE_BOOKING,
      });
      const adjacentDates = await Promise.all([
        service.getAvailableSlots({
          projectSlug: "acme",
          eventTypeSlug: "discovery-call",
          date: "2026-03-23",
          timezone: "Pacific/Kiritimati",
          now: BEFORE_BOOKING,
        }),
        service.getAvailableSlots({
          projectSlug: "acme",
          eventTypeSlug: "discovery-call",
          date: "2026-03-25",
          timezone: "Pacific/Kiritimati",
          now: BEFORE_BOOKING,
        }),
        service.getAvailableSlots({
          projectSlug: "acme",
          eventTypeSlug: "discovery-call",
          date: "2026-03-22",
          timezone: "Pacific/Pago_Pago",
          now: BEFORE_BOOKING,
        }),
        service.getAvailableSlots({
          projectSlug: "acme",
          eventTypeSlug: "discovery-call",
          date: "2026-03-24",
          timezone: "Pacific/Pago_Pago",
          now: BEFORE_BOOKING,
        }),
      ]);

      expect(kiritimati.map(function start(slot) {
        return slot.start;
      })).toEqual([
        CROSS_TIMEZONE_SLOT_ISO,
        "2026-03-24T09:00:00.000Z",
      ]);
      expect(pagoPago.map(function start(slot) {
        return slot.start;
      })).toEqual([
        CROSS_TIMEZONE_SLOT_ISO,
        "2026-03-24T09:00:00.000Z",
      ]);
      expect(adjacentDates).toEqual([[], [], [], []]);
    } finally {
      testDatabase.close();
    }
  });
});

describe("availability exclusions users rely on", () => {
  test("database bookings and Google busy time remove every buffered overlap", async () => {
    const testDatabase = createTestDb();
    try {
      await seedAvailabilityScenario(testDatabase.db, {
        rule: { startTime: "09:00", endTime: "12:00" },
        eventType: { bufferBefore: 15, bufferAfter: 15 },
      });
      await testDatabase.db.insert(dbSchema.bookings).values({
        id: FIXTURE_IDS.booking,
        eventTypeId: FIXTURE_IDS.eventType,
        name: "Existing Guest",
        email: "existing@example.com",
        startTime: new Date("2026-03-23T14:00:00.000Z"),
        endTime: new Date("2026-03-23T14:30:00.000Z"),
        timezone: "America/New_York",
        status: "confirmed",
      });

      const slots = await new AvailabilityService(
        testDatabase.db,
      ).getAvailableSlots({
        projectSlug: "acme",
        eventTypeSlug: "discovery-call",
        date: "2026-03-23",
        timezone: "America/New_York",
        now: BEFORE_BOOKING,
        externalBusySlots: [
          {
            start: "2026-03-23T15:45:00.000Z",
            end: "2026-03-23T16:00:00.000Z",
          },
        ],
      });

      expect(slots.map(function start(slot) {
        return slot.start;
      })).toEqual([
        "2026-03-23T13:00:00.000Z",
        "2026-03-23T15:00:00.000Z",
      ]);
    } finally {
      testDatabase.close();
    }
  });

  test("confirmation notice starts at the organizer's pre-event buffer", async () => {
    const testDatabase = createTestDb();
    try {
      await seedAvailabilityScenario(testDatabase.db, {
        rule: { startTime: "09:00", endTime: "11:00" },
        eventType: {
          bufferBefore: 30,
          requiresConfirmation: true,
        },
      });

      const slots = await new AvailabilityService(
        testDatabase.db,
      ).getAvailableSlots({
        projectSlug: "acme",
        eventTypeSlug: "discovery-call",
        date: "2026-03-23",
        timezone: "America/New_York",
        now: new Date("2026-03-23T12:00:00.000Z"),
      });

      expect(slots.map(function start(slot) {
        return slot.start;
      })).toEqual([
        "2026-03-23T14:00:00.000Z",
        "2026-03-23T14:30:00.000Z",
      ]);
    } finally {
      testDatabase.close();
    }
  });

  test("an organizer override blocks or replaces the weekly window across viewer dates", async () => {
    const testDatabase = createTestDb();
    try {
      await seedAvailabilityScenario(testDatabase.db);
      await testDatabase.db.insert(dbSchema.scheduleOverrides).values({
        id: "override-monday",
        scheduleId: FIXTURE_IDS.schedule,
        date: "2026-03-23",
        isBlocked: true,
      });
      const service = new AvailabilityService(testDatabase.db);

      const blocked = await service.getAvailableSlots({
        projectSlug: "acme",
        eventTypeSlug: "discovery-call",
        date: "2026-03-24",
        timezone: "Pacific/Kiritimati",
        now: BEFORE_BOOKING,
      });

      await testDatabase.db
        .delete(dbSchema.scheduleOverrides)
        .run();
      await testDatabase.db.insert(dbSchema.scheduleOverrides).values({
        id: "override-monday-custom",
        scheduleId: FIXTURE_IDS.schedule,
        date: "2026-03-23",
        startTime: "15:00",
        endTime: "16:00",
        isBlocked: false,
      });

      const custom = await service.getAvailableSlots({
        projectSlug: "acme",
        eventTypeSlug: "discovery-call",
        date: "2026-03-24",
        timezone: "Pacific/Kiritimati",
        now: BEFORE_BOOKING,
      });

      expect(blocked).toEqual([]);
      expect(custom.map(function start(slot) {
        return slot.start;
      })).toEqual([
        "2026-03-23T19:00:00.000Z",
        "2026-03-23T19:30:00.000Z",
      ]);
    } finally {
      testDatabase.close();
    }
  });
});

import { describe, expect, test } from "bun:test";

import { buildIcs } from "../../worker/lib/ics";

const base = {
  uid: "booking-abc@linkycal.com",
  dtstamp: new Date("2026-04-01T09:00:00.000Z"),
  start: new Date("2026-04-01T13:00:00.000Z"),
  end: new Date("2026-04-01T13:30:00.000Z"),
  summary: "Intro Call with Ava",
};

describe("buildIcs", () => {
  test("emits a well-formed VCALENDAR with REQUEST method when there is an organizer + attendee", () => {
    const ics = buildIcs({
      ...base,
      organizerEmail: "host@example.com",
      attendeeEmail: "guest@example.com",
    });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:-//LinkyCal//Booking//EN");
    expect(ics).toContain("CALSCALE:GREGORIAN");
    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });
});

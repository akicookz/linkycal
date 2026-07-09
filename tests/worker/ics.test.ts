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
  test("emits a well-formed VCALENDAR with PUBLISH method", () => {
    const ics = buildIcs(base);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:-//LinkyCal//Booking//EN");
    expect(ics).toContain("CALSCALE:GREGORIAN");
    expect(ics).toContain("METHOD:PUBLISH");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });

  test("formats timestamps as UTC basic form", () => {
    const ics = buildIcs(base);
    expect(ics).toContain("DTSTAMP:20260401T090000Z");
    expect(ics).toContain("DTSTART:20260401T130000Z");
    expect(ics).toContain("DTEND:20260401T133000Z");
  });

  test("passes the UID through verbatim", () => {
    const ics = buildIcs({ ...base, uid: "evt123@google.com" });
    expect(ics).toContain("UID:evt123@google.com");
  });

  test("uses CRLF line endings", () => {
    const ics = buildIcs(base);
    expect(ics).toContain("\r\n");
    expect(ics.includes("\n\n")).toBe(false); // no bare LF pairs
  });

  test("escapes TEXT special characters", () => {
    const ics = buildIcs({
      ...base,
      summary: "A, B; C \\ D",
      description: "line1\nline2",
    });
    expect(ics).toContain("SUMMARY:A\\, B\\; C \\\\ D");
    expect(ics).toContain("DESCRIPTION:line1\\nline2");
  });

  test("folds lines longer than 75 octets with a leading space", () => {
    const ics = buildIcs({ ...base, summary: "x".repeat(200) });
    const rawLines = ics.split("\r\n");
    for (const line of rawLines) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }
    // continuation lines begin with a single space
    expect(ics).toContain("\r\n x");
  });

  test("omits optional properties when absent", () => {
    const ics = buildIcs(base);
    // The only DESCRIPTION is the VALARM reminder; no event-level DESCRIPTION.
    expect((ics.match(/DESCRIPTION:/g) ?? []).length).toBe(1);
    expect(ics).toContain("DESCRIPTION:Reminder");
    expect(ics).not.toContain("LOCATION:");
    expect(ics).not.toContain("ORGANIZER");
    expect(ics).not.toContain("URL:");
  });

  test("includes optional properties when provided", () => {
    const ics = buildIcs({
      ...base,
      description: "notes",
      location: "https://meet.google.com/abc",
      url: "https://meet.google.com/abc",
      organizerName: "Owner Name",
      organizerEmail: "owner@example.com",
    });
    expect(ics).toContain("DESCRIPTION:notes");
    expect(ics).toContain("LOCATION:https://meet.google.com/abc");
    expect(ics).toContain("URL:https://meet.google.com/abc");
    expect(ics).toContain("ORGANIZER;CN=Owner Name:mailto:owner@example.com");
  });
});

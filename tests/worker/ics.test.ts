import { describe, expect, test } from "bun:test";

import { buildIcs } from "../../worker/lib/ics";

const base = {
  uid: "booking-abc@linkycal.com",
  dtstamp: new Date("2026-04-01T09:00:00.000Z"),
  start: new Date("2026-04-01T13:00:00.000Z"),
  end: new Date("2026-04-01T13:30:00.000Z"),
  summary: "Intro Call with Ava",
};

function unfoldIcs(value: string): string[] {
  return value.split("\r\n").reduce<string[]>((lines, line) => {
    if (line.startsWith(" ")) {
      lines[lines.length - 1] += line.slice(1);
    } else if (line.length > 0) {
      lines.push(line);
    }
    return lines;
  }, []);
}

function countLine(lines: string[], expected: string): number {
  return lines.filter((line) => line === expected).length;
}

describe("buildIcs", () => {
  test("emits a complete REQUEST calendar for an organizer and attendee", () => {
    const lines = unfoldIcs(
      buildIcs({
        ...base,
        organizerName: "LinkyCal Host",
        organizerEmail: "host@example.com",
        attendeeName: "Ava Guest",
        attendeeEmail: "guest@example.com",
      }),
    );

    expect(lines).toContain("METHOD:REQUEST");
    expect(lines).toContain("UID:booking-abc@linkycal.com");
    expect(lines).toContain("DTSTAMP:20260401T090000Z");
    expect(lines).toContain("DTSTART:20260401T130000Z");
    expect(lines).toContain("DTEND:20260401T133000Z");
    expect(lines).toContain(
      "ORGANIZER;CN=LinkyCal Host:mailto:host@example.com",
    );
    expect(lines).toContain(
      "ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=Ava Guest:mailto:guest@example.com",
    );

    const alarmStart = lines.indexOf("BEGIN:VALARM");
    expect(lines.slice(alarmStart, alarmStart + 5)).toEqual([
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:Reminder",
      "TRIGGER:-PT30M",
      "END:VALARM",
    ]);
    expect([
      countLine(lines, "BEGIN:VCALENDAR"),
      countLine(lines, "END:VCALENDAR"),
      countLine(lines, "BEGIN:VEVENT"),
      countLine(lines, "END:VEVENT"),
    ]).toEqual([1, 1, 1, 1]);
  });

  test("falls back to PUBLISH when either request participant is missing", () => {
    const results = [
      {
        label: "missing organizer",
        lines: unfoldIcs(
          buildIcs({ ...base, attendeeEmail: "guest@example.com" }),
        ),
      },
      {
        label: "missing attendee",
        lines: unfoldIcs(
          buildIcs({ ...base, organizerEmail: "host@example.com" }),
        ),
      },
    ].map(({ label, lines }) => ({
      label,
      method: lines.find((line) => line.startsWith("METHOD:")),
      hasOrganizer: lines.some((line) => line.startsWith("ORGANIZER")),
      hasAttendee: lines.some((line) => line.startsWith("ATTENDEE")),
    }));

    expect(results).toEqual([
      {
        label: "missing organizer",
        method: "METHOD:PUBLISH",
        hasOrganizer: false,
        hasAttendee: false,
      },
      {
        label: "missing attendee",
        method: "METHOD:PUBLISH",
        hasOrganizer: true,
        hasAttendee: false,
      },
    ]);
  });

  test("escapes injected text and folds every physical line to 75 octets", () => {
    const ics = buildIcs({
      ...base,
      summary: "Roadmap, phase; path\\folder\r\nX-EVIL:1",
      description: `Résumé ${"漢".repeat(40)}, next; path\\file`,
      url: "https://example.com/book\r\nX-URL-EVIL:1",
      organizerName: "Host\r\nX-CN-EVIL:1",
      organizerEmail: "host@example.com",
      attendeeEmail: "guest@example.com",
    });

    const lines = unfoldIcs(ics);
    expect(lines).toContain(
      "SUMMARY:Roadmap\\, phase\\; path\\\\folder\\nX-EVIL:1",
    );
    expect(lines.some((line) => line.startsWith("X-EVIL:"))).toBe(false);
    expect(lines.some((line) => line.startsWith("X-URL-EVIL:"))).toBe(false);
    expect(lines.some((line) => line.startsWith("X-CN-EVIL:"))).toBe(false);
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replaceAll("\r\n", "")).not.toMatch(/[\r\n]/);

    const encoder = new TextEncoder();
    const physicalLines = ics.split("\r\n").filter(Boolean);
    expect(physicalLines.some((line) => line.startsWith(" "))).toBe(true);
    expect(
      physicalLines.every((line) => encoder.encode(line).length <= 75),
    ).toBe(true);
  });
});

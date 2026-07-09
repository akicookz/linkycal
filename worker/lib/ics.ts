export interface IcsInput {
  uid: string;
  dtstamp: Date;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  location?: string;
  organizerName?: string;
  organizerEmail?: string;
  attendeeName?: string;
  attendeeEmail?: string;
  url?: string;
}

const CRLF = "\r\n";

function formatUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\n|\r/g, "\\n");
}

function sanitizeParam(value: string): string {
  return value.replace(/[",;:\r\n]/g, " ").trim();
}

function cnParam(name?: string): string {
  if (!name) return "";
  const cn = sanitizeParam(name);
  return cn ? `;CN=${cn}` : "";
}

function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const out: string[] = [];
  let current = "";
  let currentBytes = 0;
  let isFirst = true;

  for (const ch of line) {
    const chBytes = encoder.encode(ch).length;
    const limit = isFirst ? 75 : 74; // continuation lines reserve 1 octet for the leading space
    if (currentBytes + chBytes > limit) {
      out.push(isFirst ? current : ` ${current}`);
      isFirst = false;
      current = "";
      currentBytes = 0;
    }
    current += ch;
    currentBytes += chBytes;
  }
  if (current) out.push(isFirst ? current : ` ${current}`);

  return out.join(CRLF);
}

export function buildIcs(input: IcsInput): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LinkyCal//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${formatUtc(input.dtstamp)}`,
    `DTSTART:${formatUtc(input.start)}`,
    `DTEND:${formatUtc(input.end)}`,
    `SUMMARY:${escapeText(input.summary)}`,
    "SEQUENCE:0",
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
  ];

  if (input.description) lines.push(`DESCRIPTION:${escapeText(input.description)}`);
  if (input.location) lines.push(`LOCATION:${escapeText(input.location)}`);
  if (input.url) lines.push(`URL:${input.url.replace(/[\r\n]/g, "")}`);
  if (input.organizerEmail) {
    lines.push(`ORGANIZER${cnParam(input.organizerName)}:mailto:${input.organizerEmail}`);
  }
  // A REQUEST's ATTENDEE is only valid alongside an ORGANIZER; skip it otherwise.
  if (input.attendeeEmail && input.organizerEmail) {
    lines.push(
      `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE${cnParam(
        input.attendeeName,
      )}:mailto:${input.attendeeEmail}`,
    );
  }

  lines.push(
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Reminder",
    "TRIGGER:-PT30M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  );

  return `${lines.map(foldLine).join(CRLF)}${CRLF}`;
}

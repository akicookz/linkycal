import { afterEach, describe, expect, mock, test } from "bun:test";

import { EmailService } from "../../worker/services/email-service";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch() {
  const fetchMock = mock(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(null, { status: 200 });
  });
  globalThis.fetch = fetchMock as typeof fetch;
  return fetchMock;
}

function lastPayload(
  fetchMock: ReturnType<typeof mockFetch>,
): { subject: string; html: string; to: string[] } {
  const [, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
  return JSON.parse(String(init.body)) as {
    subject: string;
    html: string;
    to: string[];
  };
}

describe("booking confirmation email", () => {
  test("omits submitted form fields from guest confirmation", async () => {
    const fetchMock = mockFetch();
    const emailService = new EmailService("test-key");

    await emailService.sendBookingConfirmation({
      to: "guest@example.com",
      guestName: "Ava",
      eventTypeName: "Intro Call",
      startTime: new Date("2026-04-01T13:00:00.000Z"),
      endTime: new Date("2026-04-01T13:30:00.000Z"),
      timezone: "Europe/Berlin",
    });

    const payload = lastPayload(fetchMock);
    expect(payload.to).toEqual(["guest@example.com"]);
    expect(payload.subject).toBe("Booking Confirmed: Intro Call");
    expect(payload.html).not.toContain("Submitted Details");
  });

  test("renders a join link when meetingUrl is provided", async () => {
    const fetchMock = mockFetch();
    const emailService = new EmailService("test-key");

    await emailService.sendBookingConfirmation({
      to: "guest@example.com",
      guestName: "Ava",
      eventTypeName: "Intro Call",
      startTime: new Date("2026-04-01T13:00:00.000Z"),
      endTime: new Date("2026-04-01T13:30:00.000Z"),
      timezone: "Europe/Berlin",
      meetingUrl: "https://meet.google.com/abc-defg-hij",
    });

    const payload = lastPayload(fetchMock);
    expect(payload.html).toContain("Join meeting");
    expect(payload.html).toContain("https://meet.google.com/abc-defg-hij");
  });

  test("omits join link when meetingUrl is absent", async () => {
    const fetchMock = mockFetch();
    const emailService = new EmailService("test-key");

    await emailService.sendBookingConfirmation({
      to: "guest@example.com",
      guestName: "Ava",
      eventTypeName: "Intro Call",
      startTime: new Date("2026-04-01T13:00:00.000Z"),
      endTime: new Date("2026-04-01T13:30:00.000Z"),
      timezone: "Europe/Berlin",
    });

    expect(lastPayload(fetchMock).html).not.toContain("Join meeting");
  });

  test("applies project theme to guest confirmation email", async () => {
    const fetchMock = mockFetch();
    const emailService = new EmailService("test-key");

    await emailService.sendBookingConfirmation({
      to: "guest@example.com",
      guestName: "Ava",
      eventTypeName: "Intro Call",
      startTime: new Date("2026-04-01T13:00:00.000Z"),
      endTime: new Date("2026-04-01T13:30:00.000Z"),
      timezone: "Europe/Berlin",
      theme: {
        primaryBg: "#ff00aa",
        borderRadius: 24,
        fontFamily: "Satoshi",
      },
    });

    const html = lastPayload(fetchMock).html;
    expect(html).toContain("#ff00aa");
    expect(html).toContain("border-radius: 24px");
    expect(html).toContain("'Satoshi'");
    expect(html).not.toContain("#1B4332");
  });

  test("falls back to default brand styling when no theme is passed", async () => {
    const fetchMock = mockFetch();
    const emailService = new EmailService("test-key");

    await emailService.sendBookingConfirmation({
      to: "guest@example.com",
      guestName: "Ava",
      eventTypeName: "Intro Call",
      startTime: new Date("2026-04-01T13:00:00.000Z"),
      endTime: new Date("2026-04-01T13:30:00.000Z"),
      timezone: "Europe/Berlin",
    });

    expect(lastPayload(fetchMock).html).toContain("#1B4332");
  });
});

describe("owner booking notifications", () => {
  test("includes submitted fields in owner booking request notifications", async () => {
    const fetchMock = mockFetch();
    const emailService = new EmailService("test-key");

    await emailService.sendBookingRequestNotification({
      to: "owner@example.com",
      ownerName: "Host",
      guestName: "Ava",
      guestEmail: "guest@example.com",
      eventTypeName: "Intro Call",
      startTime: new Date("2026-04-01T13:00:00.000Z"),
      endTime: new Date("2026-04-01T13:30:00.000Z"),
      dashboardUrl: "https://linkycal.com/app/projects/p1/bookings?tab=pending",
      submittedFields: [
        { label: "Team size", value: "11-50" },
        { label: "CRM", value: "HubSpot" },
      ],
    });

    const payload = lastPayload(fetchMock);
    expect(payload.subject).toBe("Action Needed: Ava - Intro Call");
    expect(payload.html).toContain("Submitted Details");
    expect(payload.html).toContain("Team size");
    expect(payload.html).toContain("11-50");
    expect(payload.html).toContain("CRM");
    expect(payload.html).toContain("HubSpot");
  });

  test("CCs the account owner on booking notifications when organizer differs", async () => {
    const fetchMock = mockFetch();
    const emailService = new EmailService("test-key");

    await emailService.sendBookingNotification({
      to: "organizer@example.com",
      cc: ["owner@example.com"],
      ownerName: "Admin",
      guestName: "Ava",
      guestEmail: "guest@example.com",
      eventTypeName: "Intro Call",
      startTime: new Date("2026-04-01T13:00:00.000Z"),
      endTime: new Date("2026-04-01T13:30:00.000Z"),
    });

    const [, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      to: string[];
      cc?: string[];
    };
    expect(body.to).toEqual(["organizer@example.com"]);
    expect(body.cc).toEqual(["owner@example.com"]);
  });

  test("omits cc field when no cc is passed", async () => {
    const fetchMock = mockFetch();
    const emailService = new EmailService("test-key");

    await emailService.sendBookingNotification({
      to: "owner@example.com",
      ownerName: "Admin",
      guestName: "Ava",
      guestEmail: "guest@example.com",
      eventTypeName: "Intro Call",
      startTime: new Date("2026-04-01T13:00:00.000Z"),
      endTime: new Date("2026-04-01T13:30:00.000Z"),
    });

    const [, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    const body = JSON.parse(String(init.body)) as { cc?: string[] };
    expect(body.cc).toBeUndefined();
  });
});

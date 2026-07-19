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

function lastBody(
  fetchMock: ReturnType<typeof mockFetch>,
): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

function decodeBase64Utf8(b64: string): string {
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
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
});

describe("owner booking notifications", () => {

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
});

describe("booking confirmation ICS attachment", () => {
});

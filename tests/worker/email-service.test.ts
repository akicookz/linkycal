import { afterEach, describe, expect, mock, test } from "bun:test";

import { EmailService } from "../../worker/services/email-service";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch() {
  const fetchMock = mock(async () => {
    return new Response(null, { status: 200 });
  });
  globalThis.fetch = fetchMock as typeof fetch;
  return fetchMock;
}

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

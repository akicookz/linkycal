import { afterEach, describe, expect, mock, test } from "bun:test";

import { EmailService } from "../../worker/services/email-service";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("booking emails with form submissions", () => {
  test("includes submitted fields in booking confirmation emails", async () => {
    const fetchMock = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      return new Response(null, { status: 200 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const emailService = new EmailService("test-key");
    await emailService.sendBookingConfirmation({
      to: "guest@example.com",
      guestName: "Ava",
      eventTypeName: "Intro Call",
      startTime: new Date("2026-04-01T13:00:00.000Z"),
      endTime: new Date("2026-04-01T13:30:00.000Z"),
      timezone: "Europe/Berlin",
      submittedFields: [
        { label: "Company", value: "Acme Inc" },
        { label: "Use case", value: "Scheduling" },
      ],
    });

    const [, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    const payload = JSON.parse(String(init.body)) as {
      subject: string;
      html: string;
      to: string[];
    };

    expect(payload.to).toEqual(["guest@example.com"]);
    expect(payload.subject).toBe("Booking Confirmed: Intro Call");
    expect(payload.html).toContain("Submitted Details");
    expect(payload.html).toContain("Company");
    expect(payload.html).toContain("Acme Inc");
    expect(payload.html).toContain("Use case");
    expect(payload.html).toContain("Scheduling");
  });

  test("includes submitted fields in owner booking request notifications", async () => {
    const fetchMock = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      return new Response(null, { status: 200 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

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

    const [, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    const payload = JSON.parse(String(init.body)) as {
      subject: string;
      html: string;
    };

    expect(payload.subject).toBe("Action Needed: Ava - Intro Call");
    expect(payload.html).toContain("Submitted Details");
    expect(payload.html).toContain("Team size");
    expect(payload.html).toContain("11-50");
    expect(payload.html).toContain("CRM");
    expect(payload.html).toContain("HubSpot");
  });
});

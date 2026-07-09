import { afterEach, describe, expect, mock, test } from "bun:test";

import { CalendarService } from "../../worker/services/calendar-service";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function makeService(): CalendarService {
  return new CalendarService({} as never, {
    GOOGLE_CALENDAR_CLIENT_ID: "id",
    GOOGLE_CALENDAR_CLIENT_SECRET: "secret",
  });
}

describe("CalendarService.createEvent", () => {
  test("returns id, meetingUrl, iCalUID and organizer from Google's response", async () => {
    globalThis.fetch = mock(async () =>
      new Response(
        JSON.stringify({
          id: "evt1",
          hangoutLink: "https://meet.google.com/abc-defg-hij",
          iCalUID: "evt1@google.com",
          organizer: { email: "host@example.com" },
        }),
        { status: 200 },
      ),
    ) as typeof fetch;

    const result = await makeService().createEvent("token", "primary", {
      summary: "Intro Call with Ava",
      start: "2026-04-01T13:00:00.000Z",
      end: "2026-04-01T13:30:00.000Z",
    });

    expect(result.id).toBe("evt1");
    expect(result.meetingUrl).toBe("https://meet.google.com/abc-defg-hij");
    expect(result.iCalUID).toBe("evt1@google.com");
    expect(result.organizer).toBe("host@example.com");
  });

  test("returns null iCalUID when Google omits it", async () => {
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ id: "evt2" }), { status: 200 }),
    ) as typeof fetch;

    const result = await makeService().createEvent("token", "primary", {
      summary: "Intro Call",
      start: "2026-04-01T13:00:00.000Z",
      end: "2026-04-01T13:30:00.000Z",
    });

    expect(result.id).toBe("evt2");
    expect(result.meetingUrl).toBeNull();
    expect(result.iCalUID).toBeNull();
    expect(result.organizer).toBeNull();
  });
});

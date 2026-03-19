import type { DrizzleD1Database } from "drizzle-orm/d1";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalendarServiceEnv {
  GOOGLE_CALENDAR_CLIENT_ID: string;
  GOOGLE_CALENDAR_CLIENT_SECRET: string;
}

interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  email: string;
}

interface CalendarEntry {
  id: string;
  summary: string;
  primary: boolean;
  accessRole: "freeBusyReader" | "reader" | "writer" | "owner";
}

interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
}

interface CreateEventInput {
  summary: string;
  start: string; // ISO 8601
  end: string; // ISO 8601
  description?: string;
  attendees?: string[];
  organizerEmail?: string;
  organizerName?: string;
  guestName?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

// ─── Service ──────────────────────────────────────────────────────────────────

export class CalendarService {
  readonly db: DrizzleD1Database<Record<string, unknown>>;

  constructor(
    db: DrizzleD1Database<Record<string, unknown>>,
    private env: CalendarServiceEnv,
  ) {
    this.db = db;
  }

  // ─── Get OAuth URL ────────────────────────────────────────────────────────

  getOAuthUrl(redirectUri: string, returnUrl?: string): string {
    const params = new URLSearchParams({
      client_id: this.env.GOOGLE_CALENDAR_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: CALENDAR_SCOPES,
      access_type: "offline",
      prompt: "consent",
    });

    if (returnUrl) {
      params.set("state", returnUrl);
    }

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  // ─── Exchange Code ────────────────────────────────────────────────────────

  async exchangeCode(
    code: string,
    redirectUri: string,
  ): Promise<TokenResponse> {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: this.env.GOOGLE_CALENDAR_CLIENT_ID,
        client_secret: this.env.GOOGLE_CALENDAR_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to exchange code: ${error}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token: string;
    };

    // Fetch the user's email using the access token
    const email = await this.getUserEmail(data.access_token);

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      email,
    };
  }

  // ─── Refresh Access Token ─────────────────────────────────────────────────

  async refreshAccessToken(refreshToken: string): Promise<string> {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: this.env.GOOGLE_CALENDAR_CLIENT_ID,
        client_secret: this.env.GOOGLE_CALENDAR_CLIENT_SECRET,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to refresh token: ${error}`);
    }

    const data = (await response.json()) as { access_token: string };
    return data.access_token;
  }

  // ─── List Calendars ───────────────────────────────────────────────────────

  async listCalendars(accessToken: string): Promise<CalendarEntry[]> {
    const response = await fetch(
      `${GOOGLE_CALENDAR_BASE}/users/me/calendarList`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to list calendars: ${error}`);
    }

    const data = (await response.json()) as {
      items: Array<{ id: string; summary: string; primary?: boolean; accessRole?: string }>;
    };

    return (data.items ?? []).map((item) => ({
      id: item.id,
      summary: item.summary,
      primary: item.primary ?? false,
      accessRole: (item.accessRole as CalendarEntry["accessRole"]) ?? "reader",
    }));
  }

  // ─── Get Events ──────────────────────────────────────────────────────────

  async getEvents(
    accessToken: string,
    calendarId: string,
    timeMin: string,
    timeMax: string,
  ): Promise<CalendarEvent[]> {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });

    const response = await fetch(
      `${GOOGLE_CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get events: ${error}`);
    }

    const data = (await response.json()) as {
      items: Array<{
        id: string;
        summary?: string;
        start: { dateTime?: string; date?: string };
        end: { dateTime?: string; date?: string };
      }>;
    };

    return (data.items ?? []).map((item) => ({
      id: item.id,
      summary: item.summary ?? "",
      start: item.start.dateTime ?? item.start.date ?? "",
      end: item.end.dateTime ?? item.end.date ?? "",
    }));
  }

  // ─── Create Event ─────────────────────────────────────────────────────────

  async createEvent(
    accessToken: string,
    calendarId: string,
    event: CreateEventInput,
  ): Promise<{ id: string; meetingUrl: string | null }> {
    const body: Record<string, unknown> = {
      summary: event.summary,
      start: { dateTime: event.start },
      end: { dateTime: event.end },
      guestsCanSeeOtherGuests: true,
      reminders: {
        useDefault: false,
        overrides: [
          { method: "email", minutes: 60 }, // 1 hour
          { method: "popup", minutes: 10 },
        ],
      },
      conferenceData: {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    };

    if (event.description) {
      body.description = event.description;
    }

    // Build attendees list with display names
    const attendees: Array<Record<string, unknown>> = [];

    if (event.organizerEmail) {
      attendees.push({
        email: event.organizerEmail,
        displayName: event.organizerName || event.organizerEmail,
        responseStatus: "accepted",
        organizer: true,
      });
    }

    if (event.attendees && event.attendees.length > 0) {
      for (const email of event.attendees) {
        attendees.push({
          email,
          displayName: event.guestName || email,
        });
      }
    }

    if (attendees.length > 0) {
      body.attendees = attendees;
    }

    const response = await fetch(
      `${GOOGLE_CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all&conferenceDataVersion=1`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create event: ${error}`);
    }

    const data = (await response.json()) as { id: string; hangoutLink?: string };
    return { id: data.id, meetingUrl: data.hangoutLink ?? null };
  }

  // ─── Get Free/Busy ────────────────────────────────────────────────────────

  async getFreeBusy(
    accessToken: string,
    calendarIds: string[],
    timeMin: string,
    timeMax: string,
  ): Promise<Array<{ start: string; end: string }>> {
    const response = await fetch(
      `${GOOGLE_CALENDAR_BASE}/freeBusy`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timeMin,
          timeMax,
          items: calendarIds.map((id) => ({ id })),
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get free/busy: ${error}`);
    }

    const data = (await response.json()) as {
      calendars: Record<
        string,
        { busy: Array<{ start: string; end: string }> }
      >;
    };

    // Merge all busy slots from all calendars
    const busySlots: Array<{ start: string; end: string }> = [];
    for (const calendarId of calendarIds) {
      const cal = data.calendars?.[calendarId];
      if (cal?.busy) {
        busySlots.push(...cal.busy);
      }
    }

    return busySlots;
  }

  // ─── Delete Event ─────────────────────────────────────────────────────────

  async deleteEvent(
    accessToken: string,
    calendarId: string,
    eventId: string,
  ): Promise<void> {
    const response = await fetch(
      `${GOOGLE_CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to delete event: ${error}`);
    }
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async getUserEmail(accessToken: string): Promise<string> {
    const response = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error("Failed to fetch user email from Google");
    }

    const data = (await response.json()) as { email: string };
    return data.email;
  }
}

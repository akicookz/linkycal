import {
  afterEach,
  describe,
  expect,
  test,
} from "bun:test";
import { eq } from "drizzle-orm";

import * as dbSchema from "../../worker/db/schema";
import {
  cancelBookingAction,
  confirmBookingAction,
  createBookingAction,
  declineBookingAction,
  type BookingActionDeps,
} from "../../worker/lib/booking-actions";
import { notifyFormResponseCompleted } from "../../worker/lib/form-response-notification";
import type { AppEnv } from "../../worker/types";
import {
  createFakeQueue,
  type FakeQueue,
} from "../support/fake-queue";
import {
  FIXTURE_IDS,
  seedBookingDeliveryScenario,
} from "../support/fixtures";
import {
  restoreRealTime,
  setFixedTime,
} from "../support/fixed-time";
import {
  installHttpCapture,
  type HttpCapture,
} from "../support/http-capture";
import { createTestDb } from "../support/test-db";
import { createWaitUntilCollector } from "../support/wait-until";

interface ResendAttachment {
  filename: string;
  content: string;
  content_type: string;
}

interface ResendPayload {
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  attachments?: ResendAttachment[];
}

interface WorkflowQueueBody {
  workflowRunId: string;
  stepIndex: number;
}

afterEach(function restoreClock() {
  restoreRealTime();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installDeliveryHttp(): HttpCapture {
  let resendSequence = 0;
  return installHttpCapture([
    {
      method: "POST",
      matches: function matchesGoogleToken(url) {
        return url.toString() === "https://oauth2.googleapis.com/token";
      },
      respond: function respondGoogleToken() {
        return jsonResponse({
          access_token: "google-access-token",
          expires_in: 3600,
        });
      },
    },
    {
      method: "POST",
      matches: function matchesGoogleEvent(url) {
        return url.origin === "https://www.googleapis.com" &&
          url.pathname.endsWith("/events");
      },
      respond: function respondGoogleEvent() {
        return jsonResponse({
          id: "google-event-123",
          iCalUID: "google-uid-123@google.com",
          organizer: { email: "calendar-owner@example.com" },
          hangoutLink: "https://meet.google.com/abc-defg-hij",
        });
      },
    },
    {
      method: "DELETE",
      matches: function matchesGoogleDelete(url) {
        return url.origin === "https://www.googleapis.com" &&
          url.pathname.includes("/events/");
      },
      respond: function respondGoogleDelete() {
        return new Response(null, { status: 204 });
      },
    },
    {
      method: "POST",
      matches: function matchesResend(url) {
        return url.toString() === "https://api.resend.com/emails";
      },
      respond: function respondResend() {
        resendSequence += 1;
        return jsonResponse({ id: `resend-message-${resendSequence}` });
      },
    },
  ]);
}

function makeTestEnv(
  queue: FakeQueue<WorkflowQueueBody>,
): AppEnv {
  return {
    BETTER_AUTH_URL: "https://app.linkycal.test",
    GOOGLE_CALENDAR_CLIENT_ID: "google-calendar-client",
    GOOGLE_CALENDAR_CLIENT_SECRET: "google-calendar-secret",
    RESEND_API_KEY: "resend-test-key",
    WORKFLOW_QUEUE: queue.binding,
  } as AppEnv;
}

function getResendPayloads(http: HttpCapture): ResendPayload[] {
  return http
    .requestsFor("POST", "/emails")
    .filter(function isResend(request) {
      return request.url.origin === "https://api.resend.com";
    })
    .map(function payload(request) {
      return request.json as ResendPayload;
    });
}

function findPayloadFor(
  payloads: ResendPayload[],
  recipient: string,
  subject: string,
): ResendPayload {
  const payload = payloads.find(function isTarget(candidate) {
    return candidate.to.includes(recipient) &&
      candidate.subject === subject;
  });
  if (!payload) {
    throw new Error(`Missing Resend payload for ${recipient}: ${subject}`);
  }
  return payload;
}

function renderedText(html: string): string {
  const container = document.createElement("div");
  container.innerHTML = html;
  return (container.textContent ?? "").replace(/\s+/g, " ").trim();
}

function decodeBase64Utf8(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, function toByte(character) {
    return character.charCodeAt(0);
  });
  return new TextDecoder().decode(bytes);
}

function unfoldIcs(value: string): string[] {
  return value.split("\r\n").reduce<string[]>(function reduceLines(
    lines,
    line,
  ) {
    if (line.startsWith(" ")) {
      lines[lines.length - 1] += line.slice(1);
    } else if (line) {
      lines.push(line);
    }
    return lines;
  }, []);
}

function countExact(lines: string[], expected: string): number {
  return lines.filter(function matches(line) {
    return line === expected;
  }).length;
}

function createDeps(
  db: BookingActionDeps["db"],
  env: AppEnv,
  collector: ReturnType<typeof createWaitUntilCollector>,
): BookingActionDeps {
  return {
    db,
    env,
    waitUntil: collector.waitUntil,
  };
}

describe("booking delivery", () => {
  test("confirmed booking persists Google identity and sends exact attendee, email, and ICS data", async () => {
    setFixedTime("2026-03-20T12:00:00.000Z");
    const testDatabase = createTestDb();
    const queue = createFakeQueue<WorkflowQueueBody>();
    const collector = createWaitUntilCollector();
    const http = installDeliveryHttp();

    try {
      const fixture = await seedBookingDeliveryScenario(testDatabase.db);
      const result = await createBookingAction(
        createDeps(testDatabase.db, makeTestEnv(queue), collector),
        {
          projectSlug: "acme",
          eventTypeSlug: "discovery-call",
          name: "Hanna Guest",
          email: "hanna@example.com",
          notes: fixture.notes,
          startTime: fixture.startTime,
          timezone: "Europe/Helsinki",
          formFields: {
            company: "Northstar Oy",
            "optional-note": "",
          },
        },
      );
      if (!result.ok) throw new Error(result.error);
      await collector.flush();

      const googleRequests = http.requests.filter(function isGoogleEvent(
        request,
      ) {
        return request.method === "POST" &&
          request.url.origin === "https://www.googleapis.com";
      });
      expect(googleRequests).toHaveLength(1);
      const googleRequest = googleRequests[0]!;
      expect(googleRequest.url.pathname).toBe(
        "/calendar/v3/calendars/team%2Fcalendar%40group.calendar.google.com/events",
      );
      expect(Object.fromEntries(googleRequest.url.searchParams)).toEqual({
        sendUpdates: "all",
        conferenceDataVersion: "1",
      });
      expect(googleRequest.headers.get("Authorization")).toBe(
        "Bearer google-access-token",
      );
      expect(googleRequest.headers.get("Content-Type")).toBe(
        "application/json",
      );
      expect(googleRequest.json).toEqual({
        summary: "Discovery call with Hanna Guest",
        start: { dateTime: fixture.startTime },
        end: { dateTime: fixture.endTime },
        guestsCanSeeOtherGuests: true,
        reminders: {
          useDefault: false,
          overrides: [
            { method: "email", minutes: 60 },
            { method: "popup", minutes: 10 },
          ],
        },
        conferenceData: {
          createRequest: {
            requestId: expect.stringMatching(
              /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
            ),
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
        description: fixture.notes,
        attendees: [
          {
            email: "hanna@example.com",
            displayName: "Hanna Guest",
          },
          {
            email: "observer@example.com",
            displayName: "Hanna Guest",
          },
        ],
      });

      const [booking] = await testDatabase.db
        .select()
        .from(dbSchema.bookings)
        .where(eq(dbSchema.bookings.id, result.booking.id))
        .limit(1);
      expect({
        status: booking!.status,
        gcalEventId: booking!.gcalEventId,
        gcalICalUid: booking!.gcalICalUid,
        gcalOrganizerEmail: booking!.gcalOrganizerEmail,
        meetingUrl: booking!.meetingUrl,
      }).toEqual({
        status: "confirmed",
        gcalEventId: "google-event-123",
        gcalICalUid: "google-uid-123@google.com",
        gcalOrganizerEmail: "calendar-owner@example.com",
        meetingUrl: "https://meet.google.com/abc-defg-hij",
      });

      const resendPayloads = getResendPayloads(http);
      expect(resendPayloads).toHaveLength(2);
      const guestEmail = findPayloadFor(
        resendPayloads,
        "hanna@example.com",
        "Booking Confirmed: Discovery call",
      );
      expect(Object.keys(guestEmail).sort()).toEqual([
        "attachments",
        "from",
        "html",
        "subject",
        "to",
      ]);
      expect({
        from: guestEmail.from,
        to: guestEmail.to,
        subject: guestEmail.subject,
      }).toEqual({
        from: "LinkyCal <noreply@updates.linkycal.com>",
        to: ["hanna@example.com"],
        subject: "Booking Confirmed: Discovery call",
      });
      const guestText = renderedText(guestEmail.html);
      for (const expected of [
        "Hanna Guest",
        "Discovery call",
        "Monday, March 23, 2026",
        "3:00 PM - 3:30 PM GMT+2",
        "Remote studio",
        "Bring roadmap, budget; and path\\notes.",
        "https://meet.google.com/abc-defg-hij",
      ]) {
        expect(guestText).toContain(expected);
      }
      expect(guestText).not.toContain("Northstar Oy");
      expect(guestEmail.html).toContain("#1B4332");
      expect(guestEmail.html).toContain("border-radius: 16px");

      const ownerEmail = findPayloadFor(
        resendPayloads,
        "calendar-owner@example.com",
        "New Booking: Hanna Guest - Discovery call",
      );
      expect(ownerEmail.cc).toEqual(["aki@encited.com"]);
      const ownerText = renderedText(ownerEmail.html);
      expect(ownerText).toContain("Hanna Guest (hanna@example.com)");
      expect(ownerText).toContain("Company");
      expect(ownerText).toContain("Northstar Oy");
      expect(ownerText).not.toContain("Optional note");

      const attachment = guestEmail.attachments?.[0];
      expect({
        count: guestEmail.attachments?.length,
        filename: attachment?.filename,
        contentType: attachment?.content_type,
      }).toEqual({
        count: 1,
        filename: "invite.ics",
        contentType: "text/calendar; method=REQUEST; charset=utf-8",
      });
      const ics = decodeBase64Utf8(attachment!.content);
      expect(ics.endsWith("\r\n")).toBe(true);
      expect(ics.replaceAll("\r\n", "")).not.toMatch(/[\r\n]/);
      const encoder = new TextEncoder();
      const physicalLines = ics.split("\r\n").filter(Boolean);
      expect(
        physicalLines.every(function hasLegalLength(line) {
          return encoder.encode(line).length <= 75;
        }),
      ).toBe(true);

      const lines = unfoldIcs(ics);
      expect([
        countExact(lines, "BEGIN:VCALENDAR"),
        countExact(lines, "BEGIN:VEVENT"),
        countExact(lines, "BEGIN:VALARM"),
      ]).toEqual([1, 1, 1]);
      for (const expected of [
        "METHOD:REQUEST",
        "UID:google-uid-123@google.com",
        "DTSTAMP:20260320T120000Z",
        "DTSTART:20260323T130000Z",
        "DTEND:20260323T133000Z",
        "ORGANIZER:mailto:calendar-owner@example.com",
        "ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=Hanna Guest:mailto:hanna@example.com",
        "SUMMARY:Discovery call with Hanna Guest",
        "LOCATION:Remote studio",
        "URL:https://meet.google.com/abc-defg-hij",
      ]) {
        expect(lines).toContain(expected);
      }
      const description = lines.find(function isDescription(line) {
        return line.startsWith("DESCRIPTION:Bring roadmap");
      });
      expect(description).toContain(
        "roadmap\\, budget\\; and path\\\\notes.\\nX-EVIL:injected",
      );
      expect(lines.some(function isInjectedProperty(line) {
        return line.startsWith("X-EVIL:");
      })).toBe(false);
    } finally {
      http.restore();
      testDatabase.close();
    }
  });

  test("pending request sends no Google event, then approval delivers once and queues the confirmed workflow", async () => {
    setFixedTime("2026-03-20T12:00:00.000Z");
    const testDatabase = createTestDb();
    const queue = createFakeQueue<WorkflowQueueBody>();
    const collector = createWaitUntilCollector();
    const http = installDeliveryHttp();

    try {
      const fixture = await seedBookingDeliveryScenario(testDatabase.db, {
        requiresConfirmation: true,
        seedConfirmationWorkflow: true,
      });
      const deps = createDeps(
        testDatabase.db,
        makeTestEnv(queue),
        collector,
      );
      const created = await createBookingAction(deps, {
        projectSlug: "acme",
        eventTypeSlug: "discovery-call",
        name: "Hanna Guest",
        email: "hanna@example.com",
        notes: fixture.notes,
        startTime: fixture.startTime,
        timezone: "Europe/Helsinki",
        formFields: {
          company: "Northstar Oy",
          "optional-note": "",
        },
      });
      if (!created.ok) throw new Error(created.error);
      await collector.flush();

      const [pendingBooking] = await testDatabase.db
        .select()
        .from(dbSchema.bookings)
        .where(eq(dbSchema.bookings.id, created.booking.id))
        .limit(1);
      expect({
        status: pendingBooking!.status,
        expiresAt: pendingBooking!.expiresAt?.toISOString(),
      }).toEqual({
        status: "pending",
        expiresAt: "2026-03-21T12:00:00.000Z",
      });
      expect(
        http.requests.filter(function isGoogle(request) {
          return request.url.origin === "https://www.googleapis.com";
        }),
      ).toEqual([]);

      const requestEmails = getResendPayloads(http);
      const guestRequest = findPayloadFor(
        requestEmails,
        "hanna@example.com",
        "Booking Request: Discovery call",
      );
      const guestRequestText = renderedText(guestRequest.html);
      expect(guestRequestText).toContain("awaiting confirmation");
      expect(guestRequestText).toContain("Monday, March 23, 2026");
      expect(guestRequestText).toContain("3:00 PM - 3:30 PM");
      const ownerRequest = findPayloadFor(
        requestEmails,
        "calendar-owner@example.com",
        "Action Needed: Hanna Guest - Discovery call",
      );
      const ownerRequestText = renderedText(ownerRequest.html);
      expect(ownerRequestText).toContain("Hanna Guest (hanna@example.com)");
      expect(ownerRequestText).toContain("Company");
      expect(ownerRequestText).toContain("Northstar Oy");
      expect(ownerRequest.html).toContain(
        "https://app.linkycal.test/app/projects/project-acme/bookings?tab=pending",
      );

      const confirmed = await confirmBookingAction(
        deps,
        FIXTURE_IDS.project,
        created.booking.id,
      );
      if (!confirmed.ok) throw new Error(confirmed.error);
      await collector.flush();

      const googleCreates = http.requests.filter(function isGoogleCreate(
        request,
      ) {
        return request.method === "POST" &&
          request.url.origin === "https://www.googleapis.com";
      });
      expect(googleCreates).toHaveLength(1);
      const [confirmedBooking] = await testDatabase.db
        .select()
        .from(dbSchema.bookings)
        .where(eq(dbSchema.bookings.id, created.booking.id))
        .limit(1);
      expect({
        status: confirmedBooking!.status,
        expiresAt: confirmedBooking!.expiresAt,
        gcalEventId: confirmedBooking!.gcalEventId,
        gcalICalUid: confirmedBooking!.gcalICalUid,
        gcalOrganizerEmail: confirmedBooking!.gcalOrganizerEmail,
        meetingUrl: confirmedBooking!.meetingUrl,
      }).toEqual({
        status: "confirmed",
        expiresAt: null,
        gcalEventId: "google-event-123",
        gcalICalUid: "google-uid-123@google.com",
        gcalOrganizerEmail: "calendar-owner@example.com",
        meetingUrl: "https://meet.google.com/abc-defg-hij",
      });
      const confirmationEmail = findPayloadFor(
        getResendPayloads(http),
        "hanna@example.com",
        "Booking Confirmed: Discovery call",
      );
      expect(
        unfoldIcs(
          decodeBase64Utf8(confirmationEmail.attachments![0]!.content),
        ),
      ).toContain("UID:google-uid-123@google.com");

      const [workflowRun] = await testDatabase.db
        .select()
        .from(dbSchema.workflowRuns)
        .where(eq(dbSchema.workflowRuns.workflowId, "workflow-confirmed"))
        .limit(1);
      expect(
        JSON.parse(workflowRun!.context ?? "{}"),
      ).toMatchObject({
        projectId: FIXTURE_IDS.project,
        bookingId: created.booking.id,
        contactEmail: "hanna@example.com",
      });
      expect(queue.messages).toEqual([
        {
          body: {
            workflowRunId: workflowRun!.id,
            stepIndex: 0,
          },
          delaySeconds: 0,
        },
      ]);
    } finally {
      http.restore();
      testDatabase.close();
    }
  });

  test("cancellation deletes the Google event and tells the guest the real event and local time", async () => {
    setFixedTime("2026-03-20T12:00:00.000Z");
    const testDatabase = createTestDb();
    const queue = createFakeQueue<WorkflowQueueBody>();
    const collector = createWaitUntilCollector();
    const http = installDeliveryHttp();

    try {
      const fixture = await seedBookingDeliveryScenario(testDatabase.db);
      await testDatabase.db.insert(dbSchema.bookings).values({
        id: "booking-to-cancel",
        eventTypeId: fixture.eventTypeId,
        name: "Hanna Guest",
        email: "hanna@example.com",
        notes: fixture.notes,
        startTime: new Date(fixture.startTime),
        endTime: new Date(fixture.endTime),
        timezone: "Europe/Helsinki",
        status: "confirmed",
        gcalEventId: "google-event-to-delete",
      });

      const cancelled = await cancelBookingAction(
        createDeps(testDatabase.db, makeTestEnv(queue), collector),
        fixture.projectId,
        "booking-to-cancel",
        "Host is unavailable",
      );
      if (!cancelled.ok) throw new Error(cancelled.error);
      await collector.flush();

      const [booking] = await testDatabase.db
        .select()
        .from(dbSchema.bookings)
        .where(eq(dbSchema.bookings.id, "booking-to-cancel"))
        .limit(1);
      expect(booking!.status).toBe("cancelled");
      const deletes = http.requests.filter(function isDelete(request) {
        return request.method === "DELETE" &&
          request.url.origin === "https://www.googleapis.com";
      });
      expect(deletes).toHaveLength(1);
      expect(deletes[0]!.url.pathname).toBe(
        "/calendar/v3/calendars/team%2Fcalendar%40group.calendar.google.com/events/google-event-to-delete",
      );
      expect(Object.fromEntries(deletes[0]!.url.searchParams)).toEqual({
        sendUpdates: "all",
      });
      const email = findPayloadFor(
        getResendPayloads(http),
        "hanna@example.com",
        "Booking Cancelled: Discovery call",
      );
      const text = renderedText(email.html);
      expect(text).toContain("Discovery call");
      expect(text).toContain("Monday, March 23, 2026");
      expect(text).toContain("3:00 PM - 3:30 PM GMT+2");
      expect(text).toContain("Host is unavailable");
    } finally {
      http.restore();
      testDatabase.close();
    }
  });

  test("decline persists without Google and includes host, event, local time, and reason", async () => {
    setFixedTime("2026-03-20T12:00:00.000Z");
    const testDatabase = createTestDb();
    const queue = createFakeQueue<WorkflowQueueBody>();
    const collector = createWaitUntilCollector();
    const http = installDeliveryHttp();

    try {
      const fixture = await seedBookingDeliveryScenario(testDatabase.db);
      await testDatabase.db.insert(dbSchema.bookings).values({
        id: "booking-to-decline",
        eventTypeId: fixture.eventTypeId,
        name: "Hanna Guest",
        email: "hanna@example.com",
        startTime: new Date(fixture.startTime),
        endTime: new Date(fixture.endTime),
        timezone: "Europe/Helsinki",
        status: "pending",
      });
      const declined = await declineBookingAction(
        createDeps(testDatabase.db, makeTestEnv(queue), collector),
        fixture.projectId,
        "booking-to-decline",
        {
          notify: true,
          reason: "Requested time cannot be hosted",
        },
      );
      if (!declined.ok) throw new Error(declined.error);
      await collector.flush();

      const [booking] = await testDatabase.db
        .select()
        .from(dbSchema.bookings)
        .where(eq(dbSchema.bookings.id, "booking-to-decline"))
        .limit(1);
      expect(booking!.status).toBe("declined");
      expect(
        http.requests.some(function isGoogle(request) {
          return request.url.origin === "https://www.googleapis.com";
        }),
      ).toBe(false);
      const email = findPayloadFor(
        getResendPayloads(http),
        "hanna@example.com",
        "Booking Update: Discovery call",
      );
      const text = renderedText(email.html);
      expect(text).toContain("Aki Owner");
      expect(text).toContain("Discovery call");
      expect(text).toContain("Monday, March 23, 2026");
      expect(text).toContain("3:00 PM - 3:30 PM");
      expect(text).toContain("Requested time cannot be hosted");
    } finally {
      http.restore();
      testDatabase.close();
    }
  });

  test("paid form response notification sends the configured escaped payload", async () => {
    const testDatabase = createTestDb();
    const http = installDeliveryHttp();

    try {
      const fixture = await seedBookingDeliveryScenario(testDatabase.db);
      await testDatabase.db.insert(dbSchema.subscriptions).values({
        id: "subscription-pro",
        userId: FIXTURE_IDS.owner,
        plan: "pro",
        status: "active",
      });
      await testDatabase.db
        .update(dbSchema.forms)
        .set({
          name: "Partner application",
          settings: JSON.stringify({
            responseNotificationEmail: "forms@encited.com",
          }),
        })
        .where(eq(dbSchema.forms.id, fixture.formId));
      await testDatabase.db.insert(dbSchema.formResponses).values({
        id: "response-hanna",
        formId: fixture.formId,
        status: "completed",
        respondentEmail: "respondent@example.com",
      });
      await testDatabase.db.insert(dbSchema.formFieldValues).values([
        {
          id: "value-company",
          responseId: "response-hanna",
          formId: fixture.formId,
          fieldId: "company",
          value: "<Northstar & Co>",
        },
        {
          id: "value-website",
          responseId: "response-hanna",
          formId: fixture.formId,
          fieldId: "optional-note",
          value: "https://northstar.example",
        },
      ]);

      await notifyFormResponseCompleted(
        testDatabase.db,
        { RESEND_API_KEY: "resend-test-key" },
        "response-hanna",
        fixture.formId,
      );

      const email = findPayloadFor(
        getResendPayloads(http),
        "forms@encited.com",
        "New Form Response: Partner application",
      );
      const text = renderedText(email.html);
      expect(text).toContain("Partner application");
      expect(text).toContain("respondent@example.com");
      expect(text).toContain("Company");
      expect(text).toContain("<Northstar & Co>");
      expect(text).toContain("Optional note");
      expect(text).toContain("https://northstar.example");
      expect(email.html).toContain("&lt;Northstar &amp; Co&gt;");
      expect(email.html).not.toContain("<Northstar & Co>");
    } finally {
      http.restore();
      testDatabase.close();
    }
  });
});

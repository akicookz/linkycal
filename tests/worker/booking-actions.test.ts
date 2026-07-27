import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";

import * as dbSchema from "../../worker/db/schema";
import {
  cancelBookingAction,
  confirmBookingAction,
  declineBookingAction,
} from "../../worker/lib/booking-actions";
import type { BookingActionDeps } from "../../worker/lib/booking-actions";
import type { AppEnv } from "../../worker/types";
import { seedTwoProjects } from "./mcp-test-db";

// The actions fire background email tasks; keep the test hermetic by stubbing
// fetch so no request ever leaves the process. Calls are recorded so tests can
// assert on the outgoing request payloads.
const realFetch = globalThis.fetch;
let fetchCalls: Array<{ url: string; body: string }> = [];
beforeAll(() => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({ url: String(input), body: String(init?.body ?? "") });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

async function seedFixture() {
  const { db } = await seedTwoProjects();

  await db.insert(dbSchema.eventTypes).values([
    { id: "et-a1", projectId: "proj-a", name: "Intro Call", slug: "intro-call" },
    { id: "et-b1", projectId: "proj-b", name: "Private Call", slug: "private-call" },
  ]);

  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const futureEnd = new Date(future.getTime() + 30 * 60 * 1000);
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const pastEnd = new Date(past.getTime() + 30 * 60 * 1000);

  await db.insert(dbSchema.bookings).values([
    {
      id: "bk-confirmed",
      eventTypeId: "et-a1",
      name: "Guest",
      email: "guest@example.com",
      startTime: future,
      endTime: futureEnd,
      timezone: "UTC",
      status: "confirmed",
    },
    {
      id: "bk-pending",
      eventTypeId: "et-a1",
      name: "Guest",
      email: "guest@example.com",
      startTime: future,
      endTime: futureEnd,
      timezone: "UTC",
      status: "pending",
    },
    {
      id: "bk-pending-past",
      eventTypeId: "et-a1",
      name: "Guest",
      email: "guest@example.com",
      startTime: past,
      endTime: pastEnd,
      timezone: "UTC",
      status: "pending",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
    {
      id: "bk-foreign-confirmed",
      eventTypeId: "et-b1",
      name: "Foreign Guest",
      email: "foreign@example.com",
      startTime: future,
      endTime: futureEnd,
      timezone: "UTC",
      status: "confirmed",
    },
    {
      id: "bk-foreign-pending",
      eventTypeId: "et-b1",
      name: "Foreign Guest",
      email: "foreign@example.com",
      startTime: future,
      endTime: futureEnd,
      timezone: "UTC",
      status: "pending",
    },
  ]);

  const pending: Promise<unknown>[] = [];
  const deps: BookingActionDeps = {
    db,
    env: { RESEND_API_KEY: "re_test" } as AppEnv,
    waitUntil: (p) => {
      pending.push(p.catch(() => {}));
    },
  };

  return { db, deps, pending, settle: () => Promise.all(pending) };
}

describe("booking actions", () => {
  test("cancels an owned booking, emails the reason, and records one activity", async () => {
    fetchCalls = [];
    const { db, deps, settle } = await seedFixture();

    const result = await cancelBookingAction(deps, "proj-a", "bk-confirmed", "Schedule conflict");
    expect(result.ok).toBe(true);

    const [row] = await db
      .select()
      .from(dbSchema.bookings)
      .where(eq(dbSchema.bookings.id, "bk-confirmed"))
      .limit(1);
    expect(row.status).toBe("cancelled");

    await settle();

    const cancellationCall = fetchCalls.find(
      (call) =>
        call.url.includes("api.resend.com") &&
        call.body.includes("Booking Cancelled"),
    );
    expect(cancellationCall).toBeDefined();
    const cancellationPayload = JSON.parse(cancellationCall!.body) as {
      html: string;
    };
    expect(cancellationPayload.html).toContain("Schedule conflict");

    const contacts = await db
      .select()
      .from(dbSchema.contacts)
      .where(eq(dbSchema.contacts.email, "guest@example.com"));
    expect(contacts.map((contact) => contact.projectId)).toEqual(["proj-a"]);

    const activities = await db
      .select()
      .from(dbSchema.contactActivity)
      .where(eq(dbSchema.contactActivity.contactId, contacts[0]!.id));
    expect(
      activities.filter(
        (activity) =>
          activity.type === "cancelled" &&
          activity.referenceId === "bk-confirmed",
      ),
    ).toHaveLength(1);
  });

  test("rejects a past booking before changing its pending state", async () => {
    const { db, deps, pending } = await seedFixture();

    const result = await confirmBookingAction(deps, "proj-a", "bk-pending-past");
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Cannot confirm a booking whose time has already passed",
    });

    const [row] = await db
      .select({
        status: dbSchema.bookings.status,
        expiresAt: dbSchema.bookings.expiresAt,
      })
      .from(dbSchema.bookings)
      .where(eq(dbSchema.bookings.id, "bk-pending-past"))
      .limit(1);
    expect(row.status).toBe("pending");
    expect(row.expiresAt).not.toBeNull();
    expect(pending).toHaveLength(0);
  });

  test("does not mutate another project's booking through any organizer action", async () => {
    const { db, deps, pending } = await seedFixture();

    expect(
      await cancelBookingAction(
        deps,
        "proj-a",
        "bk-foreign-confirmed",
        "No",
      ),
    ).toEqual({ ok: false, status: 404, error: "Booking not found" });
    expect(
      await confirmBookingAction(deps, "proj-a", "bk-foreign-pending"),
    ).toEqual({
      ok: false,
      status: 404,
      error: "Booking not found or not pending",
    });
    expect(
      await declineBookingAction(
        deps,
        "proj-a",
        "bk-foreign-pending",
        { notify: true, reason: "No" },
      ),
    ).toEqual({
      ok: false,
      status: 404,
      error: "Booking not found or not pending",
    });

    const rows = await db
      .select({
        id: dbSchema.bookings.id,
        status: dbSchema.bookings.status,
      })
      .from(dbSchema.bookings)
      .where(
        inArray(dbSchema.bookings.id, [
          "bk-foreign-confirmed",
          "bk-foreign-pending",
        ]),
      );
    expect(new Map(rows.map((row) => [row.id, row.status]))).toEqual(
      new Map([
        ["bk-foreign-confirmed", "confirmed"],
        ["bk-foreign-pending", "pending"],
      ]),
    );
    expect(pending).toHaveLength(0);
  });

  test("confirmBookingAction returns 404 for a non-pending booking", async () => {
    const { deps } = await seedFixture();
    const result = await confirmBookingAction(deps, "proj-a", "bk-confirmed");
    expect(result).toEqual({
      ok: false,
      status: 404,
      error: "Booking not found or not pending",
    });
  });

  test("confirming a booking attaches an invite.ics to the guest email", async () => {
    fetchCalls = [];
    const { deps, settle } = await seedFixture();

    const result = await confirmBookingAction(deps, "proj-a", "bk-pending");
    expect(result.ok).toBe(true);
    await settle();

    const call = fetchCalls.find(
      (c) => c.url.includes("api.resend.com") && c.body.includes("Booking Confirmed"),
    );
    expect(call).toBeDefined();

    const body = JSON.parse(call!.body) as {
      attachments?: Array<{ filename: string; content: string }>;
    };
    expect(body.attachments).toHaveLength(1);
    expect(body.attachments![0].filename).toBe("invite.ics");

    const binary = atob(body.attachments![0].content);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const ics = new TextDecoder().decode(bytes);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("UID:booking-bk-pending@linkycal.com");
  });
});

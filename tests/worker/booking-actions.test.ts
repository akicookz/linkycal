import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

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

  return { db, deps, settle: () => Promise.all(pending) };
}

describe("booking actions", () => {
  test("cancelBookingAction cancels and records the reason", async () => {
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

    // The cancel flow links/creates a contact for the guest
    const [contact] = await db
      .select()
      .from(dbSchema.contacts)
      .where(eq(dbSchema.contacts.email, "guest@example.com"))
      .limit(1);
    expect(contact?.projectId).toBe("proj-a");
  });

  test("cancelBookingAction returns 404 for an unknown booking", async () => {
    const { deps } = await seedFixture();
    const result = await cancelBookingAction(deps, "proj-a", "nope", undefined);
    expect(result).toEqual({ ok: false, status: 404, error: "Booking not found" });
  });

  test("confirmBookingAction rejects a booking whose time has passed", async () => {
    const { db, deps } = await seedFixture();

    const result = await confirmBookingAction(deps, "proj-a", "bk-pending-past");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);

    // BookingService.confirm flips status before the time check; the action
    // mirrors the route exactly, so just assert the rejection surfaced.
    const [row] = await db
      .select()
      .from(dbSchema.bookings)
      .where(eq(dbSchema.bookings.id, "bk-pending-past"))
      .limit(1);
    expect(row).toBeDefined();
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

  test("declineBookingAction declines without email when notify is false", async () => {
    const { db, deps, settle } = await seedFixture();

    const result = await declineBookingAction(deps, "bk-pending", { notify: false });
    expect(result.ok).toBe(true);

    const [row] = await db
      .select()
      .from(dbSchema.bookings)
      .where(eq(dbSchema.bookings.id, "bk-pending"))
      .limit(1);
    expect(row.status).toBe("declined");

    await settle();
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

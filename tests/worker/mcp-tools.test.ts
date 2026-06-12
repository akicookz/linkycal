import { describe, expect, test } from "bun:test";

import * as dbSchema from "../../worker/db/schema";
import {
  listBookings,
  getBooking,
  getAvailableSlots,
} from "../../worker/mcp/tools/bookings";
import {
  listContacts,
  createContact,
  updateContact,
  addTagToContact,
} from "../../worker/mcp/tools/contacts";
import {
  listEventTypes,
  getEventType,
  createEventType,
} from "../../worker/mcp/tools/event-types";
import { getSchedule } from "../../worker/mcp/tools/schedules";
import { getForm } from "../../worker/mcp/tools/forms";
import { getWorkflow } from "../../worker/mcp/tools/workflows";
import { seedTwoProjects, makeToolContext } from "./mcp-test-db";
import type { ToolResult } from "../../worker/mcp/helpers";

function parsed(result: ToolResult): unknown {
  return JSON.parse(result.content[0].text);
}

async function seedFixture() {
  const seeded = await seedTwoProjects();
  const { db } = seeded;

  await db.insert(dbSchema.eventTypes).values([
    { id: "et-a1", projectId: "proj-a", name: "Intro Call", slug: "intro-call" },
    { id: "et-a2", projectId: "proj-a", name: "Demo", slug: "demo" },
    { id: "et-b1", projectId: "proj-b", name: "Other Call", slug: "other-call" },
  ]);

  const start = new Date("2026-07-01T10:00:00Z");
  const end = new Date("2026-07-01T10:30:00Z");
  await db.insert(dbSchema.bookings).values([
    {
      id: "bk-a1",
      eventTypeId: "et-a1",
      name: "Guest A",
      email: "guest-a@example.com",
      startTime: start,
      endTime: end,
      timezone: "UTC",
      status: "confirmed",
    },
    {
      id: "bk-b1",
      eventTypeId: "et-b1",
      name: "Guest B",
      email: "guest-b@example.com",
      startTime: start,
      endTime: end,
      timezone: "UTC",
      status: "confirmed",
    },
  ]);

  await db.insert(dbSchema.contacts).values([
    { id: "ct-a1", projectId: "proj-a", name: "Carol", email: "carol@example.com" },
    { id: "ct-b1", projectId: "proj-b", name: "Dave", email: "dave@example.com" },
  ]);

  await db.insert(dbSchema.tags).values([
    { id: "tag-a1", projectId: "proj-a", name: "VIP" },
    { id: "tag-b1", projectId: "proj-b", name: "Lead" },
  ]);

  return { db, ctxA: makeToolContext(db, "proj-a") };
}

describe("MCP tool project scoping", () => {
  test("list_bookings returns only the session project's bookings", async () => {
    const { ctxA } = await seedFixture();
    const result = await listBookings(ctxA, {});
    const bookings = parsed(result) as Array<{ id: string }>;
    expect(bookings.map((b) => b.id)).toEqual(["bk-a1"]);
  });

  test("get_booking reads own bookings and hides foreign ones", async () => {
    const { ctxA } = await seedFixture();

    const own = await getBooking(ctxA, { bookingId: "bk-a1" });
    expect(own.isError).toBeUndefined();
    expect((parsed(own) as { id: string }).id).toBe("bk-a1");

    const foreign = await getBooking(ctxA, { bookingId: "bk-b1" });
    expect(foreign.isError).toBe(true);
    expect(foreign.content[0].text).toBe("Not found");
  });

  test("get_available_slots rejects a foreign event type id", async () => {
    const { ctxA } = await seedFixture();
    const result = await getAvailableSlots(ctxA, {
      eventTypeId: "et-b1",
      date: "2026-07-01",
      timezone: "UTC",
    });
    expect(result.isError).toBe(true);
  });

  test("list_event_types and get_event_type are project-scoped", async () => {
    const { ctxA } = await seedFixture();

    const list = parsed(await listEventTypes(ctxA)) as Array<{ id: string }>;
    expect(list.map((e) => e.id).sort()).toEqual(["et-a1", "et-a2"]);

    const foreign = await getEventType(ctxA, { eventTypeId: "et-b1" });
    expect(foreign.isError).toBe(true);
  });

  test("list_contacts and update_contact are project-scoped", async () => {
    const { ctxA } = await seedFixture();

    const list = parsed(await listContacts(ctxA, {})) as Array<{ id: string }>;
    expect(list.map((c) => c.id)).toEqual(["ct-a1"]);

    const foreign = await updateContact(ctxA, { contactId: "ct-b1", name: "Hijack" });
    expect(foreign.isError).toBe(true);

    const own = await updateContact(ctxA, { contactId: "ct-a1", name: "Carol Updated" });
    expect(own.isError).toBeUndefined();
    expect((parsed(own) as { name: string }).name).toBe("Carol Updated");
  });

  test("add_tag_to_contact rejects a tag from another project", async () => {
    const { ctxA } = await seedFixture();

    const foreignTag = await addTagToContact(ctxA, { contactId: "ct-a1", tagId: "tag-b1" });
    expect(foreignTag.isError).toBe(true);

    const ownTag = await addTagToContact(ctxA, { contactId: "ct-a1", tagId: "tag-a1" });
    expect(ownTag.isError).toBeUndefined();
  });

  test("get_schedule, get_form, get_workflow hide foreign resources", async () => {
    const { db, ctxA } = await seedFixture();

    await db.insert(dbSchema.schedules).values([
      { id: "sch-b1", projectId: "proj-b", name: "B Hours", timezone: "UTC" },
    ]);
    await db.insert(dbSchema.forms).values([
      { id: "form-b1", projectId: "proj-b", name: "B Form", slug: "b-form" },
    ]);
    await db.insert(dbSchema.workflows).values([
      { id: "wf-b1", projectId: "proj-b", name: "B Flow", trigger: "form_submitted" },
    ]);

    expect((await getSchedule(ctxA, { scheduleId: "sch-b1" })).isError).toBe(true);
    expect((await getForm(ctxA, { formId: "form-b1" })).isError).toBe(true);
    expect((await getWorkflow(ctxA, { workflowId: "wf-b1" })).isError).toBe(true);
  });
});

describe("MCP tool plan limits", () => {
  test("create_event_type enforces the free plan limit", async () => {
    const { db, ctxA } = await seedFixture();

    // Free plan allows 3 event types; the fixture seeded 2 — add a third.
    await db.insert(dbSchema.eventTypes).values([
      { id: "et-a3", projectId: "proj-a", name: "Third", slug: "third" },
    ]);

    const result = await createEventType(ctxA, {
      name: "Fourth",
      slug: "fourth",
      duration: 30,
      bufferBefore: 0,
      bufferAfter: 0,
      enabled: true,
      requiresConfirmation: false,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Plan limit reached");
  });

  test("create_contact succeeds under the limit", async () => {
    const { ctxA } = await seedFixture();
    const result = await createContact(ctxA, { name: "New Contact", email: "new@example.com" });
    expect(result.isError).toBeUndefined();
    expect((parsed(result) as { projectId: string }).projectId).toBe("proj-a");
  });
});

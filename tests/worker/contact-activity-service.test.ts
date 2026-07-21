import { describe, expect, test } from "bun:test";

import * as dbSchema from "../../worker/db/schema";
import { ContactActivityService } from "../../worker/services/contact-activity-service";
import { createTestDb, seedTwoProjects } from "./mcp-test-db";

const hour = 60 * 60 * 1000;

async function seedTimeline() {
  const { db, projectA, projectB } = await seedTwoProjects();
  const at = (offset: number) => new Date(Date.UTC(2026, 6, 1, offset));

  await db.insert(dbSchema.contacts).values([
    {
      id: "contact-a",
      projectId: projectA.id,
      name: "Ada Lovelace",
      email: "ada@example.com",
      createdAt: at(8),
      updatedAt: at(8),
    },
    {
      id: "contact-b",
      projectId: projectB.id,
      name: "Grace Hopper",
      email: "grace@example.com",
      createdAt: at(8),
      updatedAt: at(8),
    },
  ]);

  await db.insert(dbSchema.forms).values([
    {
      id: "form-a",
      projectId: projectA.id,
      name: "Lead form",
      slug: "lead-form",
      status: "active",
      createdAt: at(7),
      updatedAt: at(7),
    },
    {
      id: "form-b",
      projectId: projectB.id,
      name: "Foreign form",
      slug: "foreign-form",
      status: "active",
      createdAt: at(7),
      updatedAt: at(7),
    },
  ]);

  await db.insert(dbSchema.formResponses).values([
    {
      id: "response-standalone",
      formId: "form-a",
      status: "completed",
      respondentEmail: "ada@example.com",
      createdAt: at(11),
      updatedAt: at(11),
    },
    {
      id: "response-booking",
      formId: "form-a",
      status: "completed",
      respondentEmail: "ada@example.com",
      createdAt: at(12),
      updatedAt: at(12),
    },
    {
      id: "response-foreign",
      formId: "form-b",
      status: "completed",
      respondentEmail: "grace@example.com",
      createdAt: at(15),
      updatedAt: at(15),
    },
  ]);

  await db.insert(dbSchema.eventTypes).values([
    {
      id: "event-a",
      projectId: projectA.id,
      name: "Product demo",
      slug: "product-demo",
      createdAt: at(7),
      updatedAt: at(7),
    },
    {
      id: "event-b",
      projectId: projectB.id,
      name: "Foreign demo",
      slug: "foreign-demo",
      createdAt: at(7),
      updatedAt: at(7),
    },
  ]);

  await db.insert(dbSchema.bookings).values([
    {
      id: "booking-a",
      eventTypeId: "event-a",
      contactId: "contact-a",
      formResponseId: "response-booking",
      name: "Ada Lovelace",
      email: "ada@example.com",
      startTime: at(18),
      endTime: new Date(at(18).getTime() + hour),
      timezone: "UTC",
      status: "confirmed",
      createdAt: at(10),
      updatedAt: at(10),
    },
    {
      id: "booking-b",
      eventTypeId: "event-b",
      contactId: "contact-b",
      name: "Grace Hopper",
      email: "grace@example.com",
      startTime: at(19),
      endTime: new Date(at(19).getTime() + hour),
      timezone: "UTC",
      status: "confirmed",
      createdAt: at(15),
      updatedAt: at(15),
    },
  ]);

  await db.insert(dbSchema.workflows).values([
    {
      id: "workflow-a",
      projectId: projectA.id,
      name: "Qualify lead",
      trigger: "manual",
      status: "active",
      createdAt: at(7),
      updatedAt: at(7),
    },
    {
      id: "workflow-b",
      projectId: projectB.id,
      name: "Foreign workflow",
      trigger: "manual",
      status: "active",
      createdAt: at(7),
      updatedAt: at(7),
    },
  ]);

  await db.insert(dbSchema.workflowRuns).values([
    {
      id: "run-a",
      workflowId: "workflow-a",
      context: JSON.stringify({ projectId: projectA.id, contactId: "contact-a" }),
      status: "completed",
      startedAt: at(13),
      completedAt: at(13),
      stepLogs: [],
    },
    {
      id: "run-foreign",
      workflowId: "workflow-b",
      context: JSON.stringify({ projectId: projectB.id, contactId: "contact-b" }),
      status: "completed",
      startedAt: at(15),
      completedAt: at(15),
      stepLogs: [],
    },
  ]);

  await db.insert(dbSchema.contactActivity).values([
    {
      id: "activity-created",
      contactId: "contact-a",
      type: "contact_created",
      createdAt: at(9),
    },
    {
      id: "activity-response-standalone",
      contactId: "contact-a",
      type: "form_submitted",
      referenceId: "response-standalone",
      createdAt: at(11),
    },
    {
      id: "activity-response-booking",
      contactId: "contact-a",
      type: "form_submitted",
      referenceId: "response-booking",
      createdAt: at(12),
    },
    {
      id: "activity-research",
      contactId: "contact-a",
      type: "workflow_researched",
      metadata: {
        resultKey: "lead",
        summary: "Strong product fit",
        sourceCount: 2,
      },
      createdAt: at(14),
    },
    {
      id: "activity-foreign",
      contactId: "contact-b",
      type: "contact_created",
      createdAt: at(15),
    },
  ]);

  return { db, at };
}

describe("ContactActivityService", () => {
  test("normalizes the complete contact timeline and exact counts", async () => {
    const { db } = await seedTimeline();
    const service = new ContactActivityService(db);

    const page = await service.list("proj-a", "contact-a", {
      category: "all",
      limit: 20,
      cursor: null,
    });

    expect(page?.activities.map((item) => item.kind)).toEqual([
      "research",
      "workflow_run",
      "form_response",
      "form_response",
      "booking",
      "generic",
    ]);
    expect(page?.counts).toEqual({
      all: 6,
      bookings: 1,
      formResponses: 2,
      workflows: 2,
    });
    expect(page?.nextCursor).toBeNull();
  });

  test("filters categories on the server", async () => {
    const { db } = await seedTimeline();
    const service = new ContactActivityService(db);

    const bookings = await service.list("proj-a", "contact-a", {
      category: "bookings",
      limit: 20,
      cursor: null,
    });
    const responses = await service.list("proj-a", "contact-a", {
      category: "form_responses",
      limit: 20,
      cursor: null,
    });
    const workflows = await service.list("proj-a", "contact-a", {
      category: "workflows",
      limit: 20,
      cursor: null,
    });

    expect(bookings?.activities.map((item) => item.kind)).toEqual(["booking"]);
    expect(responses?.activities.map((item) => item.kind)).toEqual([
      "form_response",
      "form_response",
    ]);
    expect(workflows?.activities.map((item) => item.kind)).toEqual([
      "research",
      "workflow_run",
    ]);
  });

  test("deduplicates a booking response also linked by submission activity", async () => {
    const { db } = await seedTimeline();
    const service = new ContactActivityService(db);

    const page = await service.list("proj-a", "contact-a", {
      category: "form_responses",
      limit: 20,
      cursor: null,
    });

    expect(page?.activities.filter((item) => item.id === "form_response:response-booking")).toHaveLength(1);
    expect(page?.counts.formResponses).toBe(2);
  });

  test("hides foreign contacts and foreign project activity", async () => {
    const { db } = await seedTimeline();
    const service = new ContactActivityService(db);

    expect(
      await service.list("proj-a", "contact-b", {
        category: "all",
        limit: 20,
        cursor: null,
      }),
    ).toBeNull();

    const page = await service.list("proj-a", "contact-a", {
      category: "all",
      limit: 20,
      cursor: null,
    });
    expect(page?.activities.some((item) => item.id.includes("foreign"))).toBe(false);
  });

  test("paginates tied timestamps without duplicates", async () => {
    const db = createTestDb();
    await db.insert(dbSchema.schema.users).values({ id: "u", name: "U", email: "u@example.com" });
    await db.insert(dbSchema.projects).values({ id: "p", userId: "u", name: "P", slug: "p" });
    await db.insert(dbSchema.contacts).values({ id: "c", projectId: "p", name: "C" });
    const tied = new Date("2026-07-01T10:00:00.000Z");
    await db.insert(dbSchema.contactActivity).values(
      ["a", "b", "c", "d"].map((id) => ({
        id,
        contactId: "c",
        type: "tag_added" as const,
        metadata: { tagName: id },
        createdAt: tied,
      })),
    );
    const service = new ContactActivityService(db);

    const first = await service.list("p", "c", {
      category: "all",
      limit: 2,
      cursor: null,
    });
    const second = await service.list("p", "c", {
      category: "all",
      limit: 2,
      cursor: first?.nextCursor ?? null,
    });

    expect(first?.activities).toHaveLength(2);
    expect(second?.activities).toHaveLength(2);
    expect(new Set([...(first?.activities ?? []), ...(second?.activities ?? [])].map((item) => item.id)).size).toBe(4);
    expect(second?.nextCursor).toBeNull();
  });

  test("newer inserts do not shift the next cursor page", async () => {
    const { db, at } = await seedTimeline();
    const service = new ContactActivityService(db);
    const first = await service.list("proj-a", "contact-a", {
      category: "all",
      limit: 2,
      cursor: null,
    });
    const expectedOlderIds = ["form_response:response-booking", "form_response:response-standalone"];

    await db.insert(dbSchema.contactActivity).values({
      id: "activity-newer",
      contactId: "contact-a",
      type: "tag_added",
      metadata: { tagName: "New" },
      createdAt: at(16),
    });

    const second = await service.list("proj-a", "contact-a", {
      category: "all",
      limit: 2,
      cursor: first?.nextCursor ?? null,
    });

    expect(second?.activities.map((item) => item.id)).toEqual(expectedOlderIds);
  });
});

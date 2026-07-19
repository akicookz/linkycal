import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import * as dbSchema from "../../worker/db/schema";
import { ContactService } from "../../worker/services/contact-service";
import { setNextActionSchema } from "../../worker/validation";
import { createTestDb } from "./mcp-test-db";

async function seedContact() {
  const db = createTestDb();
  await db.insert(dbSchema.schema.users).values({
    id: "u",
    name: "User",
    email: "user@example.com",
  });
  await db.insert(dbSchema.projects).values({
    id: "p",
    userId: "u",
    name: "Project",
    slug: "project",
  });
  await db.insert(dbSchema.contacts).values({
    id: "c",
    projectId: "p",
    name: "Contact",
  });
  return db;
}

describe("setNextActionSchema", () => {

  test("rejects partial and malformed actions", () => {
    expect(
      setNextActionSchema.safeParse({ text: "Send proposal", deadline: null })
        .success,
    ).toBe(false);
    expect(
      setNextActionSchema.safeParse({
        text: null,
        deadline: "2026-07-25T14:30:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      setNextActionSchema.safeParse({
        text: "Send proposal",
        deadline: "not-a-date",
      }).success,
    ).toBe(false);
  });
});

describe("ContactService.setNextAction", () => {
  test("sets and replaces the complete action", async () => {
    const db = await seedContact();
    const service = new ContactService(db);

    await service.setNextAction("c", {
      text: "Send proposal",
      deadline: new Date("2026-07-25T14:30:00.000Z"),
    });
    await service.setNextAction("c", {
      text: "Call procurement",
      deadline: new Date("2026-07-26T09:00:00.000Z"),
    });

    const contact = await service.getById("c");
    expect(contact?.nextActionText).toBe("Call procurement");
    expect(contact?.nextActionDeadline?.toISOString()).toBe(
      "2026-07-26T09:00:00.000Z",
    );

    const activity = await service.getActivity("c");
    const setEntries = activity.filter(
      (entry) => entry.type === "next_action_set",
    );
    expect(setEntries).toHaveLength(2);
    expect(setEntries.map((entry) => entry.metadata)).toContainEqual({
      text: "Call procurement",
      deadline: "2026-07-26T09:00:00.000Z",
    });
  });

  test("completion clears both fields and records the previous action", async () => {
    const db = await seedContact();
    const service = new ContactService(db);
    await service.setNextAction("c", {
      text: "Send proposal",
      deadline: new Date("2026-07-25T14:30:00.000Z"),
    });

    await service.setNextAction("c", null);

    const contact = await service.getById("c");
    expect(contact?.nextActionText).toBeNull();
    expect(contact?.nextActionDeadline).toBeNull();

    const activity = await service.getActivity("c");
    const completed = activity.find(
      (entry) => entry.type === "next_action_completed",
    );
    expect(completed?.metadata).toEqual({
      text: "Send proposal",
      deadline: "2026-07-25T14:30:00.000Z",
    });
  });
});

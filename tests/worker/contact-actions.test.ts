import { describe, expect, test, beforeEach, mock } from "bun:test";
import * as dbSchema from "../../worker/db/schema";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { createTestDb } from "./mcp-test-db";

// Capture dispatchWorkflowTrigger calls without a real queue/env.
const dispatchCalls: { trigger: string; ctx: Record<string, unknown> }[] = [];
mock.module("../../worker/lib/workflow-dispatch", () => ({
  dispatchWorkflowTrigger: async (
    _db: unknown,
    _env: unknown,
    _projectId: string,
    trigger: string,
    ctx: Record<string, unknown>,
  ) => {
    dispatchCalls.push({ trigger, ctx });
  },
}));

const { ensureContact } = await import("../../worker/lib/contact-actions");

async function seed(db: DrizzleD1Database<Record<string, unknown>>) {
  await db.insert(dbSchema.schema.users).values({ id: "u", name: "U", email: "u@x.com" });
  await db.insert(dbSchema.projects).values({ id: "p", userId: "u", name: "P", slug: "p" });
}

describe("ensureContact", () => {
  beforeEach(() => {
    dispatchCalls.length = 0;
  });

  test("dispatches new_contact_created when a brand-new contact is created", async () => {
    const db = createTestDb();
    await seed(db);

    const res = await ensureContact(
      db,
      {} as never,
      "p",
      { name: "Jane", email: "jane@acme.com" },
      "booking",
    );

    expect(res.created).toBe(true);
    expect(dispatchCalls.length).toBe(1);
    expect(dispatchCalls[0].trigger).toBe("new_contact_created");
    expect(dispatchCalls[0].ctx.contactId).toBe(res.contact.id);
    expect(dispatchCalls[0].ctx.metadata).toEqual({ source: "booking" });
  });

  test("does not dispatch when the contact already exists", async () => {
    const db = createTestDb();
    await seed(db);

    await ensureContact(db, {} as never, "p", { name: "Jane", email: "jane@acme.com" }, "booking");
    dispatchCalls.length = 0;

    const res = await ensureContact(
      db,
      {} as never,
      "p",
      { name: "Jane", email: "JANE@acme.com" },
      "booking",
    );

    expect(res.created).toBe(false);
    expect(dispatchCalls.length).toBe(0);
  });
});

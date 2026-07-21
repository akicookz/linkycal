import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import * as dbSchema from "../../worker/db/schema";
import { ContactService } from "../../worker/services/contact-service";
import { createTestDb } from "./mcp-test-db";

async function seedProject(db: ReturnType<typeof createTestDb>) {
  await db.insert(dbSchema.schema.users).values({ id: "u", name: "U", email: "u@x.com" });
  await db.insert(dbSchema.projects).values({ id: "p", userId: "u", name: "P", slug: "p" });
}

describe("ContactService.create normalization + activity", () => {
  test("stores email trimmed + lowercased", async () => {
    const db = createTestDb();
    await seedProject(db);
    const svc = new ContactService(db);

    const c = await svc.create("p", { name: "Jane", email: "  Jane@Acme.COM " });

    expect(c.email).toBe("jane@acme.com");
  });

  test("logs a contact_created activity", async () => {
    const db = createTestDb();
    await seedProject(db);
    const svc = new ContactService(db);

    const c = await svc.create("p", { name: "Jane", email: "jane@acme.com" });

    const acts = await db
      .select()
      .from(dbSchema.contactActivity)
      .where(eq(dbSchema.contactActivity.contactId, c.id));
    expect(acts.some((a) => a.type === "contact_created")).toBe(true);
  });
});

describe("ContactService.findOrCreate dedup", () => {

  test("dedups across email casing/whitespace (no duplicate row)", async () => {
    const db = createTestDb();
    await seedProject(db);
    const svc = new ContactService(db);

    const a = await svc.findOrCreate("p", { name: "Jane", email: "Jane@Acme.com" });
    const b = await svc.findOrCreate("p", { name: "Jane D", email: "  jane@acme.com  " });

    expect(b.created).toBe(false);
    expect(b.contact.id).toBe(a.contact.id);

    const rows = await db
      .select()
      .from(dbSchema.contacts)
      .where(eq(dbSchema.contacts.projectId, "p"));
    expect(rows.length).toBe(1);
  });

  test("emailless records are never merged by name (email-only dedup)", async () => {
    const db = createTestDb();
    await seedProject(db);
    const svc = new ContactService(db);

    // Two different people who happen to share a name and have no email must
    // stay distinct — we do not merge by name.
    const a = await svc.create("p", { name: "John Smith" });
    const b = await svc.findOrCreate("p", { name: "John Smith" });

    expect(b.created).toBe(true);
    expect(b.contact.id).not.toBe(a.id);
  });

  test("forwards all create fields (no data loss on the create path)", async () => {
    const db = createTestDb();
    await seedProject(db);
    const svc = new ContactService(db);

    const { contact, created } = await svc.findOrCreate("p", {
      name: "Jane",
      email: "jane@acme.com",
      company: "Acme",
      position: "CTO",
      notes: "VIP",
      linkedinUrl: "https://linkedin.com/in/jane",
    });

    expect(created).toBe(true);
    expect(contact.company).toBe("Acme");
    expect(contact.position).toBe("CTO");
    expect(contact.notes).toBe("VIP");
    expect(contact.linkedinUrl).toBe("https://linkedin.com/in/jane");
  });
});

describe("ContactService.getWithDetails", () => {
  test("returns tags without embedding activity", async () => {
    const db = createTestDb();
    await seedProject(db);
    const svc = new ContactService(db);
    const contact = await svc.create("p", { name: "Jane" });

    const detail = await svc.getWithDetails(contact.id, "p");

    expect(detail).not.toBeNull();
    expect(detail).toHaveProperty("tags");
    expect(detail && "activity" in detail).toBe(false);
  });
});

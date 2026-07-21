import { describe, expect, test } from "bun:test";
import * as dbSchema from "../../worker/db/schema";
import { ContactService } from "../../worker/services/contact-service";
import { createTestDb } from "./mcp-test-db";

async function seed() {
  const db = createTestDb();
  await db.insert(dbSchema.schema.users).values({ id: "u", name: "U", email: "u@x.com" });
  await db.insert(dbSchema.projects).values({ id: "p", userId: "u", name: "P", slug: "p" });
  await db.insert(dbSchema.tags).values([
    { id: "lead", projectId: "p", name: "Lead", color: "#6b7280" },
    { id: "prospect", projectId: "p", name: "Prospect", color: "#3b82f6" },
    { id: "vip", projectId: "p", name: "VIP", color: "#ec4899" },
  ]);
  await db.insert(dbSchema.contacts).values({ id: "c", projectId: "p", name: "C", email: "c@x.com" });
  return db;
}

describe("ContactService.setStage", () => {
  const group = ["lead", "prospect"];

  test("moves between stages, leaving non-stage tags intact", async () => {
    const db = await seed();
    const svc = new ContactService(db);
    await svc.addTag("c", "lead");
    await svc.addTag("c", "vip");

    await svc.setStage("c", "prospect", group);

    const ids = (await svc.getContactTags("c")).map((t) => t.id).sort();
    expect(ids).toEqual(["prospect", "vip"]);
  });

  test("null tagId removes all stage tags (move to Untagged)", async () => {
    const db = await seed();
    const svc = new ContactService(db);
    await svc.addTag("c", "lead");
    await svc.addTag("c", "vip");

    await svc.setStage("c", null, group);

    const ids = (await svc.getContactTags("c")).map((t) => t.id);
    expect(ids).toEqual(["vip"]);
  });
});

describe("ContactService operational facts", () => {
  test("uses the latest tag-added timestamp for a current assignment", async () => {
    const db = await seed();
    const svc = new ContactService(db);
    await db
      .insert(dbSchema.contactTags)
      .values({ contactId: "c", tagId: "lead" });
    await db.insert(dbSchema.contactActivity).values([
      {
        id: "stage-old",
        contactId: "c",
        type: "tag_added",
        referenceId: "lead",
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
      },
      {
        id: "stage-new",
        contactId: "c",
        type: "tag_added",
        referenceId: "lead",
        createdAt: new Date("2026-07-10T12:00:00.000Z"),
      },
    ]);

    const facts = await svc.getOperationalFacts(["c"]);

    expect(facts.c?.enteredAtByTagId.lead).toBe(
      "2026-07-10T12:00:00.000Z",
    );
  });

  test("decorates stage timestamps beyond the first D1-sized chunk", async () => {
    const db = await seed();
    const svc = new ContactService(db);
    const rows = Array.from({ length: 150 }, (_, index) => ({
      id: `timed-${index}`,
      projectId: "p",
      name: `Timed ${index}`,
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
    }));
    await db.insert(dbSchema.contacts).values(rows);
    await db.insert(dbSchema.contactTags).values(
      rows.map((contact) => ({ contactId: contact.id, tagId: "lead" })),
    );
    await db.insert(dbSchema.contactActivity).values(
      rows.map((contact, index) => ({
        id: `timed-activity-${index}`,
        contactId: contact.id,
        type: "tag_added" as const,
        referenceId: "lead",
        createdAt: new Date("2026-07-10T12:00:00.000Z"),
      })),
    );

    const decorated = await svc.listWithTags("p");
    const timed = decorated.filter((contact) => contact.id.startsWith("timed-"));

    expect(timed).toHaveLength(150);
    for (const contact of timed) {
      expect(contact.enteredAtByTagId.lead).toBe(
        "2026-07-10T12:00:00.000Z",
      );
    }
  });
});

describe("ContactService.listPage", () => {
  async function seedMany(n: number) {
    const db = await seed(); // project "p" already has 1 contact ("c")
    const svc = new ContactService(db);
    const rows = Array.from({ length: n }, (_, i) => ({
      id: `pg-${String(i).padStart(3, "0")}`,
      projectId: "p",
      name: `Paged ${i}`,
      email: `pg-${i}@x.com`,
    }));
    await db.insert(dbSchema.contacts).values(rows);
    return { db, svc, total: n + 1 };
  }

  test("returns the first page and the full filtered total", async () => {
    const { svc, total } = await seedMany(120);
    const { contacts, total: reported } = await svc.listPage("p", undefined, {
      limit: 50,
      offset: 0,
    });
    expect(reported).toBe(total); // 121
    expect(contacts).toHaveLength(50);
  });
});

describe("ContactService ownership guards", () => {
  test("contactInProject is true only for the owning project", async () => {
    const db = await seed();
    await db.insert(dbSchema.projects).values({ id: "p2", userId: "u", name: "P2", slug: "p2" });
    const svc = new ContactService(db);
    expect(await svc.contactInProject("p", "c")).toBe(true);
    expect(await svc.contactInProject("p2", "c")).toBe(false);
    expect(await svc.contactInProject("p", "nonexistent")).toBe(false);
  });
});

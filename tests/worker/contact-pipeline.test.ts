import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
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

  test("setting the stage it already has is a no-op", async () => {
    const db = await seed();
    const svc = new ContactService(db);
    await svc.addTag("c", "prospect");

    await svc.setStage("c", "prospect", group);

    const ids = (await svc.getContactTags("c")).map((t) => t.id);
    expect(ids).toEqual(["prospect"]);
  });
});

describe("ContactService.seedPipeline", () => {
  test("creates 5 ordered stage tags + a kanban view", async () => {
    const db = await seed(); // reuse seed(); ignore its pre-made tags
    const svc = new ContactService(db);

    const { view } = await svc.seedPipeline("p");

    const tagRows = await db.select().from(dbSchema.tags).where(eq(dbSchema.tags.projectId, "p"));
    const names = tagRows.map((t) => t.name);
    for (const n of ["Lead", "Prospect", "First Contact", "Follow Up", "Met"]) {
      expect(names).toContain(n);
    }

    expect(view?.type).toBe("kanban");
    expect(view?.name).toBe("Sales Pipeline");
    const cfg = typeof view?.config === "string" ? JSON.parse(view.config) : view?.config;
    expect(cfg.showUntagged).toBe(true);
    expect(cfg.pivotTagIds).toHaveLength(5);
    // Order matches the canonical stage order.
    const idToName = new Map(tagRows.map((t) => [t.id, t.name]));
    expect(cfg.pivotTagIds.map((id: string) => idToName.get(id))).toEqual([
      "Lead", "Prospect", "First Contact", "Follow Up", "Met",
    ]);
  });
});

describe("ContactService.listWithTags lastActivityAt", () => {
  test("attaches the most recent activity timestamp", async () => {
    const db = await seed();
    const svc = new ContactService(db);
    await db.insert(dbSchema.contactActivity).values([
      { id: "a1", contactId: "c", type: "form_submitted", createdAt: new Date("2026-02-01T00:00:00Z") },
      { id: "a2", contactId: "c", type: "booked", createdAt: new Date("2026-03-15T00:00:00Z") },
    ]);

    const [contact] = await svc.listWithTags("p");
    expect(contact.lastActivityAt).not.toBeNull();
    expect(new Date(contact.lastActivityAt as string).toISOString()).toBe("2026-03-15T00:00:00.000Z");
  });

  test("null when the contact has no activity", async () => {
    const db = await seed();
    const svc = new ContactService(db);
    const [contact] = await svc.listWithTags("p");
    expect(contact.lastActivityAt).toBeNull();
  });

  // Regression: projects over ~100 contacts used to 500 because the tag/activity
  // lookups bound one param per contact and D1 caps queries at 100 params. The
  // lookups are chunked now; this proves contacts past the first chunk still get
  // their tags and lastActivityAt merged in. (bun:sqlite has no param cap, so
  // this guards the chunk-merge logic, not the D1 limit itself.)
  test("merges tags and activity for contacts beyond the first chunk", async () => {
    const db = await seed();
    const svc = new ContactService(db);

    const N = 150; // > CONTACT_ID_CHUNK (90) → at least two chunks
    const contactRows = Array.from({ length: N }, (_, i) => ({
      id: `bulk-${i}`,
      projectId: "p",
      name: `Bulk ${i}`,
      email: `bulk-${i}@x.com`,
    }));
    await db.insert(dbSchema.contacts).values(contactRows);
    await db.insert(dbSchema.contactTags).values(
      contactRows.map((c) => ({ contactId: c.id, tagId: "lead" })),
    );
    await db.insert(dbSchema.contactActivity).values(
      contactRows.map((c, i) => ({
        id: `act-${i}`,
        contactId: c.id,
        type: "form_submitted" as const,
        createdAt: new Date("2026-05-01T00:00:00Z"),
      })),
    );

    const all = await svc.listWithTags("p");
    const bulk = all.filter((c) => c.id.startsWith("bulk-"));
    expect(bulk).toHaveLength(N);
    for (const c of bulk) {
      expect(c.tags.map((t) => t.id)).toEqual(["lead"]);
      expect(c.lastActivityAt).not.toBeNull();
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

  test("offset walks through the set without overlap; last page is short", async () => {
    const { svc } = await seedMany(120); // 121 total
    const page1 = await svc.listPage("p", undefined, { limit: 50, offset: 0 });
    const page2 = await svc.listPage("p", undefined, { limit: 50, offset: 50 });
    const page3 = await svc.listPage("p", undefined, { limit: 50, offset: 100 });

    expect(page3.contacts).toHaveLength(21); // 121 - 100
    const ids = new Set([
      ...page1.contacts.map((c) => c.id),
      ...page2.contacts.map((c) => c.id),
      ...page3.contacts.map((c) => c.id),
    ]);
    expect(ids.size).toBe(121); // no dupes, full coverage
  });

  test("total reflects the filter, not the whole project", async () => {
    const { db, svc } = await seedMany(10);
    // Tag exactly 3 of the paged contacts.
    await db.insert(dbSchema.contactTags).values([
      { contactId: "pg-000", tagId: "lead" },
      { contactId: "pg-001", tagId: "lead" },
      { contactId: "pg-002", tagId: "lead" },
    ]);
    const { contacts, total } = await svc.listPage(
      "p",
      { tagIds: ["lead"] },
      { limit: 50, offset: 0 },
    );
    expect(total).toBe(3);
    expect(contacts).toHaveLength(3);
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

  test("filterProjectTagIds drops foreign and unknown tag ids", async () => {
    const db = await seed();
    await db.insert(dbSchema.projects).values({ id: "p2", userId: "u", name: "P2", slug: "p2" });
    await db.insert(dbSchema.tags).values({ id: "foreign", projectId: "p2", name: "Foreign", color: "#000000" });
    const svc = new ContactService(db);
    const valid = await svc.filterProjectTagIds("p", ["lead", "foreign", "missing"]);
    expect(valid).toEqual(["lead"]);
  });
});

describe("ContactService.updateTag", () => {
  test("updates name only, leaving color intact", async () => {
    const db = await seed();
    const svc = new ContactService(db);
    const updated = await svc.updateTag("p", "lead", { name: "Renamed" });
    expect(updated?.name).toBe("Renamed");
    expect(updated?.color).toBe("#6b7280");
  });

  test("updates color only, leaving name intact", async () => {
    const db = await seed();
    const svc = new ContactService(db);
    const updated = await svc.updateTag("p", "lead", { color: "#123456" });
    expect(updated?.name).toBe("Lead");
    expect(updated?.color).toBe("#123456");
  });

  test("updates name and color together", async () => {
    const db = await seed();
    const svc = new ContactService(db);
    const updated = await svc.updateTag("p", "lead", { name: "Hot", color: "#abcdef" });
    expect(updated?.name).toBe("Hot");
    expect(updated?.color).toBe("#abcdef");
  });

  test("does not update a tag from another project", async () => {
    const db = await seed();
    await db.insert(dbSchema.projects).values({ id: "p2", userId: "u", name: "P2", slug: "p2" });
    await db.insert(dbSchema.tags).values({ id: "foreign", projectId: "p2", name: "Foreign", color: "#000000" });
    const svc = new ContactService(db);
    const result = await svc.updateTag("p", "foreign", { name: "Hijacked" });
    expect(result).toBeNull();
    const [row] = await db.select().from(dbSchema.tags).where(eq(dbSchema.tags.id, "foreign"));
    expect(row.name).toBe("Foreign");
  });
});

import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import * as dbSchema from "../../worker/db/schema";
import {
  TagNameConflictError,
  TagService,
} from "../../worker/services/tag-service";
import {
  assignTagSchema,
  createTagSchema,
  listTagsQuerySchema,
  updateTagSchema,
} from "../../worker/validation";
import { createTestDb } from "./mcp-test-db";

async function seed() {
  const db = createTestDb();
  await db.insert(dbSchema.schema.users).values({
    id: "u",
    name: "User",
    email: "user@example.com",
  });
  await db.insert(dbSchema.projects).values([
    { id: "p", userId: "u", name: "Project", slug: "project" },
    { id: "p2", userId: "u", name: "Other", slug: "other" },
  ]);
  await db.insert(dbSchema.tags).values([
    { id: "lead", projectId: "p", name: "Lead", color: "#6b7280" },
    { id: "prospect", projectId: "p", name: "Prospect", color: "#3b82f6" },
    { id: "vip", projectId: "p", name: "VIP", color: "#ec4899" },
    { id: "foreign", projectId: "p2", name: "Foreign", color: "#000000" },
  ]);
  await db.insert(dbSchema.contacts).values([
    { id: "c", projectId: "p", name: "Contact" },
    { id: "c2", projectId: "p2", name: "Other contact" },
  ]);
  return db;
}

describe("tag validation", () => {
  test.each([
    [
      "create trims a valid name",
      () => createTagSchema.safeParse({ name: "  Lead  " }),
      true,
      { name: "Lead" },
    ],
    [
      "create rejects a whitespace-only name",
      () => createTagSchema.safeParse({ name: "   " }),
      false,
      null,
    ],
    [
      "update rejects an empty object",
      () => updateTagSchema.safeParse({}),
      false,
      null,
    ],
    [
      "assignment rejects an empty tagId",
      () => assignTagSchema.safeParse({ tagId: "" }),
      false,
      null,
    ],
    [
      "list trims search and coerces an integer limit",
      () => listTagsQuerySchema.safeParse({ search: "  vi ", limit: "2" }),
      true,
      { search: "vi", limit: 2 },
    ],
    [
      "list rejects a zero limit",
      () => listTagsQuerySchema.safeParse({ limit: "0" }),
      false,
      null,
    ],
    [
      "list rejects a limit over 100",
      () => listTagsQuerySchema.safeParse({ limit: "101" }),
      false,
      null,
    ],
    [
      "list rejects a fractional limit",
      () => listTagsQuerySchema.safeParse({ limit: "2.5" }),
      false,
      null,
    ],
    [
      "list rejects an empty cursor",
      () => listTagsQuerySchema.safeParse({ limit: "2", cursor: "" }),
      false,
      null,
    ],
    [
      "list rejects a cursor without a page limit",
      () => listTagsQuerySchema.safeParse({ cursor: "cursor" }),
      false,
      null,
    ],
  ] as const)("%s", (_label, parse, expectedSuccess, expectedData) => {
    const result = parse();
    expect(result.success).toBe(expectedSuccess);
    if (expectedSuccess) {
      if (!result.success) throw result.error;
      expect(result.data).toEqual(expectedData);
    }
  });
});

describe("TagService", () => {
  test("lists with search and cursor pagination without crossing projects", async () => {
    const service = new TagService(await seed());

    const first = await service.list("p", { limit: 2 });
    expect(first.tags.map((tag) => tag.name)).toEqual(["Lead", "Prospect"]);
    expect(first.nextCursor).toBeString();

    const second = await service.list("p", {
      limit: 2,
      cursor: first.nextCursor,
    });
    expect(second.tags.map((tag) => tag.name)).toEqual(["VIP"]);
    expect(second.nextCursor).toBeNull();

    const searched = await service.list("p", { search: "vi" });
    expect(searched.tags.map((tag) => tag.id)).toEqual(["vip"]);
    await expect(
      service.list("p", { limit: 2, cursor: "not-a-cursor" }),
    ).rejects.toThrow("Invalid tag cursor");
  });

  test("scopes get and filterProjectTagIds to the requested project", async () => {
    const service = new TagService(await seed());

    expect((await service.get("p", "lead"))?.name).toBe("Lead");
    expect(await service.get("p", "foreign")).toBeNull();
    expect(
      await service.filterProjectTagIds("p", ["lead", "foreign", "missing"]),
    ).toEqual(["lead"]);
  });

  test("keeps an existing tag unchanged when a same-project rename conflicts", async () => {
    const service = new TagService(await seed());
    const crossProject = await service.create("p2", {
      name: " vip ",
      color: "#123456",
    });
    expect(crossProject).toEqual(
      expect.objectContaining({ projectId: "p2", name: "vip" }),
    );

    const before = await service.get("p", "lead");
    await expect(
      service.update("p", "lead", { name: " VIP ", color: "#abcdef" }),
    ).rejects.toBeInstanceOf(TagNameConflictError);
    expect(await service.get("p", "lead")).toEqual(before);
  });

  test("assigns and removes idempotently and records activity only on change", async () => {
    const db = await seed();
    const service = new TagService(db);

    const assigned = await service.assignToContact("p", "c", "lead");
    const duplicate = await service.assignToContact("p", "c", "lead");
    const foreign = await service.assignToContact("p", "c", "foreign");

    expect(assigned).toEqual(
      expect.objectContaining({ status: "ok", changed: true }),
    );
    expect(duplicate).toEqual(
      expect.objectContaining({ status: "ok", changed: false }),
    );
    expect(foreign).toEqual({ status: "tag_not_found" });

    const removed = await service.removeFromContact("p", "c", "lead");
    const missing = await service.removeFromContact("p", "c", "lead");
    expect(removed).toEqual(
      expect.objectContaining({ status: "ok", changed: true }),
    );
    expect(missing).toEqual(
      expect.objectContaining({ status: "ok", changed: false }),
    );

    const activity = await db
      .select()
      .from(dbSchema.contactActivity)
      .where(eq(dbSchema.contactActivity.contactId, "c"));
    expect(activity.map((entry) => entry.type).sort()).toEqual([
      "tag_added",
      "tag_removed",
    ]);
  });

  test("blocks workflow-referenced deletion and safely cleans view references", async () => {
    const db = await seed();
    const service = new TagService(db);
    await db.insert(dbSchema.contactTags).values({ contactId: "c", tagId: "lead" });
    await db.insert(dbSchema.contactViews).values({
      id: "view",
      projectId: "p",
      name: "Pipeline",
      type: "kanban",
      config: { pivotTagIds: ["lead", "prospect"], tagIds: ["lead"] },
    });
    await db.insert(dbSchema.workflows).values({
      id: "workflow",
      projectId: "p",
      name: "Lead workflow",
      trigger: "manual",
    });
    await db.insert(dbSchema.workflowSteps).values({
      id: "step",
      workflowId: "workflow",
      type: "add_tag",
      config: { tagId: "lead" },
    });

    const blocked = await service.delete("p", "lead");
    expect(blocked).toEqual({
      status: "in_use",
      workflows: [{ id: "workflow", name: "Lead workflow" }],
    });
    expect(await service.get("p", "lead")).not.toBeNull();

    await db
      .delete(dbSchema.workflowSteps)
      .where(eq(dbSchema.workflowSteps.id, "step"));
    const deleted = await service.delete("p", "lead");
    expect(deleted).toEqual(
      expect.objectContaining({ status: "deleted" }),
    );
    expect(await service.get("p", "lead")).toBeNull();

    const [view] = await db
      .select()
      .from(dbSchema.contactViews)
      .where(eq(dbSchema.contactViews.id, "view"));
    expect(view.config).toEqual({ pivotTagIds: ["prospect"] });
    expect(
      await db
        .select()
        .from(dbSchema.contactTags)
        .where(eq(dbSchema.contactTags.contactId, "c")),
    ).toHaveLength(0);
  });
});

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
  test("normalizes tag input and rejects empty updates", () => {
    expect(createTagSchema.parse({ name: "  Lead  " })).toEqual({ name: "Lead" });
    expect(updateTagSchema.safeParse({}).success).toBe(false);
    expect(assignTagSchema.safeParse({ tagId: "" }).success).toBe(false);
    expect(listTagsQuerySchema.safeParse({ cursor: "cursor" }).success).toBe(
      false,
    );
    expect(
      listTagsQuerySchema.parse({ search: "  vi ", limit: "2" }),
    ).toEqual({ search: "vi", limit: 2 });
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

  test("gets, updates, and rejects duplicate names within one project", async () => {
    const service = new TagService(await seed());

    expect((await service.get("p", "lead"))?.name).toBe("Lead");
    expect(await service.get("p", "foreign")).toBeNull();
    expect(
      await service.filterProjectTagIds("p", ["lead", "foreign", "missing"]),
    ).toEqual(["lead"]);

    const updated = await service.update("p", "lead", {
      name: "Qualified Lead",
      color: "#123456",
    });
    expect(updated).toEqual(
      expect.objectContaining({ name: "Qualified Lead", color: "#123456" }),
    );

    await expect(
      service.create("p", { name: " prospect ", color: "#abcdef" }),
    ).rejects.toBeInstanceOf(TagNameConflictError);
    await expect(
      service.update("p", "lead", { name: "VIP" }),
    ).rejects.toBeInstanceOf(TagNameConflictError);
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

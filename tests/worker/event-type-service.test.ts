import { describe, expect, test } from "bun:test";

import * as dbSchema from "../../worker/db/schema";
import { EventTypeService } from "../../worker/services/event-type-service";
import { createTestDb } from "./mcp-test-db";

async function seedProject() {
  const db = createTestDb();
  await db.insert(dbSchema.schema.users).values({
    id: "u1",
    name: "U",
    email: "u@example.com",
  });
  await db.insert(dbSchema.projects).values({
    id: "p1",
    userId: "u1",
    name: "P",
    slug: "p1",
  });
  return db;
}

describe("EventTypeService booking limits", () => {
  test("create persists maxPerWeek and weekStart", async () => {
    const service = new EventTypeService(await seedProject());
    const et = await service.create("p1", {
      name: "Call",
      slug: "call",
      duration: 30,
      maxPerDay: 3,
      maxPerWeek: 5,
      weekStart: "sunday",
    });
    expect(et.maxPerDay).toBe(3);
    expect(et.maxPerWeek).toBe(5);
    expect(et.weekStart).toBe("sunday");
  });

  test("create defaults weekStart to monday and limits to null", async () => {
    const service = new EventTypeService(await seedProject());
    const et = await service.create("p1", {
      name: "Call",
      slug: "call",
      duration: 30,
    });
    expect(et.maxPerDay).toBeNull();
    expect(et.maxPerWeek).toBeNull();
    expect(et.weekStart).toBe("monday");
  });

  test("update can set then clear the weekly limit", async () => {
    const service = new EventTypeService(await seedProject());
    const et = await service.create("p1", {
      name: "Call",
      slug: "call",
      duration: 30,
    });
    await service.update(et.id, { maxPerWeek: 7 });
    expect((await service.getById(et.id))!.maxPerWeek).toBe(7);
    await service.update(et.id, { maxPerWeek: null });
    expect((await service.getById(et.id))!.maxPerWeek).toBeNull();
  });
});

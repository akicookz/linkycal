import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import * as dbSchema from "../../worker/db/schema";
import { ApiKeyService } from "../../worker/services/api-key-service";
import { createTestDb } from "./mcp-test-db";

describe("API key service", () => {
  test("validation returns key and project identity and records usage", async () => {
    const db = createTestDb();
    await db.insert(dbSchema.schema.users).values({
      id: "owner",
      name: "Owner",
      email: "owner@example.com",
    });
    await db.insert(dbSchema.projects).values({
      id: "project-a",
      userId: "owner",
      name: "Project A",
      slug: "project-a",
    });

    const service = new ApiKeyService(db);
    const created = await service.create("project-a", "CI");

    await expect(service.validate(created.key)).resolves.toEqual({
      apiKeyId: created.id,
      projectId: "project-a",
    });

    const [row] = await db
      .select({ lastUsedAt: dbSchema.apiKeys.lastUsedAt })
      .from(dbSchema.apiKeys)
      .where(eq(dbSchema.apiKeys.id, created.id));
    expect(row?.lastUsedAt).toBeInstanceOf(Date);
  });

  test("validation rejects an unknown secret", async () => {
    const service = new ApiKeyService(createTestDb());
    await expect(service.validate("lc_live_unknown")).resolves.toBeNull();
  });
});

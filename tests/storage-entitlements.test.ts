import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import * as dbSchema from "../worker/db/schema";
import { deleteProjectStorage } from "../worker/lib/storage-reconciliation";
import { entitlementError } from "../worker/lib/entitlement-errors";
import { StorageUsageService } from "../worker/services/storage-usage-service";
import type { WorkspaceRef } from "../worker/types";
import { createTestDb, type TestDatabase } from "./support/test-db";

const WORKSPACE: WorkspaceRef = {
  type: "team",
  id: "team-storage",
  ownerUserId: "owner-storage",
  teamId: "team-storage",
};

describe("storage entitlements", () => {
  let testDatabase: TestDatabase | null = null;

  afterEach(() => {
    testDatabase?.close();
    testDatabase = null;
  });

  test("the exact Free grace ceiling is atomically final", async () => {
    testDatabase = createTestDb();
    await seedStorageProject(testDatabase, 549_999_999);
    const service = new StorageUsageService(testDatabase.db);

    const finalByte = await service.reserve({
      workspace: WORKSPACE,
      plan: "free",
      objectKey: "projects/project-storage/final.png",
      sizeBytes: 1,
    });
    expect(finalByte).toMatchObject({
      allowed: true,
      limit: 500_000_000,
      hardLimit: 550_000_000,
    });
    const blocked = await service.reserve({
      workspace: WORKSPACE,
      plan: "free",
      objectKey: "projects/project-storage/overflow.png",
      sizeBytes: 1,
    });
    expect(blocked).toMatchObject({ allowed: false, used: 550_000_000 });
    expect(entitlementError(blocked, "upload this file").body.error)
      .toBe(
        "Cannot upload this file because this workspace has reached its storage limit.",
      );
  });

  test("failed puts release positive reservations while overwrites and deletion apply exact deltas", async () => {
    testDatabase = createTestDb();
    await seedStorageProject(testDatabase, 0);
    const service = new StorageUsageService(testDatabase.db);
    const objectKey = "projects/project-storage/logo.png";

    await service.reserve({
      workspace: WORKSPACE,
      plan: "free",
      objectKey,
      sizeBytes: 100,
    });
    await service.releaseFailed(WORKSPACE, objectKey);
    expect(await totalBytes(testDatabase)).toBe(0);

    await service.reserve({
      workspace: WORKSPACE,
      plan: "free",
      objectKey,
      sizeBytes: 100,
    });
    await service.commit({
      workspace: WORKSPACE,
      projectId: "project-storage",
      objectKey,
      category: "project_asset",
      sizeBytes: 100,
    });
    expect(await totalBytes(testDatabase)).toBe(100);

    await service.reserve({
      workspace: WORKSPACE,
      plan: "free",
      objectKey,
      sizeBytes: 40,
    });
    await service.commit({
      workspace: WORKSPACE,
      projectId: "project-storage",
      objectKey,
      category: "project_asset",
      sizeBytes: 40,
    });
    expect(await totalBytes(testDatabase)).toBe(40);
    await service.remove(WORKSPACE, objectKey);
    expect(await totalBytes(testDatabase)).toBe(0);
  });

  test("reconciliation replaces stale metadata with the exact customer-owned object sum", async () => {
    testDatabase = createTestDb();
    await seedStorageProject(testDatabase, 999);
    await testDatabase.db.insert(dbSchema.storedObjects).values({
      id: "stale-object",
      workspaceType: "team",
      workspaceId: "team-storage",
      projectId: "project-storage",
      objectKey: "projects/project-storage/stale.png",
      category: "project_asset",
      sizeBytes: 999,
    });
    const service = new StorageUsageService(testDatabase.db);
    const result = await service.reconcile(WORKSPACE, [
      { key: "projects/project-storage/a.png", size: 20 },
      { key: "form-responses/project-storage/f/r/f/b.pdf", size: 30 },
    ]);
    expect(result).toEqual({ objectCount: 2, sizeBytes: 50, matched: true });
    expect(await totalBytes(testDatabase)).toBe(50);
    const objects = await testDatabase.db.select().from(dbSchema.storedObjects);
    expect(objects.map((object) => object.objectKey).sort()).toEqual([
      "form-responses/project-storage/f/r/f/b.pdf",
      "projects/project-storage/a.png",
    ]);
  });

  test("project cleanup deletes both R2 prefixes before releasing charged bytes", async () => {
    testDatabase = createTestDb();
    await seedStorageProject(testDatabase, 150);
    await testDatabase.db.insert(dbSchema.storedObjects).values([
      {
        id: "project-object",
        workspaceType: "team",
        workspaceId: "team-storage",
        projectId: "project-storage",
        objectKey: "projects/project-storage/logo.png",
        category: "project_asset",
        sizeBytes: 100,
      },
      {
        id: "response-object",
        workspaceType: "team",
        workspaceId: "team-storage",
        projectId: "project-storage",
        objectKey: "form-responses/project-storage/form/response/file.pdf",
        category: "response_upload",
        sizeBytes: 50,
      },
    ]);
    const keys = new Set([
      "projects/project-storage/logo.png",
      "form-responses/project-storage/form/response/file.pdf",
      "projects/project-storage/untracked.png",
    ]);
    const bucket = {
      list: async ({ prefix }: { prefix: string }) => ({
        objects: Array.from(keys)
          .filter((key) => key.startsWith(prefix))
          .map((key) => ({ key, size: 1 })),
        truncated: false,
      }),
      delete: async (deleteKeys: string | string[]) => {
        for (const key of Array.isArray(deleteKeys) ? deleteKeys : [deleteKeys]) {
          keys.delete(key);
        }
      },
    } as unknown as R2Bucket;

    expect(
      await deleteProjectStorage(
        testDatabase.db,
        bucket,
        "project-storage",
      ),
    ).toEqual({ objectCount: 3, releasedBytes: 150 });
    expect(Array.from(keys)).toEqual([]);
    expect(await totalBytes(testDatabase)).toBe(0);
    expect(await testDatabase.db.select().from(dbSchema.storedObjects))
      .toEqual([]);
  });
});

async function seedStorageProject(
  testDatabase: TestDatabase,
  sizeBytes: number,
): Promise<void> {
  await testDatabase.db.insert(dbSchema.schema.users).values({
    id: "owner-storage",
    name: "Storage Owner",
    email: "storage@example.com",
    emailVerified: true,
  });
  await testDatabase.db.insert(dbSchema.teams).values({
    id: "team-storage",
    ownerUserId: "owner-storage",
    name: "Storage Team",
    slug: "storage-team",
  });
  await testDatabase.db.insert(dbSchema.projects).values({
    id: "project-storage",
    userId: "owner-storage",
    teamId: "team-storage",
    name: "Storage Project",
    slug: "storage-project",
  });
  await testDatabase.db.insert(dbSchema.workspaceStorageTotals).values({
    id: "storage-total",
    workspaceType: "team",
    workspaceId: "team-storage",
    sizeBytes,
  });
}

async function totalBytes(testDatabase: TestDatabase): Promise<number> {
  const [total] = await testDatabase.db
    .select()
    .from(dbSchema.workspaceStorageTotals)
    .where(eq(dbSchema.workspaceStorageTotals.workspaceId, "team-storage"));
  return total?.sizeBytes ?? 0;
}

import { and, eq, inArray, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import * as dbSchema from "../db/schema";
import { resolveProjectEntitlements } from "./entitlements";

type AppDatabase = DrizzleD1Database<Record<string, unknown>>;

export async function reconcileProjectStorage(
  db: AppDatabase,
  bucket: R2Bucket,
  projectId: string,
): Promise<{ objectCount: number; sizeBytes: number; matched: boolean }> {
  const resolved = await resolveProjectEntitlements(db, projectId, {
    ensureSubscription: true,
  });
  if (!resolved) throw new Error(`Project ${projectId} not found`);

  const objects = [
    ...(await listAll(bucket, `projects/${projectId}/`)),
    ...(await listAll(bucket, `form-responses/${projectId}/`)),
  ];
  const keys = objects.map((object) => object.key);

  for (const object of objects) {
    await db
      .insert(dbSchema.storedObjects)
      .values({
        id: crypto.randomUUID(),
        workspaceType: resolved.workspace.type,
        workspaceId: resolved.workspace.id,
        projectId,
        objectKey: object.key,
        category: object.key.startsWith("form-responses/")
          ? "response_upload"
          : "project_asset",
        sizeBytes: object.size,
      })
      .onConflictDoUpdate({
        target: dbSchema.storedObjects.objectKey,
        set: {
          workspaceType: resolved.workspace.type,
          workspaceId: resolved.workspace.id,
          projectId,
          category: object.key.startsWith("form-responses/")
            ? "response_upload"
            : "project_asset",
          sizeBytes: object.size,
          updatedAt: new Date(),
        },
      });
  }

  if (keys.length === 0) {
    await db
      .delete(dbSchema.storedObjects)
      .where(eq(dbSchema.storedObjects.projectId, projectId));
  } else {
    const existing = await db
      .select({ id: dbSchema.storedObjects.id, objectKey: dbSchema.storedObjects.objectKey })
      .from(dbSchema.storedObjects)
      .where(eq(dbSchema.storedObjects.projectId, projectId));
    const staleIds = existing
      .filter((row) => !keys.includes(row.objectKey))
      .map((row) => row.id);
    if (staleIds.length > 0) {
      await db
        .delete(dbSchema.storedObjects)
        .where(inArray(dbSchema.storedObjects.id, staleIds));
    }
  }

  const [sum] = await db
    .select({ sizeBytes: sql<number>`coalesce(sum(${dbSchema.storedObjects.sizeBytes}), 0)` })
    .from(dbSchema.storedObjects)
    .where(
      and(
        eq(dbSchema.storedObjects.workspaceType, resolved.workspace.type),
        eq(dbSchema.storedObjects.workspaceId, resolved.workspace.id),
      ),
    );
  const sizeBytes = Number(sum?.sizeBytes ?? 0);
  await db
    .insert(dbSchema.workspaceStorageTotals)
    .values({
      id: crypto.randomUUID(),
      workspaceType: resolved.workspace.type,
      workspaceId: resolved.workspace.id,
      sizeBytes,
    })
    .onConflictDoUpdate({
      target: [
        dbSchema.workspaceStorageTotals.workspaceType,
        dbSchema.workspaceStorageTotals.workspaceId,
      ],
      set: { sizeBytes, updatedAt: new Date() },
    });

  return { objectCount: objects.length, sizeBytes, matched: true };
}

export async function deleteProjectStorage(
  db: AppDatabase,
  bucket: R2Bucket,
  projectId: string,
): Promise<{ objectCount: number; releasedBytes: number }> {
  const resolved = await resolveProjectEntitlements(db, projectId, {
    ensureSubscription: true,
  });
  if (!resolved) throw new Error(`Project ${projectId} not found`);

  const objects = [
    ...(await listAll(bucket, `projects/${projectId}/`)),
    ...(await listAll(bucket, `form-responses/${projectId}/`)),
  ];
  for (let offset = 0; offset < objects.length; offset += 1_000) {
    await bucket.delete(
      objects.slice(offset, offset + 1_000).map((object) => object.key),
    );
  }

  const [tracked] = await db
    .select({
      sizeBytes: sql<number>`coalesce(sum(${dbSchema.storedObjects.sizeBytes}), 0)`,
    })
    .from(dbSchema.storedObjects)
    .where(eq(dbSchema.storedObjects.projectId, projectId));
  const releasedBytes = Number(tracked?.sizeBytes ?? 0);
  await db
    .delete(dbSchema.storedObjects)
    .where(eq(dbSchema.storedObjects.projectId, projectId));
  if (releasedBytes > 0) {
    await db
      .update(dbSchema.workspaceStorageTotals)
      .set({
        sizeBytes:
          sql`max(0, ${dbSchema.workspaceStorageTotals.sizeBytes} - ${releasedBytes})`,
      })
      .where(
        and(
          eq(
            dbSchema.workspaceStorageTotals.workspaceType,
            resolved.workspace.type,
          ),
          eq(
            dbSchema.workspaceStorageTotals.workspaceId,
            resolved.workspace.id,
          ),
        ),
      );
  }
  return { objectCount: objects.length, releasedBytes };
}

async function listAll(bucket: R2Bucket, prefix: string): Promise<R2Object[]> {
  const objects: R2Object[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor });
    objects.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return objects;
}

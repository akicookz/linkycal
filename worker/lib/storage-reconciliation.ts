import { and, eq, inArray, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import * as dbSchema from "../db/schema";
import { resolveProjectEntitlements } from "./entitlements";

type AppDatabase = DrizzleD1Database<Record<string, unknown>>;

interface SyncStatement {
  run(...params: unknown[]): unknown;
}

interface SyncSqliteClient {
  query(query: string): SyncStatement;
  transaction<T>(callback: () => T): () => T;
}

interface D1StatementLike {
  bind(...values: unknown[]): D1StatementLike;
}

interface D1ClientLike {
  prepare(query: string): D1StatementLike;
  batch(statements: D1StatementLike[]): Promise<unknown[]>;
}

interface DatabaseWithClient {
  $client?: unknown;
}

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
  await releaseProjectStorageAccounting(
    db,
    projectId,
    resolved.workspace.type,
    resolved.workspace.id,
  );
  return { objectCount: objects.length, releasedBytes };
}

async function releaseProjectStorageAccounting(
  db: AppDatabase,
  projectId: string,
  workspaceType: "personal" | "team",
  workspaceId: string,
): Promise<void> {
  const client = (db as AppDatabase & DatabaseWithClient).$client;
  if (isD1Client(client)) {
    await client.batch([
      client
        .prepare(
          "UPDATE workspace_storage_totals SET size_bytes = max(0, size_bytes - (SELECT coalesce(sum(size_bytes), 0) FROM stored_objects WHERE project_id = ?)), updated_at = unixepoch() WHERE workspace_type = ? AND workspace_id = ?",
        )
        .bind(projectId, workspaceType, workspaceId),
      client
        .prepare("DELETE FROM stored_objects WHERE project_id = ?")
        .bind(projectId),
    ]);
    return;
  }

  if (isSyncSqliteClient(client)) {
    const run = client.transaction(function releaseStorageTransaction() {
      client
        .query(
          "UPDATE workspace_storage_totals SET size_bytes = max(0, size_bytes - (SELECT coalesce(sum(size_bytes), 0) FROM stored_objects WHERE project_id = ?)), updated_at = unixepoch() WHERE workspace_type = ? AND workspace_id = ?",
        )
        .run(projectId, workspaceType, workspaceId);
      client
        .query("DELETE FROM stored_objects WHERE project_id = ?")
        .run(projectId);
    });
    run();
    return;
  }

  throw new Error("Atomic storage accounting is unavailable");
}

function isD1Client(client: unknown): client is D1ClientLike {
  if (!client || typeof client !== "object") return false;
  const candidate = client as Partial<D1ClientLike>;
  return (
    typeof candidate.prepare === "function" &&
    typeof candidate.batch === "function"
  );
}

function isSyncSqliteClient(client: unknown): client is SyncSqliteClient {
  if (!client || typeof client !== "object") return false;
  const candidate = client as Partial<SyncSqliteClient>;
  return (
    typeof candidate.query === "function" &&
    typeof candidate.transaction === "function"
  );
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

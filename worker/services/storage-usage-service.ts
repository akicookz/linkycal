import { and, eq, lte, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import { evaluateEntitlement } from "../../shared/entitlement-decision";
import type {
  EntitlementDecision,
  Plan,
  WorkspaceRef,
} from "../../shared/plan-catalog";
import * as dbSchema from "../db/schema";
import {
  applyEntitlementEnforcement,
  type EntitlementModeEnv,
} from "../lib/entitlement-mode";

type AppDatabase = DrizzleD1Database<Record<string, unknown>>;
export type StoredObjectCategory = dbSchema.StoredObjectRow["category"];

export interface StorageReconciliation {
  objectCount: number;
  sizeBytes: number;
  matched: boolean;
}

interface PendingReservation {
  previousSize: number;
  reservedDelta: number;
}

interface ChangeResult {
  changes?: number;
  meta?: { changes?: number };
}

interface SyncStatement {
  run(...params: unknown[]): ChangeResult;
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

export class ProjectStorageUnavailableError extends Error {
  constructor() {
    super("This project is being deleted");
    this.name = "ProjectStorageUnavailableError";
  }
}

export class StorageUsageService {
  private pending = new Map<string, PendingReservation>();

  constructor(private db: AppDatabase) {}

  async reserve(input: {
    workspace: WorkspaceRef;
    plan: Plan;
    objectKey: string;
    sizeBytes: number;
    env?: EntitlementModeEnv;
    projectId?: string;
    channel?: string;
  }): Promise<EntitlementDecision> {
    assertSize(input.sizeBytes);
    await this.ensureTotal(input.workspace);
    const [total, existing] = await Promise.all([
      this.getTotal(input.workspace),
      this.getObject(input.objectKey),
    ]);
    const previousSize = existing?.sizeBytes ?? 0;
    const reservedDelta = Math.max(0, input.sizeBytes - previousSize);
    const evaluatedDecision = evaluateEntitlement({
      plan: input.plan,
      key: "storageBytes",
      used: total,
      amount: reservedDelta,
    });
    const decision = input.env
      ? applyEntitlementEnforcement(evaluatedDecision, {
          env: input.env,
          workspace: input.workspace,
          projectId: input.projectId ?? null,
          plan: input.plan,
          channel: input.channel ?? "upload",
          operationId: input.objectKey,
        })
      : evaluatedDecision;
    if (!decision.allowed) return decision;

    if (reservedDelta > 0) {
      const hardLimit = decision.hardLimit;
      if (hardLimit === null || !evaluatedDecision.allowed) {
        await this.changeTotal(input.workspace, reservedDelta);
      } else {
        const updated = await this.db
          .update(dbSchema.workspaceStorageTotals)
          .set({
            sizeBytes: sql`${dbSchema.workspaceStorageTotals.sizeBytes} + ${reservedDelta}`,
          })
          .where(
            and(
              workspaceTotalCondition(input.workspace),
              lte(
                dbSchema.workspaceStorageTotals.sizeBytes,
                hardLimit - reservedDelta,
              ),
            ),
          )
          .returning({ id: dbSchema.workspaceStorageTotals.id });
        if (updated.length === 0) {
          return evaluateEntitlement({
            plan: input.plan,
            key: "storageBytes",
            used: await this.getTotal(input.workspace),
            amount: reservedDelta,
          });
        }
      }
    }

    this.pending.set(input.objectKey, { previousSize, reservedDelta });
    return decision;
  }

  async commit(input: {
    workspace: WorkspaceRef;
    projectId: string;
    objectKey: string;
    category: StoredObjectCategory;
    sizeBytes: number;
  }): Promise<void> {
    assertSize(input.sizeBytes);
    const pending = this.pending.get(input.objectKey);
    const existing = pending ? null : await this.getObject(input.objectKey);
    const previousSize = pending?.previousSize ?? existing?.sizeBytes ?? 0;
    const reservedDelta = pending?.reservedDelta ?? 0;
    const adjustment = input.sizeBytes - previousSize - reservedDelta;
    const committed = await commitStoredObjectIfProjectActive(this.db, {
      id: existing?.id ?? crypto.randomUUID(),
      workspace: input.workspace,
      projectId: input.projectId,
      objectKey: input.objectKey,
      category: input.category,
      sizeBytes: input.sizeBytes,
      adjustment,
    });
    if (!committed) {
      throw new ProjectStorageUnavailableError();
    }
    this.pending.delete(input.objectKey);
  }

  async releaseFailed(
    workspace: WorkspaceRef,
    objectKey: string,
  ): Promise<void> {
    const pending = this.pending.get(objectKey);
    if (!pending) return;
    if (pending.reservedDelta > 0) {
      await this.changeTotal(workspace, -pending.reservedDelta);
    }
    this.pending.delete(objectKey);
  }

  async remove(workspace: WorkspaceRef, objectKey: string): Promise<void> {
    const existing = await this.getObject(objectKey);
    if (!existing) return;
    await this.db
      .delete(dbSchema.storedObjects)
      .where(eq(dbSchema.storedObjects.objectKey, objectKey));
    await this.changeTotal(workspace, -existing.sizeBytes);
    this.pending.delete(objectKey);
  }

  async reconcile(
    workspace: WorkspaceRef,
    objects: Array<{ key: string; size: number }>,
  ): Promise<StorageReconciliation> {
    const parsed = objects.map((object) => ({
      ...object,
      ...parseCustomerObjectKey(object.key),
    }));
    await this.db
      .delete(dbSchema.storedObjects)
      .where(
        and(
          eq(dbSchema.storedObjects.workspaceType, workspace.type),
          eq(dbSchema.storedObjects.workspaceId, workspace.id),
        ),
      );
    for (const object of parsed) {
      await this.db.insert(dbSchema.storedObjects).values({
        id: crypto.randomUUID(),
        workspaceType: workspace.type,
        workspaceId: workspace.id,
        projectId: object.projectId,
        objectKey: object.key,
        category: object.category,
        sizeBytes: object.size,
      });
    }
    const sizeBytes = parsed.reduce((sum, object) => sum + object.size, 0);
    await this.ensureTotal(workspace);
    await this.db
      .update(dbSchema.workspaceStorageTotals)
      .set({ sizeBytes })
      .where(workspaceTotalCondition(workspace));
    return { objectCount: parsed.length, sizeBytes, matched: true };
  }

  private async ensureTotal(workspace: WorkspaceRef): Promise<void> {
    await this.db
      .insert(dbSchema.workspaceStorageTotals)
      .values({
        id: crypto.randomUUID(),
        workspaceType: workspace.type,
        workspaceId: workspace.id,
        sizeBytes: 0,
      })
      .onConflictDoNothing({
        target: [
          dbSchema.workspaceStorageTotals.workspaceType,
          dbSchema.workspaceStorageTotals.workspaceId,
        ],
      });
  }

  private async getTotal(workspace: WorkspaceRef): Promise<number> {
    const [row] = await this.db
      .select({ sizeBytes: dbSchema.workspaceStorageTotals.sizeBytes })
      .from(dbSchema.workspaceStorageTotals)
      .where(workspaceTotalCondition(workspace))
      .limit(1);
    return row?.sizeBytes ?? 0;
  }

  private async getObject(
    objectKey: string,
  ): Promise<dbSchema.StoredObjectRow | null> {
    const [row] = await this.db
      .select()
      .from(dbSchema.storedObjects)
      .where(eq(dbSchema.storedObjects.objectKey, objectKey))
      .limit(1);
    return row ?? null;
  }

  private async changeTotal(
    workspace: WorkspaceRef,
    delta: number,
  ): Promise<void> {
    await this.ensureTotal(workspace);
    await this.db
      .update(dbSchema.workspaceStorageTotals)
      .set({
        sizeBytes: sql`max(0, ${dbSchema.workspaceStorageTotals.sizeBytes} + ${delta})`,
      })
      .where(workspaceTotalCondition(workspace));
  }
}

async function commitStoredObjectIfProjectActive(
  db: AppDatabase,
  input: {
    id: string;
    workspace: WorkspaceRef;
    projectId: string;
    objectKey: string;
    category: StoredObjectCategory;
    sizeBytes: number;
    adjustment: number;
  },
): Promise<boolean> {
  const client = (db as AppDatabase & DatabaseWithClient).$client;
  const insertSql =
    "INSERT INTO stored_objects (id, workspace_type, workspace_id, project_id, object_key, category, size_bytes, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch() FROM projects WHERE id = ? AND deleting_at IS NULL ON CONFLICT(object_key) DO UPDATE SET workspace_type = excluded.workspace_type, workspace_id = excluded.workspace_id, project_id = excluded.project_id, category = excluded.category, size_bytes = excluded.size_bytes, updated_at = unixepoch()";
  const values = [
    input.id,
    input.workspace.type,
    input.workspace.id,
    input.projectId,
    input.objectKey,
    input.category,
    input.sizeBytes,
    input.projectId,
  ];
  const adjustmentSql =
    "UPDATE workspace_storage_totals SET size_bytes = max(0, size_bytes + ?), updated_at = unixepoch() WHERE workspace_type = ? AND workspace_id = ? AND changes() = 1";

  if (isD1Client(client)) {
    const statements = [client.prepare(insertSql).bind(...values)];
    if (input.adjustment !== 0) {
      statements.push(
        client
          .prepare(adjustmentSql)
          .bind(
            input.adjustment,
            input.workspace.type,
            input.workspace.id,
          ),
      );
    }
    const results = await client.batch(statements);
    return changeCount(results[0]) === 1;
  }

  if (isSyncSqliteClient(client)) {
    let committed = false;
    const run = client.transaction(function commitStoredObjectTransaction() {
      const inserted = client.query(insertSql).run(...values);
      if (changeCount(inserted) !== 1) return;
      if (input.adjustment !== 0) {
        client
          .query(
            "UPDATE workspace_storage_totals SET size_bytes = max(0, size_bytes + ?), updated_at = unixepoch() WHERE workspace_type = ? AND workspace_id = ?",
          )
          .run(
            input.adjustment,
            input.workspace.type,
            input.workspace.id,
          );
      }
      committed = true;
    });
    run();
    return committed;
  }

  const [project] = await db
    .select({ id: dbSchema.projects.id })
    .from(dbSchema.projects)
    .where(
      and(
        eq(dbSchema.projects.id, input.projectId),
        sql`${dbSchema.projects.deletingAt} IS NULL`,
      ),
    )
    .limit(1);
  if (!project) return false;
  await db
    .insert(dbSchema.storedObjects)
    .values({
      id: input.id,
      workspaceType: input.workspace.type,
      workspaceId: input.workspace.id,
      projectId: input.projectId,
      objectKey: input.objectKey,
      category: input.category,
      sizeBytes: input.sizeBytes,
    })
    .onConflictDoUpdate({
      target: dbSchema.storedObjects.objectKey,
      set: {
        workspaceType: input.workspace.type,
        workspaceId: input.workspace.id,
        projectId: input.projectId,
        category: input.category,
        sizeBytes: input.sizeBytes,
        updatedAt: new Date(),
      },
    });
  if (input.adjustment !== 0) {
    await db
      .update(dbSchema.workspaceStorageTotals)
      .set({
        sizeBytes:
          sql`max(0, ${dbSchema.workspaceStorageTotals.sizeBytes} + ${input.adjustment})`,
      })
      .where(workspaceTotalCondition(input.workspace));
  }
  return true;
}

function changeCount(result: unknown): number {
  if (!result || typeof result !== "object") return 0;
  const value = result as ChangeResult;
  return Number(value.changes ?? value.meta?.changes ?? 0);
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

function workspaceTotalCondition(workspace: WorkspaceRef) {
  return and(
    eq(dbSchema.workspaceStorageTotals.workspaceType, workspace.type),
    eq(dbSchema.workspaceStorageTotals.workspaceId, workspace.id),
  );
}

function parseCustomerObjectKey(key: string): {
  projectId: string;
  category: StoredObjectCategory;
} {
  const parts = key.split("/");
  if (parts[0] === "projects" && parts[1]) {
    return { projectId: parts[1], category: "project_asset" };
  }
  if (parts[0] === "form-responses" && parts[1]) {
    return { projectId: parts[1], category: "response_upload" };
  }
  throw new Error(`Unsupported customer storage key: ${key}`);
}

function assertSize(sizeBytes: number): void {
  if (!Number.isInteger(sizeBytes) || sizeBytes < 0) {
    throw new Error("Storage size must be a non-negative integer");
  }
}

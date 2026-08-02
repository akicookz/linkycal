import { and, eq, lte, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import { evaluateEntitlement } from "../../shared/entitlement-decision";
import type {
  EntitlementDecision,
  Plan,
  WorkspaceRef,
} from "../../shared/plan-catalog";
import * as dbSchema from "../db/schema";

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

export class StorageUsageService {
  private pending = new Map<string, PendingReservation>();

  constructor(private db: AppDatabase) {}

  async reserve(input: {
    workspace: WorkspaceRef;
    plan: Plan;
    objectKey: string;
    sizeBytes: number;
  }): Promise<EntitlementDecision> {
    assertSize(input.sizeBytes);
    await this.ensureTotal(input.workspace);
    const [total, existing] = await Promise.all([
      this.getTotal(input.workspace),
      this.getObject(input.objectKey),
    ]);
    const previousSize = existing?.sizeBytes ?? 0;
    const reservedDelta = Math.max(0, input.sizeBytes - previousSize);
    const decision = evaluateEntitlement({
      plan: input.plan,
      key: "storageBytes",
      used: total,
      amount: reservedDelta,
    });
    if (!decision.allowed) return decision;

    if (reservedDelta > 0) {
      const hardLimit = decision.hardLimit;
      if (hardLimit === null) {
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

    await this.db
      .insert(dbSchema.storedObjects)
      .values({
        id: existing?.id ?? crypto.randomUUID(),
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

    const adjustment = input.sizeBytes - previousSize - reservedDelta;
    if (adjustment !== 0) {
      await this.changeTotal(input.workspace, adjustment);
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

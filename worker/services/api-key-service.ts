import type { DrizzleD1Database } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as dbSchema from "../db/schema";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return (
    "lc_live_" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApiKeyListItem {
  id: string;
  prefix: string;
  label: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

interface ApiKeyCreateResult {
  id: string;
  key: string;
  prefix: string;
  label: string | null;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ApiKeyService {
  constructor(private db: DrizzleD1Database<Record<string, unknown>>) {}

  // ─── List ─────────────────────────────────────────────────────────────────

  async list(projectId: string): Promise<ApiKeyListItem[]> {
    const rows = await this.db
      .select({
        id: dbSchema.apiKeys.id,
        prefix: dbSchema.apiKeys.prefix,
        label: dbSchema.apiKeys.label,
        lastUsedAt: dbSchema.apiKeys.lastUsedAt,
        createdAt: dbSchema.apiKeys.createdAt,
      })
      .from(dbSchema.apiKeys)
      .where(eq(dbSchema.apiKeys.projectId, projectId));

    return rows;
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(
    projectId: string,
    label?: string,
  ): Promise<ApiKeyCreateResult> {
    const id = crypto.randomUUID();
    const key = generateKey();
    const keyHash = await hashKey(key);
    const prefix = key.slice(0, 16); // "lc_live_" + first 8 hex chars

    await this.db.insert(dbSchema.apiKeys).values({
      id,
      projectId,
      keyHash,
      prefix,
      label: label ?? null,
    });

    return { id, key, prefix, label: label ?? null };
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async delete(id: string): Promise<void> {
    await this.db
      .delete(dbSchema.apiKeys)
      .where(eq(dbSchema.apiKeys.id, id));
  }

  // ─── Validate ─────────────────────────────────────────────────────────────

  async validate(key: string): Promise<string | null> {
    const keyHash = await hashKey(key);

    const [row] = await this.db
      .select({
        id: dbSchema.apiKeys.id,
        projectId: dbSchema.apiKeys.projectId,
      })
      .from(dbSchema.apiKeys)
      .where(eq(dbSchema.apiKeys.keyHash, keyHash))
      .limit(1);

    if (!row) return null;

    // Update lastUsedAt
    await this.db
      .update(dbSchema.apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(dbSchema.apiKeys.id, row.id));

    return row.projectId;
  }
}

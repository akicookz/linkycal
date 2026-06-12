import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import * as dbSchema from "../../worker/db/schema";
import type { AppEnv } from "../../worker/types";
import type { ToolContext } from "../../worker/mcp/agent";

const { schema } = dbSchema;

const MIGRATIONS_DIR = join(import.meta.dir, "../../worker/db/drizzle");

/**
 * Real in-memory SQLite seeded from the project's own migration files —
 * exercises actual SQL instead of a hand-rolled drizzle mock. The bun-sqlite
 * drizzle instance is query-compatible with DrizzleD1Database (both SQLite
 * dialects; queries are thenable), hence the cast.
 */
export function createTestDb(): DrizzleD1Database<Record<string, unknown>> {
  const sqlite = new Database(":memory:");
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed) sqlite.run(trimmed);
    }
  }
  return drizzle(sqlite, { schema }) as unknown as DrizzleD1Database<
    Record<string, unknown>
  >;
}

export interface SeededProjects {
  db: DrizzleD1Database<Record<string, unknown>>;
  projectA: { id: string; userId: string };
  projectB: { id: string; userId: string };
}

/** Two users, each owning one project — the cross-tenant isolation fixture. */
export async function seedTwoProjects(): Promise<SeededProjects> {
  const db = createTestDb();

  await db.insert(dbSchema.schema.users).values([
    { id: "user-a", name: "Alice", email: "alice@example.com" },
    { id: "user-b", name: "Bob", email: "bob@example.com" },
  ]);
  await db.insert(dbSchema.projects).values([
    { id: "proj-a", userId: "user-a", name: "Project A", slug: "project-a" },
    { id: "proj-b", userId: "user-b", name: "Project B", slug: "project-b" },
  ]);

  return {
    db,
    projectA: { id: "proj-a", userId: "user-a" },
    projectB: { id: "proj-b", userId: "user-b" },
  };
}

export function makeToolContext(
  db: DrizzleD1Database<Record<string, unknown>>,
  projectId: string,
): ToolContext {
  return {
    projectId: () => projectId,
    db: () => db,
    env: () => ({}) as AppEnv,
    waitUntil: () => {},
  };
}

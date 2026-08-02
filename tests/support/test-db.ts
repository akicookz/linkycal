import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { Miniflare } from "miniflare";

import * as dbSchema from "../../worker/db/schema";

export interface TestDatabase {
  db: DrizzleD1Database<Record<string, unknown>>;
  sqlite: Database;
  close(): void;
}

export interface D1TestDatabase {
  db: DrizzleD1Database<Record<string, unknown>>;
  d1: D1Database;
  close(): Promise<void>;
}

export interface MigrationRange {
  through?: string;
  after?: string;
}

export function applyProductionMigrations(
  sqlite: Database,
  range: MigrationRange = {},
): void {
  const migrationsDirectory = join(
    import.meta.dir,
    "../../worker/db/drizzle",
  );
  const migrationFiles = readdirSync(migrationsDirectory)
    .filter(function isSql(file) {
      return file.endsWith(".sql");
    })
    .filter(function isInRange(file) {
      if (range.through && file > range.through) return false;
      if (range.after && file <= range.after) return false;
      return true;
    })
    .sort();

  for (const file of migrationFiles) {
    const sql = readFileSync(join(migrationsDirectory, file), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed) sqlite.run(trimmed);
    }
  }
}

export function createTestDb(range: MigrationRange = {}): TestDatabase {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA foreign_keys = ON");
  applyProductionMigrations(sqlite, range);

  const db = drizzle(sqlite, {
    schema: dbSchema.schema,
  }) as unknown as DrizzleD1Database<Record<string, unknown>>;

  return {
    db,
    sqlite,
    close: function close() {
      sqlite.close();
    },
  };
}

export async function createD1TestDb(
  range: MigrationRange = {},
): Promise<D1TestDatabase> {
  const testSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = function miniflareSetTimeout(
    handler: TimerHandler,
    timeout?: number,
    ...args: unknown[]
  ) {
    const timerId = testSetTimeout(handler, timeout, ...args);
    if (typeof timerId === "object" && "unref" in timerId) return timerId;
    return {
      ref: function ref() {
        return this;
      },
      unref: function unref() {
        return this;
      },
      hasRef: function hasRef() {
        return false;
      },
      refresh: function refresh() {
        return this;
      },
      [Symbol.toPrimitive]: function toPrimitive() {
        return Number(timerId);
      },
    } as unknown as ReturnType<typeof setTimeout>;
  } as typeof globalThis.setTimeout;
  const miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    d1Databases: ["DB"],
  });
  const d1 = await miniflare.getD1Database("DB") as unknown as D1Database;
  const migrationsDirectory = join(
    import.meta.dir,
    "../../worker/db/drizzle",
  );
  const migrationFiles = readdirSync(migrationsDirectory)
    .filter(function isSql(file) {
      return file.endsWith(".sql");
    })
    .filter(function isInRange(file) {
      if (range.through && file > range.through) return false;
      if (range.after && file <= range.after) return false;
      return true;
    })
    .sort();
  for (const file of migrationFiles) {
    const migration = readFileSync(join(migrationsDirectory, file), "utf8");
    for (const statement of migration.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed) await d1.prepare(trimmed).run();
    }
  }
  return {
    db: drizzleD1(d1, { schema: dbSchema.schema }),
    d1,
    close: async function close() {
      try {
        await miniflare.dispose();
      } finally {
        globalThis.setTimeout = testSetTimeout;
      }
    },
  };
}

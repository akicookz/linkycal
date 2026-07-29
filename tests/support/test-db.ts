import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import * as dbSchema from "../../worker/db/schema";

export interface TestDatabase {
  db: DrizzleD1Database<Record<string, unknown>>;
  sqlite: Database;
  close(): void;
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

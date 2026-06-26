import { describe, expect, test } from "bun:test";
import * as dbSchema from "../../worker/db/schema";
import { createTestDb } from "./mcp-test-db";
import {
  currentPeriodStart,
  getEnrichmentUsage,
  incrementEnrichmentUsage,
} from "../../worker/lib/usage";

async function seedUser(db: ReturnType<typeof createTestDb>) {
  await db.insert(dbSchema.schema.users).values({ id: "u", name: "U", email: "u@x.com" });
}

describe("enrichment usage", () => {
  test("currentPeriodStart is the UTC first-of-month", () => {
    expect(currentPeriodStart(new Date("2026-06-27T15:00:00Z")).toISOString()).toBe(
      "2026-06-01T00:00:00.000Z",
    );
  });

  test("starts at 0, increments within the period, isolates by month", async () => {
    const db = createTestDb();
    await seedUser(db);
    const june = new Date("2026-06-27T00:00:00Z");
    expect(await getEnrichmentUsage(db, "u", june)).toBe(0);
    await incrementEnrichmentUsage(db, "u", june);
    await incrementEnrichmentUsage(db, "u", june);
    expect(await getEnrichmentUsage(db, "u", june)).toBe(2);
    const july = new Date("2026-07-02T00:00:00Z");
    expect(await getEnrichmentUsage(db, "u", july)).toBe(0); // new period resets
  });
});

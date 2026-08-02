import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import * as dbSchema from "../worker/db/schema";
import {
  CustomCssEntitlementError,
  CustomCssService,
} from "../worker/services/custom-css-service";
import { createTestDb, type TestDatabase } from "./support/test-db";

describe("Custom CSS entitlements", () => {
  let testDatabase: TestDatabase | null = null;

  afterEach(() => {
    testDatabase?.close();
    testDatabase = null;
  });

  test("the parser scopes selectors and keyframes while rejecting network and unsafe at-rules", () => {
    testDatabase = createTestDb();
    const service = new CustomCssService(testDatabase.db);
    const compiled = service.compile(
      "project-css",
      `
        :root { --accent: #123456; }
        body .card, html .button { color: var(--accent); animation: fade 1s; }
        @media (min-width: 500px) { .card { padding: 1rem; } }
        @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
      `,
    );
    expect(compiled.sourceBytes).toBeGreaterThan(0);
    expect(compiled.compiledCss).toContain("[data-linkycal-public]");
    expect(compiled.compiledCss).not.toContain("body .card");
    expect(compiled.compiledCss).not.toContain("@keyframes fade{");
    expect(() => service.compile("project-css", ".a{background:url(https://x)}"))
      .toThrow("URLs are not allowed");
    expect(() => service.compile("project-css", "@import 'x.css';"))
      .toThrow("@import is not allowed");
    expect(() => service.compile("project-css", ".a{"))
      .toThrow("Invalid CSS");
    expect(() => service.compile("project-css", `/*${"x".repeat(20_481)}*/`))
      .toThrow("20 KB");
  });

  test("Free retains but cannot save or publish CSS while Pro and Business can", async () => {
    testDatabase = createTestDb();
    await seedCssProject(testDatabase, "free");
    const service = new CustomCssService(testDatabase.db);
    await expect(service.save("project-css", ".card { color: red; }", "owner-css"))
      .rejects.toBeInstanceOf(CustomCssEntitlementError);

    await testDatabase.db
      .update(dbSchema.subscriptions)
      .set({ plan: "pro" })
      .where(eq(dbSchema.subscriptions.id, "subscription-css"));
    const saved = await service.save(
      "project-css",
      ".card { color: red; }",
      "owner-css",
    );
    expect(saved.sourceCss).toBe(".card { color: red; }");
    expect(await service.getPublished("project-css", "pro"))
      .toContain("[data-linkycal-public] .card");
    expect(await service.getPublished("project-css", "free")).toBeNull();
    expect((await service.getForSettings("project-css"))?.sourceCss)
      .toBe(".card { color: red; }");
  });
});

async function seedCssProject(
  testDatabase: TestDatabase,
  plan: "free" | "pro" | "business",
): Promise<void> {
  await testDatabase.db.insert(dbSchema.schema.users).values({
    id: "owner-css",
    name: "CSS Owner",
    email: "css@example.com",
    emailVerified: true,
  });
  await testDatabase.db.insert(dbSchema.teams).values({
    id: "team-css",
    ownerUserId: "owner-css",
    name: "CSS Team",
    slug: "css-team",
  });
  await testDatabase.db.insert(dbSchema.projects).values({
    id: "project-css",
    userId: "owner-css",
    teamId: "team-css",
    name: "CSS Project",
    slug: "css-project",
  });
  await testDatabase.db.insert(dbSchema.subscriptions).values({
    id: "subscription-css",
    userId: "owner-css",
    teamId: "team-css",
    plan,
    status: "active",
  });
}

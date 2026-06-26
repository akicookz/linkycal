import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import {
  enrichContactFromResearch,
  appendResearchSummaryToNotes,
} from "../../worker/lib/contact-enrich";
import * as dbSchema from "../../worker/db/schema";
import { ContactService } from "../../worker/services/contact-service";
import { WorkflowExecutionService } from "../../worker/services/workflow-execution-service";
import { createTestDb } from "./mcp-test-db";

const base = {
  summary: "Founder of a SaaS company.",
  company: "Acme Inc", role: "CEO", website: "https://acme.com",
  linkedinUrl: "https://linkedin.com/in/jane", location: "NYC",
  description: null, companySize: "11-50", estimatedRevenue: "$1M-$10M",
  recommendedTags: [], insights: [], sources: [],
};

describe("enrichContactFromResearch", () => {
  test("maps non-empty fields (role->position, website->companyWebsite)", () => {
    expect(enrichContactFromResearch(base)).toEqual({
      company: "Acme Inc", companyWebsite: "https://acme.com", position: "CEO",
      companySize: "11-50", estimatedRevenue: "$1M-$10M",
      linkedinUrl: "https://linkedin.com/in/jane",
    });
  });
  test("omits null/blank values", () => {
    expect(
      enrichContactFromResearch({ ...base, company: null, website: "   ", role: "" }),
    ).toEqual({
      companySize: "11-50", estimatedRevenue: "$1M-$10M",
      linkedinUrl: "https://linkedin.com/in/jane",
    });
  });
});

describe("appendResearchSummaryToNotes", () => {
  test("appends a dated block, preserving existing notes", () => {
    expect(appendResearchSummaryToNotes("Met at a conf.", "Great fit.", "2026-06-27")).toBe(
      "Met at a conf.\n\n— Research summary (2026-06-27) —\nGreat fit.",
    );
  });
  test("returns just the block when there are no existing notes", () => {
    expect(appendResearchSummaryToNotes(null, "Great fit.", "2026-06-27")).toBe(
      "— Research summary (2026-06-27) —\nGreat fit.",
    );
  });
});

describe("ContactService enrichment columns", () => {
  test("update writes the new columns", async () => {
    const db = createTestDb();
    await db.insert(dbSchema.schema.users).values({ id: "u", name: "U", email: "u@x.com" });
    await db.insert(dbSchema.projects).values({ id: "p", userId: "u", name: "P", slug: "p" });
    await db.insert(dbSchema.contacts).values({ id: "c", projectId: "p", name: "C" });
    const svc = new ContactService(db);

    const updated = await svc.update("c", {
      company: "Acme", companyWebsite: "https://acme.com", position: "CEO",
      companySize: "11-50", estimatedRevenue: "$1M-$10M",
      linkedinUrl: "https://linkedin.com/in/x",
    });

    expect(updated?.company).toBe("Acme");
    expect(updated?.companyWebsite).toBe("https://acme.com");
    expect(updated?.position).toBe("CEO");
    expect(updated?.companySize).toBe("11-50");
    expect(updated?.estimatedRevenue).toBe("$1M-$10M");
    expect(updated?.linkedinUrl).toBe("https://linkedin.com/in/x");
  });
});

describe("applyResearchToContact (via enrichContact path)", () => {
  test("writes columns + appends summary to notes + logs activity", async () => {
    const db = createTestDb();
    await db.insert(dbSchema.schema.users).values({ id: "u2", name: "U", email: "u2@x.com" });
    await db.insert(dbSchema.projects).values({ id: "p2", userId: "u2", name: "P", slug: "p2" });
    await db.insert(dbSchema.contacts).values({ id: "c2", projectId: "p2", name: "Jane", notes: "Met at a conf." });

    const svc = new WorkflowExecutionService(db);
    // Stub the AI call so the test is deterministic (no network).
    (svc as unknown as { workflowAiResearchService: { execute: unknown } }).workflowAiResearchService = {
      execute: async () => ({
        resultKey: "enrichment", provider: "chatgpt", model: "gpt-5.2",
        prompt: "p", executedAt: "2026-06-27T00:00:00Z",
        result: {
          summary: "Great fit.", company: "Acme", role: "CEO", website: "https://acme.com",
          linkedinUrl: "https://linkedin.com/in/jane", location: "NYC", description: null,
          companySize: "11-50", estimatedRevenue: "$1M-$10M", recommendedTags: [], insights: [], sources: [],
        },
      }),
    };

    await svc.enrichContact("p2", "c2", {} as never);

    const [c] = await db.select().from(dbSchema.contacts).where(eq(dbSchema.contacts.id, "c2"));
    expect(c.company).toBe("Acme");
    expect(c.position).toBe("CEO");
    expect(c.companySize).toBe("11-50");
    expect(c.notes).toContain("Met at a conf.");
    expect(c.notes).toContain("Research summary");
    expect(c.notes).toContain("Great fit.");
    const acts = await db.select().from(dbSchema.contactActivity).where(eq(dbSchema.contactActivity.contactId, "c2"));
    expect(acts.some((a) => a.type === "workflow_researched")).toBe(true);
  });
});

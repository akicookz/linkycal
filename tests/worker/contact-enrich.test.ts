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

describe("enrichContact provider fallback", () => {
  const geminiResult = {
    resultKey: "enrichment", provider: "gemini", model: "gemini-2.5-pro",
    prompt: "p", executedAt: "2026-07-09T00:00:00Z",
    result: {
      summary: "From Gemini.", company: "Beta", role: "CTO", website: "https://beta.com",
      linkedinUrl: null, location: null, description: null, companySize: null,
      estimatedRevenue: null, recommendedTags: [], insights: [], sources: [],
    },
  };

  async function seedContact(id: string) {
    const db = createTestDb();
    await db.insert(dbSchema.schema.users).values({ id: `u-${id}`, name: "U", email: `${id}@x.com` });
    await db.insert(dbSchema.projects).values({ id: `p-${id}`, userId: `u-${id}`, name: "P", slug: `p-${id}` });
    await db.insert(dbSchema.contacts).values({ id, projectId: `p-${id}`, name: "Jane" });
    return db;
  }

  test("falls back to Gemini when ChatGPT fails and a Gemini key is set", async () => {
    const db = await seedContact("cf1");
    const svc = new WorkflowExecutionService(db);
    (svc as unknown as { workflowAiResearchService: { execute: unknown } }).workflowAiResearchService = {
      execute: async (config: { provider: string }) => {
        if (config.provider === "chatgpt") {
          throw Object.assign(new Error("Incorrect API key"), { name: "AI_APICallError" });
        }
        return geminiResult;
      },
    };

    await svc.enrichContact("p-cf1", "cf1", { GOOGLE_GENERATIVE_AI_API_KEY: "x" } as never);

    const [c] = await db.select().from(dbSchema.contacts).where(eq(dbSchema.contacts.id, "cf1"));
    expect(c.company).toBe("Beta");
    expect(c.position).toBe("CTO");
  });

  test("surfaces the error when both providers fail", async () => {
    const db = await seedContact("cf2");
    const svc = new WorkflowExecutionService(db);
    (svc as unknown as { workflowAiResearchService: { execute: unknown } }).workflowAiResearchService = {
      execute: async () => {
        throw Object.assign(new Error("provider down"), { name: "AI_APICallError" });
      },
    };

    await expect(
      svc.enrichContact("p-cf2", "cf2", { GOOGLE_GENERATIVE_AI_API_KEY: "x" } as never),
    ).rejects.toThrow("provider down");
  });

  test("does not attempt Gemini when no Gemini key is configured", async () => {
    const db = await seedContact("cf3");
    const svc = new WorkflowExecutionService(db);
    let calls = 0;
    (svc as unknown as { workflowAiResearchService: { execute: unknown } }).workflowAiResearchService = {
      execute: async () => {
        calls += 1;
        throw Object.assign(new Error("chatgpt down"), { name: "AI_APICallError" });
      },
    };

    await expect(svc.enrichContact("p-cf3", "cf3", {} as never)).rejects.toThrow("chatgpt down");
    expect(calls).toBe(1);
  });
});

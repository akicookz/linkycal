import { describe, expect, test } from "bun:test";
import {
  enrichContactFromResearch,
  appendResearchSummaryToNotes,
} from "../../worker/lib/contact-enrich";
import * as dbSchema from "../../worker/db/schema";
import { ContactService } from "../../worker/services/contact-service";
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

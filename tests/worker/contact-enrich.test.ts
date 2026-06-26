import { describe, expect, test } from "bun:test";
import {
  enrichContactFromResearch,
  appendResearchSummaryToNotes,
} from "../../worker/lib/contact-enrich";

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
